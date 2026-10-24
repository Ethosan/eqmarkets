/* Shared compute for the public macro API: GET /api/regime and GET /api/risk.

   Both endpoints read the same two dashboard models the site itself shows —
   the Risk Appetite Index and the growth × inflation regime — computed with
   the app's own fetchers (src/data/sources.js) and model builders
   (src/model/models.js), so the API and the dashboard can never disagree.

   The models move slowly, so one snapshot is computed, cached in memory for
   CACHE_MS, and reused; a failed refresh serves the last good snapshot marked
   stale rather than an error. Responses also carry `stale: true` when any
   input series failed its latest refetch. */
import { ITEM_BY_ID, RAI_INPUTS, REGIME_INPUTS } from "../../src/config.js";
import { STATE } from "../../src/state.js";
import { fetchItem } from "../../src/data/sources.js";
import { computeDerived } from "../../src/model/derived.js";
import { buildRai, buildRegime } from "../../src/model/models.js";
import { regimeLabel } from "../../src/quant/models.js";

/* Every series the two models read, plus what their derived inputs need
   (vixts = vix / vix3m, cugold = hg / gc). Computed series are excluded:
   computeDerived() builds them from the fetched ones. */
export const NEEDED = [...new Set([
  ...RAI_INPUTS.map(i => i.id),
  ...REGIME_INPUTS.map(i => i.id),
  "vix3m", "hg", "gc",
])].filter(id => ITEM_BY_ID[id] && !ITEM_BY_ID[id].computed);

const CACHE_MS = 5 * 60_000;
const UPSTREAM_TIMEOUT_MS = 20_000;
const POOL = 4; /* kind to the upstreams; Yahoo rate-limits a burst */

let cache = null;    /* { at, asOf, rai, regime, stale } */
let lastGood = null;
let pending = null;  /* one refresh at a time */

const r2 = x => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

async function fetchAll() {
  const ids = [...NEEDED];
  const run = async () => { while (ids.length) await fetchItem(ITEM_BY_ID[ids.shift()]).catch(() => {}); };
  await Promise.all(Array.from({ length: POOL }, run));
}

export async function macroSnapshot() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      await Promise.race([
        fetchAll(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("upstreams slow")), UPSTREAM_TIMEOUT_MS)),
      ]);
      computeDerived();
      const rai = buildRai(), regime = buildRegime();
      if (!rai || !regime) throw new Error("models incomplete");
      const snap = {
        at: Date.now(),
        asOf: regime.history?.dates?.at(-1) || STATE.es?.asOf || null,
        rai, regime,
        stale: NEEDED.some(id => STATE[id] && STATE[id].stale),
      };
      cache = snap;
      lastGood = snap;
      return snap;
    } catch (e) {
      if (lastGood) return { ...lastGood, stale: true };
      throw e;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/* The public contracts. Small and additive: consumers (Oracular's Market tab
   today, this site's own panels later) read only these fields, and new fields
   may be added without breaking anyone. */
export function shapeRegime(regime, asOf, updated) {
  return {
    quadrant: regime.quadrant,
    label: regime.label,
    confidence: regime.confidence,
    growth: r2(regime.growth),
    inflation: r2(regime.inflation),
    readingQuadrant: regime.readingQuadrant,
    provisional: !!regime.provisional,
    weeksIn: regime.weeksIn,
    since: regime.since || null,
    pending: regime.pending
      ? { quadrant: regime.pending.quadrant, label: regime.pending.label, weeks: regime.pending.weeks, needed: regime.pending.needed }
      : null,
    switchesYear: regime.switchesYear,
    asOf,
    updated,
  };
}

export function shapeRisk(rai, asOf, updated) {
  return {
    value: r2(rai.smooth),
    latest: r2(rai.latest),
    label: regimeLabel(rai.smooth),
    inputs: rai.contributions?.length ?? 0,
    total: rai.total,
    contributions: (rai.contributions || []).map(c => ({ id: c.id, label: c.label, score: r2(c.score) })),
    asOf,
    updated,
  };
}

/* Per-IP rate limit, same shape as /api/explain. */
const RATE_WINDOW_MS = 60_000, RATE_MAX = 30;
const rateHits = new Map();
export function rateLimited(ip) {
  const now = Date.now();
  for (const [k, v] of rateHits) { if (now - v[0] > RATE_WINDOW_MS) rateHits.delete(k); }
  const v = rateHits.get(ip);
  if (v && now - v[0] <= RATE_WINDOW_MS) {
    if (v[1] >= RATE_MAX) return true;
    v[1]++;
  } else {
    rateHits.set(ip, [now, 1]);
  }
  return false;
}

/* Read-only public market data: any origin may read it, and the edge may cache it. */
export const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=60",
  },
});
