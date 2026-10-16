/* Detail sheet: opens when a card is tapped. Shows the full history the feed
   returned, range stats, and a link to the original source. */
import { sourceUrl } from "../config.js";
import { STATE } from "../state.js";
import { $, fmtNum, fmtChange, lineChart } from "./format.js";
import { noteFor } from "./notes.js";

const RANGES = [
  { key: "1m", label: "1M", days: 21 },
  { key: "3m", label: "3M", days: 63 },
  { key: "6m", label: "6M", days: 126 },
  { key: "1y", label: "1Y", days: 260 },
];

let current = null;
let range = "3m";

function rangeCloses(s) {
  const r = RANGES.find(x => x.key === range);
  return s.closes.slice(-r.days);
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
    $("dRanges").hidden = true;
    $("dSource").hidden = true;
    return;
  }

  $("dValue").textContent = fmtNum(s.price, item.fmt);
  const ch = fmtChange(item, s.price, s.prev);
  $("dChange").textContent = ch ? (ch.up ? "▲ " : "▼ ") + ch.text + " today" : "";
  $("dChange").className = "d-change num " + (ch ? ch.tone : "flat");
  const nt = noteFor(item, s);
  $("dNote").textContent = nt ? nt.t : "";

  const hasHist = s.closes && s.closes.length > 1;
  $("dRanges").hidden = !hasHist;
  if (hasHist) {
    const vals = rangeCloses(s);
    const first = vals[0], last = vals[vals.length - 1];
    const good = item.invert ? last < first : last >= first;
    $("dChart").innerHTML = lineChart(vals, { good, id: "detail", w: 600, h: 160, pad: 6 });
    const hi = Math.max(...vals), lo = Math.min(...vals);
    const move = fmtChange(item, last, first);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    $("dStats").innerHTML = [
      ["High", fmtNum(hi, item.fmt)],
      ["Low", fmtNum(lo, item.fmt)],
      ["Average", fmtNum(avg, item.fmt)],
      ["Change", move ? move.text : "--"],
    ].map(([k, v]) => "<div><dt>" + k + '</dt><dd class="num">' + v + "</dd></div>").join("");
    document.querySelectorAll("#dRanges button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.range === range)));
  } else {
    $("dChart").innerHTML = '<p class="d-empty">No daily history for this series. It is a policy rate or a derived ratio.</p>';
    $("dStats").innerHTML = "";
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
