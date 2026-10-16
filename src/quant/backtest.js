/* Daily-close backtests for the admin lab. Pure functions on plain arrays; unit tested.

   Timing: a rule sees data up to close i and returns targets[i]. With lag L the
   position held over the return from close t−1 to close t is targets[t − L], so
   lag 1 trades on the signal's own close and lag 2 one bar later. A null target
   holds the previous position. Costs are charged on every change in position,
   in bp of notional per unit traded. */
import { clip, ewmaVolPath, logReturns, maxDrawdown, mean, std } from "./stats.js";

/* Rule fields a strategy can read: the instrument price and the model paths. */
export const FIELDS = ["price", "rai", "raiS", "ar", "dAR", "rec", "vix"];

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
export function metrics(dates, sim, { ppy = 252, bench = null } = {}) {
  const { start, ret, equity, pos } = sim;
  const n = equity.length;
  const r = ret.slice(start + 1);
  if (r.length < 2) return null;
  const years = (Date.parse(dates[n - 1]) - Date.parse(dates[start])) / (365.25 * 864e5);
  const total = equity[n - 1] / equity[start] - 1;
  const cagr = years > 0 && total > -1 ? (1 + total) ** (1 / years) - 1 : null;
  const mu = mean(r), sd = std(r);
  const down = Math.sqrt(mean(r.map(x => Math.min(x, 0) ** 2)));
  const p = pos.slice(start + 1);
  const active = r.filter((_, i) => Math.abs(p[i]) > 1e-9);
  let beta = null;
  if (bench) {
    const b = bench.slice(start + 1), mb = mean(b), vb = std(b) ** 2;
    let cov = 0;
    for (let i = 0; i < r.length; i++) cov += (r[i] - mu) * (b[i] - mb);
    beta = vb > 0 ? cov / (r.length - 1) / vb : null;
  }
  const mdd = maxDrawdown(equity.slice(start));
  return {
    total, cagr, years, bars: r.length,
    vol: sd * Math.sqrt(ppy),
    sharpe: sd > 0 ? mu / sd * Math.sqrt(ppy) : null,
    sortino: down > 0 ? mu / down * Math.sqrt(ppy) : null,
    mdd,
    calmar: cagr != null && mdd < 0 ? cagr / -mdd : null,
    exposure: mean(p.map(Math.abs)),
    tradesPerYear: years > 0 ? sim.changes / years : null,
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
   Targets are clipped to ±3. Errors are rethrown with the bar's date. */
export function runRule(frame, rule, { ppy = 252 } = {}) {
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
   the editor as a starting point. */
export const PRESETS = [
  { id: "bh", name: "Buy & hold", desc: "Always fully long. The benchmark.", code: "return 1;" },
  {
    id: "rai", name: "RAI regime", desc: "Long unless the Risk Appetite Index (3-day mean) leans risk-off.",
    code: "// Long unless RAI leans risk-off (3-day mean below −0.25σ).\nif (ctx.raiS == null) return null;\nreturn ctx.raiS > -0.25 ? 1 : 0;",
  },
  {
    id: "raiscale", name: "RAI scaled", desc: "Exposure 0.5 + RAI/2, between 0 and 1.",
    code: "// Exposure 0.5 + RAI/2, clipped to 0–1.\nif (ctx.raiS == null) return null;\nreturn Math.min(1, Math.max(0, 0.5 + 0.5 * ctx.raiS));",
  },
  {
    id: "ar", name: "Absorption ΔAR", desc: "Kritzman et al.: flat when ΔAR ≥ +1σ, long when ≤ −1σ, half otherwise.",
    code: "// Kritzman et al. (2011): de-risk on a +1σ jump in the absorption ratio.\nif (ctx.dAR == null) return null;\nif (ctx.dAR >= 1) return 0;\nif (ctx.dAR <= -1) return 1;\nreturn 0.5;",
  },
  {
    id: "rec", name: "Recession filter", desc: "Half size while the NY Fed probit is at or above 30%.",
    code: "// Half size while the 12M recession probability is 30% or more.\nif (ctx.rec == null) return null;\nreturn ctx.rec >= 0.3 ? 0.5 : 1;",
  },
  {
    id: "combo", name: "RAI + ΔAR", desc: "Flat on a fragility spike, otherwise long in risk-on and half in risk-off.",
    code: "// Flat on a fragility spike; otherwise full in risk-on, half in risk-off.\nif (ctx.raiS == null || ctx.dAR == null) return null;\nif (ctx.dAR >= 1) return 0;\nreturn ctx.raiS > -0.25 ? 1 : 0.5;",
  },
  {
    id: "trend", name: "Trend 200d", desc: "Long above the 200-day average. A non-model baseline.",
    code: "// Baseline: long above the 200-day moving average.\nconst m = ctx.sma(200);\nif (m == null) return null;\nreturn ctx.price > m ? 1 : 0;",
  },
];
