/* Market models built on src/quant/stats.js. Every function takes plain
   { dates, values } series so it can be tested without the network.
   Methodology and references are summarised in the README. */
import {
  alignSeries, asOf, clip, correlationMatrix, ewmaVolPath, logReturns, maxDrawdown, mean, median, normCdf,
  percentileRank, robustZ, std, symmetricEigenvalues,
} from "./stats.js";

/* ------------------------------------------------------- recession model */
/* NY Fed yield-curve model (Estrella & Mishkin; Estrella & Trubin 2006):
   P(recession 12 months ahead) = Φ(α + β · S), S = 10y − 3m Treasury spread in
   percentage points, using the monthly average spread. */
export const NYFED_PROBIT = { alpha: -0.5333, beta: -0.6330 };

export const recessionProbability = spread => normCdf(NYFED_PROBIT.alpha + NYFED_PROBIT.beta * spread);

/* Daily path: 10y−3m spread, its trailing ~1-month (21 obs) mean, and the probability. */
export function recessionSeries(dgs10, dgs3m, window = 21) {
  const { dates, columns: [ten, three] } = alignSeries([dgs10, dgs3m]);
  const spread = ten.map((v, i) => v - three[i]);
  const out = { dates: [], spread: [], avgSpread: [], prob: [] };
  for (let i = window - 1; i < spread.length; i++) {
    const avg = mean(spread.slice(i - window + 1, i + 1));
    out.dates.push(dates[i]);
    out.spread.push(spread[i]);
    out.avgSpread.push(avg);
    out.prob.push(recessionProbability(avg));
  }
  return out;
}

/* ----------------------------------------------------- absorption ratio */
/* Kritzman, Li, Page & Rigobon (2011): share of total variance explained by the
   first fifth of eigenvectors of the asset-return correlation matrix. High and
   rising = markets moving as one = fragile. */
export function absorptionRatio(returnCols, k = Math.max(1, Math.round(returnCols.length / 5))) {
  const eig = symmetricEigenvalues(correlationMatrix(returnCols));
  const total = eig.reduce((a, b) => a + b, 0);
  return eig.slice(0, k).reduce((a, b) => a + b, 0) / total;
}

/* Rolling absorption ratio over aligned log returns, plus the standardized
   shift: (15-day mean AR − 1-year mean AR) / 1-year std of AR. */
export function absorptionSeries(seriesList, { window = 63, shortMean = 15, longWindow = 252, kind } = {}) {
  const { dates, columns } = alignSeries(seriesList);
  const rets = columns.map((c, i) => (kind?.[i] === "rate" ? c.slice(1).map((v, t) => v - c[t]) : logReturns(c)));
  const rDates = dates.slice(1);
  const ar = [], arDates = [];
  for (let t = window; t <= rDates.length; t++) {
    const cols = rets.map(r => r.slice(t - window, t));
    if (cols.some(c => std(c) === 0)) continue;
    ar.push(absorptionRatio(cols));
    arDates.push(rDates[t - 1]);
  }
  if (!ar.length) return null;
  const long = ar.slice(-longWindow);
  const sd = std(long);
  const shift = ar.length >= shortMean + 20 && sd > 0 ? (mean(ar.slice(-shortMean)) - mean(long)) / sd : null;
  return { dates: arDates, values: ar, latest: ar[ar.length - 1], shift, n: seriesList.length, k: Math.max(1, Math.round(seriesList.length / 5)) };
}

/* Point-in-time ΔAR for every day: the same standardized shift as above, using
   only AR values up to that day. null until minObs values exist. */
export function absorptionShiftPath(ar, { shortMean = 15, longWindow = 252, minObs = shortMean + 20 } = {}) {
  const out = new Array(ar.length).fill(null);
  for (let t = Math.max(minObs, shortMean) - 1; t < ar.length; t++) {
    const long = ar.slice(Math.max(0, t - longWindow + 1), t + 1);
    const sd = std(long);
    if (sd > 0) out[t] = (mean(ar.slice(t - shortMean + 1, t + 1)) - mean(long)) / sd;
  }
  return out;
}

/* ------------------------------------------------- risk appetite (v2) */
/* Two input transforms:
   - "trend": 21-day log return divided by EWMA vol × √21, a volatility-scaled
     momentum score (a t-stat-like quantity), for trending price series.
   - "level": robust z-score of the level against its trailing year, for
     mean-reverting stress gauges (VIX, MOVE, credit spreads, VIX term structure).
   Each score is multiplied by its sign (+1 risk-on, −1 stress) and clipped to ±3. */
const LEVEL_W = 252;

export function scorePath(series, transform, sign, ppy = 252) {
  const { dates, values } = series;
  const out = { dates: [], values: [] };
  if (transform === "trend") {
    /* One month of observations: 21 trading days, or 30 for a 365-day market. */
    const TREND_H = Math.round(21 * ppy / 252);
    const r = logReturns(values);
    const vol = ewmaVolPath(r);
    for (let i = TREND_H; i < values.length; i++) {
      const s = vol[i - 1];
      if (!(s > 0)) continue;
      const z = Math.log(values[i] / values[i - TREND_H]) / (s * Math.sqrt(TREND_H));
      out.dates.push(dates[i]);
      out.values.push(clip(sign * z, -3, 3));
    }
  } else {
    for (let i = 60; i < values.length; i++) {
      const z = robustZ(values[i], values.slice(Math.max(0, i - LEVEL_W + 1), i + 1));
      if (z == null) continue;
      out.dates.push(dates[i]);
      out.values.push(clip(sign * z, -3, 3));
    }
  }
  return out;
}

/* Composite on the master calendar: equal-weighted mean of the inputs available
   (as-of, max 7 days old). Requires at least minInputs. */
export function riskAppetite(inputs, calendar, { minInputs = 4, days = 260 } = {}) {
  const paths = inputs.map(inp => ({ ...inp, path: scorePath(inp.series, inp.transform, inp.sign, inp.ppy) }));
  const cal = calendar.slice(-days);
  const history = { dates: [], values: [] };
  for (const d of cal) {
    const vals = paths.map(p => (p.path.dates.length ? asOf(p.path, d, 7) : null)).filter(v => v != null);
    if (vals.length >= minInputs) { history.dates.push(d); history.values.push(mean(vals)); }
  }
  const last = cal[cal.length - 1];
  const contributions = paths
    .map(p => ({ id: p.id, label: p.label, transform: p.transform, score: p.path.dates.length ? asOf(p.path, last, 7) : null }))
    .filter(c => c.score != null);
  const latest = contributions.length >= minInputs ? mean(contributions.map(c => c.score)) : null;
  /* Label and needle use a 3-day mean so they don't flicker around thresholds. */
  const smooth = history.values.length >= 3 ? mean(history.values.slice(-3)) : latest;
  return { latest, smooth, history, contributions };
}

export function regimeLabel(x) {
  if (x == null) return "Insufficient data";
  if (x >= 0.75) return "Risk-on";
  if (x >= 0.25) return "Leaning risk-on";
  if (x > -0.25) return "Neutral";
  if (x > -0.75) return "Leaning risk-off";
  return "Risk-off";
}

/* ----------------------------------------------------------- carry */
/* Carry-to-vol: rate differential (pp) divided by annualized EWMA vol of USD/JPY (%). */
export function carryToVol(gapPct, usdjpy) {
  const path = ewmaVolPath(logReturns(usdjpy.values));
  const vol = path[path.length - 1] * Math.sqrt(252) * 100;
  return vol > 0 ? { ratio: gapPct / vol, vol, gap: gapPct } : null;
}

/* ------------------------------------------------------ per-series stats */
/* Units depend on the kind of series:
   price: % changes and annualized % vol of log returns
   rate:  changes in basis points and annualized bp vol of daily changes
   level: changes in points and annualized point vol of daily changes */
export function seriesStats({ dates, values }, kind, ppy = 252) {
  const n = values.length;
  if (n < 2) return null;
  const last = values[n - 1];
  const year = values.slice(-Math.min(n, ppy + 1));
  const change = k => {
    if (n <= k) return null;
    const prev = values[n - 1 - k];
    if (kind === "price") return (last / prev - 1) * 100;
    if (kind === "rate") return (last - prev) * 100;
    return last - prev;
  };
  const ytdIdx = dates.findIndex(d => d.slice(0, 4) === dates[n - 1].slice(0, 4));
  const ytdBase = ytdIdx > 0 ? values[ytdIdx - 1] : null;
  const ytd = ytdBase == null ? null
    : kind === "price" ? (last / ytdBase - 1) * 100 : kind === "rate" ? (last - ytdBase) * 100 : last - ytdBase;
  const steps = kind === "price" ? logReturns(values) : values.slice(1).map((v, i) => v - values[i]);
  const scale = (kind === "price" || kind === "rate" ? 100 : 1) * Math.sqrt(ppy);
  const recent = steps.slice(-21);
  const ewma = ewmaVolPath(steps);
  const short = ppy === 365 ? { w: 7, m: 30, q: 91 } : ppy === 52 ? { w: 1, m: 4, q: 13 } : { w: 5, m: 21, q: 63 };
  return {
    last,
    chg: { d1: change(1), w1: change(short.w), m1: change(short.m), m3: change(short.q), ytd, y1: change(year.length - 1) },
    vol21: recent.length > 2 ? std(recent) * scale : null,
    volEwma: ewma.length ? ewma[ewma.length - 1] * scale : null,
    /* Percentile of the latest value within the prior year (excluding itself). */
    pct1y: year.length > 20 ? percentileRank(last, year.slice(0, -1)) : null,
    z1y: robustZ(last, year),
    hi1y: Math.max(...year),
    lo1y: Math.min(...year),
    med1y: median(year),
    mdd1y: kind === "price" ? maxDrawdown(year) * 100 : null,
  };
}
