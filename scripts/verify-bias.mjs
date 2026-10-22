/* Quantitative verification of the market-bias card (scripts/verify-bias.mjs).

   Reproduces the deployed card offline (same cached series and the same app
   code path as scripts/bias-research.mjs: buildFrame -> combinationForecast ->
   evaluate -> readNow), then re-derives every headline number with independent
   code, not the production functions:

   1. "Chance higher" and "usually": a Simpson-integrated normal CDF versus
      the production polynomial approximation, over every forecast day.
   2. Hit rates ("right X% of N past calls, vs Y% on other days"), R^2, beat
      and up rates: plain loops over the raw forecast arrays.
   3. The confidence sub-line's call selection (whole record vs today's
      market state): recomputed from the byState split.
   4. Clark-West statistic: an independent Newey-West implementation.
   5. Look-ahead test: the frame is rebuilt from every input series truncated
      at a past date; every signal value and every walk-forward forecast made
      before that date must be bit-identical, or something is looking ahead.

   Usage:  node scripts/bias-research.mjs --refresh   (fresh series in cache)
           node scripts/verify-bias.mjs
   Exits non-zero if any check fails. Not part of the app bundle. */

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE = path.join(ROOT, "scripts", "cache");
const imp = p => import(pathToFileURL(path.join(ROOT, p)).href);
const { rollAdjust } = await imp("src/data/roll.js");
const { buildFrame, reframe } = await imp("src/model/history.js");
const { HORIZONS, PREDICTORS, combinationForecast, evaluate, biasLabel } = await imp("src/quant/composite.js");
const { biasFromFrame } = await imp("src/model/bias.js");

const read = f => JSON.parse(readFileSync(path.join(CACHE, f)));
const ykey = (sym, tr) => "y-" + sym.replace(/[^A-Z0-9]/gi, "_") + (tr ? "-tr" : "") + ".json";
const yahoo = (sym, tr) => read(ykey(sym, tr));
const fred = id => read("f-" + id + ".json");

const S = {
  es: yahoo("ES=F"), nq: yahoo("NQ=F"), gspc: yahoo("^GSPC"), ndx: yahoo("^NDX"),
  vix: yahoo("^VIX"), vix3m: yahoo("^VIX3M"), vix9d: yahoo("^VIX9D"), vxn: yahoo("^VXN"),
  vvix: yahoo("^VVIX"), move: yahoo("^MOVE"), us10y: yahoo("^TNX"), dxy: yahoo("DX-Y.NYB"),
  usdjpy: yahoo("JPY=X"), btc: yahoo("BTC-USD"), hyg: yahoo("HYG"), gc: yahoo("GC=F"),
  cl: yahoo("CL=F"), rsp: yahoo("RSP"), spy: yahoo("SPY"), hygtr: yahoo("HYG", true), ieftr: yahoo("IEF", true),
  hyoas: fred("BAMLH0A0HYM2"), dgs10: fred("DGS10"), us3m: fred("DGS3MO"),
};
S.es = rollAdjust(S.es, S.gspc);
S.nq = rollAdjust(S.nq, S.ndx);
console.log(`Series: ES ${S.es.dates.length} bars (${S.es.dates[0]} -> ${S.es.dates.at(-1)})`);

/* ---------- independent reference implementations ---------- */

/* Standard normal CDF by Simpson integration of the density: no shared code
   with src/quant/stats.js's polynomial approximation. */
function phiRef(x) {
  if (!isFinite(x)) return x > 0 ? 1 : 0;
  if (x < 0) return 1 - phiRef(-x);
  if (x > 6) return 1;
  const n = 40000, h = x / n;
  const f = u => Math.exp(-u * u / 2) / Math.sqrt(2 * Math.PI);
  let s = f(0) + f(x);
  for (let i = 1; i < n; i++) s += f(i * h) * (i % 2 ? 4 : 2);
  return 0.5 + s * h / 3;
}

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

/* Newey-West variance of a mean, Bartlett kernel, written independently of
   composite.js (same estimator, different code). */
function nwT(d, lag) {
  const T = d.length, mu = mean(d);
  let s = 0;
  for (let i = 0; i < T; i++) s += (d[i] - mu) ** 2;
  s /= T;
  for (let l = 1; l <= lag; l++) {
    let c = 0;
    for (let t = l; t < T; t++) c += (d[t] - mu) * (d[t - l] - mu);
    s += 2 * (1 - l / (lag + 1)) * (c / T);
  }
  return s > 0 ? mu / Math.sqrt(s / T) : 0;
}

const failures = [];
const check = (name, ok, detail) => {
  if (!ok) failures.push(name + (detail ? ": " + detail : ""));
  return ok;
};
const pct = x => (x == null ? "n/a" : (x * 100).toFixed(1) + "%");
const pc = x => Math.round(x * 100) + "%"; /* same rounding the card uses */

const frames = { es: buildFrame(S, S.es), nq: reframe(buildFrame(S, S.es), S.nq) };

/* ---------- per instrument and horizon ---------- */
for (const [inst, fr] of Object.entries(frames)) {
  console.log(`\n=== ${inst.toUpperCase()}  card as of ${fr.dates.at(-1)} ===`);
  const card = biasFromFrame(fr); /* the deployed path, exactly as the card */

  for (const hz of card) {
    const H = HORIZONS.find(x => x.key === hz.key);
    const res = combinationForecast(fr, H.h); /* default options = shipped v8 set */
    const ev = evaluate(res, { band: H.band, dates: fr.dates });
    const now = hz.now;
    const t = res.G.length - 1;

    /* 1. probabilities: production pUp/pBase vs the integrated CDF. */
    let maxPhi = 0;
    for (const arr of [res.pUp, res.pBase])
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] == null || res.sigma[i] == null) continue;
        const ref = phiRef((arr === res.pUp ? res.G[i] : res.M[i]) / res.sigma[i]);
        maxPhi = Math.max(maxPhi, Math.abs(arr[i] - ref));
      }
    check(`${inst}/${hz.key}: normal CDF`, maxPhi < 1e-6, `max diff ${maxPhi.toExponential(2)}`);

    /* 2. hit rates, R^2, up/beat rates from raw arrays. */
    const idx = [];
    for (let i = 0; i + H.h < res.G.length; i++) if (res.G[i] != null && res.M[i] != null) idx.push(i);
    const y = i => Math.log(res.P[i + H.h] / res.P[i]);
    const myHit = lab => {
      const g = [], o = [];
      for (const i of idx) {
        const L = biasLabel(res.pUp[i] - res.pBase[i], H.band);
        const went = lab === "Bearish" ? y(i) <= res.M[i] : y(i) > res.M[i];
        (L === lab ? g : o).push(went);
      }
      return { n: g.length, right: g.length ? g.filter(Boolean).length / g.length : null, others: o.length ? o.filter(Boolean).length / o.length : null };
    };
    let sseG = 0, sseM = 0, beat = 0, up = 0;
    for (const i of idx) { sseG += (y(i) - res.G[i]) ** 2; sseM += (y(i) - res.M[i]) ** 2; if (y(i) > res.M[i]) beat++; if (y(i) > 0) up++; }
    const myR2 = 1 - sseG / sseM;
    const myUp = up / idx.length, myBeat = beat / idx.length;
    for (const [lab, g] of [["Bullish", ev.bull], ["Bearish", ev.bear]]) {
      const m = myHit(lab);
      check(`${inst}/${hz.key}: ${lab} hit rate`, Math.abs((g.right ?? 0) - (m.right ?? 0)) < 1e-12 && g.n === m.n && Math.abs((g.others ?? 0) - (m.others ?? 0)) < 1e-12);
    }
    check(`${inst}/${hz.key}: R^2`, Math.abs(myR2 - ev.r2) < 1e-12, `${myR2} vs ${ev.r2}`);
    check(`${inst}/${hz.key}: up/beat rates`, Math.abs(myUp - ev.upRate) < 1e-12 && Math.abs(myBeat - ev.beatRate) < 1e-12);

    /* 3. Clark-West, independent NW t-stat. */
    const cw = nwT(idx.map(i => (y(i) - res.M[i]) ** 2 - ((y(i) - res.G[i]) ** 2 - (res.M[i] - res.G[i]) ** 2)), H.h - 1);
    check(`${inst}/${hz.key}: Clark-West t`, Math.abs(cw - ev.cwT) < 1e-9 * Math.max(1, Math.abs(ev.cwT)), `${cw} vs ${ev.cwT}`);

    /* 4. the card's today-read and its confidence sub-line. */
    if (now) {
      const myP = phiRef(res.G[t] / res.sigma[t]), myBase = phiRef(res.M[t] / res.sigma[t]);
      check(`${inst}/${hz.key}: today p`, Math.abs(myP - now.p) < 1e-6, `${now.p} vs ${myP}`);
      check(`${inst}/${hz.key}: today base`, Math.abs(myBase - now.base) < 1e-6);
      const myLab = biasLabel(myP - myBase, H.band);
      check(`${inst}/${hz.key}: label`, myLab === now.label, `${now.label} vs ${myLab}`);

      if (now.label !== "Neutral" && now.why) {
        /* replicate the selection rule: today's state if it has 50+ such calls. */
        const st = now.state != null ? ev.byState[now.state] : null;
        const stG = st && (now.label === "Bullish" ? st.bull : st.bear);
        const useState = stG && stG.n >= 50;
        const g = useState ? stG : now.label === "Bullish" ? ev.bull : ev.bear;
        const chance = g.others ?? (now.label === "Bullish" ? (useState ? st.beatRate : ev.beatRate) : 1 - (useState ? st.beatRate : ev.beatRate));
        check(`${inst}/${hz.key}: why selection`, g.right === now.why.right && g.n === now.why.n && chance === now.why.chance && useState === now.why.inState);
        const edge = now.why.right - now.why.chance;
        const expect = (edge >= 0.05 && now.why.n >= 100 && now.agree >= 0.7 && ev.cwP < 0.1 && now.lambda >= 0.5) ? "High"
          : (edge >= 0.02 && now.why.n >= 50 && now.agree >= 0.5 && now.lambda >= 0.2) ? "Medium" : "Low";
        const capped = hz.recent && !(hz.recent.r2 > 0) ? "Low" : expect;
        check(`${inst}/${hz.key}: confidence grade`, capped === now.confidence, `${now.confidence} vs expected ${capped}`);
      }

      console.log(`  ${H.label}: ${now.label}  chance higher ${pc(now.p)} (usually ${pc(now.base)})  conf ${now.confidence ?? "-"}` +
        (now.why ? `  right ${pc(now.why.right)} of ${now.why.n} past calls${now.why.inState ? " in " + (now.state ? "stressed" : "calm") + " markets" : ""}, vs ${pc(now.why.chance)} on other days` : ""));
      console.log(`    record: ${ev.n} forecasts ${ev.from}-${ev.to}, OOS R^2 ${pct(ev.r2)}, CW p ${ev.cwP.toFixed(3)}, bull ${ev.bull.n} (${pct(ev.bull.right)} vs ${pct(ev.bull.others)}), bear ${ev.bear.n} (${pct(ev.bear.right)} vs ${pct(ev.bear.others)})` +
        (hz.recent ? `, last 3y R^2 ${pct(hz.recent.r2)}` : ""));
    } else console.log(`  ${H.label}: no read (not enough history)`);
  }
}

/* ---------- 5. look-ahead test ----------
   Rebuild everything from series truncated at a past date. Every signal value
   and every forecast made before that date must be identical. */
const CUT = "2024-12-31";
const cut = ser => {
  const k = ser.dates.findIndex(d => d > CUT);
  const n = k === -1 ? ser.dates.length : k;
  return { dates: ser.dates.slice(0, n), values: ser.values.slice(0, n) };
};
const S2 = Object.fromEntries(Object.entries(S).map(([id, ser]) => [id, cut(ser)]));
const frFull = buildFrame(S, S.es);
const frCut = buildFrame(S2, S2.es);
let nCut = 0;
while (nCut < frCut.dates.length && frCut.dates[nCut] <= CUT) nCut++;
check("look-ahead: date grid", frFull.dates.slice(0, nCut).every((d, i) => d === frCut.dates[i]));
for (const p of PREDICTORS) {
  if (!p.cal && !frFull[p.id]) continue;
  if (p.cal) continue;
  let bad = 0;
  for (let i = 0; i < nCut; i++) if (frFull[p.id][i] !== frCut[p.id][i]) bad++;
  check(`look-ahead: signal ${p.id}`, bad === 0, `${bad} differing values before ${CUT}`);
}
for (const h of [1, 5, 21]) {
  const a = combinationForecast(frFull, h), b = combinationForecast(frCut, h);
  /* Calendar flags (FOMC, turn-of-month, holidays) are known in advance, so a
     forecast made within h bars of the cutoff legitimately reads flags past
     it; compare only forecasts whose whole window lies inside the data. */
  let bad = 0, where = [];
  for (let i = 0; i + h < nCut; i++) {
    if (a.G[i] !== b.G[i] || a.pUp[i] !== b.pUp[i] || a.M[i] !== b.M[i] || a.sigma[i] !== b.sigma[i]) { bad++; where.push(frFull.dates[i]); }
  }
  check(`look-ahead: forecast h=${h}`, bad === 0, `${bad} differing (${where.slice(0, 5).join(", ")}${where.length > 5 ? ", …" : ""})`);
}
console.log(`\nLook-ahead cutoff ${CUT}: rebuilt ${nCut} of ${frFull.dates.length} days and compared signals, forecasts, vol and probabilities.`);

/* ---------- summary ---------- */
if (failures.length) {
  console.log("\nFAILED checks:");
  for (const f of failures) console.log("  " + f);
  process.exit(1);
}
console.log("\nAll checks passed: probabilities, hit rates, R^2, Clark-West, confidence grades, call selection and look-ahead integrity.");
