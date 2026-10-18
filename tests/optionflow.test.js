import { describe, expect, it } from "vitest";
import {
  bsGamma, parseOptionSymbol, parseChain, netGex, gexProfile, walls, putCallFlow, optionFlow,
} from "../src/quant/optionflow.js";
import { momentumPath, reversalPath, ratioSeries, levelZPath } from "../src/model/history.js";
import { readMarket } from "../src/quant/narrative.js";

const normPdf = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);

describe("Black–Scholes gamma", () => {
  it("matches the closed form at the money", () => {
    const S = 100, K = 100, T = 0.25, vol = 0.2, r = 0.04, q = 0;
    const d1 = (Math.log(S / K) + (r - q + vol * vol / 2) * T) / (vol * Math.sqrt(T));
    expect(bsGamma(S, K, T, vol, r, q)).toBeCloseTo(normPdf(d1) / (S * vol * Math.sqrt(T)), 10);
  });
  it("peaks near the strike and shrinks away from it", () => {
    const g = x => bsGamma(x, 100, 0.1, 0.2);
    expect(g(100)).toBeGreaterThan(g(70));
    expect(g(100)).toBeGreaterThan(g(130));
  });
});

describe("option symbol parsing", () => {
  it("reads root, expiry, type and strike", () => {
    expect(parseOptionSymbol("SPX261120C07655000")).toEqual({ expiry: "2026-11-20", type: "C", strike: 7655 });
    expect(parseOptionSymbol("SPXW261020P07650000")).toEqual({ expiry: "2026-10-20", type: "P", strike: 7650 });
    expect(parseOptionSymbol("GARBAGE")).toBeNull();
  });
});

const opt = (sym, gamma, iv, oi, vol) => {
  const p = parseOptionSymbol(sym);
  return { ...p, dte: Math.round((Date.parse(p.expiry) - Date.parse("2026-10-16")) / 864e5), gamma, iv, oi, vol };
};

/* A tiny synthetic board: one call and one put at the money. */
const ATM = [
  opt("SPX261120C07660000", 0.001, 0.14, 300, 100),
  opt("SPX261120P07660000", 0.001, 0.14, 200, 150),
];

describe("net gamma", () => {
  it("adds call gamma and subtracts put gamma, in dollars per 1% move", () => {
    const spot = 7660;
    const gex = netGex(ATM, spot);
    const unit = 0.001 * 100 * spot * spot * 0.01;
    expect(gex.call).toBeCloseTo(300 * unit);
    expect(gex.put).toBeCloseTo(200 * unit);
    expect(gex.net).toBeCloseTo(100 * unit);
  });
});

describe("chain parsing", () => {
  it("parses the CBOE JSON shape, flags junk and keeps the spot", () => {
    const json = {
      timestamp: "2026-10-16 17:35:07",
      data: {
        current_price: 7660.5,
        iv30: 14.2,
        options: [
          { option: "SPX261120C07660000", gamma: 0.001, iv: 0.14, open_interest: 10, volume: 5 },
          { option: "SPXW261019P07650000", gamma: 0.002, iv: 0.15, open_interest: 20, volume: 7 },
          { option: "NOT_AN_OPTION", gamma: 1, open_interest: 1 },
        ],
      },
    };
    const c = parseChain(json);
    expect(c.spot).toBe(7660.5);
    expect(c.asOf).toBe("2026-10-16");
    expect(c.options).toHaveLength(2);
    expect(c.skipped).toBe(1);
    expect(c.options[0]).toMatchObject({ strike: 7660, type: "C", dte: 35 });
    expect(c.options[1].dte).toBe(3);
  });
  it("rejects a chain with nothing usable", () => {
    expect(parseChain({ data: { options: [] } })).toBeNull();
    expect(parseChain(null)).toBeNull();
  });
});

describe("gamma profile", () => {
  it("computes a profile and finds the flip level", () => {
    const chain = { asOf: "2026-10-16", spot: 7660, options: [...ATM, 
      opt("SPX261220C07200000", 0.0006, 0.14, 400, 0),   /* heavy call OI below spot */
      opt("SPX261220P08000000", 0.0006, 0.14, 400, 0),  /* heavy put OI above spot */
    ] };
    const p = gexProfile(chain);
    expect(p.spots[0]).toBeLessThan(7660 * 0.83);
    expect(p.spots[p.spots.length - 1]).toBeGreaterThan(7660 * 1.17);
    expect(p.values.length).toBe(p.spots.length);
    expect(p.flip).not.toBeNull();
    /* Between the OTM walls the profile must cross zero. */
    expect(Math.min(...p.values)).toBeLessThanOrEqual(0);
    expect(Math.max(...p.values)).toBeGreaterThanOrEqual(0);
  });
});

describe("walls and flow", () => {
  it("finds the largest call, put and gamma strikes", () => {
    const board = [
      opt("SPX261120C07700000", 0.0009, 0.14, 500, 10),
      opt("SPX261120C07600000", 0.001, 0.14, 300, 10),
      opt("SPX261120P07400000", 0.0009, 0.14, 800, 10),
      opt("SPX261120P07600000", 0.001, 0.14, 200, 10),
    ];
    const w = walls(board, 7660);
    expect(w.call.strike).toBe(7700);
    expect(w.put.strike).toBe(7400);
    expect(w.gamma.strike).toBe(7400); /* 800 puts x 0.0009 beats every other strike */
  });
  it("computes put/call ratios and 0DTE share", () => {
    const board = [
      opt("SPXW261016C07660000", 0.004, 0.12, 50, 1200),  /* 0DTE: same day */
      opt("SPXW261016P07660000", 0.004, 0.12, 80, 1800),
      opt("SPX261120C07660000", 0.001, 0.14, 300, 100),
      opt("SPX261120P07660000", 0.001, 0.14, 200, 100),
    ];
    const pc = putCallFlow(board);
    expect(pc.callVol).toBe(1300);
    expect(pc.putVol).toBe(1900);
    expect(pc.pcVol).toBeCloseTo(1900 / 1300, 8);
    expect(pc.d0Share).toBeCloseTo(3000 / 3200, 8);
    expect(pc.pcOi).toBeCloseTo(280 / 350, 8);
  });
  it("assembles the full card payload", () => {
    const chain = { asOf: "2026-10-16", spot: 7660, options: ATM };
    const f = optionFlow(chain);
    expect(f.asOf).toBe("2026-10-16");
    expect(f.gex.netBn).toBeGreaterThan(0);
    expect(f.byDte).toHaveLength(5);
  });
});

describe("bias-model signal paths (history.js)", () => {
  const dates = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2024, 0, 1) + i * 864e5).toISOString().slice(0, 10));

  it("momentum is the 12−1 move over the vol at the window start, clipped, with no look-ahead", () => {
    const v = dates.map((_, i) => 100 * Math.exp(0.001 * i + 0.002 * Math.sin(i))); /* noisy uptrend */
    const m = momentumPath(v);
    /* 252 for the window plus the 20-observation EWMA seed. */
    expect(m[271]).toBeNull();
    expect(m[272]).not.toBeNull();
    expect(m[399]).toBeGreaterThan(0);
    const a = momentumPath(v.slice());
    v[399] *= 2; /* change the last price */
    const b = momentumPath(v);
    for (let i = 272; i < 399; i++) expect(b[i]).toBeCloseTo(a[i], 12); /* earlier reads unchanged */
    const flat = momentumPath(dates.map((_, i) => 100 * Math.exp(0.001 * Math.sin(i)))); /* no drift */
    expect(Math.abs(flat[399])).toBeLessThan(3); /* clipped to ±3 and small without a trend */
  });
  it("reversal is the 5-day vol-scaled move, signed raw (the slope restriction makes it negative)", () => {
    const wobble = i => 100 * Math.exp(0.002 * Math.sin(i * 1.7)); /* daily variation, no drift */
    const up = dates.map((_, i) => wobble(i) * (i > 394 ? 1.05 : 1)); /* +5% in the last 5 days */
    expect(reversalPath(up)[399]).toBeGreaterThan(0); /* up move, positive signal */
    const down = dates.map((_, i) => wobble(i) * (i > 394 ? 0.95 : 1));
    expect(reversalPath(down)[399]).toBeLessThan(0); /* down week, negative signal */
  });
  it("ratio series aligns on shared dates only", () => {
    const a = { dates: ["2026-01-01", "2026-01-02", "2026-01-03"], values: [2, 4, 6] };
    const b = { dates: ["2026-01-02", "2026-01-03", "2026-01-04"], values: [2, 3, 4] };
    const r = ratioSeries(a, b);
    expect(r.dates).toEqual(["2026-01-02", "2026-01-03"]);
    expect(r.values).toEqual([2, 2]);
  });
  it("level z-scores use only the trailing year", () => {
    const values = Array.from({ length: 300 }, (_, i) => 10 + 0.5 * ((i * 7) % 5) + (i > 250 ? 20 : 0));
    const z = levelZPath({ dates: dates.slice(0, 300), values });
    expect(z.dates[0]).toBe(dates[60]);
    expect(z.values[z.values.length - 1]).toBeGreaterThan(2); /* the late shift is many MADs high */
    /* The reading at index 0 must not see the later shift. */
    const zEarly = levelZPath({ dates: dates.slice(0, 61), values: values.slice(0, 61) });
    expect(z.values[0]).toBeCloseTo(zEarly.values[0], 9);
    expect(z.values[0]).toBeLessThan(2);
  });
});

describe("divergence rules in Today's read", () => {
  it("fires leadership damage when growth lags while the S&P holds", () => {
    const facts = {
      moves: { es: { score: -0.3, chg1m: -1 } },
      levels: { vix: 0.5, move: 0, vxn: 0.5, v9d: -0.5 },
      relative: { lead: -1.4, ew: -0.9 },
    };
    const fired = readMarket(facts, 10).map(r => r.id);
    expect(fired).toContain("leadership_damage");
  });
  it("fires growth fear and front-of-curve backwardation (growth fear excludes the same-story leadership line)", () => {
    const facts = {
      moves: { es: { score: -0.3, chg1m: -1 } },
      levels: { vix: 0.5, move: 0, vxn: 2.1, v9d: 1.8 },
      relative: { lead: -1.4, ew: -0.9 },
    };
    const fired = readMarket(facts, 10).map(r => r.id);
    expect(fired).toContain("growth_fear");
    expect(fired).toContain("vol_backwardation");
  });
  it("stays quiet when growth leads", () => {
    const quiet = readMarket({ moves: { es: { score: 0.5 } }, levels: { vix: 0, move: 0, vxn: -0.5, v9d: -1 }, relative: { lead: 0.8, ew: 0.4 } }, 10);
    expect(quiet.map(r => r.id)).toEqual(["quiet"]);
  });
});
