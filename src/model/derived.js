/* Computed series: curve spreads (H.15 closes on both legs), VIX term structure
   and carry-to-vol. Each is stored in STATE like a fetched series. */
import { STATE } from "../state.js";
import { alignSeries } from "../quant/stats.js";
import { carryToVol } from "../quant/models.js";

const ok = id => {
  const s = STATE[id];
  return s && !s.error && s.price != null ? s : null;
};
const hasHist = s => s && s.dates && s.dates.length > 1;

/* a − b (or a / b) on common dates. */
function combine(id, a, b, op) {
  if (!hasHist(a) || !hasHist(b)) { STATE[id] = { error: true }; return; }
  const { dates, columns: [x, y] } = alignSeries([{ dates: a.dates, values: a.values }, { dates: b.dates, values: b.values }]);
  if (dates.length < 2) { STATE[id] = { error: true }; return; }
  const values = x.map((v, i) => op(v, y[i]));
  const n = values.length;
  STATE[id] = { price: values[n - 1], prev: values[n - 2], dates, values, asOf: dates[n - 1], error: false, src: "derived", stale: a.stale || b.stale };
}

/* The 10Y leg of the spreads is FRED DGS10 (hidden series), not the live ^TNX
   quote, so both legs are the same day's H.15 close. */
export function computeDerived() {
  const ten = ok("dgs10");
  combine("spread", ten, ok("us2y")?.src === "fred" ? ok("us2y") : null, (a, b) => a - b);
  combine("spread3m", ten, ok("us3m"), (a, b) => a - b);
  combine("vixts", ok("vix"), ok("vix3m"), (a, b) => a / b);

  const j = ok("usdjpy"), ff = ok("fedfunds"), bj = ok("boj");
  const c = hasHist(j) && ff && bj ? carryToVol(ff.price - bj.price, { dates: j.dates, values: j.values }) : null;
  STATE.carryvol = c
    ? { price: c.ratio, prev: null, dates: null, values: null, error: false, src: "derived", vol: c.vol, gap: c.gap }
    : { error: true };
}
