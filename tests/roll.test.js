import { describe, expect, it } from "vitest";
import { inRollWindow, rollAdjust, rollWindows } from "../src/data/roll.js";
import { isTradingDay } from "../src/quant/calendar.js";

/* NYSE trading days from `from` for n sessions. */
function sessions(n, from = "2025-01-02") {
  const out = [];
  for (let t = Date.parse(from + "T00:00:00Z"); out.length < n; t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (isTradingDay(d)) out.push(d);
  }
  return out;
}

describe("futures roll adjustment", () => {
  it("windows run from 8 sessions before each quarterly expiry to 1 after", () => {
    const w = rollWindows(2025, 2025);
    expect(w).toHaveLength(4);
    expect(w[0]).toEqual(["2025-03-11", "2025-03-24"]); /* expiry Fri 21 Mar */
    expect(inRollWindow("2025-03-13", w)).toBe(true); /* CME roll Thursday */
    expect(inRollWindow("2025-03-25", w)).toBe(false);
    /* June 2026 expiry falls on Juneteenth, so it moves to Thursday 18 June. */
    expect(rollWindows(2026, 2026)[1][1]).toBe("2026-06-22");
  });

  it("removes the contract-switch jump and keeps today's price", () => {
    const d = sessions(300);
    const w = rollWindows(2025, 2026);
    const idx = d.map((_, i) => 5000 * Math.exp(0.0004 * i));
    /* Futures = index × (1 + basis); the basis decays through each quarter and
       jumps back up 1.2% on the day after expiry, when the next contract takes over. */
    let basis = 0.012;
    const switchDays = new Set(w.map(([, end]) => end));
    const fut = d.map((day, i) => {
      basis = switchDays.has(day) ? 0.012 : Math.max(0, basis - 0.0002);
      return idx[i] * (1 + basis);
    });
    const a = rollAdjust({ dates: d, values: fut }, { dates: d, values: idx });
    expect(a.values.at(-1)).toBe(fut.at(-1));
    const maxJump = Math.max(...a.values.slice(1).map((v, i) => Math.abs(Math.log(v / a.values[i]))));
    expect(maxJump).toBeLessThan(0.002);
  });

  it("treats a futures-only holiday bar as a zero cash return", () => {
    /* 19 June 2026 is a cash holiday inside the June window; futures print a bar. */
    const d = ["2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19", "2026-06-22"];
    const fut = [100, 101, 102, 104.5, 105];
    const idxD = ["2026-06-16", "2026-06-17", "2026-06-18", "2026-06-22"], idxV = [100, 101, 102, 102.4];
    const a = rollAdjust({ dates: d, values: fut }, { dates: idxD, values: idxV });
    const r = i => Math.log(a.values[i] / a.values[i - 1]);
    expect(r(3)).toBeCloseTo(0, 12); /* holiday: no cash move */
    expect(r(4)).toBeCloseTo(Math.log(102.4 / 102), 12);
  });

  it("keeps today's futures move before the cash market has printed", () => {
    const d = ["2025-03-18", "2025-03-19", "2025-03-20"]; /* inside the March window */
    const fut = [100, 101, 103];
    const a = rollAdjust({ dates: d, values: fut }, { dates: d.slice(0, 2), values: [200, 202] });
    expect(Math.log(a.values[2] / a.values[1])).toBeCloseTo(Math.log(103 / 101), 12);
    expect(Math.log(a.values[1] / a.values[0])).toBeCloseTo(Math.log(202 / 200), 12);
  });

  it("doesn't touch days outside a window, including the first day of the data", () => {
    const d = sessions(20, "2025-04-01"); /* after March's window, before June's */
    const fut = d.map((_, i) => 100 + i), idx = d.map((_, i) => 50 + 3 * i);
    const a = rollAdjust({ dates: d, values: fut }, { dates: d, values: idx });
    expect(a.rollAdjusted).toBe(0);
    expect(a.values).toEqual(fut);
  });
});
