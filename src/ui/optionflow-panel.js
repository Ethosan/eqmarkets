/* SPX option flow: dealer gamma from the live CBOE delayed-quotes chain
   (net gamma exposure, the flip level, walls, 0DTE and put/call flow), plus
   the vol-curve gauges with history (VIX9D/VIX, VXN/VIX, VVIX, SKEW).
   The chain is ~1.7 MB, so it loads once and is cached 20 minutes
   (src/data/sources.js spxChain); the card renders from whatever is in hand. */
import { spxChain } from "../data/sources.js";
import { optionFlow } from "../quant/optionflow.js";
import { percentileRank, robustZ } from "../quant/stats.js";
import { ok, hist } from "../state.js";
import { $, ordinal } from "./format.js";

const AMBER = "#D9A84E";
const NS = "http://www.w3.org/2000/svg";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sgn = (x, dp = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(dp);
const fmt0 = x => Math.round(x).toLocaleString("en-US");

/* The gamma profile as its own small SVG: index level on x, net dealer gamma
   per 1% on y, zero line, today's spot and the flip level marked. */
function drawProfile(el, p, flip) {
  el.innerHTML = "";
  const W = Math.max(120, el.clientWidth), H = 150, P = { t: 8, r: 46, b: 16, l: 4 };
  const { spots, values } = p;
  let mn = Math.min(0, ...values), mx = Math.max(0, ...values);
  const padY = (mx - mn || 1) * 0.05;
  mn -= padY; mx += padY;
  const X = s => P.l + (s - spots[0]) / (spots[spots.length - 1] - spots[0]) * (W - P.r - P.l);
  const Y = v => H - P.b - (v - mn) / (mx - mn) * (H - P.t - P.b);
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
  line(P.l, Y(0), W - P.r, Y(0), "ch-ref");
  if (flip != null) line(X(flip), P.t, X(flip), H - P.b, "ch-axis");
  const d = values.map((v, i) => `${i ? "L" : "M"}${X(spots[i]).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", AMBER);
  path.setAttribute("stroke-width", "1.6");
  svg.appendChild(path);
  const spot = spots[Math.round((spots.length - 1) / 2)];
  line(X(spot), P.t, X(spot), H - P.b, "ch-grid");
  for (const [v, cls, anchor, text] of [
    [flip, "ch-xlab", "middle", flip == null ? "" : "flip " + fmt0(flip)],
    [spot, "ch-xlab", "middle", "spot " + fmt0(spot)],
  ]) {
    if (v == null || !text) continue;
    const lab = document.createElementNS(NS, "text");
    lab.setAttribute("x", Math.max(14, Math.min(W - P.r - 4, X(v))));
    lab.setAttribute("y", H - 4);
    lab.setAttribute("class", cls);
    lab.setAttribute("text-anchor", anchor);
    lab.textContent = text;
    svg.appendChild(lab);
  }
  /* Two round y labels: the extremes of the scale. */
  for (const v of [mx - padY, mn + padY]) {
    const lab = document.createElementNS(NS, "text");
    lab.setAttribute("x", W - P.r + 6);
    lab.setAttribute("y", Y(v) + 3.5);
    lab.setAttribute("class", "ch-ylab");
    lab.textContent = sgn(v, 1);
    svg.appendChild(lab);
  }
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
    return `<li><span class="cb-l">${esc(r.label)} <em title="${esc(r.desc)}">${r.value.toFixed(2)}</em></span>` +
      `<span class="cb-v num">${r.pct == null ? "—" : ordinal(Math.round(r.pct * 100)) + " pctile (1Y)"}</span></li>`;
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

export async function renderOptionFlow() {
  renderCurve();
  let chain = await loadFlow();
  if (!chain) {
    $("ofGex").textContent = "—";
    $("ofTag").textContent = "The CBOE chain isn't reachable right now; it retries on the next refresh.";
    return;
  }
  /* r = the policy rate, from the fed funds card when it's in. */
  const ff = ok("fedfunds");
  const f = optionFlow(chain, { r: ff && ff.price > 0 && ff.price < 20 ? ff.price / 100 : 0.04 });
  if (!f) return;
  renderStats(f, chain.spot, chain.stale);
  drawProfile($("ofProfile"), f.profile, f.profile?.flip ?? null);
}
