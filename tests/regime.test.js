import { describe, expect, it } from "vitest";
import { mean, std } from "../src/quant/stats.js";
import { scaledMovePath, regimeModel, quadrantOf, confidenceOf, obsFor } from "../src/quant/regime.js";
import { readMarket, RULES, QUIET } from "../src/quant/narrative.js";

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = r => () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const dates = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2024, 0, 1) + i * 864e5).toISOString().slice(0, 10));

/* Price path with daily log drift mu and vol sigma. */
function price(n, mu, sigma, seed, start = 100) {
  const g = gauss(rng(seed)), v = [start];
  for (let i = 1; i < n; i++) v.push(v[i - 1] * Math.exp(mu + sigma * g()));
  return { dates: dates(n), values: v };
}
/* Level/rate path with daily drift and normal vol. */
function level(n, mu, sigma, seed, start = 3) {
  const g = gauss(rng(seed)), v = [start];
  for (let i = 1; i < n; i++) v.push(v[i - 1] + mu + sigma * g());
  return { dates: dates(n), values: v };
}

describe("vol-scaled moves", () => {
  it("are roughly unit-variance on a driftless random walk", () => {
    /* Non-overlapping 21-day windows, so the draws are independent. */
    const p = scaledMovePath(price(6000, 0, 0.01, 11), "price", 21);
    const sample = p.values.filter((_, i) => i % 21 === 0);
    expect(Math.abs(mean(sample))).toBeLessThan(0.15);
    expect(std(sample)).toBeGreaterThan(0.85);
    expect(std(sample)).toBeLessThan(1.15);
  });

  it("are unbiased with unit variance across many independent paths", () => {
    /* One draw per path (the last 21-day score), so draws are independent. */
    const draws = [];
    for (let seed = 1; seed <= 2000; seed++) draws.push(scaledMovePath(price(400, 0, 0.01, seed), "price", 21).values.at(-1));
    const se = std(draws) / Math.sqrt(draws.length);
    expect(Math.abs(mean(draws))).toBeLessThan(3 * se);
    expect(std(draws)).toBeGreaterThan(0.94);
    expect(std(draws)).toBeLessThan(1.06);
  });

  it("scale by volatility measured before the window, so a shock can't shrink its own score", () => {
    /* Calm for 300 days, then a 21-day run of +2% days. */
    const s = price(300, 0, 0.005, 3);
    for (let i = 0; i < 21; i++) { s.values.push(s.values.at(-1) * Math.exp(0.02)); s.dates.push(dates(400)[300 + i]); }
    const z = scaledMovePath(s, "price", 21).values.at(-1);
    /* 21 × 2% against an ex-ante 0.5% daily vol is ~8σ, clipped to 3. */
    expect(z).toBe(3);
  });

  it("use point changes for rates", () => {
    const up = scaledMovePath(level(400, 0.01, 0.03, 5), "rate", 63).values.at(-1);
    const down = scaledMovePath(level(400, -0.01, 0.03, 5), "rate", 63).values.at(-1);
    expect(up).toBeGreaterThan(1);
    expect(down).toBeLessThan(-1);
  });

  it("convert trading days to observations for 365-day markets", () => {
    expect(obsFor(21, 252)).toBe(21);
    expect(obsFor(63, 365)).toBe(91);
  });
});

describe("growth × inflation regime", () => {
  const N = 500;
  const cal = dates(N);
  /* g, f: +1 rising, −1 falling; drift is strong enough to dominate the noise. */
  const build = (g, f) => [
    { id: "es", axis: "growth", sign: 1, kind: "price", series: price(N, g * 0.002, 0.01, 1) },
    { id: "cugold", axis: "growth", sign: 1, kind: "price", series: price(N, g * 0.002, 0.012, 2) },
    { id: "hyoas", axis: "growth", sign: -1, kind: "rate", series: level(N, -g * 0.01, 0.03, 3) },
    { id: "be10", axis: "inflation", sign: 1, kind: "rate", series: level(N, f * 0.004, 0.015, 4, 2.3) },
    { id: "dbc", axis: "inflation", sign: 1, kind: "price", series: price(N, f * 0.002, 0.012, 5) },
    { id: "dba", axis: "inflation", sign: 1, kind: "price", series: price(N, f * 0.0015, 0.01, 6) },
  ];

  it.each([
    [1, -1, "goldilocks"], [1, 1, "reflation"], [-1, 1, "stagflation"], [-1, -1, "disinflation"],
  ])("growth %i, inflation %i is %s", (g, f, q) => {
    const r = regimeModel(build(g, f), cal);
    expect(r.quadrant).toBe(q);
    expect(Math.sign(r.growth)).toBe(g);
    expect(Math.sign(r.inflation)).toBe(f);
    expect(r.confidence).toBe("clear");
    expect(r.contributions).toHaveLength(6);
  });

  it("dates the start of the current regime", () => {
    /* Reflation for 300 days, then inflation turns down: Goldilocks from about day 300 + h. */
    const a = build(1, 1), b = build(1, -1);
    const spliced = a.map((inp, k) => {
      const tail = b[k].series.values.slice(300);
      const base = inp.series.values[299], off = b[k].series.values[299];
      const values = inp.series.values.slice(0, 300).concat(
        tail.map(v => (inp.kind === "price" ? base * v / off : base + v - off)));
      return { ...inp, series: { dates: cal, values } };
    });
    const r = regimeModel(spliced, cal);
    expect(r.quadrant).toBe("goldilocks");
    const day = cal.indexOf(r.since);
    expect(day).toBeGreaterThan(300);
    expect(day).toBeLessThan(300 + 63 + 10);
    expect(r.sinceStart).toBe(false);
  });

  it("needs two inputs on each axis", () => {
    const inputs = build(1, 1).filter(i => i.axis === "growth" || i.id === "dbc");
    expect(regimeModel(inputs, cal)).toBeNull();
  });

  it("labels quadrants and confidence from the coordinates", () => {
    expect(quadrantOf(0.4, -0.2)).toBe("goldilocks");
    expect(quadrantOf(-0.1, 0.3)).toBe("stagflation");
    expect(confidenceOf(0.9, 0.6)).toBe("clear");
    expect(confidenceOf(0.9, 0.3)).toBe("moderate");
    expect(confidenceOf(0.9, 0.1)).toBe("tentative");
  });
});

describe("today's read", () => {
  const m = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Array.isArray(v) ? { score: v[0], chg1m: v[1] } : { score: v, chg1m: null }]));

  it("says nothing dramatic on a quiet tape", () => {
    const out = readMarket({ moves: m({ es: 0.2, cl: 0.1, zc: -0.3, gc: 0.4 }), levels: { vix: 0, move: 0.3 }, curve: { chg2s10: 4 } });
    expect(out).toEqual([QUIET]);
  });

  it("spots the corn + oil up, stocks down pattern and checks breakevens", () => {
    const facts = { moves: m({ cl: 1.6, zc: 1.2, zw: 0.9, zs: 1.0, es: -1.1, be10: [0.8, 14] }), levels: {}, curve: {} };
    const [top, ...rest] = readMarket(facts);
    expect(top.id).toBe("cost_push");
    expect(top.text).toMatch(/Breakevens agree/);
    expect(top.evidence.map(e => e.label)).toEqual(["Oil", "Grains", "ES", "10Y breakeven"]);
    /* The narrower commodity and oil rules are folded into it, not repeated. */
    expect(rest.map(r => r.id)).not.toContain("commodity_inflation");
    expect(rest.map(r => r.id)).not.toContain("oil_alone");
  });

  it("notes when breakevens don't confirm", () => {
    const facts = { moves: m({ cl: 1.6, zc: 1.2, es: -1.1, be10: [0, 1] }), levels: {}, curve: {} };
    expect(readMarket(facts)[0].text).toMatch(/barely moved/);
  });

  it("tells a bull steepener from a bear steepener", () => {
    const bull = readMarket({ moves: m({ us2y: [-1.5, -35], us10y: [-0.4, -8] }), levels: {}, curve: { chg2s10: 27 } });
    const bear = readMarket({ moves: m({ us2y: [0.2, 4], us10y: [1.4, 32] }), levels: {}, curve: { chg2s10: 28 } });
    expect(bull[0].text).toMatch(/pricing Fed cuts/);
    expect(bear[0].text).toMatch(/term-premium or inflation/);
  });

  it("reads the curve from the same H.15 legs as the spread", () => {
    /* The live 10Y card disagrees; the spread's own legs say 2Y +20, 10Y −4. */
    const out = readMarket({ moves: m({ us2y: [0.1, 3], us10y: [-0.8, -7] }), levels: {}, curve: { chg2s10: -24, chg2y: 20, chg10y: -4 } });
    expect(out[0].text).toMatch(/more hawkish Fed/);
    expect(out[0].evidence.map(e => e.label + " " + e.value)).toEqual(["2s10s −24 bp", "2Y +20 bp", "10Y −4 bp"]);
  });

  it("ranks by strength and shows at most four", () => {
    const facts = {
      moves: m({ es: -1.8, hyoas: 2.2, gc: 1.4, usdjpy: -2.0, cugold: -1.3, us10y: -1.1, ng: 2.6 }),
      levels: { vix: 1.6, move: 2.4 }, curve: {},
    };
    const out = readMarket(facts);
    expect(out.length).toBe(4);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].strength).toBeGreaterThanOrEqual(out[i].strength);
  });

  it("never fires on missing data", () => {
    for (const r of RULES) expect(r.test({ moves: {}, levels: {}, curve: {} }, {})).toBeNull();
  });
});
