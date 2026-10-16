/* Daily-close backtests for the admin lab. Pure functions on plain arrays; unit tested.

   Timing: a rule sees data up to close i and returns targets[i]. With lag L the
   position held over the return from close t−1 to close t is targets[t − L], so
   lag 1 trades on the signal's own close and lag 2 one bar later. A null target
   holds the previous position. Costs are charged on every change in position,
   in bp of notional per unit traded. */
import { clip, ewmaVolPath, logReturns, maxDrawdown, mean, moments, normCdf, normInv, rng, std } from "./stats.js";

/* Rule fields a strategy can read: the instrument price and the model paths. */
export const FIELDS = ["price", "rai", "raiS", "ar", "dAR", "rec", "vix", "vrp", "sbCorr", "trend", "f1", "f5", "f21", "p1", "p5", "p21"];

export function simulate(prices, targets, { lag = 1, costBp = 0, start = 0 } = {}) {
  const n = prices.length;
  const pos = new Array(n).fill(0), ret = new Array(n).fill(0), equity = new Array(n).fill(1);
  let w = 0, changes = 0, turnover = 0;
  for (let t = start + 1; t < n; t++) {
    const tgt = t - lag >= 0 ? targets[t - lag] : null;
    const next = tgt == null || !isFinite(tgt) ? w : tgt;
    const dw = Math.abs(next - w);
    if (dw > 1e-9) { changes++; turnover += dw; }
    w = next;
    pos[t] = w;
    ret[t] = w * (prices[t] / prices[t - 1] - 1) - dw * costBp / 1e4;
    equity[t] = equity[t - 1] * (1 + ret[t]);
  }
  return { pos, ret, equity, start, changes, turnover };
}

const firstSignal = targets => targets.findIndex(x => x != null && isFinite(x));

/* Common test start for several strategies: the bar where every one of them has
   a signal, shifted by the lag so the first position is a real one. -1 if never. */
export function startIndex(targetsList, lag = 1) {
  const firsts = targetsList.map(firstSignal);
  if (firsts.some(i => i < 0)) return -1;
  return Math.max(0, ...firsts) + lag - 1;
}

/* Performance over the test window. Returns are simple daily returns; Sharpe and
   Sortino are annualized with a zero risk-free rate (futures P&L is already an
   excess return). beta is against `bench`, the benchmark's daily returns. */
export function metrics(dates, sim, { ppy = 252, bench = null, from = sim.start, to = sim.equity.length - 1 } = {}) {
  const { ret, equity, pos } = sim;
  const start = Math.max(from, sim.start);
  const r = ret.slice(start + 1, to + 1);
  if (r.length < 2) return null;
  const years = (Date.parse(dates[to]) - Date.parse(dates[start])) / (365.25 * 864e5);
  const total = equity[to] / equity[start] - 1;
  const cagr = years > 0 && total > -1 ? (1 + total) ** (1 / years) - 1 : null;
  const mu = mean(r), sd = std(r);
  const down = Math.sqrt(mean(r.map(x => Math.min(x, 0) ** 2)));
  const p = pos.slice(start + 1, to + 1);
  let changes = 0;
  for (let t = start + 1; t <= to; t++) if (Math.abs(pos[t] - pos[t - 1]) > 1e-9) changes++;
  const active = r.filter((_, i) => Math.abs(p[i]) > 1e-9);
  let beta = null;
  if (bench) {
    const b = bench.slice(start + 1, to + 1), mb = mean(b), vb = std(b) ** 2;
    let cov = 0;
    for (let i = 0; i < r.length; i++) cov += (r[i] - mu) * (b[i] - mb);
    beta = vb > 0 ? cov / (r.length - 1) / vb : null;
  }
  const mdd = maxDrawdown(equity.slice(start, to + 1));
  return {
    total, cagr, years, bars: r.length,
    vol: sd * Math.sqrt(ppy),
    sharpe: sd > 0 ? mu / sd * Math.sqrt(ppy) : null,
    sortino: down > 0 ? mu / down * Math.sqrt(ppy) : null,
    mdd,
    calmar: cagr != null && mdd < 0 ? cagr / -mdd : null,
    exposure: mean(p.map(Math.abs)),
    tradesPerYear: years > 0 ? changes / years : null,
    hit: active.length ? active.filter(x => x > 0).length / active.length : null,
    beta,
  };
}

/* Equity / running peak − 1, null before the test start. */
export function drawdownPath(equity, start) {
  let peak = -Infinity;
  return equity.map((v, i) => {
    if (i < start) return null;
    peak = Math.max(peak, v);
    return v / peak - 1;
  });
}

/* Scale each target to an annualized volatility target, using the EWMA vol known
   at the signal's close. Leverage is capped at maxLev. */
export function volTarget(targets, prices, { target = 0.15, maxLev = 2, ppy = 252 } = {}) {
  const sig = ewmaVolPath(logReturns(prices));
  return targets.map((x, i) => {
    if (x == null) return null;
    const s = sig[i - 1];
    return s > 0 ? x * Math.min(maxLev, target / (s * Math.sqrt(ppy))) : null;
  });
}

/* Rule body → function(ctx). The body is ordinary JS ending in `return`. */
export function compileRule(code) {
  const fn = new Function("ctx", '"use strict";\n' + code);
  return ctx => fn(ctx);
}

/* Run a rule bar by bar. The context only exposes data up to the current bar,
   so a rule cannot look ahead:
     ctx.i, ctx.date, ctx.price, ctx.rai, ctx.raiS, ctx.ar, ctx.dAR, ctx.rec, ctx.vix
     ctx.get(field, barsBack)  a field's value barsBack bars ago (0 = today)
     ctx.sma(n)  ctx.ret(n) (n-bar log return)  ctx.vol(n) (annualized, n-bar)
     ctx.prev    the last target returned;  ctx.state  an object kept across bars
     ctx.cal(flag, ahead = 1)  a calendar flag (tom, fomc, opexWeek…) on the bar
                 `ahead` bars from now. Calendars are known in advance, so this
                 is the one field that may look forward.
     ctx.p       sweep parameters ({ a, b }), empty outside a sweep
   Targets are clipped to ±3. Errors are rethrown with the bar's date. */
export function runRule(frame, rule, { ppy = 252, params = {} } = {}) {
  const { dates, price: P } = frame;
  const n = dates.length;
  const pre = [0];
  for (const p of P) pre.push(pre[pre.length - 1] + p);
  const lr = [NaN, ...logReturns(P)];
  const out = new Array(n).fill(null);
  let i = 0;
  const ctx = {
    state: {},
    prev: null,
    p: params,
    cal: (k, ahead = 1) => (frame.cal?.[k] ? frame.cal[k][i + ahead] ?? null : null),
    get: (k, back = 0) => (back >= 0 && back <= i ? frame[k]?.[i - back] ?? null : null),
    sma: m => (m >= 1 && i + 1 >= m ? (pre[i + 1] - pre[i + 1 - m]) / m : null),
    ret: m => (m >= 1 && i >= m ? Math.log(P[i] / P[i - m]) : null),
    vol: m => (m >= 2 && i >= m ? std(lr.slice(i - m + 1, i + 1)) * Math.sqrt(ppy) : null),
  };
  for (; i < n; i++) {
    ctx.i = i;
    ctx.date = dates[i];
    for (const k of FIELDS) ctx[k] = frame[k]?.[i] ?? null;
    let v;
    try {
      v = rule(ctx, i);
    } catch (e) {
      e.message = dates[i] + ": " + e.message;
      throw e;
    }
    out[i] = v == null || !isFinite(v) ? null : clip(+v, -3, 3);
    if (out[i] != null) ctx.prev = out[i];
  }
  return out;
}

/* Built-in strategies, written as rules so the lab can load any of them into
   the editor as a starting point. Thresholds read ctx.p.a / ctx.p.b when set,
   so the parameter sweep can vary them; the defaults are the values shown. */
export const PRESETS = [
  { id: "bh", name: "Buy & hold", desc: "Always fully long. The benchmark.", code: "return 1;" },
  {
    id: "rai", name: "RAI regime", desc: "Long unless the Risk Appetite Index (3-day mean) leans risk-off.",
    code: `// Long unless RAI leans risk-off. Sweep: a = threshold (σ).
if (ctx.raiS == null) return null;
return ctx.raiS > (ctx.p.a ?? -0.25) ? 1 : 0;`,
  },
  {
    id: "raiscale", name: "RAI scaled", desc: "Exposure 0.5 + RAI/2, between 0 and 1.",
    code: `// Exposure 0.5 + RAI/2, clipped to 0–1.
if (ctx.raiS == null) return null;
return Math.min(1, Math.max(0, 0.5 + 0.5 * ctx.raiS));`,
  },
  {
    id: "ar", name: "Absorption ΔAR", desc: "Kritzman et al.: flat when ΔAR ≥ +1σ, long when ≤ −1σ, half otherwise.",
    code: `// Kritzman et al. (2011): de-risk on a jump in the absorption ratio. Sweep: a = cutoff (σ).
if (ctx.dAR == null) return null;
const k = ctx.p.a ?? 1;
if (ctx.dAR >= k) return 0;
if (ctx.dAR <= -k) return 1;
return 0.5;`,
  },
  {
    id: "rec", name: "Recession filter", desc: "Half size while the NY Fed probit is at or above 30%.",
    code: `// Half size while the 12M recession probability is high. Sweep: a = threshold (0–1).
if (ctx.rec == null) return null;
return ctx.rec >= (ctx.p.a ?? 0.3) ? 0.5 : 1;`,
  },
  {
    id: "combo", name: "RAI + ΔAR", desc: "Flat on a fragility spike, otherwise long in risk-on and half in risk-off.",
    code: `// Flat on a fragility spike; otherwise full in risk-on, half in risk-off.
// Sweep: a = RAI threshold (σ), b = ΔAR cutoff (σ).
if (ctx.raiS == null || ctx.dAR == null) return null;
if (ctx.dAR >= (ctx.p.b ?? 1)) return 0;
return ctx.raiS > (ctx.p.a ?? -0.25) ? 1 : 0.5;`,
  },
  {
    id: "vrp", name: "Variance premium", desc: "Full size while implied vol is above realized; half when realized runs hotter.",
    code: `// Bollerslev, Tauchen & Zhou (2009): a positive variance risk premium has
// preceded higher returns. Sweep: a = VRP threshold (vol points).
if (ctx.vrp == null) return null;
return ctx.vrp > (ctx.p.a ?? 0) ? 1 : 0.5;`,
  },
  {
    id: "cta", name: "CTA trend", desc: "The estimated trend-follower position in this market, long or short (−1 to +1).",
    code: `// Time-series momentum (Moskowitz, Ooi & Pedersen 2012): the trend
// follower's position across 1, 3, 6 and 12-month lookbacks.
return ctx.trend;`,
  },
  {
    id: "tom", name: "Turn of month", desc: "Long only over the last trading day and the first three of each month.",
    code: `// Lakonishok & Smidt (1988): equities earn much of their return around the turn
// of the month. ctx.cal looks at the bar the position will be held into.
return ctx.cal("tom") ? 1 : 0;`,
  },
  {
    id: "bias", name: "Market bias", desc: "Mean–variance sizing on the walk-forward monthly bias forecast (γ = 3), 0 to 1.5×.",
    code: `// Rapach, Strauss & Zhou (2010): size by the combination forecast.
// w = E[r] / (γ σ²), clipped to 0–1.5. Sweep: a = risk aversion γ.
if (ctx.f21 == null) return null;
const v = ctx.vol(63);
if (!v) return null;
const s2 = v * v * 21 / 252;
return Math.min(1.5, Math.max(0, ctx.f21 / ((ctx.p.a ?? 3) * s2)));`,
  },
  {
    id: "trend", name: "Trend 200d", desc: "Long above the 200-day average. A non-model baseline.",
    code: `// Baseline: long above the moving average. Sweep: a = length in days.
const m = ctx.sma(Math.round(ctx.p.a ?? 200));
if (m == null) return null;
return ctx.price > m ? 1 : 0;`,
  },
];

/* ------------------------------------------------------- overfitting guards */
/* Annualized Sharpe of daily returns. */
export const sharpe = (r, ppy = 252) => { const sd = std(r); return sd > 0 ? mean(r) / sd * Math.sqrt(ppy) : null; };

/* Stationary block bootstrap (Politis & Romano 1994) of the annualized Sharpe:
   resample the daily returns in blocks of mean length `block`, which keeps
   volatility clustering, and return the [lo, hi] percentile interval. */
export function bootstrapSharpe(r, { iters = 600, block = 10, ppy = 252, level = 0.9, seed = 11 } = {}) {
  const T = r.length;
  if (T < 30) return null;
  const u = rng(seed), out = [];
  for (let k = 0; k < iters; k++) {
    let i = Math.floor(u() * T), s = 0, s2 = 0;
    for (let t = 0; t < T; t++) {
      if (t > 0) i = u() < 1 / block ? Math.floor(u() * T) : (i + 1) % T;
      s += r[i]; s2 += r[i] * r[i];
    }
    const mu = s / T, v = (s2 - T * mu * mu) / (T - 1);
    out.push(v > 0 ? mu / Math.sqrt(v) * Math.sqrt(ppy) : 0);
  }
  out.sort((a, b) => a - b);
  const q = x => out[Math.min(iters - 1, Math.max(0, Math.round(x * (iters - 1))))];
  return [q((1 - level) / 2), q(1 - (1 - level) / 2)];
}

/* Deflated Sharpe ratio (Bailey & López de Prado 2014): the probability that
   the true Sharpe is above zero after allowing for non-normal returns and for
   having picked the best of `trials` attempts. srVar is the variance of the
   per-period (not annualized) Sharpe across those trials. With one trial it is
   the probabilistic Sharpe ratio against zero. */
export function deflatedSharpe(r, { trials = 1, srVar = 0 } = {}) {
  const T = r.length, sd = std(r);
  if (T < 30 || !(sd > 0)) return null;
  const sr = mean(r) / sd;
  const { skew, kurt } = moments(r);
  const g = 0.5772156649;
  const sr0 = trials > 1 && srVar > 0
    ? Math.sqrt(srVar) * ((1 - g) * normInv(1 - 1 / trials) + g * normInv(1 - 1 / (trials * Math.E)))
    : 0;
  const den = 1 - skew * sr + (kurt - 1) / 4 * sr * sr;
  return { dsr: normCdf((sr - sr0) * Math.sqrt(T - 1) / Math.sqrt(Math.max(den, 1e-9))), sr, sr0 };
}
