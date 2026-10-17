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

/* Market state at each day, from the instrument's own volatility: "stressed"
   (1) when its EWMA volatility is above the median of the previous year, else
   "calm" (0). Uses only data up to that day. null during the first year. */
export function marketState(prices, window = 252) {
  const vol = ewmaVolPath(logReturns(prices));
  const v = prices.map((_, t) => (t > 0 && vol[t - 1] > 0 ? vol[t - 1] : null));
  return v.map((x, t) => {
    if (x == null || t < window) return null;
    const past = v.slice(t - window, t).filter(y => y != null).sort((a, b) => a - b);
    if (past.length < window / 2) return null;
    const med = past[past.length >> 1];
    return x > med ? 1 : 0;
  });
}
export const STATE_NAMES = ["Calm", "Stressed"];

/* Discounted regression sums: weights halve every `halfLife` observations. */
const newSums = () => ({ n: 0, w: 0, sx: 0, sy: 0, sxx: 0, sxy: 0 });
function addObs(a, x, y, d) {
  a.n++;
  a.w = d * a.w + 1; a.sx = d * a.sx + x; a.sy = d * a.sy + y; a.sxx = d * a.sxx + x * x; a.sxy = d * a.sxy + x * y;
}
function moments2(a) {
  const xb = a.sx / a.w, yb = a.sy / a.w, vx = a.sxx / a.w - xb * xb;
  return { xb, yb, b: vx > 1e-12 ? (a.sxy / a.w - xb * yb) / vx : 0 };
}

/* Walk-forward combination forecast for horizon h. Every output at index t uses
   prices and signals up to t only (calendar flags are known in advance).
   F: raw combination; G: final forecast after the encompassing weight λ;
   M: prevailing historical mean (the benchmark).

   Options (all fixed in advance, none tuned on results):
   - regHalfLife: half-life of the regression weights, in observations (3 years),
     so relationships can drift (time-varying coefficients, Dangl & Halling 2012).
     Infinity gives the plain expanding window.
   - regimes: separate slopes for calm and stressed markets (see marketState),
     each pulled toward the all-market slope with weight n / (n + kappa), so a
     state with little history stays close to the pooled estimate. Predictability
     is known to differ between good and bad times (Rapach, Strauss & Zhou 2010;
     Henkel, Martin & Nardari 2011). */
export function combinationForecast(frame, h, {
  minObs = 504, holdout = 252, halfLife = 252, regHalfLife = 756, regimes = true, kappa = 504, lamHalfLife = 756,
} = {}) {
  const P = frame.price, n = P.length;
  const preds = PREDICTORS.filter(p => (p.cal ? h <= p.maxH && frame.cal?.[p.cal] : frame[p.id]));
  const X = preds.map(p => (p.cal ? calShare(frame.cal[p.cal], h) : frame[p.id]));
  const theta = 0.5 ** (1 / halfLife), thetaL = 0.5 ** (1 / lamHalfLife);
  const dReg = Number.isFinite(regHalfLife) ? 0.5 ** (1 / regHalfLife) : 1;
  const R = regimes ? marketState(P) : P.map(() => null);
  const sums = preds.map(() => newSums());
  const sumsR = preds.map(() => [newSums(), newSums()]);
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
          addObs(sums[k], x, y, dReg);
          if (R[s] != null) addObs(sumsR[k][R[s]], x, y, dReg);
        }
        if (f[k][s] != null) { phi[k] = theta * phi[k] + (y - f[k][s]) ** 2; seen[k]++; }
      }
      /* Encompassing regression of the benchmark's error on the models' tilt. */
      if (F[s] != null && M[s] != null) {
        const d = F[s] - M[s];
        encA = thetaL * encA + (y - M[s]) * d;
        encB = thetaL * encB + d * d;
        encN++;
      }
    }
    if (yN < minObs) continue;
    M[t] = ySum / yN;

    const avail = [];
    for (let k = 0; k < preds.length; k++) {
      const a = sums[k], x = X[k][t];
      if (a.n < minObs || x == null || !isFinite(x)) continue;
      let { xb, yb, b } = moments2(a);
      /* Today's market state: blend its own estimates with the pooled ones. */
      const r = R[t] != null ? sumsR[k][R[t]] : null;
      if (r && r.n >= 60) {
        /* r.w is the state's effective (discounted) observation count. */
        const m = moments2(r), q = r.w / (r.w + kappa);
        xb = q * m.xb + (1 - q) * xb;
        yb = q * m.yb + (1 - q) * yb;
        b = q * m.b + (1 - q) * b;
      }
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
  return { h, P, preds, X, f, w, F, G, EQ, M, lambda, sigma, pUp, pBase, state: R };
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
export function evaluate(res, { band = 0.02, gamma = 3, ppy = 252, dates = null, since = null } = {}) {
  const { h, P, F, G, EQ, M, f, preds, sigma, pUp, pBase, lambda } = res;
  const n = G.length;
  const idx = [];
  for (let t = 0; t + h < n; t++) if (G[t] != null && M[t] != null && (!since || !dates || dates[t] >= since)) idx.push(t);
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
  /* A call is judged against the days the model didn't make it: when it says
     bullish, did the index beat its average more often than on other days? */
  const hitRate = (set, lab) => {
    const went = x => (lab === "Bearish" ? !x.beat : x.beat);
    const g = set.filter(x => x.lab === lab), o = set.filter(x => x.lab !== lab);
    return {
      n: g.length,
      right: g.length ? g.filter(went).length / g.length : null,
      others: o.length ? o.filter(went).length / o.length : null,
    };
  };
  const rate = lab => hitRate(calls, lab);
  const beatRate = calls.filter(x => x.beat).length / calls.length;
  const upRate = calls.filter(x => x.up).length / calls.length;
  /* The same record split by the market state on the day each forecast was made. */
  const byState = [0, 1].map(s => {
    const g = calls.filter(x => res.state?.[x.t] === s);
    if (g.length < 60) return { state: s, n: g.length, r2: null, bull: { n: 0, right: null }, bear: { n: 0, right: null } };
    const sub = lab => hitRate(g, lab);
    return {
      state: s, n: g.length, share: g.length / calls.length, r2: r2(G, g.map(x => x.t)),
      upRate: g.filter(x => x.up).length / g.length, beatRate: g.filter(x => x.beat).length / g.length,
      bull: sub("Bullish"), bear: sub("Bearish"),
    };
  });
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
    upRate, beatRate, bull: rate("Bullish"), bear: rate("Bearish"), neutralShare: rate("Neutral").n / calls.length, byState,
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
  const state = res.state?.[t] ?? null;
  let confidence = null, why = null;
  if (label !== "Neutral" && ev) {
    /* Judge the call on its record in today's market state when there is
       enough of it (50+ calls of this kind), else on the whole record. */
    const st = state != null ? ev.byState?.[state] : null;
    const stG = st && (label === "Bullish" ? st.bull : st.bear);
    const useState = stG && stG.n >= 50;
    const g = useState ? stG : label === "Bullish" ? ev.bull : ev.bear;
    const baseRate = useState ? st.beatRate : ev.beatRate;
    /* Prefer the other-days rate; fall back to the overall base rate. */
    const chance = g.others ?? (label === "Bullish" ? baseRate : 1 - baseRate);
    const edge = g.right == null ? null : g.right - chance;
    const strong = edge != null && edge >= 0.05 && g.n >= 100 && agree >= 0.7 && ev.cwP < 0.1 && lam >= 0.5;
    const fair = edge != null && edge >= 0.02 && g.n >= 50 && agree >= 0.5 && lam >= 0.2;
    confidence = strong ? "High" : fair ? "Medium" : "Low";
    why = { right: g.right, n: g.n, chance, inState: !!useState };
  }
  return { label, p, base, tilt, F: G, M, lambda: lam, sigma: res.sigma[t], contrib, agree, confidence, why, state };
}
