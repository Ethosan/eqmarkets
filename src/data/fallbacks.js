/* Static fallback values for FRED series that have no clean non-FRED alternative.
   These are last-known-good values, updated manually. They only kick in when:
   1. FRED is unreachable, AND
   2. No alternative source works, AND
   3. No snapshot is available (or the snapshot is too old).
   Each entry: { price, prev, asOf } — just the latest two values and a date.
   The app already handles missing history gracefully (cards show the value,
   charts show what they can). Update these periodically. */

export const STATIC_FALLBACKS = {
  /* Credit spreads (ICE BofA / Moody's) — FRED-only, no clean alternative */
  BAMLH0A0HYM2: { price: 3.23, prev: 3.18, asOf: "2026-10-16" },  /* HY OAS */
  BAMLC0A0CM:   { price: 0.85, prev: 0.83, asOf: "2026-10-16" },  /* IG OAS */
  BAA10Y:       { price: 1.05, prev: 1.02, asOf: "2026-10-16" },  /* Baa–10Y spread */

  /* Fed balance sheet (H.4.1) — $ billions */
  WALCL:     { price: 6500, prev: 6520, asOf: "2026-10-15" },  /* Total assets, $bn */
  WTREGEN:   { price: 750,  prev: 760,  asOf: "2026-10-15" },  /* TGA, $bn */
  RRPONTSYD: { price: 50,   prev: 55,   asOf: "2026-10-16" },  /* Reverse repos, $bn */

  /* Fed Funds Effective (NY Fed) */
  DFF: { price: 3.90, prev: 3.92, asOf: "2026-10-16" },

  /* Labour — Initial Jobless Claims (thousands) */
  ICSA: { price: 220, prev: 218, asOf: "2026-10-10" },

  /* Financial conditions indices */
  NFCI:   { price: -0.15, prev: -0.14, asOf: "2026-10-09" },  /* Chicago Fed NFCI */
  STLFSI4: { price: -0.80, prev: -0.78, asOf: "2026-10-09" }, /* St. Louis Fed Stress */
};

/* Build a minimal series object from a static fallback. */
export function staticFallback(fredId) {
  const f = STATIC_FALLBACKS[fredId];
  if (!f) return null;
  return {
    price: f.price,
    prev: f.prev,
    dates: [f.asOf],
    values: [f.price],
    asOf: f.asOf,
    static: true,
  };
}
