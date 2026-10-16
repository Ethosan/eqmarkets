/* Market calendar and calendar-effect statistics. Every flag depends only on the
   date, so it is known in advance and can be traded without look-ahead.

   - NYSE full-day holidays (rules since 1998, Juneteenth from 2022). One-off
     closures such as national days of mourning are not included.
   - Scheduled FOMC statement days (unscheduled meetings excluded).
   - Turn of month: the last trading day and the first three (Lakonishok &
     Smidt 1988; McConnell & Xu 2008).
   - Monthly option expiry: the third Friday (Thursday if Friday is a holiday);
     March, June, September and December are quarterly "quad witching".
   - Pre-holiday: the trading day before a weekday holiday (Ariel 1990). */
import { mean, rng, std } from "./stats.js";

/* Scheduled FOMC statement days. The app reads the Fed's own calendar page at
   startup (parseFomcCalendar + useFomcDates) and merges it over this list, so
   new years and reschedules arrive on their own; this list is the offline
   fallback and the history for the event study. */
export const FOMC_DATES = [
  "2010-01-27", "2010-03-16", "2010-04-28", "2010-06-23", "2010-08-10", "2010-09-21", "2010-11-03", "2010-12-14",
  "2011-01-26", "2011-03-15", "2011-04-27", "2011-06-22", "2011-08-09", "2011-09-21", "2011-11-02", "2011-12-13",
  "2012-01-25", "2012-03-13", "2012-04-25", "2012-06-20", "2012-08-01", "2012-09-13", "2012-10-24", "2012-12-12",
  "2013-01-30", "2013-03-20", "2013-05-01", "2013-06-19", "2013-07-31", "2013-09-18", "2013-10-30", "2013-12-18",
  "2014-01-29", "2014-03-19", "2014-04-30", "2014-06-18", "2014-07-30", "2014-09-17", "2014-10-29", "2014-12-17",
  "2015-01-28", "2015-03-18", "2015-04-29", "2015-06-17", "2015-07-29", "2015-09-17", "2015-10-28", "2015-12-16",
  "2016-01-27", "2016-03-16", "2016-04-27", "2016-06-15", "2016-07-27", "2016-09-21", "2016-11-02", "2016-12-14",
  "2017-02-01", "2017-03-15", "2017-05-03", "2017-06-14", "2017-07-26", "2017-09-20", "2017-11-01", "2017-12-13",
  "2018-01-31", "2018-03-21", "2018-05-02", "2018-06-13", "2018-08-01", "2018-09-26", "2018-11-08", "2018-12-19",
  "2019-01-30", "2019-03-20", "2019-05-01", "2019-06-19", "2019-07-31", "2019-09-18", "2019-10-30", "2019-12-11",
  "2020-01-29", "2020-04-29", "2020-06-10", "2020-07-29", "2020-09-16", "2020-11-05", "2020-12-16",
  "2021-01-27", "2021-03-17", "2021-04-28", "2021-06-16", "2021-07-28", "2021-09-22", "2021-11-03", "2021-12-15",
  "2022-01-26", "2022-03-16", "2022-05-04", "2022-06-15", "2022-07-27", "2022-09-21", "2022-11-02", "2022-12-14",
  "2023-02-01", "2023-03-22", "2023-05-03", "2023-06-14", "2023-07-26", "2023-09-20", "2023-11-01", "2023-12-13",
  "2024-01-31", "2024-03-20", "2024-05-01", "2024-06-12", "2024-07-31", "2024-09-18", "2024-11-07", "2024-12-18",
  "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10",
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
  /* 2027: tentative schedule from the Fed's 5 Sep 2025 release. */
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-12-08",
];
let FOMC = new Set(FOMC_DATES);
let fomcList = FOMC_DATES.slice();
export const FOMC_COVERAGE = [FOMC_DATES[0], FOMC_DATES[FOMC_DATES.length - 1]];
export const fomcDates = () => fomcList;

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/* Statement days from the Fed's FOMC calendar page
   (federalreserve.gov/monetarypolicy/fomccalendars.htm). Each year panel lists
   meetings as a month ("March", or "Apr/May" across a month end) and a day
   range ("17-18*", "30-1"); the statement comes on the last day. Notation
   votes and unscheduled calls are skipped. Returns sorted ISO dates. */
export function parseFomcCalendar(html) {
  const out = new Set();
  const panels = html.split(/(?=<h4[^>]*>\s*<a[^>]*>\s*\d{4} FOMC Meetings)/);
  for (const panel of panels) {
    const ym = panel.match(/(\d{4}) FOMC Meetings/);
    if (!ym) continue;
    const year = +ym[1];
    const re = /fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g;
    let m;
    while ((m = re.exec(panel))) {
      const monthTxt = m[1].trim().toLowerCase(), dayTxt = m[2].trim();
      if (/notation|unscheduled|conference|call/i.test(dayTxt)) continue;
      const days = dayTxt.replace(/\*/g, "").match(/\d{1,2}/g);
      if (!days) continue;
      const parts = monthTxt.split("/").map(s => s.trim());
      const last = parts[parts.length - 1];
      const mi = MONTHS.findIndex(x => x.startsWith(last.slice(0, 3)));
      if (mi < 0) continue;
      const d = +days[days.length - 1];
      /* "Dec/Jan" style ranges would roll the year; none so far, but handle it. */
      const y = parts.length > 1 && mi === 0 && MONTHS.findIndex(x => x.startsWith(parts[0].slice(0, 3))) === 11 ? year + 1 : year;
      out.add(y + "-" + String(mi + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"));
    }
  }
  return [...out].sort();
}

/* Merge dates read from the Fed: for every year they cover, they replace the
   built-in list; other years keep the built-in dates. */
export function useFomcDates(dates) {
  if (!dates || dates.length < 4) return false;
  const years = new Set(dates.map(d => d.slice(0, 4)));
  fomcList = [...FOMC_DATES.filter(d => !years.has(d.slice(0, 4))), ...dates].sort();
  FOMC = new Set(fomcList);
  return true;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const iso = d => d.toISOString().slice(0, 10);
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
const parse = s => new Date(s + "T00:00:00Z");
const addDays = (s, k) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + k); return iso(d); };

/* Easter Sunday, anonymous Gregorian algorithm (Meeus). */
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return utc(y, Math.floor(n / 31) - 1, (n % 31) + 1);
}
const nthWeekday = (y, m, wd, n) => { const d = utc(y, m, 1); d.setUTCDate(1 + ((wd - d.getUTCDay() + 7) % 7) + 7 * (n - 1)); return d; };
const lastWeekday = (y, m, wd) => { const d = utc(y, m + 1, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - wd + 7) % 7)); return d; };
/* Saturday holidays are observed on Friday, Sunday ones on Monday. */
function observed(d) {
  const o = new Date(d), w = d.getUTCDay();
  if (w === 6) o.setUTCDate(d.getUTCDate() - 1);
  if (w === 0) o.setUTCDate(d.getUTCDate() + 1);
  return o;
}

const holidayCache = new Map();
/* NYSE full-day holidays for a year: [{ date, name }]. */
export function nyseHolidays(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const out = [];
  const add = (d, name) => out.push({ date: iso(d), name });
  /* New Year's Day on a Saturday is not moved back into December. */
  const ny = utc(y, 0, 1);
  if (ny.getUTCDay() !== 6) add(observed(ny), "New Year's Day");
  add(nthWeekday(y, 0, 1, 3), "Martin Luther King Jr. Day");
  add(nthWeekday(y, 1, 1, 3), "Presidents' Day");
  const gf = easter(y); gf.setUTCDate(gf.getUTCDate() - 2); add(gf, "Good Friday");
  add(lastWeekday(y, 4, 1), "Memorial Day");
  if (y >= 2022) add(observed(utc(y, 5, 19)), "Juneteenth");
  add(observed(utc(y, 6, 4)), "Independence Day");
  add(nthWeekday(y, 8, 1, 1), "Labor Day");
  add(nthWeekday(y, 10, 4, 4), "Thanksgiving");
  add(observed(utc(y, 11, 25)), "Christmas");
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  holidayCache.set(y, out);
  return out;
}
const isHoliday = s => nyseHolidays(+s.slice(0, 4)).some(h => h.date === s);
export const isTradingDay = s => { const w = parse(s).getUTCDay(); return w !== 0 && w !== 6 && !isHoliday(s); };

/* NYSE trading days from `from` to `to` inclusive. */
function tradingDays(from, to) {
  const out = [];
  for (let s = from; s <= to; s = addDays(s, 1)) if (isTradingDay(s)) out.push(s);
  return out;
}

/* Monthly option expiry: third Friday, or the Thursday before when Friday is a holiday. */
export function opexDate(y, m) {
  let s = iso(nthWeekday(y, m, 5, 3));
  if (!isTradingDay(s)) s = addDays(s, -1);
  return s;
}

/* Per-trading-day attributes over a date range, keyed by date. */
function dayInfo(from, to) {
  const days = tradingDays(addDays(from, -40), addDays(to, 45));
  const info = new Map();
  days.forEach((d, i) => {
    const ym = d.slice(0, 7);
    let first = i; while (first > 0 && days[first - 1].slice(0, 7) === ym) first--;
    let last = i; while (last < days.length - 1 && days[last + 1].slice(0, 7) === ym) last++;
    const fromStart = i - first + 1, toEnd = last - i + 1; /* 1 = first / last trading day */
    const y = +d.slice(0, 4), m = +d.slice(5, 7) - 1;
    const ox = opexDate(y, m);
    const oxMon = addDays(ox, -((parse(ox).getUTCDay() + 6) % 7));
    const next = days[i + 1];
    info.set(d, {
      tomDay: toEnd === 1 ? -1 : fromStart <= 3 ? fromStart : null,
      monthEnd: toEnd <= 3,
      fomc: FOMC.has(d),
      preFomc: next != null && FOMC.has(next),
      opex: d === ox,
      opexWeek: d >= oxMon && d <= ox,
      quad: [2, 5, 8, 11].includes(m),
      /* The next weekday is a holiday. */
      preHoliday: (() => { let s = addDays(d, 1); while ([0, 6].includes(parse(s).getUTCDay())) s = addDays(s, 1); return isHoliday(s); })(),
    });
  });
  return info;
}

export const CAL_FIELDS = ["tom", "monthEnd", "fomc", "preFomc", "opex", "opexWeek", "quadWeek", "preHoliday"];

/* Boolean calendar flags for each date (false on non-NYSE days, e.g. crypto
   weekends), plus tomDay (−1 last day, 1–3 first days, else null). */
export function calendarFlags(dates) {
  const out = Object.fromEntries([...CAL_FIELDS, "tomDay"].map(k => [k, []]));
  if (!dates.length) return out;
  const info = dayInfo(dates[0], dates[dates.length - 1]);
  for (const d of dates) {
    const x = info.get(d);
    out.tomDay.push(x ? x.tomDay : null);
    out.tom.push(!!x && x.tomDay != null);
    out.monthEnd.push(!!x && x.monthEnd);
    out.fomc.push(!!x && x.fomc);
    out.preFomc.push(!!x && x.preFomc);
    out.opex.push(!!x && x.opex);
    out.opexWeek.push(!!x && x.opexWeek);
    out.quadWeek.push(!!x && x.opexWeek && x.quad);
    out.preHoliday.push(!!x && x.preHoliday);
  }
  return out;
}

/* What's coming up from `today` (ISO date), for the dashboard. */
export function upcoming(today) {
  const days = tradingDays(today, addDays(today, 120));
  const info = dayInfo(today, addDays(today, 75));
  /* Trading sessions after today up to and including d (0 = today). */
  const sessionsTo = d => days.filter(x => x > today && x <= d).length;
  const nowInfo = info.get(today) || null;
  const tomStart = days.find((d, i) => i > 0 && info.get(d)?.tomDay === -1) || null;
  const fomc = fomcList.find(d => d >= today) || null;
  const opex = days.find(d => info.get(d)?.opex) || null;
  const y = +today.slice(0, 4);
  const hol = [...nyseHolidays(y), ...nyseHolidays(y + 1)].find(h => h.date > today) || null;
  const monthEnd = days.find(d => info.get(d)?.tomDay === -1) || null;
  return {
    today: nowInfo,
    tradingToday: isTradingDay(today),
    tomStart: tomStart && { date: tomStart, sessions: sessionsTo(tomStart) },
    fomc: fomc && { date: fomc, sessions: sessionsTo(fomc) },
    fomcListed: !!fomc,
    opex: opex && { date: opex, sessions: sessionsTo(opex), quad: [2, 5, 8, 11].includes(+opex.slice(5, 7) - 1) },
    holiday: hol,
    monthEnd: monthEnd && { date: monthEnd, sessions: sessionsTo(monthEnd) },
  };
}

export const fmtDay = s => { const d = parse(s); return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()] + " " + d.getUTCDate() + " " + MON[d.getUTCMonth()]; };

/* ----------------------------------------------------------- event study */
/* Mean daily log return on event days vs all other days, with a Welch t-stat
   and a two-sided randomization p-value: how often a random set of the same
   number of days lands at least as far from the overall mean. Also the share
   of the period's total log return earned on event days. */
export function eventStudy(rets, mask, { iters = 2000, seed = 7 } = {}) {
  const inn = [], out = [];
  rets.forEach((r, i) => { if (r == null || !isFinite(r)) return; (mask[i] ? inn : out).push(r); });
  const n = inn.length, all = inn.concat(out);
  if (n < 8 || out.length < 8) return null;
  const mIn = mean(inn), mOut = mean(out), mAll = mean(all);
  const se = Math.sqrt(std(inn) ** 2 / n + std(out) ** 2 / out.length);
  const r = rng(seed), pool = all.slice(), obs = Math.abs(mIn - mAll);
  let hits = 0;
  for (let k = 0; k < iters; k++) {
    let s = 0;
    for (let j = 0; j < n; j++) {
      const p = j + Math.floor(r() * (pool.length - j));
      const t = pool[j]; pool[j] = pool[p]; pool[p] = t;
      s += pool[j];
    }
    if (Math.abs(s / n - mAll) >= obs - 1e-15) hits++;
  }
  const total = all.reduce((a, b) => a + b, 0);
  return {
    n, share: n / all.length,
    meanIn: mIn, meanOut: mOut, diff: mIn - mOut,
    t: se > 0 ? (mIn - mOut) / se : null,
    p: (hits + 1) / (iters + 1),
    hit: inn.filter(x => x > 0).length / n,
    retShare: total !== 0 ? inn.reduce((a, b) => a + b, 0) / total : null,
  };
}
