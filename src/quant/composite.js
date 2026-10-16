/* Market bias: a combination forecast of index returns over the next day,
   week and month, built so that nothing is fitted to the period it is judged on.

   Method (the standard out-of-sample approach of the equity-premium literature):
   1. One predictive regression per signal, r(t→t+h) = a + b·x(t), estimated on
      an expanding window of observations whose outcome was already known at t
      (s + h ≤ t). Goyal & Welch (2008) show single kitchen-sink models fail out
      of sample; simple univariate regressions combined hold up far better.
   2. Sign restriction (Campbell & Thompson 2008): each signal has the sign its
      research predicts. If the estimated slope points the other way, it is set
      to zero and that signal falls back to its historical mean.
   3. Combination (Rapach, Strauss & Zhou 2010): the forecasts are averaged with
      weights proportional to the inverse of each one's discounted out-of-sample
      squared error (DMSPE, Stock & Watson 2004), half-life one year. Until a
      signal has a year of its own out-of-sample record it gets an equal share.
   4. The models must earn their place against the plain long-run average. The
      final forecast is M + λ(F − M), where λ is the forecast-encompassing weight
      (Harvey, Leybourne & Newbold 1998) estimated from past out-of-sample
      errors only, discounted with the same half-life and clipped to [0, 1]. It
      is 0 until there is a year of record. When the models stop helping, λ
      falls and the read goes back to "no tilt".
   5. Evaluation, all on forecasts made before the outcome: out-of-sample R²
      against the prevailing historical mean (Campbell & Thompson 2008), the
      Clark & West (2007) test with Newey–West errors, hit rates, calibration,
      and the utility gain of a mean–variance investor (γ = 3) who uses the
      forecast instead of the historical mean (Rapach et al. 2010).

   The label is a tilt against normal: how much the forecast moves the chance of
   a higher close away from the long-run base rate. Bands were set in advance:
   1 point for a day, 2 for a week, 3 for a month. */
import { ewmaVolPath, logReturns, mean, normCdf, std } from "./stats.js";

export const HORIZONS = [
  { h: 1, key: "d", label: "Next day", band: 0.01 },
  { h: 5, key: "w", label: "Next week", band: 0.02 },
  { h: 21, key: "m", label: "Next month", band: 0.03 },
];

/* sign: the direction the cited research predicts. Calendar signals are the
   share of the next h sessions that fall in the window; they only matter at
   short horizons, so they are left out of the monthly model. */
export const PREDICTORS = [
  { id: "trend", sign: 1, label: "Trend followers", src: "Moskowitz, Ooi & Pedersen (2012)" },
  { id: "vrp", sign: 1, label: "Variance risk premium", src: "Bollerslev, Tauchen & Zhou (2009)" },
  { id: "raiS", sign: 1, label: "Risk appetite", src: "Kumar & Persaud (2002)" },
  { id: "dAR", sign: -1, label: "Absorption shift", src: "Kritzman, Li, Page & Rigobon (2011)" },
  { id: "rec", sign: -1, label: "Yield-curve recession odds", src: "Estrella & Mishkin (1996)" },
  { id: "tom", cal: "tom", maxH: 5, sign: 1, label: "Turn of month", src: "McConnell & Xu (2008)" },
  { id: "fomc", cal: "fomc", maxH: 5, sign: 1, label: "FOMC drift", src: "Lucca & Moench (2015)" },
  { id: "preHoliday", cal: "preHoliday", maxH: 5, sign: 1, label: "Pre-holiday", src: "Ariel (1990)" },
];

/* Share of the next h bars flagged in a calendar series. */
function calShare(flags, h) {
  return flags.map((_, t) => {
    let k = 0;
    for (let j = 1; j <= h; j++) { if (t + j >= flags.length) return null; if (flags[t + j]) k++; }
    return k / h;
  });
}

/* Walk-forward combination forecast for horizon h. Every output at index t uses
   prices and signals up to t only (calendar flags are known in advance).
   F: raw combination; G: final forecast after the encompassing weight λ;
   M: prevailing historical mean (the benchmark). */
export function combinationForecast(frame, h, { minObs = 504, holdout = 252, halfLife = 252 } = {}) {
  const P = frame.price, n = P.length;
  const preds = PREDICTORS.filter(p => (p.cal ? h <= p.maxH && frame.cal?.[p.cal] : frame[p.id]));
  const X = preds.map(p => (p.cal ? calShare(frame.cal[p.cal], h) : frame[p.id]));
  const theta = 0.5 ** (1 / halfLife);
  const sums = preds.map(() => ({ n: 0, sx: 0, sy: 0, sxx: 0, sxy: 0 }));
  const phi = preds.map(() => 0), seen = preds.map(() => 0);
  const f = preds.map(() => new Array(n).fill(null));
  const w = preds.map(() => new Array(n).fill(null));
  const F = new Array(n).fill(null), G = new Array(n).fill(null), EQ = new Array(n).fill(null), M = new Array(n).fill(null);
  const lambda = new Array(n).fill(null);
  let ySum = 0, yN = 0, encA = 0, encB = 0, encN = 0;

  for (let t = 0; t < n; t++) {
    /* The outcome of the forecast made at s = t − h is now known. */
    const s = t - h;
    if (s >= 0) {
      const y = Math.log(P[t] / P[s]);
      ySum += y; yN++;
      for (let k = 0; k < preds.length; k++) {
        const x = X[k][s];
        if (x != null && isFinite(x)) {
          const a = sums[k];
          a.n++; a.sx += x; a.sy += y; a.sxx += x * x; a.sxy += x * y;
        }
        if (f[k][s] != null) { phi[k] = theta * phi[k] + (y - f[k][s]) ** 2; seen[k]++; }
      }
      /* Encompassing regression of the benchmark's error on the models' tilt. */
      if (F[s] != null && M[s] != null) {
        const d = F[s] - M[s];
        encA = theta * encA + (y - M[s]) * d;
        encB = theta * encB + d * d;
        encN++;
      }
    }
    if (yN < minObs) continue;
    M[t] = ySum / yN;

    const avail = [];
    for (let k = 0; k < preds.length; k++) {
      const a = sums[k], x = X[k][t];
      if (a.n < minObs || x == null || !isFinite(x)) continue;
      const xb = a.sx / a.n, yb = a.sy / a.n, vx = a.sxx / a.n - xb * xb;
      let b = vx > 1e-12 ? (a.sxy / a.n - xb * yb) / vx : 0;
      if (b * preds[k].sign < 0) b = 0;
      f[k][t] = yb + b * (x - xb);
      avail.push(k);
    }
    if (avail.length < 2) continue;
    /* Seasoned signals share their slots by inverse discounted error; the rest
       get an equal share each. */
    const seasoned = avail.filter(k => seen[k] >= holdout && phi[k] > 0);
    const inv = seasoned.reduce((a, k) => a + 1 / phi[k], 0);
    let c = 0;
    for (const k of avail) {
      const wk = seasoned.includes(k) ? (seasoned.length / avail.length) * (1 / phi[k]) / inv : 1 / avail.length;
      w[k][t] = wk;
      c += wk * f[k][t];
    }
    F[t] = c;
    EQ[t] = mean(avail.map(k => f[k][t]));
    const lam = encN >= holdout && encB > 0 ? Math.max(0, Math.min(1, encA / encB)) : 0;
    lambda[t] = lam;
    G[t] = M[t] + lam * (c - M[t]);
  }

  /* Chance the index is higher over the horizon, under the final forecast and
     under the long-run average, using the conditional (EWMA) volatility. */
  const vol = ewmaVolPath(logReturns(P));
  const sigma = P.map((_, t) => (t > 0 && vol[t - 1] > 0 ? vol[t - 1] * Math.sqrt(h) : null));
  const prob = A => A.map((x, t) => (x == null || sigma[t] == null ? null : normCdf(x / sigma[t])));
  const pUp = prob(G), pBase = prob(M);
  return { h, P, preds, X, f, w, F, G, EQ, M, lambda, sigma, pUp, pBase };
}

/* Newey–West t-statistic of a mean, Bartlett kernel with `lag` lags. */
export function neweyWestT(d, lag) {
  const T = d.length, mu = mean(d);
  let s = d.reduce((a, x) => a + (x - mu) ** 2, 0) / T;
  for (let l = 1; l <= lag; l++) {
    let c = 0;
    for (let t = l; t < T; t++) c += (d[t] - mu) * (d[t - l] - mu);
    s += 2 * (1 - l / (lag + 1)) * (c / T);
  }
  return s > 0 ? mu / Math.sqrt(s / T) : 0;
}

/* tilt: chance up under the forecast minus the base-rate chance. */
export const biasLabel = (tilt, band) => (tilt == null ? null : tilt >= band ? "Bullish" : tilt <= -band ? "Bearish" : "Neutral");

/* Out-of-sample scorecard of a combinationForecast result. */
export function evaluate(res, { band = 0.02, gamma = 3, ppy = 252, dates = null } = {}) {
  const { h, P, F, G, EQ, M, f, preds, sigma, pUp, pBase, lambda } = res;
  const n = G.length;
  const idx = [];
  for (let t = 0; t + h < n; t++) if (G[t] != null && M[t] != null) idx.push(t);
  if (idx.length < 60) return null;
  const y = t => Math.log(P[t + h] / P[t]);
  const r2 = (A, ts) => {
    let a = 0, b = 0;
    for (const t of ts) { a += (y(t) - A[t]) ** 2; b += (y(t) - M[t]) ** 2; }
    return b > 0 ? 1 - a / b : null;
  };
  /* Clark–West: adjusted MSFE difference, one-sided against the historical mean. */
  const cwT = neweyWestT(idx.map(t => (y(t) - M[t]) ** 2 - ((y(t) - G[t]) ** 2 - (M[t] - G[t]) ** 2)), h - 1);

  /* A tilt call is right when the outcome lands on its side of the long-run average. */
  const calls = idx.map(t => ({ t, lab: biasLabel(pUp[t] - pBase[t], band), beat: y(t) > M[t], up: y(t) > 0 }));
  const rate = lab => {
    const g = calls.filter(x => x.lab === lab);
    if (!g.length) return { n: 0, right: null };
    const right = lab === "Bearish" ? g.filter(x => !x.beat).length : g.filter(x => x.beat).length;
    return { n: g.length, right: right / g.length };
  };
  const beatRate = calls.filter(x => x.beat).length / calls.length;
  const upRate = calls.filter(x => x.up).length / calls.length;
  const calib = [[0, 0.45], [0.45, 0.5], [0.5, 0.55], [0.55, 0.6], [0.6, 1.01]].map(([lo, hi]) => {
    const g = calls.filter(x => pUp[x.t] >= lo && pUp[x.t] < hi);
    return { lo, hi, n: g.length, up: g.length ? g.filter(x => x.up).length / g.length : null, mean: g.length ? mean(g.map(x => pUp[x.t])) : null };
  });

  /* Mean–variance investor, rebalanced every h days (non-overlapping), weight
     E[r] / (γσ²) clipped to [0, 1.5]; same investor using the historical mean. */
  const port = A => {
    const r = [];
    for (let i = 0; i < idx.length; i += h) {
      const t = idx[i], s2 = sigma[t] ** 2;
      if (!(s2 > 0)) continue;
      const wt = Math.max(0, Math.min(1.5, A[t] / (gamma * s2)));
      r.push(wt * (Math.exp(y(t)) - 1));
    }
    const per = ppy / h;
    return { cer: (mean(r) - gamma / 2 * std(r) ** 2) * per, sharpe: std(r) > 0 ? mean(r) / std(r) * Math.sqrt(per) : null };
  };
  const pm = port(G), pb = port(M);

  /* Goyal–Welch diagnostic: cumulative SSE(historical mean) − SSE(forecast). */
  let cum = 0, cumRaw = 0;
  const cumSse = idx.map(t => (cum += (y(t) - M[t]) ** 2 - (y(t) - G[t]) ** 2));
  const cumSseRaw = idx.map(t => (cumRaw += (y(t) - M[t]) ** 2 - (y(t) - F[t]) ** 2));

  return {
    n: idx.length, from: dates?.[idx[0]] ?? null, to: dates?.[idx[idx.length - 1]] ?? null,
    r2: r2(G, idx), r2Raw: r2(F, idx), r2Equal: r2(EQ, idx.filter(t => EQ[t] != null)),
    lambdaMean: mean(idx.map(t => lambda[t])),
    single: preds.map((p, k) => {
      const ts = idx.filter(t => f[k][t] != null);
      return { id: p.id, label: p.label, src: p.src, n: ts.length, r2: ts.length > 60 ? r2(f[k], ts) : null };
    }),
    cwT, cwP: 1 - normCdf(cwT),
    upRate, beatRate, bull: rate("Bullish"), bear: rate("Bearish"), neutralShare: rate("Neutral").n / calls.length,
    calib, cer: pm.cer, cerMean: pb.cer, cerGain: pm.cer - pb.cer, sharpe: pm.sharpe, sharpeMean: pb.sharpe,
    cumSse: { dates: dates ? idx.map(t => dates[t]) : null, values: cumSse, raw: cumSseRaw },
  };
}

/* Today's reading for one horizon: label, chances, expected move, each
   signal's pull on the final forecast relative to the long-run average,
   agreement, the models' current weight λ, and a confidence grade. */
export function readNow(res, ev, band) {
  const t = res.G.length - 1;
  const p = res.pUp[t], base = res.pBase[t], G = res.G[t], M = res.M[t], lam = res.lambda[t];
  if (p == null || base == null || G == null) return null;
  const tilt = p - base;
  const label = biasLabel(tilt, band);
  const contrib = res.preds.map((pr, k) => ({
    id: pr.id, label: pr.label, src: pr.src, w: res.w[k][t],
    c: res.w[k][t] != null && res.f[k][t] != null ? lam * res.w[k][t] * (res.f[k][t] - M) : null,
  })).filter(x => x.c != null);
  const dir = Math.sign(res.F[t] - M);
  const agree = contrib.reduce((a, x) => a + (Math.sign(res.f[res.preds.findIndex(q => q.id === x.id)][t] - M) === dir && dir !== 0 ? x.w : 0), 0);
  let confidence = null, why = null;
  if (label !== "Neutral" && ev) {
    const g = label === "Bullish" ? ev.bull : ev.bear;
    const chance = label === "Bullish" ? ev.beatRate : 1 - ev.beatRate;
    const edge = g.right == null ? null : g.right - chance;
    const strong = edge != null && edge >= 0.05 && g.n >= 100 && agree >= 0.7 && ev.cwP < 0.1 && lam >= 0.5;
    const fair = edge != null && edge >= 0.02 && g.n >= 50 && agree >= 0.5 && lam >= 0.2;
    confidence = strong ? "High" : fair ? "Medium" : "Low";
    why = { right: g.right, n: g.n, chance };
  }
  return { label, p, base, tilt, F: G, M, lambda: lam, sigma: res.sigma[t], contrib, agree, confidence, why };
}
