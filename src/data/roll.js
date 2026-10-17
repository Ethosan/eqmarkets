/* Roll adjustment for continuous index futures.

   Yahoo's ES=F and NQ=F switch to the next contract around each quarterly
   expiry. The next contract trades at a premium (interest minus dividends), so
   the series jumps 1–3% when it switches. Nobody earns that jump, but it shows
   up as a return in volatility, trend and backtests.

   Fix: inside a window around each quarterly expiry (8 sessions before the
   third Friday, which covers the CME roll date, to 1 session after), use the
   cash index's return instead of the futures' return; keep the futures' own
   returns on every other day; and rebuild the price path backwards from
   today's price, so the latest price is unchanged. Windows come from the NYSE
   calendar, not from the futures' own dates, so a futures-only session (a
   Globex bar on a cash holiday) can't shift them. */
import { isTradingDay, opexDate } from "../quant/calendar.js";

const iso = t => new Date(t).toISOString().slice(0, 10);

/* [start, end] ISO date ranges, one per quarterly expiry from y0 to y1. */
export function rollWindows(y0, y1, { before = 8, after = 1 } = {}) {
  const out = [];
  for (let y = y0; y <= y1; y++) {
    for (const m of [2, 5, 8, 11]) {
      const ox = opexDate(y, m);
      let t = Date.parse(ox + "T00:00:00Z"), k = 0, start = ox, end = ox;
      while (k < before) { t -= 864e5; const d = iso(t); if (isTradingDay(d)) { k++; start = d; } }
      t = Date.parse(ox + "T00:00:00Z"); k = 0;
      while (k < after) { t += 864e5; const d = iso(t); if (isTradingDay(d)) { k++; end = d; } }
      out.push([start, end]);
    }
  }
  return out;
}

export function inRollWindow(d, windows) {
  return windows.some(([a, b]) => d >= a && d <= b);
}

/* Last index value on or before d (sorted ISO dates), or null. */
function asOfValue(dates, values, d) {
  let lo = 0, hi = dates.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) { k = m; lo = m + 1; } else hi = m - 1; }
  return k < 0 ? null : values[k];
}

/* fut, idx: { dates, values }. Returns the futures series with roll-window
   returns taken from the index, plus how many days were replaced.
   A day is replaced when the index has a bar for it, or when it isn't a cash
   session at all (a futures-only holiday bar: the cash return is zero). A
   cash session the index hasn't printed yet (today, before the cash open)
   keeps the futures' own return. */
export function rollAdjust(fut, idx) {
  const n = fut.values.length;
  if (n < 2 || !idx?.dates?.length) return { ...fut, rollAdjusted: 0 };
  const has = new Set(idx.dates);
  const windows = rollWindows(+fut.dates[0].slice(0, 4), +fut.dates[n - 1].slice(0, 4) + 1);
  const adj = new Array(n);
  adj[n - 1] = fut.values[n - 1];
  let replaced = 0;
  for (let i = n - 1; i > 0; i--) {
    const d = fut.dates[i], p = fut.dates[i - 1];
    let r = Math.log(fut.values[i] / fut.values[i - 1]);
    if (inRollWindow(d, windows) && (has.has(d) || !isTradingDay(d))) {
      const a = asOfValue(idx.dates, idx.values, d), b = asOfValue(idx.dates, idx.values, p);
      if (a != null && b != null) { r = Math.log(a / b); replaced++; }
    }
    adj[i - 1] = adj[i] / Math.exp(r);
  }
  if (!replaced) return { ...fut, rollAdjusted: 0 };
  return { ...fut, values: adj, price: adj[n - 1], prev: adj[n - 2], rollAdjusted: replaced };
}
