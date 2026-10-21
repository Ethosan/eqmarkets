import { describe, expect, it } from "vitest";
import { readMarket } from "../src/quant/narrative.js";

const base = { moves: {}, levels: {}, curve: {}, relative: {}, day: {}, extremes: {}, credit: null };

describe("Today's read: since the last close", () => {
  it("names the biggest 2σ+ movers with their day change", () => {
    const f = { ...base, day: { cl: { score: -3.1, chg1d: -4.2 }, hg: { score: 2.2, chg1d: 2.9 }, es: { score: 0.4, chg1d: 0.3 } } };
    const r = readMarket(f).find(x => x.id === "big_moves");
    expect(r.text).toContain("Oil −4.2%");
    expect(r.text).toContain("Copper +2.9%");
    expect(r.text).not.toContain("ES");
    expect(r.age).toBe("today");
  });

  it("reads a VIX jump with VVIX as a scramble for protection", () => {
    const r = readMarket({ ...base, day: { vix: { score: 2.6, chg1d: 3.4 }, vvix: { score: 2.1, chg1d: 9 } } }).find(x => x.id === "vol_jump");
    expect(r.text).toContain("VIX jumped 3.4 points");
    expect(r.text).toContain("VVIX with it");
    expect(r.tone).toBe("d");
  });

  it("lists new 52-week highs and lows", () => {
    const r = readMarket({ ...base, extremes: { gc: "high", dxy: "low" } }).find(x => x.id === "new_extremes");
    expect(r.text).toBe("New 52-week highs in Gold; new 52-week lows in the dollar.");
  });
});

describe("Today's read: credit in long-run context", () => {
  const credit = { hy: 3.23, hyChg1m: 52, hyPct1y: 0.96 };

  it("says a one-year high can still be tight by long-run standards", () => {
    const r = readMarket({ ...base, credit: { ...credit, baaPctLong: 0.18, baaSince: "1986" } }).find(x => x.id === "credit_context");
    expect(r.text).toContain("widened 52 bp in a month to 3.23%");
    expect(r.text).toContain("96th percentile");
    expect(r.text).toContain("still tight");
    expect(r.text).toContain("18th percentile since 1986");
    expect(r.tone).toBe("");
  });

  it("calls it wide only when the long-run spread agrees", () => {
    const r = readMarket({ ...base, credit: { ...credit, baaPctLong: 0.9, baaSince: "1986" } }).find(x => x.id === "credit_context");
    expect(r.text).toContain("wide by long-run standards too");
    expect(r.tone).toBe("d");
  });

  it("admits it can't judge the long run without the Baa series", () => {
    const r = readMarket({ ...base, credit }).find(x => x.id === "credit_context");
    expect(r.text).toContain("only three years");
  });

  it("stays quiet when spreads are ordinary for the year and not moving", () => {
    expect(readMarket({ ...base, credit: { hy: 2.9, hyChg1m: 5, hyPct1y: 0.5 } }).some(x => x.id === "credit_context")).toBe(false);
  });
});

describe("Today's read: how long a pattern has run", () => {
  const wide = { ...base, moves: { hyoas: { score: 1.4 }, es: { score: 0.2 } } };
  const calm = { ...base, moves: { hyoas: { score: 0 }, es: { score: 0 } } };

  it("tags a pattern that wasn't there yesterday as new", () => {
    const r = readMarket(wide, 5, { d1: calm, w1: calm, w2: calm }).find(x => x.id === "credit_leads");
    expect(r.age).toBe("new");
  });

  it("tags one that has held for two weeks and lets fresh news outrank it", () => {
    const today = { ...wide, day: { cl: { score: -2.2, chg1d: -3 } } };
    const out = readMarket(today, 5, { d1: wide, w1: wide, w2: wide });
    expect(out.find(x => x.id === "credit_leads").age).toBe("long");
    expect(out[0].id).toBe("big_moves");
  });
});
