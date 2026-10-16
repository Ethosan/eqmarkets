import { describe, expect, it } from "vitest";
import {
  mean, std, median, mad, robustZ, percentileRank, ewmaVolPath, maxDrawdown,
  correlationMatrix, symmetricEigenvalues, normCdf, alignSeries, asOf,
} from "../src/quant/stats.js";
import {
  recessionProbability, recessionSeries, absorptionRatio, absorptionSeries, scorePath, riskAppetite,
  regimeLabel, carryToVol, seriesStats, NYFED_PROBIT,
} from "../src/quant/models.js";

/* Deterministic pseudo-random numbers (mulberry32) and Gaussian draws. */
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = r => () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const dates = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString().slice(0, 10));
function walk(n, sigma, seed, start = 100) {
  const g = gauss(rng(seed));
  const v = [start];
  for (let i = 1; i < n; i++) v.push(v[i - 1] * Math.exp(sigma * g()));
  return { dates: dates(n), values: v };
}

describe("descriptive statistics", () => {
  it("sample std uses n-1", () => {
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 5);
    expect(mean([1, 2, 3])).toBe(2);
  });
  it("median, MAD and robust z resist outliers", () => {
    const ref = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 1000];
    expect(median(ref)).toBe(10.5);
    expect(mad(ref)).toBeCloseTo(1.4826 * 5, 6);
    expect(robustZ(10.5, ref)).toBeCloseTo(0, 9);
  });
  it("percentile rank uses mid-ranks", () => {
    expect(percentileRank(3, [1, 2, 3, 4, 5])).toBeCloseTo(0.5);
    expect(percentileRank(10, [1, 2, 3])).toBe(1);
  });
  it("max drawdown", () => {
    expect(maxDrawdown([100, 120, 90, 130, 65])).toBeCloseTo(-0.5);
  });
});

describe("normal CDF", () => {
  it("matches reference values", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normCdf(-1)).toBeCloseTo(0.158655, 6);
    expect(normCdf(3)).toBeCloseTo(0.998650, 6);
  });
});

describe("EWMA volatility", () => {
  it("recovers the true sigma of a stationary Gaussian process", () => {
    const g = gauss(rng(7));
    const r = Array.from({ length: 3000 }, () => 0.01 * g());
    const path = ewmaVolPath(r);
    const avg = mean(path.slice(500));
    expect(avg).toBeGreaterThan(0.0093);
    expect(avg).toBeLessThan(0.0107);
  });
  it("reacts to a volatility shock", () => {
    const g = gauss(rng(3));
    const r = [...Array.from({ length: 300 }, () => 0.005 * g()), ...Array.from({ length: 30 }, () => 0.03 * g())];
    const p = ewmaVolPath(r);
    expect(p[p.length - 1]).toBeGreaterThan(3 * p[299]);
  });
});

describe("eigenvalues and absorption ratio", () => {
  it("Jacobi matches a known symmetric matrix", () => {
    const eig = symmetricEigenvalues([[4, 1, 0], [1, 3, 1], [0, 1, 2]]);
    expect(eig[0]).toBeCloseTo(4.7320508, 6);
    expect(eig[1]).toBeCloseTo(3, 6);
    expect(eig[2]).toBeCloseTo(1.2679492, 6);
  });
  it("eigenvalues of a correlation matrix sum to N", () => {
    const g = gauss(rng(11));
    const cols = Array.from({ length: 5 }, () => Array.from({ length: 200 }, g));
    const eig = symmetricEigenvalues(correlationMatrix(cols));
    expect(eig.reduce((a, b) => a + b, 0)).toBeCloseTo(5, 6);
  });
  it("AR is near k/N for independent assets and near 1 when one factor drives all", () => {
    const g = gauss(rng(5));
    const indep = Array.from({ length: 10 }, () => Array.from({ length: 500 }, g));
    expect(absorptionRatio(indep)).toBeLessThan(0.33);
    const f = Array.from({ length: 500 }, g);
    const common = Array.from({ length: 10 }, () => f.map(x => x + 0.1 * g()));
    expect(absorptionRatio(common)).toBeGreaterThan(0.95);
  });
  it("rolling AR rises when assets start co-moving", () => {
    const g = gauss(rng(9));
    const n = 400;
    const factor = Array.from({ length: n }, g);
    const series = Array.from({ length: 6 }, () => {
      const v = [100];
      for (let t = 1; t < n; t++) v.push(v[t - 1] * Math.exp(0.01 * (t > 330 ? factor[t] + 0.2 * g() : g())));
      return { dates: dates(n), values: v };
    });
    const ar = absorptionSeries(series);
    expect(ar.latest).toBeGreaterThan(ar.values[100] + 0.2);
    expect(ar.shift).toBeGreaterThan(1);
  });
});

describe("recession probability (NY Fed probit)", () => {
  it("uses Φ(α + β·spread)", () => {
    expect(recessionProbability(0)).toBeCloseTo(normCdf(NYFED_PROBIT.alpha), 9);
    expect(recessionProbability(0)).toBeCloseTo(0.297, 3);
    expect(recessionProbability(-1)).toBeGreaterThan(recessionProbability(0));
    expect(recessionProbability(2.5)).toBeLessThan(0.05);
  });
  it("averages the spread over the trailing month", () => {
    const d = dates(40);
    const s = recessionSeries({ dates: d, values: d.map(() => 4) }, { dates: d, values: d.map(() => 5) });
    expect(s.avgSpread.at(-1)).toBeCloseTo(-1);
    expect(s.prob.at(-1)).toBeCloseTo(recessionProbability(-1));
  });
});

describe("risk appetite", () => {
  it("trend score is positive in an uptrend and clipped to ±3", () => {
    const n = 200, d = dates(n);
    const up = { dates: d, values: d.map((_, i) => 100 * Math.exp(0.002 * i + 0.003 * Math.sin(i))) };
    const p = scorePath(up, "trend", 1);
    expect(p.values.at(-1)).toBeGreaterThan(0);
    expect(Math.max(...p.values.map(Math.abs))).toBeLessThanOrEqual(3);
  });
  it("stress gauges at a 1-year high push the composite risk-off", () => {
    const n = 300, d = dates(n);
    const vix = { dates: d, values: d.map((_, i) => (i > 290 ? 40 : 15 + Math.sin(i / 5))) };
    const flat = walk(n, 0.01, 2);
    const inputs = [
      { id: "vix", series: vix, transform: "level", sign: -1 },
      { id: "move", series: { dates: d, values: vix.values.map(v => v * 5) }, transform: "level", sign: -1 },
      { id: "es", series: flat, transform: "trend", sign: 1 },
      { id: "btc", series: walk(n, 0.02, 4), transform: "trend", sign: 1 },
    ];
    const r = riskAppetite(inputs, d);
    expect(r.contributions.find(c => c.id === "vix").score).toBe(-3);
    expect(r.latest).toBeLessThan(-0.75);
    expect(regimeLabel(r.smooth)).toMatch(/off/i);
  });
});

describe("series statistics", () => {
  it("annualized vol of a 1%-daily random walk is near 16%", () => {
    const s = seriesStats(walk(800, 0.01, 21), "price");
    expect(s.vol21).toBeGreaterThan(9);
    expect(s.vol21).toBeLessThan(24);
    expect(s.volEwma).toBeGreaterThan(10);
    expect(s.volEwma).toBeLessThan(22);
  });
  it("rates report changes in basis points", () => {
    const d = dates(30);
    const s = seriesStats({ dates: d, values: d.map((_, i) => 4 + i * 0.01) }, "rate");
    expect(s.chg.d1).toBeCloseTo(1);
    expect(s.chg.m1).toBeCloseTo(21);
    expect(s.pct1y).toBe(1);
  });
  it("carry-to-vol divides the gap by annualized EWMA vol", () => {
    const c = carryToVol(3.33, walk(300, 0.006, 8));
    expect(c.vol).toBeGreaterThan(6);
    expect(c.vol).toBeLessThan(13);
    expect(c.ratio).toBeCloseTo(3.33 / c.vol, 9);
  });
  it("alignSeries and asOf", () => {
    const a = { dates: ["2026-01-01", "2026-01-02", "2026-01-05"], values: [1, 2, 3] };
    const b = { dates: ["2026-01-02", "2026-01-05"], values: [20, 30] };
    expect(alignSeries([a, b])).toEqual({ dates: ["2026-01-02", "2026-01-05"], columns: [[2, 3], [20, 30]] });
    expect(asOf(a, "2026-01-04")).toBe(2);
    expect(asOf(a, "2026-02-01")).toBeNull();
  });
});
