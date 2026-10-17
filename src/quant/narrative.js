/* "Today's read": fixed rules that turn cross-asset moves into plain-English
   observations. Each rule fires only on the numbers, says which numbers, and
   gets a strength so the strongest few are shown. No randomness, no model.

   facts (see src/model/facts.js):
     moves[id]  = { score, chg1m }  score: 1-month vol-scaled move (σ), chg1m: % for
                                    prices, bp for rates
     levels     = { vix, move }     robust z-score of the level vs its past year
     curve      = { chg2s10, chg2y, chg10y }  1-month changes in the 2s10s spread and
                                    its two H.15 legs, bp

   Thresholds are in σ of each market's own 1-month move: 1σ is unusual, 2σ rare.
   These are rules of thumb from standard cross-asset practice, not forecasts. */
import { mean } from "./stats.js";

const sc = (f, id) => f.moves?.[id]?.score ?? null;
const chg = (f, id) => f.moves?.[id]?.chg1m ?? null;
const avail = (...xs) => xs.filter(x => x != null && Number.isFinite(x));
const avg = (...xs) => { const v = avail(...xs); return v.length ? mean(v) : null; };
const ge = (x, t) => x != null && x >= t;
const le = (x, t) => x != null && x <= t;

export const fmtSigma = x => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(1) + "σ";
export const fmtBp = x => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(0) + " bp";
const fmtZ = x => "z " + (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(1);

/* Composite readings shared by several rules. */
function derive(f) {
  const grains = avg(sc(f, "zc"), sc(f, "zw"), sc(f, "zs"));
  return {
    es: sc(f, "es"),
    energy: sc(f, "cl") ?? sc(f, "dbc"),
    energyLabel: sc(f, "cl") != null ? "Oil" : "Commodities",
    food: grains ?? sc(f, "dba"),
    foodLabel: grains != null ? "Grains" : "Agriculture",
    grains,
    be: chg(f, "be10"),
    hy: sc(f, "hyoas"), /* positive = spreads widening */
    vixZ: f.levels?.vix ?? null,
    moveZ: f.levels?.move ?? null,
  };
}

const ev = (label, value) => ({ label, value });

export const RULES = [
  {
    id: "cost_push",
    excludes: ["commodity_inflation", "oil_alone"],
    test(f, d) {
      if (!(ge(d.energy, 1) && ge(d.food, 0.75) && le(d.es, -0.75))) return null;
      let text = "Energy and food are rising while stocks fall: a cost-push pattern that leans stagflationary.";
      if (ge(d.be, 8)) text += " Breakevens agree, up " + fmtBp(d.be).slice(1) + " this month.";
      else if (d.be != null && d.be <= 2) text += " Breakevens have barely moved, so bond markets don't see it lasting yet.";
      return {
        strength: Math.min(d.energy, d.food, -d.es), tone: "d", text,
        evidence: [ev(d.energyLabel, fmtSigma(d.energy)), ev(d.foodLabel, fmtSigma(d.food)), ev("ES", fmtSigma(d.es)), d.be != null && ev("10Y breakeven", fmtBp(d.be))],
      };
    },
  },
  {
    id: "commodity_inflation",
    excludes: ["oil_alone"],
    test(f, d) {
      if (!(ge(d.energy, 1) && ge(d.food, 1))) return null;
      return {
        strength: 0.9 * Math.min(d.energy, d.food), tone: "d",
        text: "Energy and grains are both rising: broad commodity inflation pressure." + (d.es != null && d.es > -0.25 ? " Stocks haven't reacted yet." : ""),
        evidence: [ev(d.energyLabel, fmtSigma(d.energy)), ev(d.foodLabel, fmtSigma(d.food)), d.es != null && ev("ES", fmtSigma(d.es))],
      };
    },
  },
  {
    id: "reflation",
    test(f, d) {
      const hg = sc(f, "hg"), y10 = chg(f, "us10y");
      if (!(ge(hg, 1) && ge(d.es, 0.5) && ge(d.be, 5) && ge(y10, 10))) return null;
      return {
        strength: Math.min(hg, d.es), tone: "u",
        text: "Copper, stocks, breakevens and yields are rising together: a reflation pattern, with growth and inflation expectations both moving up.",
        evidence: [ev("Copper", fmtSigma(hg)), ev("ES", fmtSigma(d.es)), ev("10Y breakeven", fmtBp(d.be)), ev("10Y yield", fmtBp(y10))],
      };
    },
  },
  {
    id: "growth_scare",
    test(f, d) {
      const cg = sc(f, "cugold"), y10 = sc(f, "us10y");
      if (!(le(cg, -1) && le(y10, -0.75))) return null;
      return {
        strength: Math.min(-cg, -y10), tone: "d",
        text: "Copper is lagging gold and long yields are falling: the market is marking down growth." +
          (le(d.es, -0.5) ? " Stocks are following." : d.es != null ? " Stocks haven't priced it in yet." : ""),
        evidence: [ev("Copper/gold", fmtSigma(cg)), ev("10Y yield", fmtSigma(y10)), d.es != null && ev("ES", fmtSigma(d.es))],
      };
    },
  },
  {
    id: "haven_bid",
    test(f, d) {
      const gc = sc(f, "gc");
      const stress = Math.max(d.vixZ ?? -Infinity, d.es != null ? -d.es : -Infinity);
      if (!(ge(gc, 1) && stress >= 1)) return null;
      return {
        strength: Math.min(gc, stress), tone: "d",
        text: "Gold is climbing as stress rises: a safe-haven bid.",
        evidence: [ev("Gold", fmtSigma(gc)), d.vixZ != null && ev("VIX", fmtZ(d.vixZ)), d.es != null && ev("ES", fmtSigma(d.es))],
      };
    },
  },
  {
    id: "liquidity_rally",
    test(f, d) {
      const gc = sc(f, "gc"), dxy = sc(f, "dxy");
      if (!(ge(gc, 1.5) && ge(d.es, 0.5) && le(dxy, 0))) return null;
      return {
        strength: 0.8 * Math.min(gc, d.es), tone: "",
        text: "Gold and stocks are rising together with a soft dollar, which usually means easy liquidity, not fear.",
        evidence: [ev("Gold", fmtSigma(gc)), ev("ES", fmtSigma(d.es)), ev("Dollar", fmtSigma(dxy))],
      };
    },
  },
  {
    id: "dollar_squeeze",
    test(f) {
      const dxy = sc(f, "dxy"), cm = avg(sc(f, "dbc"), sc(f, "hg"));
      if (!(ge(dxy, 1.25) && le(cm, -0.5))) return null;
      return {
        strength: 0.8 * dxy, tone: "d",
        text: "A strong dollar is weighing on commodities, which are priced in dollars.",
        evidence: [ev("Dollar", fmtSigma(dxy)), ev("Commodities", fmtSigma(cm))],
      };
    },
  },
  {
    id: "credit_leads",
    test(f, d) {
      if (!(ge(d.hy, 1) && d.es != null && d.es >= -0.25)) return null;
      return {
        strength: d.hy, tone: "d",
        text: "Credit spreads are widening while stocks hold up. Credit has often turned before stocks.",
        evidence: [ev("HY spread", fmtSigma(d.hy) + " wider"), ev("ES", fmtSigma(d.es))],
      };
    },
  },
  {
    id: "broad_risk_off",
    test(f, d) {
      if (!(ge(d.hy, 1) && le(d.es, -1))) return null;
      return {
        strength: Math.min(d.hy, -d.es), tone: "d",
        text: "Credit and stocks are selling off together: a broad risk-off move.",
        evidence: [ev("HY spread", fmtSigma(d.hy) + " wider"), ev("ES", fmtSigma(d.es))],
      };
    },
  },
  {
    id: "healthy_risk_on",
    test(f, d) {
      if (!(ge(d.es, 1.25) && le(d.hy, -0.5) && (d.vixZ == null || d.vixZ <= 0))) return null;
      return {
        strength: Math.min(d.es, -d.hy), tone: "u",
        text: "Stocks are trending up, credit spreads are tightening and volatility is low.",
        evidence: [ev("ES", fmtSigma(d.es)), ev("HY spread", fmtSigma(-d.hy) + " tighter"), d.vixZ != null && ev("VIX", fmtZ(d.vixZ))],
      };
    },
  },
  {
    id: "rates_vol",
    test(f, d) {
      if (!ge(d.moveZ, 2)) return null;
      return {
        strength: d.moveZ - 1, tone: "d",
        text: "Bond-market volatility is extreme. It usually spills into other markets.",
        evidence: [ev("MOVE", fmtZ(d.moveZ))],
      };
    },
  },
  {
    id: "curve",
    test(f) {
      /* Prefer the H.15 legs the spread is built from; fall back to the cards. */
      const s = f.curve?.chg2s10, c2 = f.curve?.chg2y ?? chg(f, "us2y"), c10 = f.curve?.chg10y ?? chg(f, "us10y");
      if (s == null || Math.abs(s) < 20) return null;
      const strength = Math.min(3, Math.abs(s) / 20);
      const evidence = [ev("2s10s", fmtBp(s)), c2 != null && ev("2Y", fmtBp(c2)), c10 != null && ev("10Y", fmtBp(c10))];
      if (s > 0) {
        if (c2 != null && c2 < 0 && Math.abs(c2) >= Math.abs(c10 ?? 0)) {
          return { strength, tone: "", evidence, text: "The curve is steepening because short rates are falling: the market is pricing Fed cuts." };
        }
        return { strength, tone: "d", evidence, text: "Long yields are rising faster than short ones: term-premium or inflation worries are building." };
      }
      if (c2 != null && c2 > 0) {
        return { strength, tone: "d", evidence, text: "Short rates are rising faster than long ones: the market is pricing a more hawkish Fed." };
      }
      return { strength, tone: "", evidence, text: "Long yields are falling faster than short ones: the market sees slower growth ahead." };
    },
  },
  {
    id: "carry_unwind",
    test(f, d) {
      const jpy = sc(f, "usdjpy");
      if (!(le(jpy, -1.5) && ge(d.vixZ, 0.5))) return null;
      return {
        strength: -jpy, tone: "d",
        text: "The yen is strengthening sharply as volatility rises: watch for a carry-trade unwind.",
        evidence: [ev("USD/JPY", fmtSigma(jpy)), ev("VIX", fmtZ(d.vixZ))],
      };
    },
  },
  {
    id: "grains_only",
    test(f, d) {
      if (!(ge(d.grains, 1.5) && d.energy != null && Math.abs(d.energy) < 0.5)) return null;
      return {
        strength: 0.8 * d.grains, tone: "",
        text: "Grains are moving on their own, without energy: more likely weather or supply than macro.",
        evidence: [ev("Grains", fmtSigma(d.grains)), ev(d.energyLabel, fmtSigma(d.energy))],
      };
    },
  },
  {
    id: "oil_alone",
    test(f, d) {
      if (!(ge(d.energy, 1.5) && d.es != null && d.es >= -0.25)) return null;
      return {
        strength: 0.8 * d.energy, tone: "d",
        text: "Oil is up sharply but stocks haven't reacted yet.",
        evidence: [ev(d.energyLabel, fmtSigma(d.energy)), ev("ES", fmtSigma(d.es))],
      };
    },
  },
  {
    id: "natgas",
    test(f) {
      const ng = sc(f, "ng");
      if (ng == null || Math.abs(ng) < 2) return null;
      return {
        strength: 0.6 * (Math.abs(ng) - 1), tone: "",
        text: "Natural gas is having an outsized move, most likely from weather or storage.",
        evidence: [ev("Nat gas", fmtSigma(ng))],
      };
    },
  },
];

export const QUIET = {
  id: "quiet", strength: 0, tone: "",
  text: "No strong cross-asset pattern this month. Most markets are moving within their normal ranges.",
  evidence: [],
};

/* The strongest observations, best first, at most `limit`. */
export function readMarket(facts, limit = 4) {
  const d = derive(facts);
  const fired = [];
  for (const r of RULES) {
    const out = r.test(facts, d);
    if (out && out.strength > 0) fired.push({ id: r.id, excludes: r.excludes || [], ...out, evidence: out.evidence.filter(Boolean) });
  }
  fired.sort((a, b) => b.strength - a.strength);
  const shown = [], blocked = new Set();
  for (const r of fired) {
    if (blocked.has(r.id)) continue;
    shown.push(r);
    r.excludes.forEach(x => blocked.add(x));
    if (shown.length >= limit) break;
  }
  return shown.length ? shown.map(r => { const o = { ...r }; delete o.excludes; return o; }) : [QUIET];
}
