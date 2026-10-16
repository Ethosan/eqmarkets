/* Statistics primitives. Pure functions on plain arrays; unit tested.
   Conventions: sample statistics use n-1; returns are log returns;
   volatility is annualized with sqrt(periods per year). */

export const sum = a => a.reduce((x, y) => x + y, 0);
export const mean = a => (a.length ? sum(a) / a.length : NaN);

/* Sample standard deviation (n-1). */
export function std(a, mu = mean(a)) {
  if (a.length < 2) return NaN;
  return Math.sqrt(a.reduce((s, x) => s + (x - mu) ** 2, 0) / (a.length - 1));
}

export function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* Median absolute deviation, scaled by 1.4826 so it estimates sigma for normal data. */
export function mad(a, med = median(a)) {
  return 1.4826 * median(a.map(x => Math.abs(x - med)));
}

/* Robust z-score of x against a reference sample: (x - median) / scaled MAD.
   Falls back to the classical z when MAD is zero (e.g. a mostly flat series). */
export function robustZ(x, ref) {
  if (ref.length < 20) return null;
  const med = median(ref), s = mad(ref, med);
  if (s > 0) return (x - med) / s;
  const sd = std(ref);
  return sd > 0 ? (x - mean(ref)) / sd : null;
}

/* Mid-rank percentile of x within ref, in [0, 1]. */
export function percentileRank(x, ref) {
  if (!ref.length) return null;
  let below = 0, equal = 0;
  for (const v of ref) { if (v < x) below++; else if (v === x) equal++; }
  return (below + 0.5 * equal) / ref.length;
}

export const clip = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function logReturns(v) {
  const out = [];
  for (let i = 1; i < v.length; i++) out.push(Math.log(v[i] / v[i - 1]));
  return out;
}

export function diffs(v) {
  const out = [];
  for (let i = 1; i < v.length; i++) out.push(v[i] - v[i - 1]);
  return out;
}

/* RiskMetrics EWMA volatility path: sigma²_t = λ·sigma²_{t-1} + (1-λ)·r²_{t-1}.
   Seeded with the sample variance of the first `seed` observations.
   Returns the per-period sigma available *after* each observation (same length as r). */
export function ewmaVolPath(r, lambda = 0.94, seed = 20) {
  if (r.length < seed + 1) return [];
  let v = mean(r.slice(0, seed).map(x => x * x));
  const out = new Array(r.length).fill(NaN);
  for (let i = 0; i < r.length; i++) {
    v = lambda * v + (1 - lambda) * r[i] * r[i];
    if (i >= seed - 1) out[i] = Math.sqrt(v);
  }
  return out;
}

export function ewmaVol(r, lambda = 0.94, seed = 20) {
  const p = ewmaVolPath(r, lambda, seed);
  return p.length ? p[p.length - 1] : NaN;
}

/* Largest peak-to-trough fall, as a negative fraction (price series). */
export function maxDrawdown(v) {
  let peak = -Infinity, dd = 0;
  for (const x of v) {
    peak = Math.max(peak, x);
    dd = Math.min(dd, x / peak - 1);
  }
  return dd;
}

/* Pearson correlation matrix of equal-length columns. */
export function correlationMatrix(cols) {
  const n = cols.length;
  const z = cols.map(c => {
    const mu = mean(c), sd = std(c, mu) || 1;
    return c.map(x => (x - mu) / sd);
  });
  const T = cols[0].length;
  const C = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let t = 0; t < T; t++) s += z[i][t] * z[j][t];
      C[i][j] = C[j][i] = s / (T - 1);
    }
  }
  return C;
}

/* Eigenvalues of a symmetric matrix by cyclic Jacobi rotations, sorted descending. */
export function symmetricEigenvalues(M, tol = 1e-12, maxSweeps = 100) {
  const n = M.length;
  const A = M.map(r => r.slice());
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] ** 2;
    if (off < tol) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
      }
    }
  }
  return A.map((r, i) => r[i]).sort((a, b) => b - a);
}

/* Standard normal CDF, Abramowitz & Stegun 26.2.17 (|error| < 7.5e-8). */
export function normCdf(x) {
  if (!isFinite(x)) return x > 0 ? 1 : 0;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/* Inner-join several { dates, values } series on common dates (sorted ISO dates). */
export function alignSeries(list) {
  const maps = list.map(s => new Map(s.dates.map((d, i) => [d, s.values[i]])));
  const dates = list[0].dates.filter(d => maps.every(m => m.has(d)));
  return { dates, columns: maps.map(m => dates.map(d => m.get(d))) };
}

/* Value of a series as of a date: the last observation on or before it,
   if no older than maxAgeDays. Binary search over sorted ISO dates. */
export function asOf(series, date, maxAgeDays = 7) {
  const { dates, values } = series;
  let lo = 0, hi = dates.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= date) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (idx < 0) return null;
  const age = (Date.parse(date) - Date.parse(dates[idx])) / 864e5;
  return age <= maxAgeDays ? values[idx] : null;
}
