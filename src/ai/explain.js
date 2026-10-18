/* Shared by the browser and the /api/explain function.

   The browser sends only numbers. The server validates them against a fixed
   schema (known ids, bounded finite numbers, ISO dates) and rebuilds every
   label and sentence itself, so nothing a visitor types can reach the prompt. */
import { ITEM_BY_ID, READ_IDS } from "../config.js";
import { regimeLabel } from "../quant/models.js";
import { QUADRANTS, quadrantOf } from "../quant/regime.js";
import { fmtBp, fmtSigma, readMarket } from "../quant/narrative.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (x, lo, hi) => (typeof x === "number" && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : null);
const date = x => (typeof x === "string" && ISO.test(x) ? x : null);
const obj = x => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const ordinal = n => { const t = ["th", "st", "nd", "rd"], v = n % 100; return n + (t[(v - 20) % 10] || t[v] || t[0]); };

export function validateFacts(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("facts must be an object");
  const moves = {};
  for (const id of READ_IDS) {
    const m = obj(obj(raw.moves)[id]);
    const score = num(m.score, -3, 3), chg1m = num(m.chg1m, -1000, 1000);
    if (score != null || chg1m != null) moves[id] = { score, chg1m };
  }
  const lv = obj(raw.levels), cv = obj(raw.curve), rai = obj(raw.rai), rg = obj(raw.regime), ar = obj(raw.ar), rec = obj(raw.rec);
  const facts = {
    asOf: date(raw.asOf),
    moves,
    levels: { vix: num(lv.vix, -10, 10), move: num(lv.move, -10, 10), vxn: num(lv.vxn, -10, 10), v9d: num(lv.v9d, -10, 10) },
    relative: { lead: num(obj(raw.relative).lead, -3, 3), ew: num(obj(raw.relative).ew, -3, 3) },
    curve: { chg2s10: num(cv.chg2s10, -500, 500), chg2y: num(cv.chg2y, -500, 500), chg10y: num(cv.chg10y, -500, 500) },
    rai: num(rai.value, -3, 3) == null ? null : { value: num(rai.value, -3, 3), pct: num(rai.pct, 0, 1) },
    regime: num(rg.growth, -3, 3) == null || num(rg.inflation, -3, 3) == null ? null
      : {
        growth: num(rg.growth, -3, 3), inflation: num(rg.inflation, -3, 3), since: date(rg.since),
        /* Only one of the four fixed names gets through; anything else is dropped. */
        quadrant: Object.hasOwn(QUADRANTS, rg.quadrant) ? rg.quadrant : null, weeks: num(rg.weeks, 0, 1000),
      },
    ar: num(ar.latest, 0, 1) == null ? null : { latest: num(ar.latest, 0, 1), shift: num(ar.shift, -10, 10) },
    rec: num(rec.prob, 0, 1) == null ? null : { prob: num(rec.prob, 0, 1) },
  };
  if (Object.keys(moves).length < 5) throw new Error("not enough data");
  return facts;
}

const chgText = (id, x) => {
  if (x == null) return "";
  return ITEM_BY_ID[id].kind === "price" ? (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(1) + "%" : fmtBp(x);
};

export const SYSTEM_PROMPT = `You write the short daily note on a macro dashboard used by a retail futures trader. You are given today's market data as numbers, plus observations a rules engine has already drawn from them.

Write two short paragraphs, 90 to 140 words in total, in plain English:
1. What markets are doing and the most likely reading of it.
2. What would confirm or change that reading over the coming weeks, naming specific markets from the data.

Rules:
- Use only the data given. Do not mention news, events, people or causes that are not in the data. When you suggest a cause, say it is "consistent with" or "likely", never certain.
- Where the data disagree with each other, say so instead of forcing one story.
- No price targets, no trade recommendations, no "buy" or "sell".
- σ means a move measured in that market's own typical 1-month move: about 1σ is unusual, 2σ is rare.
- Write prose only: no headings, bullet points, emoji or markdown.`;

/* The data block, built from validated numbers only. Deterministic, so it also
   serves as a cache key. */
export function buildPrompt(facts) {
  const lines = [];
  if (facts.asOf) lines.push("Data as of " + facts.asOf + ".");
  if (facts.rai) {
    lines.push("Risk Appetite Index: " + fmtSigma(facts.rai.value).replace("σ", "") + " (" + regimeLabel(facts.rai.value) + ")" +
      (facts.rai.pct != null ? ", " + ordinal(Math.round(facts.rai.pct * 100)) + " percentile of the past year" : "") + ".");
  }
  if (facts.regime) {
    /* The regime the card shows (weekly, confirmed after three weeks), not today's raw quadrant. */
    const r = facts.regime;
    const q = r.quadrant || quadrantOf(r.growth, r.inflation);
    lines.push("Growth × inflation regime, read weekly from 3- and 6-month market moves and changed only after a new one holds three weeks: " +
      QUADRANTS[q].label + (r.since ? ", since the week of " + r.since : "") + (r.weeks != null ? " (" + Math.round(r.weeks) + " weeks)" : "") +
      ". This week's reading: growth score " + r.growth.toFixed(2) + ", inflation score " + r.inflation.toFixed(2) + ".");
  }
  if (facts.ar) lines.push("Absorption ratio (cross-asset coupling): " + Math.round(facts.ar.latest * 100) + "%" +
    (facts.ar.shift != null ? ", 15-day shift " + facts.ar.shift.toFixed(1) + "σ vs its past year" : "") + ".");
  if (facts.rec) lines.push("NY Fed yield-curve recession probability, 12 months: " + Math.round(facts.rec.prob * 100) + "%.");
  if (facts.levels.vix != null) lines.push("VIX level vs its past year: z " + facts.levels.vix.toFixed(1) + ".");
  if (facts.levels.move != null) lines.push("MOVE (bond volatility) level vs its past year: z " + facts.levels.move.toFixed(1) + ".");
  if (facts.levels.vxn != null) lines.push("Nasdaq vol priced against S&P vol (VXN/VIX ratio) vs its past year: z " + facts.levels.vxn.toFixed(1) + (facts.levels.vxn >= 1 ? " (growth names' options bid hard)." : "."));
  if (facts.levels.v9d != null) lines.push("Nine-day vs 30-day implied vol (VIX9D/VIX) vs its past year: z " + facts.levels.v9d.toFixed(1) + (facts.levels.v9d >= 1 ? " (front-of-curve stress)." : "."));
  if (facts.relative.lead != null) lines.push("Growth leadership, Nasdaq 100 vs S&P 500 over the past month: " + facts.relative.lead.toFixed(1) + " sigma.");
  if (facts.relative.ew != null) lines.push("Breadth, equal-weight S&P (RSP) vs cap-weight (SPY) over the past month: " + facts.relative.ew.toFixed(1) + " sigma.");
  if (facts.curve.chg2s10 != null) {
    lines.push("2s10s curve, 1-month change: " + fmtBp(facts.curve.chg2s10) +
      (facts.curve.chg2y != null && facts.curve.chg10y != null ? " (2Y " + fmtBp(facts.curve.chg2y) + ", 10Y " + fmtBp(facts.curve.chg10y) + ", H.15 closes)" : "") + ".");
  }

  lines.push("", "1-month moves (vol-scaled score, then the raw change):");
  for (const id of READ_IDS) {
    const m = facts.moves[id];
    if (!m) continue;
    const parts = [m.score != null ? fmtSigma(m.score) : null, chgText(id, m.chg1m) || null].filter(Boolean);
    lines.push("- " + ITEM_BY_ID[id].name + ": " + parts.join(", "));
  }

  lines.push("", "Rules-engine observations:");
  for (const r of readMarket(facts)) lines.push("- " + r.text);

  const user = lines.join("\n");
  return { system: SYSTEM_PROMPT, user, key: user };
}
