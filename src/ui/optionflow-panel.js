/* SPX option flow: dealer gamma from the live CBOE delayed-quotes chain
   (net gamma exposure, the flip level, walls, 0DTE and put/call flow), plus
   the vol-curve gauges with history (VIX9D/VIX, VXN/VIX, VVIX, SKEW).
   The chain is ~1.7 MB, so it loads once and is cached 20 minutes
   (src/data/sources.js spxChain); the card renders from whatever is in hand. */
import { spxChain } from "../data/sources.js";
import { optionFlow, gexProfile } from "../quant/optionflow.js";
import { percentileRank, robustZ } from "../quant/stats.js";
import { ok, hist } from "../state.js";
import { $, ordinal } from "./format.js";
import { niceTicks } from "./chart.js";

const AMBER = "var(--series)";
const NS = "http://www.w3.org/2000/svg";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sgn = (x, dp = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(dp);
const fmt0 = x => Math.round(x).toLocaleString("en-US");

/* The profile's index-level window. The full ±18% grid is where the flip is
   found; the near windows show the levels actually in play around spot. */
const ZOOMS = [
  { id: "3", lo: 0.97, hi: 1.03, label: "±3%" },
  { id: "8", lo: 0.92, hi: 1.08, label: "±8%" },
  { id: "18", lo: 0.82, hi: 1.18, label: "±18%" },
];
let zoom = "3";
try { const v = JSON.parse(localStorage.getItem("eqm.of.zoom") || "null"); if (ZOOMS.some(z => z.id === v)) zoom = v; } catch { /* storage blocked */ }
let last = null; /* { chain, f, r } of the last render, so re-zooming needs no refetch */
let wired = false;

/* The gamma profile as its own SVG: index level on x, net dealer gamma per 1%
   on y, zero line, today's spot, the flip level and the walls marked. Drawn at
   the container's pixel width and redrawn when that changes, so text never
   scales. */
const profiles = new WeakMap();
function drawProfile(el, p, flip, walls) {
  if (!profiles.has(el)) new ResizeObserver(() => { const a = profiles.get(el); if (a && el.isConnected) render(el, ...a); }).observe(el);
  profiles.set(el, [p, flip, walls]);
  render(el, p, flip, walls);
}
function render(el, p, flip, walls) {
  el.innerHTML = "";
  if (!p || !el.clientWidth) return;
  const W = el.clientWidth, H = W < 480 ? 190 : 230, P = { t: 22, r: 52, b: 22, l: 4 };
  const { spots, values } = p;
  let mn = Math.min(0, ...values), mx = Math.max(0, ...values);
  const padY = (mx - mn || 1) * 0.06;
  mn -= padY; mx += padY;
  const X = s => P.l + (s - spots[0]) / (spots[spots.length - 1] - spots[0]) * (W - P.r - P.l);
  const Y = v => H - P.b - (v - mn) / (mx - mn) * (H - P.t - P.b);
  const inView = v => v >= spots[0] && v <= spots[spots.length - 1];
  /* Walls inside the window: dashed levels, labelled along the bottom, with
     labels dropped when two would print over each other. */
  const wallLabs = [];
  if (walls) for (const [w, t] of [[walls.call, "call wall"], [walls.put, "put wall"], [walls.gamma, "gamma wall"]]) {
    if (!w?.strike || !inView(w.strike)) continue;
    const x = Math.max(P.l + 34, Math.min(W - P.r - 34, X(w.strike)));
    if (wallLabs.some(q => Math.abs(q.x - x) < 62)) continue;
    wallLabs.push({ v: w.strike, x, t });
  }
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", W); svg.setAttribute("height", H);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "ch-svg");
  svg.setAttribute("aria-hidden", "true");
  const line = (x1, y1, x2, y2, cls) => {
    const l = document.createElementNS(NS, "line");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    l.setAttribute("class", cls); svg.appendChild(l);
  };
  const text = (x, y, cls, anchor, t) => {
    const lab = document.createElementNS(NS, "text");
    lab.setAttribute("x", x); lab.setAttribute("y", y);
    lab.setAttribute("class", cls); lab.setAttribute("text-anchor", anchor);
    lab.textContent = t; svg.appendChild(lab);
  };
  /* Value axis: round gridlines on the right, as on every other chart. */
  const { ticks } = niceTicks(mn, mx, H < 200 ? 3 : 4);
  for (const t of ticks) {
    if (t < mn || t > mx) continue;
    line(P.l, Y(t), W - P.r, Y(t), t === 0 ? "ch-ref" : "ch-grid");
    text(W - P.r + 8, Y(t) + 3.5, "ch-ylab", "start", t === 0 ? "0" : sgn(t, Math.abs(t) < 10 ? 1 : 0));
  }
  /* Index-level axis along the bottom, about one label per 110px. */
  line(P.l, H - P.b, W - P.r, H - P.b, "ch-axis");
  const xt = niceTicks(spots[0], spots[spots.length - 1], Math.max(3, Math.floor((W - P.r) / 110))).ticks;
  for (const t of xt) {
    if (t < spots[0] || t > spots[spots.length - 1]) continue;
    if (wallLabs.some(q => Math.abs(X(t) - q.x) < 36)) continue; /* the wall's own label sits here */
    line(X(t), H - P.b, X(t), H - P.b + 3, "ch-axis");
    text(Math.max(P.l + 16, Math.min(W - P.r - 16, X(t))), H - 5, "ch-xlab", "middle", fmt0(t));
  }
  const d = values.map((v, i) => `${i ? "L" : "M"}${X(spots[i]).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.style.stroke = AMBER;
  path.setAttribute("stroke-width", "1.8");
  svg.appendChild(path);
  /* Walls behind the spot and flip marks; a wall outside the window is not
     drawn at all (its strike is still in the Walls row below). */
  for (const q of wallLabs) {
    line(X(q.v), P.t - 4, X(q.v), H - P.b, "ch-wall");
    text(q.x, H - P.b - 6, "ch-walllab", "middle", q.t);
  }
  /* Spot and flip as verticals, labelled along the top. The two usually sit a
     few points apart, so each label hangs off the outer side of its own line
     and the pair can never print over each other. */
  const spot = spots[Math.round((spots.length - 1) / 2)];
  const marks = [{ v: spot, t: "spot " + fmt0(spot), cls: "ch-mark" }];
  if (flip != null && inView(flip)) marks.push({ v: flip, t: "flip " + fmt0(flip), cls: "ch-mark ch-flip" });
  marks.sort((a, b) => a.v - b.v);
  marks.forEach((m, i) => {
    const x = X(m.v);
    line(x, P.t - 4, x, H - P.b, m.cls);
    let right = marks.length === 1 ? x < (W - P.r) / 2 : i === 1;
    if (!right && x < 72) right = true;
    if (right && x > W - P.r - 72) right = false;
    const tx = right ? x + 5 : x - 5;
    text(tx, P.t - 8, "ch-xlab ch-marklab", right ? "start" : "end", m.t);
  });
  el.appendChild(svg);
}

/* Vol-curve gauges with history behind them, from the fetched STATE series. */
function ratio(id, num, den) {
  const a = hist(num, 60), b = hist(den, 60);
  if (!a || !b) return null;
  const out = { dates: [], values: [] };
  const map = new Map(b.dates.map((d, i) => [d, b.values[i]]));
  a.dates.forEach((d, i) => { const v = map.get(d); if (v > 0) { out.dates.push(d); out.values.push(a.values[i] / v); } });
  if (out.values.length < 40) return null;
  const x = out.values[out.values.length - 1];
  const year = out.values.slice(-253, -1);
  return { id, value: x, pct: year.length > 60 ? percentileRank(x, year) : null, z: year.length > 60 ? robustZ(x, year) : null };
}

function renderCurve() {
  const rows = [
    { ...ratio("v9d", "vix9d", "vix"), label: "Front of the curve · VIX9D/VIX", desc: "9-day vs 30-day implied vol; above 1 is backwardation", badHigh: true },
    { ...ratio("vxn", "vxn", "vix"), label: "Growth fear · VXN/VIX", desc: "Nasdaq vol priced above S&P vol; rising questions growth leadership", badHigh: true },
    (() => { const r = hist("vvix", 60); if (!r) return null;
      const x = r.values[r.values.length - 1], year = r.values.slice(-253, -1);
      return { id: "vvix", value: x, pct: percentileRank(x, year), z: robustZ(x, year), label: "Vol of vol · VVIX", desc: "Uncertainty about volatility; high = dealers want a premium", badHigh: true }; })(),
    (() => { const r = hist("skew", 60); if (!r) return null;
      const x = r.values[r.values.length - 1], year = r.values.slice(-253, -1);
      return { id: "skew", value: x, pct: percentileRank(x, year), z: robustZ(x, year), label: "Crash insurance · SKEW", desc: "OTM puts vs ATM; high = tail hedging in demand", badHigh: true }; })(),
  ].filter(Boolean);
  $("ofCurve").innerHTML = rows.map(r => {
    if (r.value == null) return "";
    const tone = r.pct == null ? "" : r.pct >= 0.8 ? "d" : r.pct <= 0.2 ? "u" : "";
    const val = r.pct == null ? "—" : ordinal(Math.round(r.pct * 100)) + " pctile (1Y)";
    return `<li><span class="cb-l">${esc(r.label)} <em title="${esc(r.desc)}">${r.value.toFixed(2)}</em></span>` +
      `<span class="cb-v num ${tone}">${val}</span></li>`;
  }).join("");
}

let inflight = null;
async function loadFlow() {
  if (inflight) return inflight;
  $("ofStats").innerHTML = '<li><span class="cal-k">Loading</span><span class="cal-v">SPX option chain, about 2 MB</span></li>';
  inflight = spxChain().finally(() => { inflight = null; });
  return inflight;
}

function renderStats(f, spot, stale) {
  const gex = f.gex.netBn;
  const tag = gex >= 0 ? ["Positive gamma · hedging dampens moves", "u"] : ["Negative gamma · hedging amplifies moves", "d"];
  $("ofGex").textContent = (gex >= 0 ? "+$" : "−$") + Math.abs(gex).toFixed(1) + "bn";
  $("ofGex").className = "m-value num";
  $("ofTag").innerHTML = `<span class="m-tag ${tag[1]}">${tag[0]}</span>` +
    ` calls +$${Math.abs(f.gex.callBn).toFixed(1)}bn · puts −$${Math.abs(f.gex.putBn).toFixed(1)}bn per 1%`;
  $("ofAsOf").textContent = "SPX " + fmt0(spot) + " · as of " + f.asOf + ", delayed" + (stale ? " · stale" : "");

  const flip = f.profile?.flip;
  const rows = [];
  if (flip != null) {
    const d = (flip / spot - 1) * 100;
    rows.push(["Gamma flip", fmt0(flip) + " (" + sgn(d, 1) + "% from spot). " +
      (spot >= flip ? "Above it, dealer hedging leans against the move." : "Below it, dealer hedging leans with the move — moves get amplified.")]);
  }
  if (f.pc.d0Share != null) rows.push(["0DTE share", Math.round(f.pc.d0Share * 100) + "% of today's SPX option volume is in same-day expiries · " + Math.round((f.pc.weekShare ?? 0) * 100) + "% within a week"]);
  if (f.pc.pcVol != null) rows.push(["Put/call today", f.pc.pcVol.toFixed(2) + " on volume (" + (f.pc.putVol / 1e6).toFixed(1) + "M puts / " + (f.pc.callVol / 1e6).toFixed(1) + "M calls) · " + (f.pc.pcOi ?? 0).toFixed(2) + " on open interest"]);
  if (f.walls) rows.push(["Walls", "Call " + fmt0(f.walls.call.strike) + " · put " + fmt0(f.walls.put.strike) + " · gamma " + fmt0(f.walls.gamma.strike) + " — strikes where hedging flow concentrates"]);
  rows.push(["Gamma by expiry", f.byDte.map(b => `${b.from === 91 ? "3M+" : b.from + (b.to === 1 ? "D" : "–" + b.to + "D")} ${sgn(b.gexBn, 1)}`).join(" · ")]);
  $("ofStats").innerHTML = rows.map(([k, v]) => `<li class=""><span class="cal-k">${k}</span><span class="cal-v">${esc(v)}</span></li>`).join("");
}

/* Re-draw the profile for the selected window. The flip always comes from the
   widest grid, where the zero crossing closest to spot is searched. */
function renderProfile() {
  if (!last) return;
  const z = ZOOMS.find(x => x.id === zoom) ?? ZOOMS[0];
  const p = z.id === "18" ? last.f.profile : gexProfile(last.chain, { lo: z.lo, hi: z.hi, r: last.r });
  drawProfile($("ofProfile"), p ?? last.f.profile, last.f.profile?.flip ?? null, last.f.walls);
}

function renderZoom() {
  $("ofZoom").innerHTML = ZOOMS.map(z =>
    `<button type="button" data-zoom="${z.id}" aria-pressed="${z.id === zoom}">${z.label}</button>`).join("");
}

export async function renderOptionFlow() {
  if (!wired) {
    wired = true;
    $("ofZoom").addEventListener("click", e => {
      const b = e.target.closest("button[data-zoom]");
      if (!b) return;
      zoom = b.dataset.zoom;
      try { localStorage.setItem("eqm.of.zoom", JSON.stringify(zoom)); } catch { /* storage blocked */ }
      renderZoom();
      renderProfile();
    });
  }
  renderZoom();
  renderCurve();
  let chain = await loadFlow();
  if (!chain) {
    $("ofGex").textContent = "—";
    $("ofTag").textContent = "The CBOE chain isn't reachable right now; it retries on the next refresh.";
    return;
  }
  /* r = the policy rate, from the fed funds card when it's in. */
  const ff = ok("fedfunds");
  const r = ff && ff.price > 0 && ff.price < 20 ? ff.price / 100 : 0.04;
  const f = optionFlow(chain, { r });
  if (!f) return;
  last = { chain, f, r };
  renderStats(f, chain.spot, chain.stale);
  renderProfile();
}
