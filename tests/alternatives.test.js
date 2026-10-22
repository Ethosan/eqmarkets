import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAlternative, HAS_ALTERNATIVE } from "../src/data/alternatives.js";

/* Treasury.gov's CSVs as they come: quoted column labels, newest row first, MM/DD/YYYY. */
const NOMINAL = 'Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"\n' +
  "10/21/2026,4.09,4.12,4.16,4.25,4.34,4.35,4.52,4.81,4.89,4.95,5.03,5.13,5.47,5.42\n" +
  "10/20/2026,4.10,4.13,4.17,4.26,4.34,4.36,4.51,4.79,4.86,4.94,5.02,5.12,5.47,5.42\n";
const REAL = 'Date,"5 YR","7 YR","10 YR","20 YR","30 YR"\n' +
  "10/21/2026,2.55,2.65,2.76,3.01,3.15\n" +
  "10/20/2026,2.56,2.66,2.79,3.03,3.17\n";

afterEach(() => vi.unstubAllGlobals());

/* Every transport ends in fetch: answer this year's file and 404 the earlier years. */
function stubTreasury() {
  const year = String(new Date().getFullYear());
  vi.stubGlobal("fetch", vi.fn(async url => {
    const u = String(url);
    if (!u.includes("daily-treasury-rates.csv/" + year + "/")) return new Response("", { status: 404 });
    return new Response(u.includes("real_yield") ? REAL : NOMINAL, { status: 200 });
  }));
}

describe("Treasury.gov alternative to FRED", () => {
  it("reads the nominal yields from Treasury's own column labels", async () => {
    stubTreasury();
    const ten = await fetchAlternative({ fredId: "DGS10" });
    expect(ten.values).toEqual([5.12, 5.13]); /* oldest first, like FRED */
    expect(ten.dates).toEqual(["2026-10-20", "2026-10-21"]);
    expect(ten.asOf).toBe("2026-10-21");
    expect((await fetchAlternative({ fredId: "DGS2" })).price).toBe(4.81);
    expect((await fetchAlternative({ fredId: "DGS3MO" })).price).toBe(4.25);
  });

  it("reads the real yield and computes the breakeven as nominal minus real", async () => {
    stubTreasury();
    expect((await fetchAlternative({ fredId: "DFII10" })).price).toBe(2.76);
    const be = await fetchAlternative({ fredId: "T10YIE" });
    expect(be.price).toBeCloseTo(5.13 - 2.76, 10);
    expect(be.prev).toBeCloseTo(5.12 - 2.79, 10);
  });

  it("has no stand-in for series only FRED publishes", async () => {
    stubTreasury();
    for (const id of ["THREEFYTP10", "BAMLH0A0HYM2", "WALCL", "NFCI"]) {
      expect(HAS_ALTERNATIVE.has(id)).toBe(false);
      expect(await fetchAlternative({ fredId: id })).toBeNull();
    }
  });
});
