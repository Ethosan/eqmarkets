/* Long daily history for the lab, and the model "frame": RAI, absorption ratio,
   ΔAR and recession probability rebuilt point-in-time on the instrument's
   calendar, so a backtest only ever uses what was known on each date. */
import { AR_UNIVERSE, ITEM_BY_ID, RAI_INPUTS } from "../config.js";
import { fredSeries, yahooSeries } from "../data/sources.js";
import { absorptionSeries, absorptionShiftPath, recessionSeries, riskAppetite } from "../quant/models.js";
import { alignSeries, asOf, mean } from "../quant/stats.js";

export const INSTRUMENTS = [
  { id: "nq", label: "NQ · Nasdaq 100 futures", symbol: "NQ=F" },
  { id: "es", label: "ES · S&P 500 futures", symbol: "ES=F" },
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
    for (const sym of item.symbols || []) { const s = await yahooSeries(sym, { range }); if (s) return s; }
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

export function loadInstrument(inst, range) {
  return yahooSeries(inst.symbol, { range, adjusted: !!inst.adjusted });
}

/* Model paths on the instrument's calendar. Each value is the as-of reading on
   that date (at most 7 days old), or null. */
export function buildFrame(S, inst) {
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

  return {
    dates: cal, price: inst.values, rai, raiS, ar, dAR, rec,
    vix: S.vix ? on(S.vix) : empty(),
    meta: {
      raiInputs: inputs.map(i => i.id), raiTotal: RAI_INPUTS.length,
      arAssets: universe, missing: MODEL_IDS.filter(id => !S[id]),
    },
  };
}
