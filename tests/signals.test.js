import { describe, expect, it } from "vitest";
import { forwardAfter, moonBuckets, moonPhase, nightlife, phaseBin, pizza, pizzaTest, tCrit } from "../src/data/signals.js";

/* n business days from 2020-01-02, with closes from `f(i)` */
function series(n, f) {
  const dates = [], values = [];
  const d = new Date(Date.UTC(2020, 0, 2));
  while (dates.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) { dates.push(d.toISOString().slice(0, 10)); values.push(f(dates.length - 1)); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return { dates, values };
}

describe("critical t", () => {
  it("matches the t-table at 5% two-tailed", () => {
    expect(tCrit(5)).toBeCloseTo(2.571, 2);
    expect(tCrit(30)).toBeCloseTo(2.042, 2);
    expect(tCrit(1e6)).toBeCloseTo(1.96, 2);
  });
});

describe("fear and greed against the next month", () => {
  it("calls too little history 'untested' rather than guessing", () => {
    const px = series(300, i => 100 + i);
    /* one stretch of extreme fear: many days, but a single episode */
    const readings = px.dates.slice(0, 200).map((d, i) => ({ d, v: i >= 40 && i < 50 ? 10 : 50 }));
    const out = forwardAfter(readings, px, { h: 21 });
    expect(out.fear.days).toBe(10);
    expect(out.fear.episodes).toBe(1);
    expect(out.fear.t).toBeNull();
    expect(out.fear.sig).toBe(false);
  });

  it("finds a real edge when the index reliably jumps after extreme fear", () => {
    /* flat, except a 5% step up 21 sessions after every fear day */
    const n = 1600, fearDays = new Set(Array.from({ length: 30 }, (_, k) => 30 + k * 50));
    const steps = new Set([...fearDays].map(i => i + 10));
    let level = 100;
    const px = series(n, i => { if (steps.has(i)) level *= 1.05; return level * (1 + 0.001 * Math.sin(i)); });
    const readings = px.dates.slice(0, n - 30).map((d, i) => ({ d, v: fearDays.has(i) ? 10 : 50 }));
    const out = forwardAfter(readings, px, { h: 21 });
    expect(out.fear.episodes).toBe(30);
    expect(out.fear.avg).toBeGreaterThan(0.04);
    expect(out.fear.sig).toBe(true);
    expect(out.greed.days).toBe(0);
  });

  it("returns nothing without enough overlapping days", () => {
    expect(forwardAfter([{ d: "2020-01-02", v: 10 }], series(50, i => 100 + i))).toBeNull();
    expect(forwardAfter([], series(50, () => 100))).toBeNull();
  });
});

describe("the moon", () => {
  it("knows a full moon from a new one", () => {
    expect(phaseBin(moonPhase(Date.UTC(2000, 0, 6, 18)))).toBe(0);        /* new moon, 6 Jan 2000 */
    expect(phaseBin(moonPhase(Date.UTC(2000, 0, 21, 5)))).toBe(4);        /* full moon, 21 Jan 2000 */
  });

  it("finds no edge in returns that ignore the moon", () => {
    /* deterministic noise with no lunar pattern */
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
    let p = 100;
    const out = moonBuckets(series(2500, () => (p *= 1 + rnd() * 0.02)));
    expect(out.rows).toHaveLength(8);
    expect(out.rows.reduce((a, r) => a + r.n, 0)).toBe(2499);
    expect(out.edge).toBe(false);
    expect(out.chance).toBeGreaterThan(0.05);
  });
});

describe("the measured Stripper Index", () => {
  const month = (y, m) => y + "-" + String(m).padStart(2, "0");
  const feed = (jobs, unrate) => ({
    jobs: Array.from({ length: 13 }, (_, i) => ({ t: month(2025 + Math.floor((i + 7) / 12), (i + 7) % 12 + 1), v: jobs[i] ?? 400 })),
    unrate: Array.from({ length: 13 }, (_, i) => ({ t: month(2025 + Math.floor((i + 7) / 12), (i + 7) % 12 + 1), v: unrate[i] ?? 4 })),
    source: "bls",
  });

  it("flags the double signal only when jobs fall and unemployment rises", () => {
    const both = nightlife(feed({ 12: 380 }, { 12: 4.5 }));
    expect(both.jobsChg).toBeCloseTo(-5, 5);
    expect(both.unrateChg).toBeCloseTo(0.5, 5);
    expect(both.double).toBe(true);
    expect(nightlife(feed({ 12: 380 }, { 12: 3.8 })).double).toBe(false);
    expect(nightlife(feed({ 12: 420 }, { 12: 4.5 })).double).toBe(false);
  });

  it("needs a year of both series", () => {
    expect(nightlife({ jobs: [{ t: "2026-01", v: 1 }], unrate: [] })).toBeNull();
    expect(nightlife(null)).toBeNull();
  });
});

describe("the Pentagon Pizza Index", () => {
  it("says when Google sent no busyness instead of reading quiet", () => {
    const pz = pizza({ now: { limited: true, signedIn: false, places: [{ name: "A", live: null, closed: true }, { name: "B", live: null, closed: false }] }, hist: [] });
    expect(pz.limited).toBe(true);
    expect(pz.pctUsual).toBeNull();
    expect(pz.live).toBe(0);
    expect(pz.open).toBe(1);
  });

  it("averages live busyness against each pizzeria's usual for the hour", () => {
    const pz = pizza({ now: { places: [{ live: 90, pctUsual: 180 }, { live: 40, pctUsual: 100 }, { live: null, usualNow: 30 }] }, hist: [{ t: 1, pctUsual: null }, { t: 2, pctUsual: 120 }] });
    expect(pz.live).toBe(2);
    expect(pz.pctUsual).toBe(140);
    expect(pz.spikes).toBe(1);
    expect(pz.hist).toHaveLength(1);
  });
});

describe("the Pizza Index against the next session", () => {
  /* one reading at 9 PM Washington time on each business day of `px`, spiking where `spike(i)` */
  const log = (px, spike) => px.dates.slice(0, -1).map((d, i) => ({ t: Date.parse(d + "T01:00:00Z") + 864e5, pctUsual: spike(i) ? 200 : 100 }));

  it("waits for ten spike nights", () => {
    const px = series(40, i => 100 + i);
    const out = pizzaTest(log(px, i => i % 10 === 0), px);
    expect(out.spikeNights).toBe(4);
    expect(out.t).toBeNull();
    expect(out.sig).toBe(false);
  });

  it("scores each night on the next session's move, either way", () => {
    /* after every spike night a 3% rise or a 4% fall; after other nights 0.1% up or 0.2% down */
    let level = 100, k = 0, j = 0;
    const spikeAt = i => i % 5 === 0;
    const px = series(300, i => (level *= i > 0 && spikeAt(i - 1) ? (k++ % 2 ? 0.96 : 1.03) : (j++ % 2 ? 0.998 : 1.001)));
    const out = pizzaTest(log(px, spikeAt), px);
    expect(out.spikeNights).toBe(60);
    expect(out.avgSpike).toBeCloseTo(0.035, 4);
    expect(out.avgRest).toBeCloseTo(0.0015, 3);
    expect(out.sig).toBe(true);
  });

  it("needs a log and prices", () => {
    expect(pizzaTest([], series(10, () => 100))).toBeNull();
    expect(pizzaTest([{ t: 0, pctUsual: 100 }], null)).toBeNull();
  });
});
