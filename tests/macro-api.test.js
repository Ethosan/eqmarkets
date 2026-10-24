import { afterEach, describe, expect, it, vi } from "vitest";
import { ITEM_BY_ID } from "../src/config.js";
import { NEEDED, json, rateLimited, shapeRegime, shapeRisk } from "../functions/api/_macro.mjs";

const REGIME = {
  growth: 0.4234, inflation: -0.3156, quadrant: "goldilocks", label: "Goldilocks",
  confidence: "clear", readingQuadrant: "reflation", provisional: false,
  weeksIn: 12, since: "2026-07-20",
  pending: { quadrant: "reflation", label: "Reflation", weeks: 2, needed: 3 },
  switchesYear: 1,
  trail: [
    { date: "2026-10-09", growth: 0.3111, inflation: -0.1049 },
    { date: "2026-10-16", growth: 0.3989, inflation: -0.2551 },
  ],
  history: { dates: ["2026-10-23"], growth: [0.42], inflation: [-0.32] },
};

describe("GET /api/regime payload", () => {
  it("carries the card's fields, rounded, with the pending switch in full", () => {
    expect(shapeRegime(REGIME, "2026-10-23", "2026-10-24T04:00:00.000Z")).toEqual({
      quadrant: "goldilocks", label: "Goldilocks", confidence: "clear",
      growth: 0.42, inflation: -0.32, readingQuadrant: "reflation", provisional: false,
      weeksIn: 12, since: "2026-07-20",
      pending: { quadrant: "reflation", label: "Reflation", weeks: 2, needed: 3 },
      switchesYear: 1,
      trail: [
        { date: "2026-10-09", growth: 0.31, inflation: -0.1 },
        { date: "2026-10-16", growth: 0.4, inflation: -0.26 },
      ],
      asOf: "2026-10-23", updated: "2026-10-24T04:00:00.000Z",
    });
  });

  it("serves the same weekly trail the dashboard's map draws", async () => {
    const { regimeModel } = await import("../src/quant/regime.js");
    const dates = [], up = [], down = [];
    for (let i = 0, t = Date.parse("2025-06-02"); i < 330; i++, t += 864e5) {
      const day = new Date(t).getUTCDay();
      if (day === 0 || day === 6) continue;
      dates.push(new Date(t).toISOString().slice(0, 10));
      up.push(100 * Math.exp(0.001 * i + 0.01 * Math.sin(i / 3)));
      down.push(100 * Math.exp(-0.001 * i + 0.01 * Math.cos(i / 4)));
    }
    const s = values => ({ dates, values });
    const r = regimeModel([
      { id: "a", axis: "growth", sign: 1, kind: "price", series: s(up) },
      { id: "b", axis: "growth", sign: 1, kind: "price", series: s(up) },
      { id: "c", axis: "inflation", sign: 1, kind: "price", series: s(down) },
      { id: "d", axis: "inflation", sign: 1, kind: "price", series: s(down) },
    ], dates);
    const out = shapeRegime(r, dates.at(-1), "t");
    expect(out.trail.length).toBe(r.trail.length);
    expect(out.trail.length).toBeGreaterThan(0);
    out.trail.forEach((p, k) => {
      expect(p.date).toBe(r.trail[k].date);
      expect(p.growth).toBeCloseTo(r.trail[k].growth, 2);
      expect(p.inflation).toBeCloseTo(r.trail[k].inflation, 2);
    });
  });

  it("serves an empty trail rather than none", () => {
    expect(shapeRegime({ ...REGIME, trail: undefined }, "d", "t").trail).toEqual([]);
  });

  it("maps a provisional reading to null since and zero weeks", () => {
    const out = shapeRegime({ ...REGIME, provisional: true, weeksIn: 0, since: null, pending: null }, "2026-10-23", "t");
    expect(out.provisional).toBe(true);
    expect(out.since).toBeNull();
    expect(out.weeksIn).toBe(0);
    expect(out.pending).toBeNull();
  });
});

describe("GET /api/risk payload", () => {
  it("labels the smoothed value and lists the contributions", () => {
    const rai = {
      smooth: 0.314, latest: 0.402, total: 8,
      contributions: [
        { id: "es", label: "Equities (ES)", transform: "trend", score: 1.234 },
        { id: "vix", label: "Equity vol (VIX)", transform: "level", score: -0.876 },
      ],
      history: { dates: ["2026-10-21", "2026-10-22", "2026-10-23"], values: [0.2111, 0.3289, 0.402] },
    };
    expect(shapeRisk(rai, "2026-10-23", "2026-10-24T04:00:00.000Z")).toEqual({
      value: 0.31, latest: 0.4, label: "Leaning risk-on", inputs: 2, total: 8,
      contributions: [
        { id: "es", label: "Equities (ES)", score: 1.23 },
        { id: "vix", label: "Equity vol (VIX)", score: -0.88 },
      ],
      history: [
        { date: "2026-10-21", value: 0.21 },
        { date: "2026-10-22", value: 0.33 },
        { date: "2026-10-23", value: 0.4 },
      ],
      asOf: "2026-10-23", updated: "2026-10-24T04:00:00.000Z",
    });
  });

  it("ends the history on the index's latest reading, and value is its last three days", async () => {
    const { riskAppetite } = await import("../src/quant/models.js");
    const dates = [], a = [], b = [];
    for (let i = 0, t = Date.parse("2025-08-01"); i < 400; i++, t += 864e5) {
      dates.push(new Date(t).toISOString().slice(0, 10));
      a.push(100 * Math.exp(0.002 * i + 0.02 * Math.sin(i / 5)));
      b.push(20 + 5 * Math.sin(i / 9));
    }
    const s = values => ({ dates, values });
    const r = riskAppetite([
      { id: "a", label: "A", transform: "trend", sign: 1, series: s(a) },
      { id: "b", label: "B", transform: "level", sign: -1, series: s(b) },
      { id: "c", label: "C", transform: "trend", sign: -1, series: s(a) },
      { id: "d", label: "D", transform: "level", sign: 1, series: s(b) },
    ], dates);
    const out = shapeRisk({ ...r, total: 4 }, dates.at(-1), "t");
    expect(out.history.length).toBe(r.history.dates.length);
    expect(out.history.at(-1).date).toBe(dates.at(-1));
    expect(out.history.at(-1).value).toBeCloseTo(r.latest, 2);
    const last3 = r.history.values.slice(-3).reduce((x, y) => x + y, 0) / 3;
    expect(out.value).toBeCloseTo(last3, 2);
  });
});

describe("model inputs", () => {
  it("fetches only configured, fetchable series", () => {
    for (const id of NEEDED) expect(ITEM_BY_ID[id], id).toBeTruthy();
    expect(NEEDED).not.toContain("vixts");
    expect(NEEDED).not.toContain("cugold");
    expect(NEEDED).toEqual(expect.arrayContaining(
      ["es", "vix", "hyoas", "be10", "dbc", "dba", "vix3m", "hg", "gc"]));
  });
});

describe("rate limiting", () => {
  afterEach(() => vi.useRealTimers());

  it("allows 30 a minute per IP and blocks the 31st until the window passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    for (let i = 0; i < 30; i++) expect(rateLimited("1.2.3.4")).toBe(false);
    expect(rateLimited("1.2.3.4")).toBe(true);
    expect(rateLimited("5.6.7.8")).toBe(false); /* other IPs are unaffected */
    vi.setSystemTime(new Date("2026-10-24T12:00:59Z"));
    expect(rateLimited("1.2.3.4")).toBe(true); /* still inside the window */
    vi.setSystemTime(new Date("2026-10-24T12:01:01Z"));
    expect(rateLimited("1.2.3.4")).toBe(false); /* window reset */
  });
});

describe("response headers", () => {
  it("answers CORS-open, cacheable, sniff-proof JSON", async () => {
    const res = json(200, { ok: true });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });
});
