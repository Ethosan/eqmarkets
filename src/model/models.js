/* Builds the three dashboard models from STATE:
   - Risk Appetite Index v2 (vol-scaled trend + robust level z-scores)
   - Absorption ratio (cross-asset systemic fragility)
   - NY Fed yield-curve recession probability
   - Growth × inflation regime */
import { AR_UNIVERSE, ITEM_BY_ID, RAI_INPUTS, REGIME_INPUTS } from "../config.js";
import { hist } from "../state.js";
import { absorptionSeries, recessionSeries, riskAppetite } from "../quant/models.js";
import { regimeModel } from "../quant/regime.js";
import { stockBondCorr, trendNow, vrpSeries } from "../quant/flows.js";
import { upcoming } from "../quant/calendar.js";

/* Master calendar: the ES futures session dates, else the VIX dates. */
function calendar() {
  return (hist("es", 60) || hist("vix", 60))?.dates || null;
}

export function buildRai() {
  const cal = calendar();
  if (!cal) return null;
  const inputs = RAI_INPUTS
    .map(i => ({ ...i, series: hist(i.id, 80), ppy: ITEM_BY_ID[i.id].ppy || 252 }))
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

export function buildRegime() {
  const cal = calendar();
  if (!cal) return null;
  const inputs = REGIME_INPUTS
    .map(i => ({ ...i, kind: ITEM_BY_ID[i.id].kind, ppy: ITEM_BY_ID[i.id].ppy || 252, series: hist(i.id, 200) }))
    .filter(i => i.series);
  /* Weeks count once they're over in New York, so a live Friday price can't decide one. */
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  return regimeModel(inputs, cal, { today });
}

/* ------------------------------------------------------ flows and premia */
export function buildVrp() {
  const es = hist("es", 80), vix = hist("vix", 80);
  if (!es || !vix) return null;
  const v = vrpSeries(es, vix);
  return v.values.length > 20 ? v : null;
}

/* ES against Treasury price moves; the live 10Y quote, else the H.15 close. */
export function buildStockBond() {
  const es = hist("es", 100), ten = hist("us10y", 100) || hist("dgs10", 100);
  if (!es || !ten) return null;
  const c = stockBondCorr(es, ten);
  return c.values.length > 20 ? c : null;
}

export const TREND_ASSETS = ["es", "nq", "gc", "cl", "us10y", "dxy", "usdjpy", "btc"];

export function buildTrend() {
  return TREND_ASSETS.map(id => {
    const it = ITEM_BY_ID[id], s = hist(id, 300);
    const t = s && trendNow(s, { kind: it.kind === "rate" ? "rate" : "price", ppy: it.ppy || 252 });
    return t && { id, item: it, ...t };
  }).filter(Boolean);
}

/* Month-to-date change from the last close of the previous month. */
function mtd(s, f) {
  const ym = s.dates[s.dates.length - 1].slice(0, 7);
  const i = s.dates.findIndex(d => d.slice(0, 7) === ym);
  return i > 0 ? f(s.values[s.values.length - 1], s.values[i - 1]) : null;
}

/* Upcoming calendar events, plus the month-end rebalancing gap: ES month to
   date minus a 10-year Treasury's (≈ −8.5 × the yield change, modified duration). */
export function buildCalendar() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const u = upcoming(today);
  const es = hist("es", 30), ten = hist("us10y", 30) || hist("dgs10", 30);
  const eq = es && mtd(es, (a, b) => (a / b - 1) * 100);
  const bond = ten && mtd(ten, (a, b) => -8.5 * (a - b));
  return { ...u, rebal: eq != null && bond != null ? { eq, bond, gap: eq - bond } : null };
}
