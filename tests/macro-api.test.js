import { afterEach, describe, expect, it, vi } from "vitest";
import { ITEM_BY_ID } from "../src/config.js";
import { NEEDED, json, rateLimited, shapeRegime, shapeRisk } from "../functions/api/_macro.mjs";

const REGIME = {
  growth: 0.4234, inflation: -0.3156, quadrant: "goldilocks", label: "Goldilocks",
  confidence: "clear", readingQuadrant: "reflation", provisional: false,
  weeksIn: 12, since: "2026-07-20",
  pending: { quadrant: "reflation", label: "Reflation", weeks: 2, needed: 3 },
  switchesYear: 1,
  history: { dates: ["2026-10-23"], growth: [0.42], inflation: [-0.32] },
};

describe("GET /api/regime payload", () => {
  it("carries the card's fields, rounded, with the pending switch in full", () => {
    expect(shapeRegime(REGIME, "2026-10-23", "2026-10-24T04:00:00.000Z")).toEqual({
      quadrant: "goldilocks", label: "Goldilocks", confidence: "clear",
      growth: 0.42, inflation: -0.32, readingQuadrant: "reflation", provisional: false,
      weeksIn: 12, since: "2026-07-20",
      pending: { quadrant: "reflation", label: "Reflation", weeks: 2, needed: 3 },
      switchesYear: 1, asOf: "2026-10-23", updated: "2026-10-24T04:00:00.000Z",
    });
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
    };
    expect(shapeRisk(rai, "2026-10-23", "2026-10-24T04:00:00.000Z")).toEqual({
      value: 0.31, latest: 0.4, label: "Leaning risk-on", inputs: 2, total: 8,
      contributions: [
        { id: "es", label: "Equities (ES)", score: 1.23 },
        { id: "vix", label: "Equity vol (VIX)", score: -0.88 },
      ],
      asOf: "2026-10-23", updated: "2026-10-24T04:00:00.000Z",
    });
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
