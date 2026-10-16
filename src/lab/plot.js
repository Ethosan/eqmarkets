/* Multi-series chart for the lab: several lines on one value axis (optionally
   log), shaded date runs, reference lines, a legend, and a crosshair whose
   readout lists every series. Charts given the same `sync` set share the
   crosshair, so stacked panes read like one chart. Same look as ui/chart.js. */
import { niceTicks } from "../ui/chart.js";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAD = { top: 10, right: 56, bottom: 20, left: 0 };
const NS = "http://www.w3.org/2000/svg";
const plots = new WeakMap();

const parse = d => new Date(d + "T00:00:00Z");
const longDate = d => { const t = parse(d); return t.getUTCDate() + " " + MON[t.getUTCMonth()] + " " + t.getUTCFullYear(); };
function dateLabel(d, spanDays) {
  const t = parse(d);
  if (spanDays > 1100) return String(t.getUTCFullYear());
  return spanDays > 200 ? MON[t.getUTCMonth()] + " ’" + String(t.getUTCFullYear()).slice(2) : t.getUTCDate() + " " + MON[t.getUTCMonth()];
}

function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

/* 1-2-5 ticks per decade for log axes. */
function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= lo && v <= hi) out.push(v); }
  }
  return out;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function draw(root, o) {
  const { dates, series } = o;
  const n = dates.length;
  const W = Math.max(160, root.clientWidth), H = o.height;
  root.querySelector("svg")?.remove();

  const usable = v => v != null && isFinite(v) && (!o.log || v > 0);
  let mn = Infinity, mx = -Infinity;
  for (const s of series) for (const v of s.values) if (usable(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  for (const r of o.refs || []) { mn = Math.min(mn, r); mx = Math.max(mx, r); }
  if (o.band) { mn = Math.min(mn, o.band[0]); mx = Math.max(mx, o.band[1]); }
  if (o.domain) [mn, mx] = o.domain;
  if (!isFinite(mn)) return;
  const tf = o.log ? Math.log : v => v;
  let a = tf(mn), b = tf(mx);
  if (b - a < 1e-12) { a -= 0.5; b += 0.5; }
  if (!o.domain) { const p = (b - a) * 0.06; a -= p; b += p; }
  const x0 = PAD.left, x1 = W - PAD.right, y0 = PAD.top, y1 = H - PAD.bottom;
  const X = i => x0 + (n === 1 ? 0 : i * (x1 - x0) / (n - 1));
  const Y = v => y1 - (Math.max(a, Math.min(b, tf(v))) - a) * (y1 - y0) / (b - a);

  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true", class: "ch-svg" });

  /* Shaded runs sit under everything else. */
  for (const r of o.shade || []) {
    const xa = Math.max(x0, X(r.i0 - 0.5)), xb = Math.min(x1, X(r.i1 + 0.5));
    el("rect", { x: xa, width: Math.max(0.5, xb - xa), y: y0, height: y1 - y0, fill: r.color }, svg);
  }

  /* 1-2-5 ticks when the range spans enough of a decade to show three of them;
     otherwise round linear ticks (still placed on the log scale). */
  const lt = o.log ? logTicks(mn, mx) : [];
  const { ticks, step } = lt.length >= 3 ? { ticks: lt, step: null } : niceTicks(mn, mx, H < 110 ? 2 : 4);
  for (const t of ticks) {
    if (t < mn - 1e-12 || t > mx + 1e-12) continue;
    el("line", { x1: x0, x2: x1, y1: Y(t), y2: Y(t), class: "ch-grid" }, svg);
    el("text", { x: x1 + 8, y: Y(t) + 3.5, class: "ch-ylab" }, svg).textContent = o.tick(t, step ?? t);
  }
  if (o.band) el("rect", { x: x0, width: x1 - x0, y: Y(o.band[1]), height: Y(o.band[0]) - Y(o.band[1]), class: "ch-band" }, svg);
  for (const r of o.refs || []) el("line", { x1: x0, x2: x1, y1: Y(r), y2: Y(r), class: "ch-ref" }, svg);
  /* Vertical markers, e.g. where the out-of-sample period starts. */
  for (const m of o.marks || []) {
    if (m.i < 0 || m.i >= n) continue;
    el("line", { x1: X(m.i), x2: X(m.i), y1: y0, y2: y1, class: "ch-ref" }, svg);
    if (m.label) el("text", { x: X(m.i) + 5, y: y0 + 9, class: "ch-xlab" }, svg).textContent = m.label;
  }

  const span = (parse(dates[n - 1]) - parse(dates[0])) / 864e5;
  const slots = Math.max(2, Math.min(7, Math.floor((x1 - x0) / 100)));
  el("line", { x1: x0, x2: x1, y1: y1, y2: y1, class: "ch-axis" }, svg);
  /* Multi-year spans label each year where it starts (thinned to fit);
     shorter spans use evenly spaced dates. */
  let at = [];
  if (span > 1100) {
    for (let i = 1; i < n; i++) if (dates[i].slice(0, 4) !== dates[i - 1].slice(0, 4)) at.push(i);
    const every = Math.ceil(at.length / slots);
    at = at.filter((_, k) => k % every === 0);
  } else {
    at = Array.from({ length: slots }, (_, s) => Math.round((n - 1) * (s + 0.5) / slots));
  }
  for (const i of at) {
    el("line", { x1: X(i), x2: X(i), y1: y1, y2: y1 + 3, class: "ch-axis" }, svg);
    el("text", { x: X(i), y: H - 5, class: "ch-xlab", "text-anchor": "middle" }, svg).textContent = dateLabel(dates[i], span);
  }

  /* Lines break across nulls; step series draw as a staircase (positions). */
  for (const s of series) {
    let d = "", pen = false;
    for (let i = 0; i < n; i++) {
      const v = s.values[i];
      if (!usable(v)) { pen = false; continue; }
      const x = X(i).toFixed(1), y = Y(v).toFixed(1);
      if (!pen) d += "M" + x + "," + y;
      else d += s.step ? "H" + x + "V" + y : "L" + x + "," + y;
      pen = true;
    }
    if (!d) continue;
    el("path", {
      d, fill: "none", stroke: s.color, "stroke-width": s.width || 1.6, "stroke-linejoin": "round", "stroke-linecap": "round",
      ...(s.dash ? { "stroke-dasharray": s.dash } : {}),
    }, svg);
  }

  const cross = el("line", { y1: y0, y2: y1, class: "ch-cross", visibility: "hidden" }, svg);
  const dots = series.map(s => el("circle", { r: 3, fill: s.color, class: "ch-dot", visibility: "hidden" }, svg));
  root.querySelector(".pl-body").prepend(svg);

  const tip = root.querySelector(".ch-tip");
  const st = plots.get(root);
  st.show = (i, fromSync) => {
    i = Math.max(0, Math.min(n - 1, i));
    st.idx = i;
    const cx = X(i);
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx);
    cross.setAttribute("visibility", "visible");
    let rows = "", topY = y1;
    series.forEach((s, k) => {
      const v = s.values[i];
      if (!usable(v)) { dots[k].setAttribute("visibility", "hidden"); return; }
      const cy = Y(v);
      topY = Math.min(topY, cy);
      dots[k].setAttribute("cx", cx); dots[k].setAttribute("cy", cy); dots[k].setAttribute("visibility", "visible");
      rows += '<span class="pl-row"><i style="background:' + s.color + '"></i>' + (series.length > 1 ? esc(s.label) + " " : "") +
        '<b>' + o.format(v, s, i) + "</b></span>";
    });
    tip.innerHTML = rows + '<span class="ch-td">' + longDate(dates[i]) + (o.note ? " · " + o.note(i) : "") + "</span>";
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const left = cx + 12 + tw > x1 ? cx - 12 - tw : cx + 12;
    tip.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, Math.min(topY - 20, y1 - tip.offsetHeight))}px)`;
    if (!fromSync) for (const other of o.sync || []) if (other !== st) other.showDate?.(dates[i]);
  };
  st.showDate = d => {
    const i = dates.indexOf(d);
    if (i >= 0) st.show(i, true); else st.hide(true);
  };
  st.hide = fromSync => {
    cross.setAttribute("visibility", "hidden");
    dots.forEach(c => c.setAttribute("visibility", "hidden"));
    tip.hidden = true; st.idx = null;
    if (!fromSync) for (const other of o.sync || []) if (other !== st) other.hide?.(true);
  };
  st.indexAt = clientX => {
    const r = root.querySelector(".pl-body").getBoundingClientRect();
    return Math.round((clientX - r.left - x0) / (x1 - x0) * (n - 1));
  };
}

/* Mount or update a plot in `root`.
   opts: dates, series [{ label, values, color, width, dash, step }], height, log,
   shade [{ i0, i1, color }], refs [values], band [lo, hi], domain [min, max],
   format(v, series, i), tick(v, step), note(i) extra readout text, sync (a Set
   shared by charts that should move together), legend (default: when > 1 series). */
export function plot(root, opts) {
  let st = plots.get(root);
  if (!st) {
    root.innerHTML = '<div class="pl-legend"></div><div class="pl-body"><div class="ch-tip" hidden></div></div>';
    root.classList.add("pl");
    const body = root.querySelector(".pl-body");
    body.classList.add("ch");
    body.tabIndex = 0;
    body.setAttribute("role", "img");
    st = { opts: null, idx: null };
    plots.set(root, st);
    body.addEventListener("pointermove", e => st.show?.(st.indexAt(e.clientX)));
    body.addEventListener("pointerdown", e => st.show?.(st.indexAt(e.clientX)));
    body.addEventListener("pointerleave", () => st.hide?.());
    body.addEventListener("blur", () => st.hide?.());
    body.addEventListener("keydown", e => {
      const n = st.opts.dates.length;
      let i = st.idx ?? n - 1;
      const step = e.shiftKey ? 20 : 1;
      if (e.key === "ArrowLeft") i -= step;
      else if (e.key === "ArrowRight") i += step;
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = n - 1;
      else if (e.key === "Escape") { st.hide(); return; }
      else return;
      e.preventDefault();
      st.show(i);
    });
    new ResizeObserver(() => { if (st.opts && root.isConnected && st.opts.dates?.length > 1) draw(root, st.opts); }).observe(root);
  }
  if (st.opts?.sync && st.opts.sync !== opts.sync) st.opts.sync.delete(st);
  st.opts = { height: 200, format: v => String(v), tick: v => String(v), ...opts };
  opts.sync?.add(st);

  const legend = root.querySelector(".pl-legend");
  const showLegend = opts.legend ?? opts.series.length > 1;
  legend.hidden = !showLegend;
  legend.innerHTML = showLegend
    ? opts.series.map(s => '<span><i style="background:' + s.color + '"></i>' + esc(s.label) + "</span>").join("")
    : "";
  const body = root.querySelector(".pl-body");
  if (!opts.dates || opts.dates.length < 2) { body.querySelector("svg")?.remove(); return; }
  body.setAttribute("aria-label", (opts.label || "Chart") + ", " + longDate(opts.dates[0]) + " to " + longDate(opts.dates[opts.dates.length - 1]) +
    ". Use arrow keys to inspect values.");
  draw(root, st.opts);
  if (st.idx != null) st.show(Math.min(st.idx, opts.dates.length - 1), true);
}
