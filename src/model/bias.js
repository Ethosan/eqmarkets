/* Market bias for ES and NQ: loads the full daily history (back to 2000),
   rebuilds every model point-in-time, runs the walk-forward combination
   forecast for the next day, week and month, and scores it out of sample
   (src/quant/composite.js). The heavy part runs in a Web Worker so the page
   never stalls; the result is cached on the device for six hours, so repeat
   visits are instant and the download happens at most a few times a day. */
import { buildFrame, loadModelSeries, reframe } from "./history.js";
import { HORIZONS, combinationForecast, evaluate, readNow } from "../quant/composite.js";

const KEY = "eqm.bias.v7"; /* v7: rebuilt after the FRED cache mix-up */
const TTL = 6 * 3600e3;
export const BIAS_RANGE = "max";

export function cachedBias() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null");
    return c && c.v === 6 ? { ...c, fresh: Date.now() - c.ts < TTL } : null;
  } catch {
    return null;
  }
}

/* Keep only what the card shows. */
const slim = ev => ev && {
  n: ev.n, from: ev.from, to: ev.to, r2: ev.r2, r2Raw: ev.r2Raw, r2Equal: ev.r2Equal, cwP: ev.cwP, upRate: ev.upRate, beatRate: ev.beatRate,
  bull: ev.bull, bear: ev.bear, neutralShare: ev.neutralShare, cerGain: ev.cerGain, single: ev.single, byState: ev.byState,
};

export function biasFromFrame(fr) {
  return HORIZONS.map(H => {
    const res = combinationForecast(fr, H.h);
    const ev = evaluate(res, { band: H.band, dates: fr.dates });
    return { key: H.key, h: H.h, label: H.label, band: H.band, now: readNow(res, ev, H.band), ev: slim(ev) };
  });
}

/* Pure: fetch, build and score. Runs in the worker (or inline as a fallback). */
export async function computeBiasData(range, onProgress) {
  const S = await loadModelSeries(range, onProgress);
  if (!S.es || !S.nq) return null;
  const es = buildFrame(S, S.es);
  const nq = reframe(es, S.nq);
  return {
    v: 6, ts: Date.now(), range, missing: es.meta.missing,
    es: { asOf: es.dates[es.dates.length - 1], horizons: biasFromFrame(es) },
    nq: { asOf: nq.dates[nq.dates.length - 1], horizons: biasFromFrame(nq) },
  };
}

function inWorker(onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./bias.worker.js", import.meta.url), { type: "module" });
    w.onmessage = e => {
      if (e.data.progress) onProgress?.(...e.data.progress);
      else { w.terminate(); e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.done); }
    };
    w.onerror = e => { w.terminate(); reject(e); };
    w.postMessage({ range: BIAS_RANGE });
  });
}

export async function computeBias(onProgress) {
  let out;
  try {
    out = typeof Worker === "function" ? await inWorker(onProgress) : await computeBiasData(BIAS_RANGE, onProgress);
  } catch {
    out = await computeBiasData(BIAS_RANGE, onProgress);
  }
  if (!out) return null;
  try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* storage full or blocked */ }
  return { ...out, fresh: true };
}
