/* Detail sheet: opens when a card is tapped. Shows the full history the feed
   returned, range stats, and a link to the original source. */
import { sourceUrl } from "../config.js";
import { STATE } from "../state.js";
import { seriesStats } from "../quant/models.js";
import { $, fmtNum, fmtChange, fmtDelta, fmtVol, lineChart, ordinal } from "./format.js";
import { noteFor } from "./notes.js";

const RANGES = [
  { key: "1m", label: "1M", days: 21 },
  { key: "3m", label: "3M", days: 63 },
  { key: "6m", label: "6M", days: 126 },
  { key: "1y", label: "1Y", days: 252 },
  { key: "2y", label: "2Y", days: 520 },
];

let current = null;
let range = "3m";

/* Calendar-based window so weekly and 24/7 series show the same span. */
function rangeValues(s) {
  const r = RANGES.find(x => x.key === range);
  const n = s.dates.length;
  const end = new Date(s.dates[n - 1]);
  const start = new Date(end.getTime() - r.days * 365 / 252 * 864e5).toISOString().slice(0, 10);
  const i = s.dates.findIndex(d => d >= start);
  return s.values.slice(Math.max(0, Math.min(i, n - 2)));
}

function render() {
  const item = current;
  const s = STATE[item.id];
  $("dTicker").textContent = item.ticker;
  $("dName").textContent = item.name;
  $("dDesc").textContent = item.desc;

  if (!s || s.error || s.price == null) {
    $("dValue").textContent = "----";
    $("dChange").textContent = "";
    $("dNote").textContent = "Feed unreachable right now. It retries every minute.";
    $("dChart").innerHTML = "";
    $("dStats").innerHTML = "";
    $("dStatsNote").textContent = "";
    $("dRanges").hidden = true;
    $("dSource").hidden = true;
    return;
  }

  $("dValue").textContent = fmtNum(s.price, item.fmt);
  const ch = fmtChange(item, s.price, s.prev);
  $("dChange").textContent = ch ? (ch.up ? "▲ " : "▼ ") + ch.text + " today" : "";
  $("dChange").className = "d-change num " + (ch ? ch.tone : "flat");
  const hasHist = s.values && s.values.length > 1;
  const st = hasHist ? seriesStats({ dates: s.dates, values: s.values }, item.kind, item.ppy || (item.weekly ? 52 : 252)) : null;
  const nt = noteFor(item, s, st);
  $("dNote").textContent = nt ? nt.t : "";

  $("dRanges").hidden = !hasHist;
  if (hasHist) {
    const vals = rangeValues(s);
    const first = vals[0], last = vals[vals.length - 1];
    const good = item.invert ? last < first : last >= first;
    $("dChart").innerHTML = lineChart(vals, { good, id: "detail", w: 600, h: 160, pad: 6, ref: st.med1y });
    const move = fmtChange(item, last, first);
    const pct = st.pct1y == null ? "—" : ordinal(Math.round(st.pct1y * 100));
    const rows = [
      ["Change, range", move ? move.text : "—"],
      ["1W", fmtDelta(item, st.chg.w1)],
      ["1M", fmtDelta(item, st.chg.m1)],
      ["3M", fmtDelta(item, st.chg.m3)],
      ["YTD", fmtDelta(item, st.chg.ytd)],
      ["1Y", fmtDelta(item, st.chg.y1)],
      ["Vol, 1M realized", fmtVol(item, st.vol21)],
      ["Vol, EWMA λ .94", fmtVol(item, st.volEwma)],
      ["1Y percentile", pct],
      ["1Y robust z", st.z1y == null ? "—" : (st.z1y >= 0 ? "+" : "−") + Math.abs(st.z1y).toFixed(2)],
      ["1Y high", fmtNum(st.hi1y, item.fmt)],
      ["1Y low", fmtNum(st.lo1y, item.fmt)],
    ];
    if (st.mdd1y != null) rows.push(["1Y max drawdown", "−" + Math.abs(st.mdd1y).toFixed(1) + "%"]);
    $("dStats").innerHTML = rows.map(([k, v]) => "<div><dt>" + k + '</dt><dd class="num">' + v + "</dd></div>").join("");
    $("dStatsNote").textContent = "Dashed line: 1Y median. Vol is annualized" +
      (item.kind === "price" ? " (% of log returns)" : item.kind === "rate" ? " (bp of daily changes)" : " (points)") + ".";
    document.querySelectorAll("#dRanges button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.range === range)));
  } else {
    $("dChart").innerHTML = '<p class="d-empty">No daily history for this series. It is a policy rate or a derived ratio.</p>';
    $("dStats").innerHTML = "";
    $("dStatsNote").textContent = "";
  }

  const url = sourceUrl(item, s.src);
  $("dSource").hidden = !url;
  if (url) $("dSource").href = url;
}

export function initDetail() {
  const dlg = $("detail");
  $("dRanges").innerHTML = RANGES.map(r => '<button type="button" data-range="' + r.key + '" aria-pressed="false">' + r.label + "</button>").join("");
  $("dRanges").addEventListener("click", e => {
    const b = e.target.closest("button[data-range]");
    if (!b) return;
    range = b.dataset.range;
    render();
  });
  $("dClose").addEventListener("click", () => dlg.close());
  /* Close on backdrop click. */
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => { current = null; });
}

export function openDetail(item) {
  current = item;
  render();
  const dlg = $("detail");
  if (!dlg.open) dlg.showModal();
}

/* Re-render if the sheet is open when fresh data lands. */
export function refreshDetail() {
  if (current) render();
}
