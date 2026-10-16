/* Premia and flow models on plain { dates, values } series; unit tested.

   - Variance risk premium (Bollerslev, Tauchen & Zhou 2009; Carr & Wu 2009):
     implied minus realized volatility. Here in vol points: VIX minus the
     trailing 21-day realized vol of ES, both annualized, both known that day.
   - Stock–bond correlation: rolling correlation of equity returns with
     Treasury price moves (the negative of 10-year yield changes). Negative
     means bonds hedge equities; positive means they fall together, as in
     2022 (Campbell, Pflueger & Viceira 2020).
   - Time-series momentum / CTA positioning (Moskowitz, Ooi & Pedersen 2012;
     Hurst, Ooi & Pedersen 2017): a trend follower's position estimated from
     vol-scaled moves over 1, 3, 6 and 12 months, with the price levels where
     each signal flips and the position change a ±1σ or ±2σ week would cause. */
import { alignSeries, clip, corr, diffs, ewmaVolPath, logReturns, mean } from "./stats.js";

/* Trailing realized vol, annualized, in % (21 obs by default). */
export function realizedVolPath(values, window = 21, ppy = 252) {
  const r = logReturns(values);
  const out = new Array(values.length).fill(null);
  for (let i = window; i < values.length; i++) {
    const w = r.slice(i - window, i);
    out[i] = Math.sqrt(mean(w.map(x => x * x)) * ppy) * 100;
  }
  return out;
}

/* VRP = VIX − realized vol of ES, on dates where both exist. */
export function vrpSeries(es, vix, window = 21) {
  const rv = realizedVolPath(es.values, window);
  const rvS = { dates: es.dates, values: rv };
  const { dates, columns: [v, r] } = alignSeries([vix, rvS]);
  const out = { dates: [], values: [], vix: [], rv: [] };
  dates.forEach((d, i) => {
    if (r[i] == null) return;
    out.dates.push(d); out.values.push(v[i] - r[i]); out.vix.push(v[i]); out.rv.push(r[i]);
  });
  return out;
}

/* Rolling correlation of equity log returns with Treasury price moves (−Δ yield). */
export function stockBondCorr(eq, yld, window = 63) {
  const { dates, columns: [p, y] } = alignSeries([eq, yld]);
  const re = logReturns(p), rb = diffs(y).map(x => -x);
  const out = { dates: [], values: [] };
  for (let t = window; t <= re.length; t++) {
    const c = corr(re.slice(t - window, t), rb.slice(t - window, t));
    if (isFinite(c)) { out.dates.push(dates[t]); out.values.push(c); }
  }
  return out;
}

/* ---------------------------------------------------------------- trend */
export const TREND_LOOKBACKS = [21, 63, 126, 252];
const toX = (values, kind) => (kind === "rate" ? values.map(v => -v) : values.map(Math.log));
const fromX = (x, kind) => (kind === "rate" ? -x : Math.exp(x));

/* Signal for one lookback: the vol-scaled move z, mapped linearly to ±1 at ±2σ. */
const sig = z => clip(z / 2, -1, 1);

function positionAt(x, i, sd, Ls, xNow = x[i], shift = 0) {
  const parts = [];
  for (const L of Ls) {
    const j = i - L + shift;
    if (j < 0 || !(sd > 0)) return null;
    parts.push(sig((xNow - x[j]) / (sd * Math.sqrt(L))));
  }
  return mean(parts);
}

const lookbacks = ppy => TREND_LOOKBACKS.map(L => Math.round(L * ppy / 252));

/* Position path in [−1, 1] (share of a trend follower's maximum long), using
   only data up to each day. kind "rate" treats a falling yield as a rising bond. */
export function trendPath(series, { kind = "price", ppy = 252 } = {}) {
  const x = toX(series.values, kind);
  const vol = ewmaVolPath(diffs(x));
  const Ls = lookbacks(ppy);
  return { dates: series.dates, values: x.map((_, i) => (i > 0 ? positionAt(x, i, vol[i - 1], Ls) : null)) };
}

/* Today's reading: position, per-lookback detail with flip levels, and the
   position change after a ±1σ / ±2σ week (window rolled forward five days). */
export function trendNow(series, { kind = "price", ppy = 252 } = {}) {
  const x = toX(series.values, kind);
  const n = x.length, i = n - 1;
  const vol = ewmaVolPath(diffs(x));
  const sd = vol[i - 1];
  const Ls = lookbacks(ppy);
  const pos = positionAt(x, i, sd, Ls);
  if (pos == null) return null;
  const legs = Ls.map(L => {
    const z = (x[i] - x[i - L]) / (sd * Math.sqrt(L));
    /* Tomorrow this lookback compares against x[i − L + 1]: crossing it flips the sign. */
    return { L, z, s: sig(z), flip: fromX(x[i - L + 1], kind) };
  });
  const week = sd * Math.sqrt(5);
  const scenarios = [-2, -1, 1, 2].map(k => {
    const p = positionAt(x, i, sd, Ls, x[i] + k * week, 5);
    return { k, pos: p, flow: p == null ? null : p - pos };
  });
  return { pos, legs, scenarios, last: series.values[i], date: series.dates[i] };
}
