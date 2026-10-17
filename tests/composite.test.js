import { describe, expect, it } from "vitest";
import { combinationForecast, evaluate, readNow, neweyWestT, biasLabel, HORIZONS, marketState } from "../src/quant/composite.js";
import { parseFomcCalendar, useFomcDates, calendarFlags, upcoming, FOMC_DATES } from "../src/quant/calendar.js";
import { rng } from "../src/quant/stats.js";

const gauss = r => () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const days = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2012, 0, 2) + i * 864e5).toISOString().slice(0, 10));

/* Prices whose next-day return loads on `trend` (positive) and on `dAR`
   (negative), plus pure-noise signals for the rest. */
function market(n, { beta = 0.002, seed = 5 } = {}) {
  const g = gauss(rng(seed)), u = gauss(rng(seed + 1));
  const sig = Array.from({ length: n }, () => u());
  const noise = () => Array.from({ length: n }, () => u());
  const P = [100];
  for (let t = 1; t < n; t++) P.push(P[t - 1] * Math.exp(0.0003 + beta * sig[t - 1] + 0.01 * g()));
  return { dates: days(n), price: P, trend: sig, dAR: sig.map(x => -x), vrp: noise(), raiS: noise(), rec: noise() };
}

describe("combination forecast", () => {
  it("finds real predictability out of sample and weights the signals that have it", () => {
    const fr = market(3000);
    const res = combinationForecast(fr, 1);
    const ev = evaluate(res, { band: 0.02, dates: fr.dates });
    expect(ev.r2).toBeGreaterThan(0.005);
    expect(ev.cwP).toBeLessThan(0.01);
    const t = fr.price.length - 1;
    const wt = res.preds.findIndex(p => p.id === "trend"), wn = res.preds.findIndex(p => p.id === "vrp");
    expect(res.w[wt][t]).toBeGreaterThan(res.w[wn][t]);
    expect(ev.cerGain).toBeGreaterThan(0);
    expect(res.lambda[t]).toBeGreaterThan(0.5); /* the models earn their weight */
  });
  it("adds nothing when every signal is noise", () => {
    const fr = market(3000, { beta: 0 });
    const ev = evaluate(combinationForecast(fr, 1), { band: 0.02 });
    expect(ev.r2).toBeLessThan(0.003);
    expect(Math.abs(ev.r2 - ev.r2Raw)).toBeLessThan(0.005); /* noise in, little change out */
    expect(ev.cwP).toBeGreaterThan(0.01);
  });
  it("switches off a slope with the wrong sign", () => {
    const fr = market(2000);
    fr.vrp = fr.trend.map(x => -x); /* research says +, data says − */
    const res = combinationForecast(fr, 1);
    const k = res.preds.findIndex(p => p.id === "vrp"), t = 1999;
    const M = res.M[t];
    /* With b = 0 the forecast is the signal's own historical mean, close to M. */
    expect(Math.abs(res.f[k][t] - M)).toBeLessThan(1e-3);
  });
  it("never uses the future: changing later prices leaves earlier forecasts alone", () => {
    const a = market(1500), b = market(1500);
    for (let t = 1200; t < 1500; t++) b.price[t] *= 1.5;
    for (const { h } of HORIZONS) {
      const ra = combinationForecast(a, h), rb = combinationForecast(b, h);
      for (let t = 0; t < 1200 - h; t++) { expect(rb.F[t]).toBe(ra.F[t]); expect(rb.G[t]).toBe(ra.G[t]); }
    }
  });
  it("reads today with a label, contributions and agreement", () => {
    const fr = market(2500);
    const res = combinationForecast(fr, 5);
    const ev = evaluate(res, { band: 0.02 });
    const now = readNow(res, ev, 0.02);
    expect(["Bullish", "Neutral", "Bearish"]).toContain(now.label);
    expect(now.contrib.length).toBeGreaterThan(1);
    expect(now.agree).toBeGreaterThanOrEqual(0);
    expect(now.agree).toBeLessThanOrEqual(1.000001);
  });
  it("labels and Newey–West", () => {
    expect(biasLabel(0.03, 0.02)).toBe("Bullish");
    expect(biasLabel(0, 0.02)).toBe("Neutral");
    expect(biasLabel(-0.03, 0.02)).toBe("Bearish");
    const d = Array.from({ length: 400 }, (_, i) => 1 + Math.sin(i));
    expect(neweyWestT(d, 0)).toBeGreaterThan(10);
  });
});

describe("market state and regime-dependent slopes", () => {
  /* Volatility alternates between calm (0.6%) and stressed (2%) spells of 250
     days; the signal predicts returns only in stressed spells. */
  function regimeMarket(n, seed = 21) {
    const g = gauss(rng(seed)), u = gauss(rng(seed + 1));
    const sig = Array.from({ length: n }, () => u());
    const stressed = t => Math.floor(t / 250) % 2 === 1;
    const P = [100];
    for (let t = 1; t < n; t++) {
      const vol = stressed(t) ? 0.02 : 0.006;
      P.push(P[t - 1] * Math.exp(0.0003 + (stressed(t - 1) ? 0.006 * sig[t - 1] : 0) + vol * g()));
    }
    const noise = () => Array.from({ length: n }, () => u());
    return { dates: days(n), price: P, trend: sig, vrp: noise(), raiS: noise(), dAR: noise(), rec: noise(), stressed };
  }
  it("flags stressed spells from the instrument's own volatility", () => {
    const fr = regimeMarket(3000);
    const st = marketState(fr.price);
    const hits = st.map((s, t) => (s == null || t % 250 < 40 ? null : s === (fr.stressed(t) ? 1 : 0))).filter(x => x != null);
    expect(hits.filter(Boolean).length / hits.length).toBeGreaterThan(0.85);
  });
  it("separate calm/stressed slopes beat one pooled slope when predictability is regime-dependent", () => {
    const fr = regimeMarket(4000);
    const pooled = evaluate(combinationForecast(fr, 1, { regimes: false, regHalfLife: Infinity }), { band: 0.01 });
    const regime = evaluate(combinationForecast(fr, 1), { band: 0.01 });
    expect(regime.r2).toBeGreaterThan(pooled.r2);
    expect(regime.byState[1].r2).toBeGreaterThan(regime.byState[0].r2);
    expect(regime.byState[0].n + regime.byState[1].n).toBeLessThanOrEqual(regime.n);
  });
});

describe("FOMC calendar from the Fed's page", () => {
  const panel = (y, rows) => `<div class="panel"><div class="panel-heading"><h4><a id="1">${y} FOMC Meetings</a></h4></div>` +
    rows.map(([m, d]) => `<div class="fomc-meeting__month col-xs-5"><strong>${m}</strong></div><div class="x"></div>` +
      `<div class="fomc-meeting__date col-xs-4">${d}</div>`).join("") + "</div>";
  const html = panel(2027, [["January", "26-27"], ["March", "16-17*"], ["Apr/May", "30-1"], ["June", "22 (notation vote)"], ["July", "27-28"]]) +
    panel(2023, [["Jan/Feb", "31-1"], ["March", "21-22*"]]);
  it("takes the statement day, crosses month ends and skips notation votes", () => {
    expect(parseFomcCalendar(html)).toEqual(["2023-02-01", "2023-03-22", "2027-01-27", "2027-03-17", "2027-05-01", "2027-07-28"]);
  });
  it("merges over the built-in list by year", () => {
    expect(useFomcDates(["2028-01-26", "2028-03-15", "2028-04-26", "2028-06-14"])).toBe(true);
    expect(calendarFlags(["2028-01-26"]).fomc).toEqual([true]);
    expect(upcoming("2028-01-02").fomc.date).toBe("2028-01-26");
    expect(calendarFlags(["2026-10-28"]).fomc).toEqual([true]); /* other years untouched */
    useFomcDates(FOMC_DATES.filter(d => d >= "2028")); /* no-op restore: too few dates */
  });
});
