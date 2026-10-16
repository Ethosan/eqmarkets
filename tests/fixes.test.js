import { describe, expect, it } from "vitest";
import { fmtNum } from "../src/ui/format.js";
import { scorePath } from "../src/quant/models.js";

describe("fmtNum", () => {
  it("drops the minus on values that round to zero", () => {
    expect(fmtNum(-0.0004, { dp: 1, scale: 100, suffix: " bp" })).toBe("0.0 bp");
    expect(fmtNum(-0.04, { dp: 1 })).toBe("0.0");
  });
  it("keeps a typographic minus ahead of the prefix", () => {
    expect(fmtNum(-1.2, { dp: 2, prefix: "$" })).toBe("−$1.20");
    expect(fmtNum(-1234.5, { dp: 1 })).toBe("−1,234.5");
  });
});

describe("trend score horizon", () => {
  /* A series that rises 1% a day for 30 days then goes flat: on day 50 a
     21-observation window sees no move, a 30-observation window still does. */
  const values = [];
  for (let i = 0; i < 80; i++) values.push(i < 30 ? 100 * 1.01 ** i : 100 * 1.01 ** 29 * (1 + 0.001 * Math.sin(i)));
  const dates = values.map((_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
  const at = (p, d) => p.values[p.dates.indexOf(d)];

  it("uses about a calendar month of observations for 365-day markets", () => {
    const day = dates[52];
    const daily = scorePath({ dates, values }, "trend", 1, 252);
    const crypto = scorePath({ dates, values }, "trend", 1, 365);
    expect(Math.abs(at(daily, day))).toBeLessThan(Math.abs(at(crypto, day)));
  });
  it("defaults to 21 trading days", () => {
    const a = scorePath({ dates, values }, "trend", 1);
    const b = scorePath({ dates, values }, "trend", 1, 252);
    expect(a.values).toEqual(b.values);
  });
});
