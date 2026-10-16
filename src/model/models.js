/* Builds the three dashboard models from STATE:
   - Risk Appetite Index v2 (vol-scaled trend + robust level z-scores)
   - Absorption ratio (cross-asset systemic fragility)
   - NY Fed yield-curve recession probability */
import { AR_UNIVERSE, ITEM_BY_ID, RAI_INPUTS } from "../config.js";
import { hist } from "../state.js";
import { absorptionSeries, recessionSeries, riskAppetite } from "../quant/models.js";

/* Master calendar: the ES futures session dates, else the VIX dates. */
function calendar() {
  return (hist("es", 60) || hist("vix", 60))?.dates || null;
}

export function buildRai() {
  const cal = calendar();
  if (!cal) return null;
  const inputs = RAI_INPUTS
    .map(i => ({ ...i, series: hist(i.id, 80) }))
    .filter(i => i.series);
  if (inputs.length < 4) return null;
  const r = riskAppetite(inputs, cal);
  return r.latest == null ? null : { ...r, total: RAI_INPUTS.length };
}

export function buildAbsorption() {
  const list = AR_UNIVERSE.map(id => ({ id, s: hist(id, 120) })).filter(x => x.s);
  if (list.length < 5) return null;
  const r = absorptionSeries(list.map(x => x.s), { kind: list.map(x => ITEM_BY_ID[x.id].kind) });
  return r ? { ...r, ids: list.map(x => x.id) } : null;
}

export function buildRecession() {
  const ten = hist("dgs10", 40), three = hist("us3m", 40);
  if (!ten || !three) return null;
  const r = recessionSeries(ten, three);
  return r.prob.length ? r : null;
}
