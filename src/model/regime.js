/* Risk Appetite Index (RAI) and the regime chips.
   See the Methodology section in index.html for the reasoning behind each step. */
import { ok, closesByDay, commonDates, mean, stdev } from "../state.js";

const INVERTED = { vix: true, hyoas: true, dxy: true };
export const RAI_INPUTS = [
  { id: "vix", inv: true }, { id: "hyoas", inv: true }, { id: "dxy", inv: true },
  { id: "es" }, { id: "btc" }, { id: "usdjpy" },
];
export const SHORT = { vix: "VIX", hyoas: "OAS", dxy: "DXY", es: "ES", btc: "BTC", usdjpy: "JPY" };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function dayPct(id) {
  const s = ok(id);
  return s && s.prev ? (s.price - s.prev) / s.prev * 100 : null;
}

/* Level z-score of the latest price against up to 200 daily closes, clamped to ±3. */
function zScore(id, invert) {
  const s = ok(id);
  if (!s || !s.closes || s.closes.length < 40) return null;
  const arr = s.closes.slice(-200);
  const mu = mean(arr), sd = stdev(arr, mu);
  if (!sd) return null;
  const z = clamp((s.price - mu) / sd, -3, 3);
  return invert ? -z : z;
}

/* Average absolute pairwise correlation of daily log returns (~2 months). */
function crossAssetRho() {
  const maps = ["es", "btc", "dxy", "usdjpy", "gc"]
    .map(ok)
    .filter(s => s && s.ts && s.closes && s.closes.length > 35)
    .map(closesByDay);
  if (maps.length < 3) return null;
  const dates = commonDates(maps).slice(-46);
  if (dates.length < 25) return null;
  const rets = maps.map(m => dates.slice(1).map((d, i) => Math.log(m.get(d) / m.get(dates[i]))));
  const pearson = (a, b) => {
    const ma = mean(a), mb = mean(b);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return da && db ? num / Math.sqrt(da * db) : 0;
  };
  let sum = 0, cnt = 0;
  for (let i = 0; i < rets.length; i++) {
    for (let j = i + 1; j < rets.length; j++) { sum += Math.abs(pearson(rets[i], rets[j])); cnt++; }
  }
  return cnt ? sum / cnt : null;
}

/* First principal component of the standardized input panel, by power iteration. */
function pcaWeights(inputs) {
  const series = [], metas = [];
  for (const cm of inputs) {
    const s = ok(cm.id);
    if (s && s.ts && s.closes && s.closes.length > 60) { series.push(closesByDay(s)); metas.push(cm); }
  }
  if (series.length < 4) return null;
  const dates = commonDates(series).slice(-150);
  if (dates.length < 60) return null;
  const Z = series.map((m, si) => {
    const raw = dates.map(d => m.get(d));
    const mu = mean(raw), sd = stdev(raw, mu) || 1;
    const sign = metas[si].inv ? -1 : 1;
    return raw.map(v => sign * (v - mu) / sd);
  });
  const n = Z.length, N = dates.length;
  const C = Z.map(zi => Z.map(zj => zi.reduce((acc, v, k) => acc + v * zj[k], 0) / N));
  let v = new Array(n).fill(1 / Math.sqrt(n));
  for (let it = 0; it < 60; it++) {
    const nv = C.map(row => row.reduce((a, c, j) => a + c * v[j], 0));
    const norm = Math.sqrt(nv.reduce((a, b) => a + b * b, 0)) || 1;
    v = nv.map(x => x / norm);
  }
  if (v.reduce((a, b) => a + b, 0) < 0) v = v.map(x => -x);
  let lambda = 0;
  for (let i = 0; i < n; i++) lambda += v[i] * C[i].reduce((s2, c, j) => s2 + c * v[j], 0);
  const absSum = v.reduce((a, b) => a + Math.abs(b), 0) || 1;
  const weights = {};
  metas.forEach((cm, i) => { weights[cm.id] = v[i] / absSum; });
  return { weights, explained: lambda / n, ids: metas.map(cm => cm.id) };
}

/* Daily RAI history using rolling 200-day z-scores and the given weights. */
function raiHistory(ids, wMap) {
  const maps = {}, used = [];
  for (const id of ids) {
    const s = ok(id);
    if (s && s.ts && s.closes && s.closes.length > 60) { maps[id] = closesByDay(s); used.push(id); }
  }
  if (used.length < 3) return null;
  const dates = commonDates(used.map(id => maps[id]));
  if (dates.length < 80) return null;
  const series = Object.fromEntries(used.map(id => [id, dates.map(d => maps[id].get(d))]));
  const out = [];
  for (let i = 40; i < dates.length; i++) {
    let sum = 0, wsum = 0;
    for (const id of used) {
      const arr = series[id].slice(Math.max(0, i - 199), i + 1);
      const mu = mean(arr), sd = stdev(arr, mu);
      if (!sd) continue;
      let z = clamp((series[id][i] - mu) / sd, -3, 3);
      if (INVERTED[id]) z = -z;
      const w = wMap && wMap[id] != null ? wMap[id] : 1 / used.length;
      sum += w * z;
      wsum += Math.abs(w);
    }
    if (wsum) out.push(sum / wsum);
  }
  return out.length > 20 ? out : null;
}

function labelFor(x, steps) {
  if (x >= steps[0]) return "Risk-on tape";
  if (x >= steps[1]) return "Leaning risk-on";
  if (x > -steps[1]) return "Mixed, pick your spots";
  if (x > -steps[0]) return "Leaning risk-off";
  return "Risk-off tape";
}

/* Returns everything the regime panel needs to render. */
export function computeRegime() {
  const chips = [];
  let score = 0, used = 0;
  const vote = c => { score += c === "u" ? 1 : c === "d" ? -1 : 0; used++; };

  const vix = ok("vix");
  if (vix) {
    const v = vix.price;
    const [word, c, sc] = v < 14 ? ["complacent", "u", 2] : v < 20 ? ["calm", "u", 1] : v < 28 ? ["elevated", "m", -1] : ["panic", "d", -2];
    chips.push({ t: "VIX " + v.toFixed(1) + " · " + word, c });
    score += sc; used++;
  }
  const esP = dayPct("es");
  if (esP != null) {
    const c = esP > 0.25 ? "u" : esP < -0.25 ? "d" : "m";
    chips.push({ t: "ES " + (esP >= 0 ? "+" : "") + esP.toFixed(2) + "%", c });
    vote(c);
  }
  const oas = ok("hyoas");
  if (oas) {
    const c = oas.price < 3.2 ? "u" : oas.price < 4.5 ? "m" : "d";
    chips.push({ t: "HY OAS " + oas.price.toFixed(2) + "% · " + (c === "u" ? "tight" : c === "m" ? "normal" : "wide"), c });
    vote(c);
  } else {
    const hygP = dayPct("hyg");
    if (hygP != null) {
      const c = hygP > 0.1 ? "u" : hygP < -0.15 ? "d" : "m";
      chips.push({ t: c === "u" ? "Credit bid" : c === "d" ? "Credit stress" : "Credit flat", c });
      vote(c);
    }
  }
  const dxyP = dayPct("dxy");
  if (dxyP != null) {
    const c = dxyP > 0.3 ? "d" : dxyP < -0.3 ? "u" : "m";
    chips.push({ t: c === "d" ? "Dollar bid" : c === "u" ? "Dollar heavy" : "Dollar flat", c });
    vote(c);
  }
  const jpyP = dayPct("usdjpy");
  if (jpyP != null) {
    const c = jpyP < -0.7 ? "d" : jpyP > 0.5 ? "u" : "m";
    chips.push({ t: c === "d" ? "Yen ripping · unwind watch" : c === "u" ? "Carry supportive" : "Yen calm", c });
    vote(c);
  }
  const btcP = dayPct("btc");
  if (btcP != null) {
    const c = btcP > 1 ? "u" : btcP < -1.5 ? "d" : "m";
    chips.push({ t: "BTC " + (btcP >= 0 ? "+" : "") + btcP.toFixed(1) + "%", c });
    vote(c);
  }
  const sp = ok("spread");
  if (sp) {
    chips.push(sp.price < 0
      ? { t: "Curve inverted " + sp.price.toFixed(0) + " bp", c: "d" }
      : { t: "Curve +" + sp.price.toFixed(0) + " bp", c: sp.price < 25 ? "m" : "u" });
  }
  const rho = crossAssetRho();
  if (rho != null) {
    chips.push({
      t: "Cross-asset ρ " + rho.toFixed(2) + (rho >= 0.55 ? " · macro-driven" : rho < 0.3 ? " · dispersed" : ""),
      c: rho >= 0.55 ? "m" : "u",
    });
  }

  const zmap = {};
  RAI_INPUTS.forEach(cm => { const z = zScore(cm.id, cm.inv); if (z != null) zmap[cm.id] = z; });
  const zIds = Object.keys(zmap);

  if (zIds.length >= 3) {
    const pca = pcaWeights(RAI_INPUTS.filter(cm => zmap[cm.id] != null));
    let rai, weights = null, ids = zIds, explained = null;
    if (pca && pca.ids.length >= 3 && pca.ids.every(id => zmap[id] != null)) {
      ids = pca.ids;
      weights = pca.weights;
      explained = pca.explained;
      rai = ids.reduce((a, id) => a + weights[id] * zmap[id], 0);
    } else {
      rai = mean(zIds.map(id => zmap[id]));
    }
    const history = raiHistory(ids, weights);
    /* Label and needle use a 3-day average so they don't flicker around thresholds. */
    const anchor = history && history.length >= 3 ? mean(history.slice(-3)) : rai;
    return {
      mode: "rai", chips, rai, history, ids, weights, explained, inputs: zIds.length,
      label: labelFor(anchor, [0.75, 0.25]),
      needle: clamp(50 + clamp(anchor, -2, 2) * 22, 6, 94),
    };
  }

  if (used < 2) return { mode: "none", chips };
  return {
    mode: "heuristic", chips,
    label: labelFor(score, [3, 1]),
    needle: clamp(50 + score * 7.5, 6, 94),
  };
}

