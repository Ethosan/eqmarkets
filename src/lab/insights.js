/* Lab insight panels: the calendar-effect event study and the parameter-sweep
   heatmap. Pure rendering plus the event definitions; the statistics live in
   src/quant/calendar.js and src/quant/backtest.js. */
import { FOMC_COVERAGE, eventStudy } from "../quant/calendar.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sgn = (x, dp = 1) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(dp);
const bp = x => (x == null ? "—" : sgn(x * 1e4, 1) + " bp");
const pc = (x, dp = 0) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(dp) + "%");

/* Each event marks the day whose close-to-close return it claims. Month-end
   rebalancing uses the stock–bond gap known at the previous close. */
export const EVENTS = [
  { id: "tom", name: "Turn of month", desc: "The last trading day of the month and the first three of the next", mask: f => f.cal.tom },
  { id: "fomc", name: "FOMC statement day", desc: "Scheduled decision days; the close-to-close return includes the run-up into 2 pm ET", mask: f => f.cal.fomc, from: FOMC_COVERAGE[0] },
  { id: "preFomc", name: "Day before FOMC", desc: "The session before a scheduled decision", mask: f => f.cal.preFomc, from: FOMC_COVERAGE[0] },
  { id: "opexWeek", name: "Option-expiry week", desc: "Monday to the third Friday of each month", mask: f => f.cal.opexWeek },
  { id: "quadWeek", name: "Quad-witching week", desc: "Expiry week in March, June, September and December", mask: f => f.cal.quadWeek },
  { id: "opex", name: "Expiry day", desc: "The third Friday itself", mask: f => f.cal.opex },
  { id: "preHoliday", name: "Day before a holiday", desc: "The session before a weekday NYSE holiday", mask: f => f.cal.preHoliday },
  {
    id: "meUp", name: "Month-end, stocks ahead", desc: "Last 3 sessions when the instrument beat Treasuries by 2+ points month to date",
    mask: f => f.cal.monthEnd.map((m, i) => m && f.rebal[i - 1] != null && f.rebal[i - 1] >= 2),
  },
  {
    id: "meDn", name: "Month-end, stocks behind", desc: "Last 3 sessions when the instrument trailed Treasuries by 2+ points",
    mask: f => f.cal.monthEnd.map((m, i) => m && f.rebal[i - 1] != null && f.rebal[i - 1] <= -2),
  },
];

/* Daily log returns, attributed to the day they end on. */
export function runEvents(frame) {
  const P = frame.price;
  const rets = P.map((p, i) => (i ? Math.log(p / P[i - 1]) : null));
  return EVENTS.map(e => {
    const mask = e.mask(frame);
    const r = e.from ? rets.map((x, i) => (frame.dates[i] >= e.from ? x : null)) : rets;
    return { ...e, stats: eventStudy(r, mask) };
  });
}

export function renderEvents(el, rows) {
  const head = ["Event", "Days", "Avg event day", "Avg other day", "Difference", "t", "p", "Up days", "Share of days", "Share of return"];
  el.innerHTML = "<thead><tr>" + head.map(h => `<th scope="col">${h}</th>`).join("") + "</tr></thead><tbody>" +
    rows.map(r => {
      const s = r.stats;
      if (!s) return `<tr><th scope="row" title="${esc(r.desc)}">${esc(r.name)}</th><td colspan="9" class="muted">Too few days in this range</td></tr>`;
      const sig = s.p < 0.05 ? (s.diff > 0 ? "up" : "dn") : "";
      return `<tr class="${sig}"><th scope="row" title="${esc(r.desc)}">${esc(r.name)}</th><td>${s.n.toLocaleString("en-US")}</td>` +
        `<td>${bp(s.meanIn)}</td><td>${bp(s.meanOut)}</td><td class="diff">${bp(s.diff)}</td><td>${s.t == null ? "—" : sgn(s.t, 2)}</td>` +
        `<td class="p">${s.p < 0.001 ? "<0.001" : s.p.toFixed(3)}</td><td>${pc(s.hit)}</td><td>${pc(s.share)}</td><td>${pc(s.retShare)}</td></tr>`;
    }).join("") + "</tbody>";
}

/* Heatmap of a metric over an a × b grid. cells: [{ a, b, value, oos }], higher is better. */
export function renderHeatmap(el, { as, bs, cells, label, fmt, best, bench }) {
  const vals = cells.map(c => c.value).filter(v => v != null && isFinite(v));
  if (!vals.length) { el.innerHTML = '<p class="m-cap">No cell produced a result.</p>'; return; }
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const shade = v => (v == null || !isFinite(v) ? 0 : hi > lo ? (v - lo) / (hi - lo) : 0.5);
  const at = (a, b) => cells.find(c => c.a === a && c.b === b);
  const twoD = bs.length > 1;
  const rows = (twoD ? [...bs].reverse() : [null]).map(b =>
    (twoD ? `<span class="hm-yl num">${+b.toFixed(4)}</span>` : "") +
    as.map(a => {
      const c = at(a, b);
      const t = shade(c?.value);
      const isBest = best && c === best;
      const tip = "a = " + (+a.toFixed(4)) + (twoD ? ", b = " + (+b.toFixed(4)) : "") + " · " + label + " " + (c?.value == null ? "—" : fmt(c.value)) +
        (c?.oos != null ? " · out-of-sample Sharpe " + c.oos.toFixed(2) : "");
      return `<span class="hm-c num${isBest ? " best" : ""}${bench != null && c?.value != null && c.value > bench ? " beat" : ""}" style="--t:${t.toFixed(3)}" title="${esc(tip)}">` +
        (c?.value == null ? "—" : fmt(c.value)) + "</span>";
    }).join("")
  ).join("");
  el.innerHTML = `<div class="hm${twoD ? " two" : ""}" style="--cols:${as.length}">` + rows +
    (twoD ? '<span class="hm-yl"></span>' : "") + as.map(a => `<span class="hm-xl num">${+a.toFixed(4)}</span>`).join("") + "</div>" +
    `<p class="m-cap hm-axes">Across: a${twoD ? " · up: b" : ""}. Darker = higher ${esc(label)}. Outlined: best cell` +
    (bench != null ? "; underlined: beats buy and hold" : "") + ".</p>";
}
