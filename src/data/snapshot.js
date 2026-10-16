/* Last good data, saved on the device so the app opens instantly (and works
   offline) with the previous session's values, marked as cached until the
   first refresh replaces them. Derived series are recomputed, not stored. */
import { FETCHABLE } from "../config.js";
import { STATE } from "../state.js";

const KEY = "eqm.snapshot.v1";
const MAX_AGE = 14 * 864e5;

/* 6 significant figures is plenty for display and roughly halves the size. */
const trim = v => (typeof v === "number" ? +v.toPrecision(6) : v);

export function saveSnapshot() {
  const series = {};
  /* A series whose feed failed this session keeps its older saved copy. */
  for (const it of FETCHABLE) {
    const s = STATE[it.id];
    if (!s || s.error || s.price == null) continue;
    series[it.id] = {
      price: s.price, prev: s.prev, asOf: s.asOf, src: s.src, savedAt: s.cached ? s.savedAt : Date.now(),
      dates: s.dates, values: s.values ? s.values.map(trim) : s.values,
    };
  }
  if (!Object.keys(series).length) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), series }));
  } catch { /* quota or storage blocked: the app still works, just without the offline copy */ }
}

/* Fill STATE from the saved copy. Returns the save time, or 0 if there was none. */
export function loadSnapshot() {
  let snap = null;
  try { snap = JSON.parse(localStorage.getItem(KEY)); } catch { return 0; }
  if (!snap?.series || Date.now() - snap.at > MAX_AGE) return 0;
  for (const [id, s] of Object.entries(snap.series)) {
    if (!STATE[id]) STATE[id] = { ...s, error: false, stale: true, cached: true, savedAt: s.savedAt || snap.at };
  }
  return snap.at;
}
