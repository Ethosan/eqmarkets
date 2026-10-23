/* Alt signals: market-wide curiosities (the Pentagon Pizza Index, the Stripper Index,
   fear-and-greed gauges, app-store rank, distress searches, the moon) and the tests
   that say whether any of them has ever held up. The readings come from the Oracular
   data worker through this site's own /odw proxy; the price history for the tests
   comes from Yahoo like every other series here. Nothing is filled in when a feed is
   down: the card says so instead. */
import { yahooSeries } from "./sources.js";

const ODW = "/odw";

async function odw(path) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(ODW + path, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) { r.body?.cancel().catch(() => {}); return null; }
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* Every feed at once; each one is null on its own when its source is down. */
export async function loadSignals() {
  const [sig, pizza, night, spx, btc] = await Promise.all([
    odw("/signals"), odw("/pizza"), odw("/nightlife"),
    yahooSeries("^GSPC", { range: "10y" }).catch(() => null),
    yahooSeries("BTC-USD", { range: "2y" }).catch(() => null),
  ]);
  return { sig: sig || {}, pizza, night, spx, btc, at: Date.now() };
}

export const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

/* Two-tailed 5% critical t for df degrees of freedom (Cornish–Fisher expansion of
   the normal quantile: 2.571 at df 5, 2.042 at 30, 1.960 in the limit). */
export function tCrit(df) {
  const z = 1.959964, d = Math.max(1, df);
  return z + (z ** 3 + z) / (4 * d) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * d * d) +
    (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * d ** 3);
}

/* ------------------------------------------------------- fear and greed vs price */
/* What the index did over the next `h` sessions after each reading below `lo` or
   above `hi`, against what it did after every reading in the same window.
   Overlapping windows share days, so the test uses only non-overlapping ones (the
   "episodes"), and calls nothing with fewer than `minEp` of them. */
export function forwardAfter(readings, px, { lo = 25, hi = 75, h = 21, minEp = 10 } = {}) {
  if (!readings?.length || !px?.dates?.length) return null;
  const idx = new Map(px.dates.map((d, i) => [d, i]));
  const firstOnOrAfter = d => {
    if (idx.has(d)) return idx.get(d);
    const i = px.dates.findIndex(x => x >= d);
    return i < 0 ? null : i;
  };
  const rows = [];
  for (const r of readings) {
    const i = firstOnOrAfter(r.d);
    if (i == null || i + h >= px.values.length) continue;
    rows.push({ d: r.d, v: r.v, i, ret: px.values[i + h] / px.values[i] - 1 });
  }
  if (rows.length < 20) return null;
  const base = mean(rows.map(r => r.ret));
  const side = test => {
    const hit = rows.filter(r => test(r.v));
    const eps = [];
    let next = -1;
    for (const r of hit) if (r.i >= next) { eps.push(r.ret); next = r.i + h; }
    const out = { days: hit.length, episodes: eps.length, avg: hit.length ? mean(hit.map(r => r.ret)) : null, t: null, sig: false };
    if (eps.length >= minEp) {
      const s = sd(eps);
      out.t = s > 0 ? (mean(eps) - base) / (s / Math.sqrt(eps.length)) : 0;
      out.sig = Math.abs(out.t) >= tCrit(eps.length - 1);
    }
    return out;
  };
  return { base, h, n: rows.length, from: rows[0].d, to: rows[rows.length - 1].d, fear: side(v => v < lo), greed: side(v => v > hi), minEp };
}

/* --------------------------------------------------------------------- the moon */
const SYN = 29.53059;
export const moonPhase = ms => { const p = ((ms - Date.UTC(2000, 0, 6)) / 864e5 % SYN) / SYN; return p < 0 ? p + 1 : p; };
export const PHASES = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
export const MOON = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
export const phaseBin = p => Math.round(p * 8) % 8;

/* Average daily index return in each of the eight phases, each tested against zero at
   its own exact critical t. With eight tries some pass by luck: `chance` is the odds of
   at least this many passes if the moon did nothing (binomial, 8 tries at 5%; one or
   more happens 34% of the time), and only odds under 5% count as an edge. */
export function moonBuckets(px) {
  if (!px?.dates || px.values.length < 300) return null;
  const bins = Array.from({ length: 8 }, () => []);
  for (let i = 1; i < px.values.length; i++) {
    const r = px.values[i] / px.values[i - 1] - 1;
    bins[phaseBin(moonPhase(Date.parse(px.dates[i] + "T12:00:00Z")))].push(r);
  }
  const rows = bins.map((a, i) => {
    const s = sd(a), t = s > 0 ? mean(a) / (s / Math.sqrt(a.length)) : 0;
    return { phase: PHASES[i], avg: mean(a), t, n: a.length, sig: Math.abs(t) >= tCrit(a.length - 1) };
  });
  const passes = rows.filter(r => r.sig).length;
  const choose = (n, k) => { let c = 1; for (let i = 1; i <= k; i++) c = c * (n - k + i) / i; return c; };
  let chance = 0;
  for (let k = passes; k <= 8; k++) chance += choose(8, k) * 0.05 ** k * 0.95 ** (8 - k);
  return { rows, passes, chance, edge: passes > 0 && chance < 0.05, from: px.dates[0], to: px.dates[px.dates.length - 1] };
}

/* --------------------------------------------------------------- stripper index */
/* 12-month change in bar and nightclub jobs and in the unemployment rate. The tell is
   the "double signal": nightlife jobs falling while unemployment rises. */
export function nightlife(n) {
  if (!n?.jobs || n.jobs.length < 13 || !n.unrate || n.unrate.length < 13) return null;
  const j = n.jobs, u = n.unrate, jl = j[j.length - 1], ul = u[u.length - 1];
  const yearAgo = (arr, last) => arr.find(x => x.t === (+last.t.slice(0, 4) - 1) + last.t.slice(4)) || arr[arr.length - 13];
  const jobsChg = (jl.v / yearAgo(j, jl).v - 1) * 100, unrateChg = ul.v - yearAgo(u, ul).v;
  const bls = n.source !== "fred";
  return {
    last: jl, unrate: ul, jobsChg, unrateChg, double: jobsChg < 0 && unrateChg > 0,
    label: bls ? "Bar and nightclub jobs" : "Restaurant and bar jobs",
    source: bls ? "BLS " + (n.jobsSeries || "CES7072240001") + " and LNS14000000" : "FRED " + (n.jobsSeries || "CES7072200001") + " and UNRATE",
    since: j[0].t, series: j,
  };
}

/* ------------------------------------------------------------- pentagon pizza */
/* pizzint.watch's own level and wording; Oracular's worker logs the feed hourly. */
export function pizza(p) {
  const now = p?.now;
  if (!now) return null;
  const places = now.places || [];
  const live = places.filter(x => x.live != null);
  return {
    defcon: now.livePlaces > 0 && now.defcon ? now.defcon : null,
    reason: String(now.reason || "").replace(/^[^:]*:\s*/, ""),
    places, live: live.length, ts: now.ts || now.sourceAt, stale: !!now.stale,
    hist: (p.hist || []).filter(x => x.busy != null),
    logged: (p.hist || []).length, since: p.hist?.length ? p.hist[0].t : null,
  };
}
