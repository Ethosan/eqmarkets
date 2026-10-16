/* The numbers behind "Today's read" and the AI explanation, built from STATE.
   Only finite numbers go in; labels and sentences are derived from them. */
import { ITEM_BY_ID, READ_IDS } from "../config.js";
import { hist, ok } from "../state.js";
import { obsFor, scaledMovePath } from "../quant/regime.js";
import { seriesStats } from "../quant/models.js";

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
    moves, levels, curve,
    rai: rai ? { value: r2(rai.smooth), pct: r2(rai.pct) } : null,
    regime: regime ? { growth: r2(regime.growth), inflation: r2(regime.inflation), since: regime.since || null } : null,
    ar: ar ? { latest: r2(ar.latest), shift: r2(ar.shift) } : null,
    rec: rec ? { prob: r2(rec.prob[rec.prob.length - 1]) } : null,
  };
}
