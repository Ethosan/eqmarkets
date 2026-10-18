import { describe, expect, it } from "vitest";
import { REV_BUCKETS, bucketOfRev, bucketTable, conditionalToday } from "../src/quant/conditional.js";

/* A synthetic frame: 300 bars where every deep 5-day drop is followed by a
   bounce, so the bucket record is known by construction. The price wobbles
   daily so the EWMA vol is defined. */
function frame({ n = 400, bounce = 0.03 } = {}) {
  const price = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const cycle = Math.sin(i / 9);
    p *= Math.exp(0.0005 + 0.004 * cycle + (i % 45 === 44 ? -0.045 : 0) + (i % 45 === 45 ? bounce : 0));
    price.push(p);
  }
  /* rev: a deterministic stand-in for the reversal signal: the 5-day log move
     over a fixed 2% vol, so bucket thresholds land exactly on multiples of it. */
  const rev = price.map((_, i) => (i >= 6 ? Math.log(price[i] / price[i - 5]) / (0.02 * Math.sqrt(5)) : null));
  const mom = price.map((_, i) => (i >= 60 ? (i % 120 < 60 ? 1 : -1) * 0.5 : null));
  return { price, rev, mom };
}

describe("reversal buckets", () => {
  it("assigns every finite value to exactly one bucket", () => {
    for (const v of [-3, -2, -1.5, -1, -0.4, 0, 0.9, 1, 1.7, 2, 3.2]) {
      const hits = REV_BUCKETS.filter(b => b.test(v));
      expect(hits).toHaveLength(1);
    }
    expect(bucketOfRev(-2)).toBe(REV_BUCKETS[0]);
    expect(bucketOfRev(0.5).id).toBe("mid");
    expect(bucketOfRev(null)).toBeNull();
  });
});

describe("bucket table", () => {
  it("counts only completed outcomes and never the future", () => {
    const fr = frame();
    const t1 = bucketTable(fr, 1);
    const sum = t1.reduce((a, b) => a + b.n, 0);
    const usable = fr.rev.filter((v, i) => v != null && i + 1 < fr.price.length).length;
    expect(sum).toBe(usable);
    /* Changing the last price can't change any bucket's count. */
    /* Changing the last price (no outcome can start there) leaves every count alone. */
    const fr2 = { ...fr, price: fr.price.slice(0, -1).concat(fr.price.at(-1) * 1.5) };
    expect(bucketTable(fr2, 1).reduce((a, b) => a + b.n, 0)).toBe(usable);
  });
});

describe("today's conditional", () => {
  it("reports today's bucket with its forward record and the match level", () => {
    const fr = frame();
    const n = fr.price.length;
    /* History: every 10th bar is a −2.5σ week, and the next day always bounces +1%. */
    for (let i = 60; i + 6 < n; i += 10) {
      fr.rev[i] = -2.5;
      fr.price[i + 1] = fr.price[i] * 1.01;
    }
    /* Today: also a deep-down week. */
    fr.rev[n - 1] = -2.99;
    const c = conditionalToday(fr);
    expect(c).not.toBeNull();
    expect(c.bucketId).toBe("le-2");
    expect(c.match).toMatch(/bucket|regime|momentum/);
    /* Every historical ≤ −2σ week here was followed by a +1% day. */
    expect(c.h[1].n).toBeGreaterThanOrEqual(30);
    expect(c.h[1].up).toBe(1);
    expect(c.h[1].meanBp).toBeCloseTo(Math.log(1.01) * 1e4, 6);
  });
  it("relaxes the match when the tight sample is too small", () => {
    const fr = frame({ n: 4000 });
    /* A high minN forces relaxation all the way to the plain bucket. */
    const c = conditionalToday(fr, { minN: 5000, floorN: 10 });
    expect(c.match).toBe("bucket");
    const tight = conditionalToday(fr, { minN: 5, floorN: 3 });
    expect(["regime+momentum", "regime", "momentum", "bucket"]).toContain(tight.match);
  });
  it("claims nothing when even the bucket has too few cases", () => {
    const fr = frame({ n: 60 });
    const c = conditionalToday(fr, { minN: 30, floorN: 10 });
    if (c && !c.h[1]) expect(c.match).toBeNull();
    else expect(c).toBeTruthy();
  });
  it("returns null when today's move is unknown", () => {
    const fr = frame();
    fr.rev[fr.rev.length - 1] = null;
    expect(conditionalToday(fr)).toBeNull();
  });
});
