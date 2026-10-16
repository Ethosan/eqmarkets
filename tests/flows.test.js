import { describe, expect, it } from "vitest";
import { nyseHolidays, isTradingDay, opexDate, calendarFlags, upcoming, eventStudy } from "../src/quant/calendar.js";
import { vrpSeries, stockBondCorr, trendNow, trendPath, realizedVolPath } from "../src/quant/flows.js";
import { normInv, normCdf, rng } from "../src/quant/stats.js";
import { simulate, metrics, bootstrapSharpe, deflatedSharpe, sharpe } from "../src/quant/backtest.js";

const days = (n, from = "2020-01-01") => Array.from({ length: n }, (_, i) => new Date(Date.parse(from) + i * 864e5).toISOString().slice(0, 10));
const gauss = r => () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
function walk(n, sigma, seed, drift = 0) {
  const g = gauss(rng(seed));
  const v = [100];
  for (let i = 1; i < n; i++) v.push(v[i - 1] * Math.exp(drift + sigma * g()));
  return { dates: days(n), values: v };
}

describe("market calendar", () => {
  it("knows NYSE holidays, including observed and moving ones", () => {
    const h24 = nyseHolidays(2024).map(h => h.date);
    expect(h24).toEqual(["2024-01-01", "2024-01-15", "2024-02-19", "2024-03-29", "2024-05-27", "2024-06-19", "2024-07-04", "2024-09-02", "2024-11-28", "2024-12-25"]);
    expect(nyseHolidays(2022).map(h => h.date)).not.toContain("2021-12-31"); /* Sat New Year isn't moved back */
    expect(nyseHolidays(2022).map(h => h.date)).toContain("2022-06-20"); /* Juneteenth on a Sunday */
    expect(nyseHolidays(2026).map(h => h.date)).toContain("2026-07-03"); /* July 4 on a Saturday */
    expect(isTradingDay("2026-11-26")).toBe(false);
    expect(isTradingDay("2026-10-16")).toBe(true);
  });
  it("puts option expiry on the third Friday, or Thursday before a holiday", () => {
    expect(opexDate(2026, 9)).toBe("2026-10-16");
    expect(opexDate(2025, 3)).toBe("2025-04-17"); /* Good Friday */
  });
  it("flags the turn of month on trading days only", () => {
    const d = ["2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
    const f = calendarFlags(d);
    expect(f.tomDay).toEqual([null, -1, 1, 2, 3, null]);
    expect(f.tom).toEqual([false, true, true, true, true, false]);
    expect(f.monthEnd.slice(0, 2)).toEqual([true, true]);
    expect(calendarFlags(["2026-10-27", "2026-10-28"]).preFomc).toEqual([true, false]);
    expect(calendarFlags(["2026-11-25"]).preHoliday).toEqual([true]);
  });
  it("lists what's coming up", () => {
    const u = upcoming("2026-10-17");
    expect(u.fomc.date).toBe("2026-10-28");
    expect(u.opex.date).toBe("2026-11-20");
    expect(u.holiday.date).toBe("2026-11-26");
    expect(u.tomStart.date).toBe("2026-10-30");
    expect(u.tradingToday).toBe(false);
  });
});

describe("event study", () => {
  it("finds a real event-day drift and not a random one", () => {
    const g = gauss(rng(3));
    const n = 2000, mask = Array.from({ length: n }, (_, i) => i % 5 === 0);
    const rets = mask.map(m => 0.01 * g() + (m ? 0.004 : 0));
    const real = eventStudy(rets, mask);
    expect(real.t).toBeGreaterThan(3);
    expect(real.p).toBeLessThan(0.01);
    const u = rng(9);
    const noise = eventStudy(rets.map(() => 0.01 * g()), mask.map(() => u() < 0.2));
    expect(noise.p).toBeGreaterThan(0.01);
  });
});

describe("premia and flows", () => {
  it("VRP is VIX minus realized vol", () => {
    const es = walk(300, 0.01, 4);
    const vix = { dates: es.dates, values: es.dates.map(() => 20) };
    const v = vrpSeries(es, vix);
    const rv = realizedVolPath(es.values);
    expect(v.values.at(-1)).toBeCloseTo(20 - rv.at(-1), 9);
    expect(v.rv.at(-1)).toBeGreaterThan(10);
    expect(v.rv.at(-1)).toBeLessThan(22);
  });
  it("stock–bond correlation is +1 when bond prices move with stocks", () => {
    const es = walk(200, 0.01, 6);
    const y = [4];
    for (let i = 1; i < 200; i++) y.push(y[i - 1] - Math.log(es.values[i] / es.values[i - 1]));
    const c = stockBondCorr(es, { dates: es.dates, values: y });
    expect(c.values.at(-1)).toBeCloseTo(1, 9);
  });
  it("trend reads a steady uptrend as long and shows flip levels and flows", () => {
    const s = walk(400, 0.008, 2, 0.003);
    const t = trendNow(s);
    expect(t.pos).toBeGreaterThan(0.7);
    expect(t.legs[0].flip).toBeCloseTo(s.values[s.values.length - 21], 9);
    expect(t.scenarios.find(x => x.k === -2).flow).toBeLessThanOrEqual(0);
    expect(trendPath(s).values.at(-1)).toBeCloseTo(t.pos, 12);
  });
  it("a falling yield counts as a bond uptrend", () => {
    const d = days(300);
    const t = trendNow({ dates: d, values: d.map((_, i) => 5 - i * 0.01 + 0.02 * Math.sin(i)) }, { kind: "rate" });
    expect(t.pos).toBeGreaterThan(0.5);
  });
});

describe("overfitting guards", () => {
  it("inverse normal", () => {
    expect(normInv(0.975)).toBeCloseTo(1.959964, 6);
    expect(normCdf(normInv(0.01))).toBeCloseTo(0.01, 6);
  });
  it("metrics over a sub-window", () => {
    const p = [100, 110, 121, 121, 110];
    const sim = simulate(p, p.map(() => 1));
    const d = days(5);
    expect(metrics(d, sim, { to: 2 }).total).toBeCloseTo(0.21, 12);
    expect(metrics(d, sim, { from: 2 }).total).toBeCloseTo(110 / 121 - 1, 12);
  });
  it("bootstrap interval brackets the Sharpe; deflation lowers it with more trials", () => {
    const g = gauss(rng(8));
    const r = Array.from({ length: 1500 }, () => 0.0006 + 0.01 * g());
    const ci = bootstrapSharpe(r);
    expect(ci[0]).toBeLessThan(sharpe(r));
    expect(ci[1]).toBeGreaterThan(sharpe(r));
    const one = deflatedSharpe(r).dsr, many = deflatedSharpe(r, { trials: 50, srVar: 0.0004 }).dsr;
    expect(one).toBeGreaterThan(0.8);
    expect(many).toBeLessThan(one);
  });
});
