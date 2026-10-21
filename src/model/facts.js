/* The numbers behind "Today's read" and the AI explanation, built from STATE.
   Only finite numbers go in; labels and sentences are derived from them. */
import { ITEM_BY_ID, READ_IDS } from "../config.js";
import { hist as histNow, ok } from "../state.js";
import { obsFor, scaledMovePath } from "../quant/regime.js";
import { seriesStats } from "../quant/models.js";
import { alignSeries, ewmaVolPath, logReturns, percentileRank, robustZ } from "../quant/stats.js";

function prevWeekday(d) {
  const t = new Date(d + "T00:00:00Z");
  do t.setUTCDate(t.getUTCDate() - 1); while (t.getUTCDay() === 0 || t.getUTCDay() === 6);
  return t.toISOString().slice(0, 10);
}
const r2 = x => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const last = p => (p.values.length ? p.values[p.values.length - 1] : null);

/* Series scored for "since the last close" and for new 52-week highs and lows.
   Front-month futures that aren't roll-adjusted (oil, gas, metals, grains) are
   left out: their quote jumps when the contract rolls. Oil and gold come from
   their ETFs instead; ES and NQ are roll-adjusted, DBC and DBA roll themselves. */
const UNROLLED = ["cl", "ng", "gc", "si", "hg", "zc", "zw", "zs"];
export const DAY_IDS = [...READ_IDS.filter(id => !UNROLLED.includes(id)), "uso", "gld", "vix", "vvix", "move", "ovx", "hyg"];
const EXTREME_IDS = ["es", "nq", "gld", "uso", "btc", "dxy", "usdjpy", "us10y", "hyoas", "vix"];

/* Today's move in units of the series' own daily volatility (EWMA known before
   today), and in display units: % for prices, bp for rates, points for levels. */
function dayMove(s, kind) {
  const v = s.values, n = v.length;
  if (n < 40) return null;
  const steps = kind === "price" ? logReturns(v) : v.slice(1).map((x, i) => x - v[i]);
  const vol = ewmaVolPath(steps)[steps.length - 2];
  if (!(vol > 0)) return null;
  const chg = kind === "price" ? (v[n - 1] / v[n - 2] - 1) * 100 : kind === "rate" ? (v[n - 1] - v[n - 2]) * 100 : v[n - 1] - v[n - 2];
  return { score: r2(steps[steps.length - 1] / vol), chg1d: r2(chg), date: s.dates[n - 1] };
}

/* lag: build the facts as they stood that many ES sessions ago, by cutting every
   series at that date (used to tell a new pattern from one that has run for weeks). */
export function buildFacts({ rai, regime, ar, rec } = {}, { lag = 0 } = {}) {
  const esDates = histNow("es", 2)?.dates;
  const cut = lag && esDates ? esDates[esDates.length - 1 - lag] : null;
  const hist = (id, min = 2) => {
    const s = histNow(id, min);
    if (!s || !cut) return s;
    let k = s.dates.length;
    while (k > 0 && s.dates[k - 1] > cut) k--;
    return k >= min ? { dates: s.dates.slice(0, k), values: s.values.slice(0, k) } : null;
  };
  const moves = {};
  for (const id of READ_IDS) {
    const it = ITEM_BY_ID[id], s = hist(id, 60);
    if (!it || !s) continue;
    const ppy = it.ppy || 252;
    const score = last(scaledMovePath(s, it.kind, obsFor(21, ppy)));
    const st = seriesStats(s, it.kind, ppy);
    if (score == null && st?.chg.m1 == null) continue;
    moves[id] = { score: r2(score), chg1m: r2(st?.chg.m1 ?? null) };
  }
  const levels = {};
  for (const id of ["vix", "move"]) {
    const s = hist(id, 60);
    const z = s ? seriesStats(s, "level")?.z1y : null;
    if (z != null) levels[id] = r2(z);
  }
  /* Options-vol ratios (VXN/VIX, VIX9D/VIX): robust z of the ratio vs its
     trailing year, and growth-leadership (NDX/SPX) and breadth (RSP/SPY)
     1-month vol-scaled moves, for the divergence rules. */
  const ratio = (num, den) => {
    const a = hist(num, 80), b = hist(den, 80);
    if (!a || !b) return null;
    const { dates, columns: [x, y] } = alignSeries([a, b]);
    const s = { dates, values: x.map((v, i) => v / y[i]) };
    return s.values.length >= 80 ? s : null;
  };
  const ratioZ = s => {
    if (!s) return null;
    const v = s.values[s.values.length - 1];
    return r2(robustZ(v, s.values.slice(-253, -1)));
  };
  const vxn = ratio("vxn", "vix"), v9d = ratio("vix9d", "vix");
  if (vxn) levels.vxn = ratioZ(vxn);
  if (v9d) levels.v9d = ratioZ(v9d);
  const relative = {};
  for (const [id, num, den] of [["lead", "ndx", "gspc"], ["ew", "rsp", "spy"]]) {
    const s = ratio(num, den);
    const sc = s ? last(scaledMovePath(s, "price", obsFor(21, 252))) : null;
    if (sc != null) relative[id] = r2(sc);
  }
  /* The curve and both legs from the same FRED H.15 closes, so 2s10s equals
     the 10Y change minus the 2Y change (the live ^TNX quote is left out). */
  const m1 = s => (s ? r2(seriesStats(s, "rate")?.chg.m1 ?? null) : null);
  const curve = {
    chg2s10: m1(hist("spread", 30)),
    chg2y: ok("us2y")?.src === "fred" ? m1(hist("us2y", 30)) : null,
    chg10y: m1(hist("dgs10", 30)),
  };
  const asOf = hist("es", 2)?.dates.at(-1) || null;

  /* Since the last close: only series whose latest bar is from the latest ES
     session or the day before (weekly and stale feeds stay out). */
  const day = {};
  for (const id of DAY_IDS) {
    const it = ITEM_BY_ID[id], s = hist(id, 40);
    if (!it || !s || it.weekly) continue;
    const m = dayMove(s, it.kind);
    if (m && asOf && m.date >= prevWeekday(asOf)) day[id] = { score: m.score, chg1d: m.chg1d };
  }
  /* New 52-week highs and lows: the latest close against the prior year. */
  const extremes = {};
  for (const id of EXTREME_IDS) {
    const s = hist(id, 200), it = ITEM_BY_ID[id];
    if (!s || !it) continue;
    const v = s.values, n = v.length, prior = v.slice(Math.max(0, n - 1 - (it.ppy || 252)), n - 1);
    if (asOf && s.dates[n - 1] < prevWeekday(asOf)) continue;
    if (v[n - 1] > Math.max(...prior)) extremes[id] = "high";
    else if (v[n - 1] < Math.min(...prior)) extremes[id] = "low";
  }
  /* Credit level in context: the HY spread against its past year (all FRED
     keeps of the ICE series is three years) and the Baa spread against its
     whole history since 1986. */
  let credit = null;
  const hy = hist("hyoas", 60), baa = hist("baa", 60);
  if (hy) {
    const st = seriesStats(hy, "rate");
    credit = { hy: r2(st.last), hyChg1m: r2(st.chg.m1), hyPct1y: r2(st.pct1y), hyLo1y: r2(st.lo1y) };
    if (baa && baa.values.length > 2000) {
      credit.baa = r2(last(baa));
      credit.baaPctLong = r2(percentileRank(last(baa), baa.values.slice(0, -1)));
      credit.baaPct1y = r2(seriesStats(baa, "rate")?.pct1y ?? null);
      credit.baaSince = baa.dates[0].slice(0, 4);
    }
  }
  return {
    asOf,
    moves, levels, curve, relative, day, extremes, credit,
    rai: rai ? { value: r2(rai.smooth), pct: r2(rai.pct) } : null,
    regime: regime ? {
      growth: r2(regime.growth), inflation: r2(regime.inflation), since: regime.since || null,
      quadrant: regime.provisional ? null : regime.quadrant, weeks: regime.weeksIn,
    } : null,
    ar: ar ? { latest: r2(ar.latest), shift: r2(ar.shift) } : null,
    rec: rec ? { prob: r2(rec.prob[rec.prob.length - 1]) } : null,
  };
}
