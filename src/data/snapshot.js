/* Last good data, saved on the device so the app opens instantly (and works
   offline) with the previous session's values, marked as cached until the
   first refresh replaces them. Derived series are recomputed, not stored.
   Writes are batched: at most every 10 minutes while open, plus whenever the
   app goes to the background or closes. */
import { FETCHABLE } from "../config.js";
import { STATE } from "../state.js";

/* v2: ES and NQ histories are roll-adjusted; older snapshots hold raw ones.
   v3: older snapshots may hold a FRED series filed under the wrong id. */
const KEY = "eqm.snapshot.v3";
const MAX_AGE = 14 * 864e5;
const MIN_GAP = 10 * 60_000;

/* 6 significant figures is plenty for display and roughly halves the size. */
const trim = v => (typeof v === "number" ? +v.toPrecision(6) : v);

let dirty = false, lastWrite = 0;

function write() {
  const now = Date.now();
  const series = {};
  for (const it of FETCHABLE) {
    const s = STATE[it.id];
    if (!s || s.error || s.price == null) continue;
    /* A series whose feed failed this session keeps its older saved copy,
       until that copy is itself too old to show. */
    const savedAt = s.cached ? s.savedAt : now;
    if (now - savedAt > MAX_AGE) continue;
    series[it.id] = {
      price: s.price, prev: s.prev, asOf: s.asOf, src: s.src, savedAt,
      dates: s.dates, values: s.values ? s.values.map(trim) : s.values,
    };
  }
  if (!Object.keys(series).length) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: now, series }));
  } catch { /* quota or storage blocked: the app still works, just without the offline copy */ }
}

export function flushSnapshot() {
  if (!dirty) return;
  dirty = false;
  lastWrite = Date.now();
  write();
}

/* Call after a refresh that brought fresh data. */
export function saveSnapshot() {
  dirty = true;
  if (Date.now() - lastWrite >= MIN_GAP) flushSnapshot();
}

addEventListener("pagehide", flushSnapshot);
document.addEventListener("visibilitychange", () => { if (document.hidden) flushSnapshot(); });

/* Fill STATE from the saved copy. Returns the save time, or 0 if there was none. */
export function loadSnapshot() {
  let snap = null;
  try { snap = JSON.parse(localStorage.getItem(KEY)); } catch { return 0; }
  if (!snap?.series) return 0;
  const now = Date.now();
  let loaded = 0;
  for (const [id, s] of Object.entries(snap.series)) {
    const savedAt = s.savedAt || snap.at;
    if (now - savedAt > MAX_AGE || STATE[id]) continue;
    STATE[id] = { ...s, error: false, stale: true, cached: true, savedAt };
    loaded++;
  }
  return loaded ? snap.at : 0;
}
