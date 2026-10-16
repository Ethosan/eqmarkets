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

/* Inverse standard normal CDF, Acklam's rational approximation (|rel. error| < 1.2e-9). */
export function normInv(p) {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/* Sample skewness and (non-excess) kurtosis, population moments. */
export function moments(a) {
  const mu = mean(a), n = a.length;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of a) { const d = x - mu; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
  m2 /= n; m3 /= n; m4 /= n;
  return { skew: m2 > 0 ? m3 / m2 ** 1.5 : 0, kurt: m2 > 0 ? m4 / (m2 * m2) : 3 };
}

/* Deterministic uniform [0, 1) generator (mulberry32), for reproducible bootstraps. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Pearson correlation of two equal-length arrays. */
export function corr(x, y) {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}
