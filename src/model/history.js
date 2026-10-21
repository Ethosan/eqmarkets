/* Long daily history and the model "frame": every model rebuilt point-in-time
   on an instrument's calendar, so a backtest or the market-bias model only
   ever uses what was known on each date. Used by the backtest lab and by the
   market-bias card. */
import { AR_UNIVERSE, ITEM_BY_ID, RAI_INPUTS } from "../config.js";
import { fredSeries, withRollAdjust, yahooSeries } from "../data/sources.js";
import { absorptionSeries, absorptionShiftPath, recessionSeries, riskAppetite } from "../quant/models.js";
import { scaledMovePath } from "../quant/regime.js";
import { alignSeries, asOf, clip, ewmaVolPath, logReturns, mean, robustZ } from "../quant/stats.js";
import { calendarFlags } from "../quant/calendar.js";
import { stockBondCorr, trendPath, vrpSeries } from "../quant/flows.js";

export const INSTRUMENTS = [
  { id: "nq", label: "NQ · Nasdaq 100 futures", symbol: "NQ=F", rollIndex: "^NDX" },
  { id: "es", label: "ES · S&P 500 futures", symbol: "ES=F", rollIndex: "^GSPC" },
  { id: "ndx", label: "NDX · Nasdaq 100 index", symbol: "^NDX" },
  { id: "qqq", label: "QQQ · total return", symbol: "QQQ", adjusted: true },
  { id: "spy", label: "SPY · total return", symbol: "SPY", adjusted: true },
  { id: "gc", label: "GC · Gold futures", symbol: "GC=F" },
  { id: "btc", label: "BTC · Bitcoin", symbol: "BTC-USD", ppy: 365 },
];

/* Yahoo range → FRED look-back in calendar days. */
export const RANGES = { "2y": 800, "5y": 1900, "10y": 3700, max: 12000 };

/* Every series the three models read. vixts is built from vix / vix3m. */
const MODEL_IDS = [...new Set([
  ...RAI_INPUTS.map(i => i.id).filter(id => id !== "vixts"), "vix3m", ...AR_UNIVERSE, "dgs10", "us3m",
  /* Momentum, leadership and options-vol inputs for the market-bias model. */
  "vix9d", "vxn", "vvix", "ndx", "gspc", "rsp", "spy",
])];
export const MODEL_COUNT = MODEL_IDS.length;

/* FRED dates an H.15 or ICE close to its trading day but publishes it the next
   business day, so the lab treats it as known one weekday later. */
function nextWeekday(d) {
  const t = new Date(d + "T00:00:00Z");
  do t.setUTCDate(t.getUTCDate() + 1); while (t.getUTCDay() === 0 || t.getUTCDay() === 6);
  return t.toISOString().slice(0, 10);
}
const publishLag = s => ({ ...s, dates: s.dates.map(nextWeekday) });

async function loadItem(item, range) {
  const yahoo = async () => {
    for (const sym of item.symbols || []) {
      const s = await yahooSeries(sym, { range });
      if (s) return item.rollIndex ? withRollAdjust(s, item.rollIndex, range) : s;
    }
    return null;
  };
  const fred = async () => {
    if (!item.fredId) return null;
    const s = await fredSeries(item.fredId, RANGES[range]);
    return s && publishLag(s);
  };
  return item.symbols && (item.live || !item.fredId) ? (await yahoo()) || (await fred()) : (await fred()) || (await yahoo());
}

const wait = ms => new Promise(r => setTimeout(r, ms));

/* Fetch the model inputs for a range. onProgress(done, total). */
export async function loadModelSeries(range, onProgress) {
  const out = {};
  let done = 0;
  await Promise.allSettled(MODEL_IDS.map((id, i) =>
    wait(i * 120).then(() => loadItem(ITEM_BY_ID[id], range)).then(s => { if (s) out[id] = s; })
      .finally(() => onProgress?.(++done, MODEL_IDS.length))
  ));
  return out;
}

/* ------------------------------------------------- momentum and leadership */

/* Momentum (12−1) and short-horizon reversal of the instrument itself, both
   volatility-scaled like the regime inputs: the move over the window divided
   by the EWMA vol known at the window's start. Clipped to ±3. */
export function momentumPath(values, { look = 252, skip = 21 } = {}) {
  const r = logReturns(values);
  const vol = ewmaVolPath(r);
  const out = new Array(values.length).fill(null);
  for (let i = look + 1; i < values.length; i++) {
    const s = vol[i - look - 1];
    if (!(s > 0)) continue;
    const z = (Math.log(values[i]) - Math.log(values[i - skip])) / (s * Math.sqrt(look - skip));
    out[i] = clip(z, -3, 3);
  }
  return out;
}

/* The raw 5-day vol-scaled move (the reversal literature's predictor: its
   slope is negative, enforced by the sign restriction in composite.js). */
export function reversalPath(values, { h = 5 } = {}) {
  const r = logReturns(values);
  const vol = ewmaVolPath(r);
  const out = new Array(values.length).fill(null);
  for (let i = h + 1; i < values.length; i++) {
    const s = vol[i - h - 1];
    if (!(s > 0)) continue;
    out[i] = clip(Math.log(values[i] / values[i - h]) / (s * Math.sqrt(h)), -3, 3);
  }
  return out;
}

/* Ratio of two aligned series (e.g. NDX/SPX), as a { dates, values } series. */
export function ratioSeries(a, b) {
  const { dates, columns: [x, y] } = alignSeries([a, b]);
  return { dates, values: x.map((v, i) => v / y[i]) };
}

/* Robust z of a series' level against its trailing year, clipped to ±3
   (the "level" transform of the Risk Appetite Index, on its own). */
export function levelZPath({ dates, values }, window = 252) {
  const out = { dates: [], values: [] };
  for (let i = 60; i < dates.length; i++) {
    const z = robustZ(values[i], values.slice(Math.max(0, i - window + 1), i + 1));
    if (z != null) { out.dates.push(dates[i]); out.values.push(clip(z, -3, 3)); }
  }
  return out;
}

/* 63-day vol-scaled move of a ratio series (leadership and breadth). */
export function ratioMove(a, b, h = 63) {
  return scaledMovePath(ratioSeries(a, b), "price", h);
}

export async function loadInstrument(inst, range) {
  const s = await yahooSeries(inst.symbol, { range, adjusted: !!inst.adjusted });
  return inst.rollIndex ? withRollAdjust(s, inst.rollIndex, range) : s;
}

/* Model paths on the instrument's calendar. Each value is the as-of reading on
   that date (at most 7 days old), or null. */
export function buildFrame(S, inst, { ppy = 252 } = {}) {
  const cal = inst.dates;
  const n = cal.length;
  const empty = () => new Array(n).fill(null);
  const on = s => cal.map(d => asOf(s, d, 7));

  const src = { ...S };
  if (S.vix && S.vix3m) {
    const { dates, columns: [a, b] } = alignSeries([S.vix, S.vix3m]);
    src.vixts = { dates, values: a.map((v, i) => v / b[i]) };
  }
  const inputs = RAI_INPUTS.map(i => ({ ...i, series: src[i.id], ppy: ITEM_BY_ID[i.id]?.ppy || 252 })).filter(i => i.series && i.series.dates.length >= 80);
  let rai = empty(), raiS = empty();
  if (inputs.length >= 4) {
    const h = riskAppetite(inputs, cal, { days: Infinity }).history;
    const raw = new Map(h.dates.map((d, i) => [d, h.values[i]]));
    const smooth = new Map(h.dates.map((d, i) => [d, i >= 2 ? mean(h.values.slice(i - 2, i + 1)) : null]));
    rai = cal.map(d => raw.get(d) ?? null);
    raiS = cal.map(d => smooth.get(d) ?? null);
  }

  const universe = AR_UNIVERSE.filter(id => S[id] && S[id].dates.length >= 120);
  let ar = empty(), dAR = empty();
  if (universe.length >= 5) {
    const a = absorptionSeries(universe.map(id => S[id]), { kind: universe.map(id => ITEM_BY_ID[id].kind) });
    if (a) {
      ar = on(a);
      dAR = on({ dates: a.dates, values: absorptionShiftPath(a.values, { minObs: 126 }) });
    }
  }

  let rec = empty();
  if (S.dgs10 && S.us3m) {
    const r = recessionSeries(S.dgs10, S.us3m);
    if (r.prob.length) rec = on({ dates: r.dates, values: r.prob });
  }

  /* Flows and premia: VRP (VIX − ES realized vol), stock–bond correlation and
     the trend-follower position in the instrument itself. */
  const vrp = S.es && S.vix ? on(vrpSeries(S.es, S.vix)) : empty();
  const ten = S.us10y || S.dgs10;
  const sbCorr = S.es && ten ? on(stockBondCorr(S.es, ten)) : empty();
  const trend = trendPath(inst, { ppy }).values;

  /* Month-to-date gap between the instrument and a 10-year Treasury
     (≈ −8.5 × the yield change), the trigger for month-end rebalancing. */
  const rebal = empty();
  if (ten) {
    let base = null, baseY = null;
    for (let i = 1; i < n; i++) {
      if (cal[i].slice(0, 7) !== cal[i - 1].slice(0, 7)) { base = inst.values[i - 1]; baseY = asOf(ten, cal[i - 1], 7); }
      const y = asOf(ten, cal[i], 7);
      if (base != null && baseY != null && y != null) rebal[i] = (inst.values[i] / base - 1) * 100 + 8.5 * (y - baseY);
    }
  }

  /* Momentum, leadership and options-vol signals for the bias model. Momentum
     and reversal are the instrument's own; the rest are as-of readings from
     cross-market series, so they are the same for ES and NQ. */
  const mom = momentumPath(inst.values);
  const rev = reversalPath(inst.values);
  const lead = S.ndx && S.gspc ? on(ratioMove(S.ndx, S.gspc)) : empty();
  const ew = S.rsp && S.spy ? on(ratioMove(S.rsp, S.spy)) : empty();
  const vxn = S.vxn && S.vix ? on(levelZPath(ratioSeries(S.vxn, S.vix))) : empty();
  const v9d = S.vix9d && S.vix ? on(levelZPath(ratioSeries(S.vix9d, S.vix))) : empty();
  const vvixz = S.vvix ? on(levelZPath(S.vvix)) : empty();
  /* VIX term structure (spot over 3-month, above 1 = backwardation) and credit
     momentum: the 63-day vol-scaled move of high-yield bonds against
     Treasuries (HYG over IEF, total return), so a credit sell-off that stocks
     haven't followed shows up as a negative reading. */
  const vixtsP = src.vixts ? on(src.vixts) : empty();
  const cred = S.hygtr && S.ieftr ? on(ratioMove(S.hygtr, S.ieftr)) : empty();

  return {
    dates: cal, price: inst.values, rai, raiS, ar, dAR, rec, vrp, sbCorr, trend, rebal,
    mom, rev, lead, ew, vxn, v9d, vvixz, vixts: vixtsP, cred,
    cal: calendarFlags(cal),
    vix: S.vix ? on(S.vix) : empty(),
    meta: {
      raiInputs: inputs.map(i => i.id), raiTotal: RAI_INPUTS.length,
      arAssets: universe, missing: MODEL_IDS.filter(id => !S[id]),
    },
  };
}

/* The same model paths on another instrument's calendar (ES → NQ), without
   rebuilding the models; the trend signal and calendar are the instrument's own. */
export function reframe(base, inst, { ppy = 252 } = {}) {
  const at = new Map(base.dates.map((d, i) => [d, i]));
  const pick = arr => inst.dates.map(d => { const i = at.get(d); return i == null ? null : arr[i]; });
  const out = { dates: inst.dates, price: inst.values, meta: base.meta };
  for (const k of ["rai", "raiS", "ar", "dAR", "rec", "vrp", "sbCorr", "vix", "rebal", "lead", "ew", "vxn", "v9d", "vvixz", "vixts", "cred"]) out[k] = pick(base[k]);
  out.trend = trendPath(inst, { ppy }).values;
  out.mom = momentumPath(inst.values);
  out.rev = reversalPath(inst.values);
  out.cal = calendarFlags(inst.dates);
  return out;
}
