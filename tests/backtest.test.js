import { describe, expect, it } from "vitest";
import {
  simulate, startIndex, metrics, drawdownPath, volTarget, compileRule, runRule, PRESETS,
} from "../src/quant/backtest.js";
import { absorptionSeries, absorptionShiftPath } from "../src/quant/models.js";

const dates = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10));
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = r => () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
function walk(n, sigma, seed) {
  const g = gauss(rng(seed));
  const v = [100];
  for (let i = 1; i < n; i++) v.push(v[i - 1] * Math.exp(sigma * g()));
  return v;
}

describe("simulate", () => {
  it("buy and hold reproduces the price path", () => {
    const p = [100, 110, 99, 120];
    const s = simulate(p, p.map(() => 1));
    expect(s.equity.at(-1)).toBeCloseTo(1.2, 12);
    expect(s.changes).toBe(1);
  });
  it("applies the lag: a target set at close i earns the return into close i+lag", () => {
    const p = [100, 100, 200, 200];
    const t = [0, 1, 0, 0];
    expect(simulate(p, t, { lag: 1 }).equity.at(-1)).toBeCloseTo(2, 12);
    expect(simulate(p, t, { lag: 2 }).equity.at(-1)).toBeCloseTo(1, 12);
  });
  it("charges costs per unit traded and holds on null", () => {
    const p = [100, 100, 100, 100];
    const s = simulate(p, [1, null, 0, 0], { costBp: 10 });
    expect(s.pos).toEqual([0, 1, 1, 0]);
    expect(s.equity.at(-1)).toBeCloseTo(0.999 * 0.999, 12);
    expect(s.turnover).toBe(2);
  });
  it("startIndex waits for the slowest signal plus the lag", () => {
    expect(startIndex([[null, 1, 1], [null, null, 1]], 1)).toBe(2);
    expect(startIndex([[1, 1], [null, null]], 1)).toBe(-1);
  });
});

describe("metrics", () => {
  it("annualizes a constant-return strategy", () => {
    const n = 253, p = Array.from({ length: n }, (_, i) => 100 * 1.0004 ** i);
    const d = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2021, 0, 1) + i * 365.25 / 252 * 864e5).toISOString().slice(0, 10));
    const m = metrics(d, simulate(p, p.map(() => 1)));
    expect(m.cagr).toBeCloseTo(1.0004 ** 252 - 1, 2);
    expect(m.mdd).toBe(0);
    expect(m.exposure).toBe(1);
  });
  it("beta to the benchmark is ~0.5 at half size and Sharpe is scale-free", () => {
    const p = walk(800, 0.01, 4), d = dates(800);
    const bh = simulate(p, p.map(() => 1)), half = simulate(p, p.map(() => 0.5));
    const m = metrics(d, half, { bench: bh.ret }), mb = metrics(d, bh);
    expect(m.beta).toBeCloseTo(0.5, 9);
    expect(m.sharpe).toBeCloseTo(mb.sharpe, 9);
    expect(m.vol).toBeCloseTo(mb.vol / 2, 9);
  });
  it("drawdown path starts at the test start", () => {
    expect(drawdownPath([1, 2, 1, 3], 1)).toEqual([null, 0, -0.5, 0]);
  });
});

describe("rules", () => {
  it("cannot see future bars", () => {
    const frame = { dates: dates(5), price: [1, 2, 3, 4, 5] };
    const seen = [];
    runRule(frame, ctx => { seen.push([ctx.get("price", -1), ctx.get("price", 0), ctx.sma(2)]); return 1; });
    expect(seen.every(([fut]) => fut == null)).toBe(true);
    expect(seen[0][2]).toBeNull();
    expect(seen[4]).toEqual([null, 5, 4.5]);
  });
  it("clips targets, keeps state and reports the failing bar", () => {
    const frame = { dates: dates(3), price: [1, 2, 3] };
    expect(runRule(frame, compileRule("ctx.state.k = (ctx.state.k || 0) + 1; return ctx.state.k * 2;"))).toEqual([2, 3, 3]);
    expect(() => runRule(frame, compileRule("if (ctx.i === 2) throw new Error('boom'); return 1;"))).toThrow(/2020-01-03: boom/);
  });
  it("every preset compiles and runs on a frame with model gaps", () => {
    const n = 300, d = dates(n);
    const frame = { dates: d, price: walk(n, 0.01, 2), raiS: d.map((_, i) => (i < 50 ? null : Math.sin(i / 9))),
      dAR: d.map((_, i) => (i < 80 ? null : 1.5 * Math.cos(i / 13))), rec: d.map(() => 0.2),
      vrp: d.map((_, i) => Math.sin(i / 7)), trend: d.map((_, i) => (i < 30 ? null : Math.cos(i / 20))),
      cal: { tom: d.map((_, i) => i % 21 < 4) } };
    for (const p of PRESETS) {
      const t = runRule(frame, compileRule(p.code));
      expect(t.length).toBe(n);
      expect(t.filter(x => x != null).length).toBeGreaterThan(50);
    }
  });
  it("vol targeting scales exposure toward the target", () => {
    const p = walk(600, 0.02, 9);
    const t = volTarget(p.map(() => 1), p, { target: 0.16, maxLev: 5 });
    const avg = t.slice(100).reduce((a, b) => a + b, 0) / 500;
    expect(avg).toBeGreaterThan(0.35);
    expect(avg).toBeLessThan(0.7);
  });
});

describe("absorption shift path", () => {
  it("ends at the dashboard's latest ΔAR", () => {
    const g = gauss(rng(9));
    const n = 400, factor = Array.from({ length: n }, g);
    const series = Array.from({ length: 6 }, () => {
      const v = [100];
      for (let t = 1; t < n; t++) v.push(v[t - 1] * Math.exp(0.01 * (t > 330 ? factor[t] + 0.2 * g() : g())));
      return { dates: dates(n), values: v };
    });
    const a = absorptionSeries(series);
    const path = absorptionShiftPath(a.values);
    expect(path.at(-1)).toBeCloseTo(a.shift, 12);
    expect(path[33]).toBeNull();
  });
});
