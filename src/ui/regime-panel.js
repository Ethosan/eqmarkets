/* Growth × inflation regime card: a quadrant map with the last 3 months as a
   trail, the regime label, and each input's contribution. */
import { QUADRANTS } from "../quant/regime.js";
import { $ } from "./format.js";

/* Plot box inside a 300×300 view; room on the left and bottom for ticks and titles. */
const S = 300, L = 30, R = 8, T = 22, B = 34, LIM = 2;
const W = S - L - R, H = S - T - B;
const X = g => L + (Math.max(-LIM, Math.min(LIM, g)) + LIM) / (2 * LIM) * W;
const Y = i => T + H - (Math.max(-LIM, Math.min(LIM, i)) + LIM) / (2 * LIM) * H;
const sgn = (x, dp = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(dp);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = d => { const t = new Date(d + "T00:00:00Z"); return t.getUTCDate() + " " + MON[t.getUTCMonth()]; };

function map(r) {
  const cx = X(0), cy = Y(0);
  /* Quadrant labels sit mid-way along each outer edge, with a halo, so neither
     extreme points (corners) nor weak readings (centre) cover them. */
  const quad = (x, y, w, h, cls, label, ly) =>
    '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" class="rq ' + cls + (r.quadrant === cls ? " on" : "") + '"/>' +
    '<text x="' + (x + w / 2) + '" y="' + ly + '" text-anchor="middle" class="rq-lab' + (r.quadrant === cls ? " on" : "") + '">' + label + "</text>";
  let svg = '<svg viewBox="0 0 ' + S + " " + S + '" class="reg-svg" aria-hidden="true">';
  svg += quad(L, T, cx - L, cy - T, "stagflation", "Stagflation", T + 15);
  svg += quad(cx, T, L + W - cx, cy - T, "reflation", "Reflation", T + 15);
  svg += quad(L, cy, cx - L, T + H - cy, "disinflation", "Slowdown", T + H - 8);
  svg += quad(cx, cy, L + W - cx, T + H - cy, "goldilocks", "Goldilocks", T + H - 8);
  for (const t of [-1, 1]) {
    svg += '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + T + '" y2="' + (T + H) + '" class="rq-grid"/>';
    svg += '<line y1="' + Y(t) + '" y2="' + Y(t) + '" x1="' + L + '" x2="' + (L + W) + '" class="rq-grid"/>';
  }
  svg += '<line x1="' + L + '" x2="' + (L + W) + '" y1="' + cy + '" y2="' + cy + '" class="rq-axis"/>';
  svg += '<line y1="' + T + '" y2="' + (T + H) + '" x1="' + cx + '" x2="' + cx + '" class="rq-axis"/>';
  for (const t of [-2, -1, 0, 1, 2]) {
    svg += '<text x="' + X(t) + '" y="' + (T + H + 13) + '" text-anchor="middle" class="rq-tick">' + (t ? sgn(t, 0) : "0") + "</text>";
    svg += '<text x="' + (L - 6) + '" y="' + (Y(t) + 3.5) + '" text-anchor="end" class="rq-tick">' + (t ? sgn(t, 0) : "0") + "</text>";
  }
  svg += '<text x="' + (L + W) + '" y="' + (S - 3) + '" text-anchor="end" class="rq-title">Growth →</text>';
  svg += '<text x="' + L + '" y="' + (T - 8) + '" class="rq-title">↑ Inflation</text>';

  const pts = r.trail;
  if (pts.length > 1) {
    svg += '<polyline class="rq-trail" points="' + pts.map(p => X(p.growth).toFixed(1) + "," + Y(p.inflation).toFixed(1)).join(" ") + '"/>';
  }
  pts.forEach((p, k) => {
    if (k === pts.length - 1) return;
    const op = (0.2 + 0.6 * k / Math.max(1, pts.length - 1)).toFixed(2);
    svg += '<circle cx="' + X(p.growth).toFixed(1) + '" cy="' + Y(p.inflation).toFixed(1) + '" r="3" class="rq-pt" opacity="' + op + '">' +
      "<title>" + shortDate(p.date) + ": growth " + sgn(p.growth) + ", inflation " + sgn(p.inflation) + "</title></circle>";
  });
  svg += '<circle cx="' + X(r.growth).toFixed(1) + '" cy="' + Y(r.inflation).toFixed(1) + '" r="7" class="rq-now"><title>Now: growth ' +
    sgn(r.growth) + ", inflation " + sgn(r.inflation) + "</title></circle>";
  return svg + "</svg>";
}

function bars(list) {
  const max = 3;
  return list.map(c => {
    const w = Math.min(Math.abs(c.score), max) / max * 50;
    return '<li><span class="cb-l">' + c.label + "</span>" +
      '<span class="cb-bar"><i class="' + (c.score >= 0 ? "pos" : "neg") + '" style="' + (c.score >= 0 ? "left:50%" : "right:50%") + ";width:" + w.toFixed(1) + '%"></i></span>' +
      '<span class="cb-v num">' + sgn(c.score) + "</span></li>";
  }).join("");
}

export function renderRegime(r) {
  const card = $("regimeCard");
  if (!r) {
    $("regLabel").textContent = "Insufficient data";
    $("regSub").textContent = "Needs 2 growth and 2 inflation inputs with 4 months of history";
    $("regMap").innerHTML = "";
    $("regBlurb").textContent = "";
    $("regGrowth").innerHTML = $("regInfl").innerHTML = "";
    return;
  }
  card.dataset.q = r.quadrant;
  $("regLabel").textContent = r.label;
  const since = r.sinceStart ? "for at least the last year" : "since " + shortDate(r.since);
  $("regSub").textContent = "Growth " + sgn(r.growth) + " · Inflation " + sgn(r.inflation) + " · " + r.confidence + " · " + since;
  $("regMap").innerHTML = map(r);
  $("regMap").setAttribute("aria-label", "Regime map: " + r.label + ", growth " + sgn(r.growth) + ", inflation " + sgn(r.inflation) +
    ". The trail shows the last " + r.trail.length + " weeks.");
  $("regBlurb").textContent = QUADRANTS[r.quadrant].blurb;
  $("regGrowth").innerHTML = bars(r.contributions.filter(c => c.axis === "growth"));
  $("regInfl").innerHTML = bars(r.contributions.filter(c => c.axis === "inflation"));
}
