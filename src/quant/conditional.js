/* Conditional forward-return history: what actually followed weeks like the
   current one, on the instrument's own tape since 2000.

   This is the evidence behind the reversal signal (src/quant/composite.js):
   the 5-day vol-scaled move is bucketed (≤ −2σ … ≥ +2σ), and each bucket's
   next-day and next-week record is tabulated — up-rate, average return in bp,
   and the number of cases. For today's bucket the sample is first matched to
   today's market state (calm/stressed, from the same EWMA-vol rule as the
   bias model) and the sign of 12−1 momentum; when that leaves fewer than
   `minN` cases the match is progressively relaxed, and the level actually
   used is reported, so the card can say what it is counting.

   Pure functions; tested in tests/conditional.test.js. The numbers quoted on
   the card are always recomputed from the full history on each build. */
import { marketState } from "./composite.js";

/* Buckets of the 5-day vol-scaled move (the same series the reversal signal
   reads). Labels are written to read after "a week in the … range". */
export const REV_BUCKETS = [
  { id: "le-2", label: "at or below −2σ", test: v => v <= -2 },
  { id: "m2m1", label: "−2σ to −1σ", test: v => v > -2 && v <= -1 },
  { id: "mid", label: "−1σ to +1σ", test: v => v > -1 && v < 1 },
  { id: "p1p2", label: "+1σ to +2σ", test: v => v >= 1 && v < 2 },
  { id: "ge2", label: "at or above +2σ", test: v => v >= 2 },
];

export const bucketOfRev = v => (v == null || !isFinite(v) ? null : REV_BUCKETS.find(b => b.test(v)) ?? null);

/* Forward-return stats over a set of indices: up-rate and mean in bp. */
function stats(price, idx, h) {
  if (!idx.length) return { n: 0, up: null, meanBp: null };
  const rs = idx.map(i => Math.log(price[i + h] / price[i]));
  return {
    n: rs.length,
    up: rs.filter(r => r > 0).length / rs.length,
    meanBp: (rs.reduce((a, b) => a + b, 0) / rs.length) * 1e4,
  };
}

/* Full bucket table for one horizon. Every case uses only the move known at
   the bar and the h bars after it; the last h bars can't have an outcome and
   are excluded. */
export function bucketTable(frame, h) {
  const { price, rev } = frame;
  const n = price.length;
  return REV_BUCKETS.map(b => {
    const idx = [];
    for (let i = 0; i + h < n; i++) {
      const v = rev[i];
      if (v != null && isFinite(v) && b.test(v)) idx.push(i);
    }
    return { id: b.id, label: b.label, ...stats(price, idx, h) };
  });
}

/* Today's reading: the current week's bucket, matched to today's market state
   and momentum sign, progressively relaxed until at least `minN` cases are
   left (or `floorN` at the bucket level, else nothing is claimed). */
export function conditionalToday(frame, { hs = [1, 5], minN = 30, floorN = 10 } = {}) {
  const { price, rev, mom } = frame;
  const n = price.length;
  const t = n - 1;
  const v = rev?.[t];
  if (v == null || !isFinite(v)) return null;
  const bucket = bucketOfRev(v);
  if (!bucket) return null;
  const state = marketState(price);
  const st = state[t];
  const m = mom?.[t];
  const ms = m != null && isFinite(m) && m !== 0 ? Math.sign(m) : null;

  /* Candidate matches, tightest first. */
  const levels = [];
  if (st != null && ms != null) levels.push({ match: "regime+momentum", use: i => state[i] === st && Math.sign(mom[i]) === ms });
  if (st != null) levels.push({ match: "regime", use: i => state[i] === st });
  if (ms != null) levels.push({ match: "momentum", use: i => mom[i] != null && Math.sign(mom[i]) === ms });
  levels.push({ match: "bucket", use: () => true });

  const out = { rev: v, bucketId: bucket.id, label: bucket.label, match: null, h: {} };
  for (const { match, use } of levels) {
    const idx = [];
    for (let i = 0; i + Math.max(...hs) < n; i++) {
      const x = rev[i];
      if (x == null || !isFinite(x) || !bucket.test(x)) continue;
      if (use(i)) idx.push(i);
    }
    if (idx.length < minN && match !== "bucket") continue;
    if (idx.length < floorN) return out.match ? out : { ...out, match: null, h: {} };
    out.match = match;
    for (const h of hs) out.h[h] = stats(price, idx.filter(i => i + h < n), h);
    return out;
  }
  return out.match ? out : { ...out, match: null, h: {} };
}
