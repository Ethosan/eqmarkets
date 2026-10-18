/* The numbers behind "Today's read" and the AI explanation, built from STATE.
   Only finite numbers go in; labels and sentences are derived from them. */
import { ITEM_BY_ID, READ_IDS } from "../config.js";
import { hist, ok } from "../state.js";
import { obsFor, scaledMovePath } from "../quant/regime.js";
import { seriesStats } from "../quant/models.js";
import { alignSeries, robustZ } from "../quant/stats.js";

const r2 = x => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const last = p => (p.values.length ? p.values[p.values.length - 1] : null);

export function buildFacts({ rai, regime, ar, rec } = {}) {
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
  return {
    asOf,
    moves, levels, curve, relative,
    rai: rai ? { value: r2(rai.smooth), pct: r2(rai.pct) } : null,
    regime: regime ? {
      growth: r2(regime.growth), inflation: r2(regime.inflation), since: regime.since || null,
      quadrant: regime.provisional ? null : regime.quadrant, weeks: regime.weeksIn,
    } : null,
    ar: ar ? { latest: r2(ar.latest), shift: r2(ar.shift) } : null,
    rec: rec ? { prob: r2(rec.prob[rec.prob.length - 1]) } : null,
  };
}
