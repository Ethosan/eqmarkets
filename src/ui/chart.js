/* Interactive time-series chart: right-hand value axis with round-number ticks,
   date axis, horizontal gridlines, and a crosshair with a date/value readout
   on hover, touch or arrow keys. Rendered at the container's pixel size so
   labels are never stretched; re-rendered on resize. */
import { UP, DOWN } from "../config.js";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAD = { top: 8, right: 50, bottom: 20, left: 0 };
const NS = "http://www.w3.org/2000/svg";
const charts = new WeakMap();
let uid = 0;

/* 1, 2, 2.5, 5 × 10^k step giving about `count` intervals over [lo, hi]. */
export function niceTicks(lo, hi, count = 4) {
  if (!(hi > lo)) return { ticks: [lo], step: 1 };
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(+v.toFixed(12));
  return { ticks, step };
}

const parse = d => new Date(d + "T00:00:00Z");
function dateLabel(d, spanDays) {
  const t = parse(d);
  return spanDays > 200 ? MON[t.getUTCMonth()] + " ’" + String(t.getUTCFullYear()).slice(2) : t.getUTCDate() + " " + MON[t.getUTCMonth()];
}
const longDate = d => { const t = parse(d); return t.getUTCDate() + " " + MON[t.getUTCMonth()] + " " + t.getUTCFullYear(); };

function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

function draw(root, o) {
  const { dates, values } = o;
  const W = Math.max(120, root.clientWidth), H = o.height;
  root.querySelector("svg")?.remove();
  const n = values.length;
  let mn = Math.min(...values), mx = Math.max(...values);
  if (o.zero) { mn = Math.min(mn, 0); mx = Math.max(mx, 0); }
  if (o.ref != null) { mn = Math.min(mn, o.ref); mx = Math.max(mx, o.ref); }
  if (o.band) { mn = Math.min(mn, o.band[0]); mx = Math.max(mx, o.band[1]); }
  if (o.domain) [mn, mx] = o.domain;
  const padY = (mx - mn || Math.abs(mx) || 1) * 0.06;
  if (!o.domain) { mn -= padY; mx += padY; }
  const x0 = PAD.left, x1 = W - PAD.right, y0 = PAD.top, y1 = H - PAD.bottom;
  const X = i => x0 + (n === 1 ? 0 : i * (x1 - x0) / (n - 1));
  const Y = v => y1 - (Math.max(mn, Math.min(mx, v)) - mn) * (y1 - y0) / (mx - mn);

  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true", class: "ch-svg" });
  const tickCount = H < 90 ? 2 : 4;
  const { ticks, step } = niceTicks(mn, mx, tickCount);
  for (const t of ticks) {
    if (t < mn || t > mx) continue;
    el("line", { x1: x0, x2: x1, y1: Y(t), y2: Y(t), class: "ch-grid" }, svg);
    const lab = el("text", { x: x1 + 8, y: Y(t) + 3.5, class: "ch-ylab" }, svg);
    lab.textContent = o.tick(t, step);
  }
  if (o.band) el("rect", { x: x0, width: x1 - x0, y: Y(o.band[1]), height: Y(o.band[0]) - Y(o.band[1]), class: "ch-band" }, svg);
  if (o.zero && mn < 0 && mx > 0) el("line", { x1: x0, x2: x1, y1: Y(0), y2: Y(0), class: "ch-ref" }, svg);
  if (o.ref != null) el("line", { x1: x0, x2: x1, y1: Y(o.ref), y2: Y(o.ref), class: "ch-ref" }, svg);

  /* Date axis: ~one label per 110px, evenly spaced, ticks on the baseline. */
  const span = (parse(dates[n - 1]) - parse(dates[0])) / 864e5;
  const slots = Math.max(2, Math.min(6, Math.floor((x1 - x0) / 110)));
  el("line", { x1: x0, x2: x1, y1: y1, y2: y1, class: "ch-axis" }, svg);
  for (let s = 0; s < slots; s++) {
    const i = Math.round((n - 1) * (s + 0.5) / slots);
    el("line", { x1: X(i), x2: X(i), y1: y1, y2: y1 + 3, class: "ch-axis" }, svg);
    const lab = el("text", { x: X(i), y: H - 5, class: "ch-xlab", "text-anchor": "middle" }, svg);
    lab.textContent = dateLabel(dates[i], span);
  }

  const col = o.color || (o.good ? UP : DOWN);
  const gid = "chg" + o.id;
  const defs = el("defs", {}, svg);
  const g = el("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el("stop", { offset: 0, "stop-color": col, "stop-opacity": 0.18 }, g);
  el("stop", { offset: 1, "stop-color": col, "stop-opacity": 0 }, g);
  let d = "";
  for (let i = 0; i < n; i++) d += (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(values[i]).toFixed(1);
  el("path", { d: d + `L${X(n - 1).toFixed(1)},${y1}L${X(0).toFixed(1)},${y1}Z`, fill: `url(#${gid})` }, svg);
  el("path", { d, fill: "none", stroke: col, "stroke-width": 1.6, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);

  const cross = el("line", { y1: y0, y2: y1, class: "ch-cross", visibility: "hidden" }, svg);
  const dot = el("circle", { r: 3.5, fill: col, class: "ch-dot", visibility: "hidden" }, svg);
  root.prepend(svg);

  const tip = root.querySelector(".ch-tip");
  const state = charts.get(root);
  state.show = i => {
    i = Math.max(0, Math.min(n - 1, i));
    state.idx = i;
    const cx = X(i), cy = Y(values[i]);
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx);
    dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
    cross.setAttribute("visibility", "visible"); dot.setAttribute("visibility", "visible");
    tip.innerHTML = '<span class="ch-tv">' + o.format(values[i], i) + '</span><span class="ch-td">' + longDate(dates[i]) + "</span>";
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const left = cx + 12 + tw > x1 ? cx - 12 - tw : cx + 12;
    tip.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, Math.min(cy - 20, y1 - tip.offsetHeight))}px)`;
  };
  state.hide = () => {
    cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden");
    tip.hidden = true; state.idx = null;
  };
  state.indexAt = clientX => {
    const r = root.getBoundingClientRect();
    return Math.round((clientX - r.left - x0) / (x1 - x0) * (n - 1));
  };
}

/* Mount or update a chart in `root`.
   opts: dates, values, format(v) for the readout, tick(v, step) for axis labels,
   height, color | good, zero, ref, band [lo, hi], domain [min, max], label. */
export function chart(root, opts) {
  let st = charts.get(root);
  if (!opts.dates || opts.values.length < 2) {
    /* Keep the state (and its listeners) for the next series; just go blank. */
    if (st) Object.assign(st, { opts: null, idx: null, show: null, hide: null });
    root.innerHTML = "";
    root.removeAttribute("tabindex");
    root.removeAttribute("role");
    root.removeAttribute("aria-label");
    return;
  }
  if (!st) {
    root.classList.add("ch");
    st = { opts: null, idx: null };
    charts.set(root, st);
    root.addEventListener("pointermove", e => st.show?.(st.indexAt(e.clientX)));
    root.addEventListener("pointerdown", e => st.show?.(st.indexAt(e.clientX)));
    root.addEventListener("pointerleave", () => st.hide?.());
    root.addEventListener("blur", () => st.hide?.());
    root.addEventListener("keydown", e => {
      if (!st.opts) return;
      const n = st.opts.values.length;
      const step = e.shiftKey ? 10 : 1;
      let i = st.idx ?? n - 1;
      if (e.key === "ArrowLeft") i -= step;
      else if (e.key === "ArrowRight") i += step;
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = n - 1;
      else if (e.key === "Escape") { st.hide(); return; }
      else return;
      e.preventDefault();
      st.show(i);
    });
    new ResizeObserver(() => { if (st.opts && root.isConnected) draw(root, st.opts); }).observe(root);
  }
  /* The caller may have replaced the contents (e.g. an empty-state message). */
  if (!root.querySelector(".ch-tip")) root.innerHTML = '<div class="ch-tip" hidden></div>';
  root.tabIndex = 0;
  root.setAttribute("role", "img");
  st.opts = { height: 160, id: ++uid, format: v => String(v), tick: v => String(v), ...opts };
  const { dates, values, format } = st.opts;
  root.setAttribute("aria-label", (opts.label ? opts.label + ": " : "") + "from " + format(values[0], 0) + " on " + longDate(dates[0]) +
    " to " + format(values[values.length - 1], values.length - 1) + " on " + longDate(dates[dates.length - 1]) + ". Use arrow keys to inspect values.");
  draw(root, st.opts);
  if (st.idx != null) st.show(Math.min(st.idx, values.length - 1));
}
