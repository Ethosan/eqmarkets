/* Latest series per indicator id:
   { price, prev, dates: [YYYY-MM-DD], values: [], asOf, src, error, stale } */
export const STATE = {};

export function ok(id) {
  const s = STATE[id];
  return s && !s.error && s.price != null ? s : null;
}

/* The series as { dates, values }, or null when there is no usable history. */
export function hist(id, min = 2) {
  const s = ok(id);
  return s && s.dates && s.dates.length >= min ? { dates: s.dates, values: s.values } : null;
}
