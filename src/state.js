/* Latest series per indicator id: { price, prev, ts, closes, error, src, ... } */
export const STATE = {};

export function ok(id) {
  const s = STATE[id];
  return s && !s.error && s.price != null ? s : null;
}

export function dayKey(sec) {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

/* Map of YYYY-MM-DD -> close for a series with timestamps. */
export function closesByDay(s) {
  const m = new Map();
  s.ts.forEach((t, i) => m.set(dayKey(t), s.closes[i]));
  return m;
}

/* Sorted dates present in every map. */
export function commonDates(maps) {
  let common = null;
  for (const m of maps) {
    const keys = new Set(m.keys());
    common = common ? new Set([...common].filter(k => keys.has(k))) : keys;
  }
  return [...(common || [])].sort();
}

export const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
export const stdev = (a, mu = mean(a)) => Math.sqrt(a.reduce((x, y) => x + (y - mu) * (y - mu), 0) / a.length);
