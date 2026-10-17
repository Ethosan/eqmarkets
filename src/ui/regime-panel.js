/* Growth × inflation regime card: a quadrant map with the last 13 weekly
   readings as a trail, the regime label, and each input's contribution. */
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

  /* Weekly readings: older segments and points fade, so the path reads from
     faint (13 weeks ago) to solid (last week). */
  const pts = r.trail;
  const age = k => (0.12 + 0.68 * k / Math.max(1, pts.length - 1)).toFixed(2);
  for (let k = 1; k < pts.length; k++) {
    svg += '<line class="rq-trail" x1="' + X(pts[k - 1].growth).toFixed(1) + '" y1="' + Y(pts[k - 1].inflation).toFixed(1) +
      '" x2="' + X(pts[k].growth).toFixed(1) + '" y2="' + Y(pts[k].inflation).toFixed(1) + '" stroke-opacity="' + age(k) + '"/>';
  }
  if (pts.length) {
    const p = pts[pts.length - 1];
    svg += '<line class="rq-trail now" x1="' + X(p.growth).toFixed(1) + '" y1="' + Y(p.inflation).toFixed(1) + '" x2="' + X(r.growth).toFixed(1) + '" y2="' + Y(r.inflation).toFixed(1) + '"/>';
  }
  pts.forEach((p, k) => {
    svg += '<circle cx="' + X(p.growth).toFixed(1) + '" cy="' + Y(p.inflation).toFixed(1) + '" r="2.5" class="rq-pt" opacity="' + age(k) + '">' +
      "<title>Week to " + shortDate(p.date) + ": growth " + sgn(p.growth) + ", inflation " + sgn(p.inflation) + "</title></circle>";
  });
  if (pts.length > 1) {
    /* Label where the trail starts; flip the label to the left near the right edge. */
    const p = pts[0], x = X(p.growth), right = x > L + W - 45;
    svg += '<text x="' + (x + (right ? -6 : 6)).toFixed(1) + '" y="' + (Y(p.inflation) + 3.5).toFixed(1) + '" text-anchor="' + (right ? "end" : "start") +
      '" class="rq-start">' + MON[+p.date.slice(5, 7) - 1] + " ’" + p.date.slice(2, 4) + "</text>";
  }
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
    $("regSub").textContent = "Needs 2 growth and 2 inflation inputs with about 8 months of history";
    $("regMap").innerHTML = "";
    $("regBlurb").textContent = "";
    $("regGrowth").innerHTML = $("regInfl").innerHTML = "";
    $("regPending").hidden = true;
    $("regStrip").innerHTML = "";
    $("regStripCap").textContent = "";
    return;
  }
  card.dataset.q = r.quadrant;
  $("regLabel").textContent = r.label;
  const wk = n => n + (n === 1 ? " week" : " weeks");
  const since = r.provisional ? "provisional until three full weeks of readings"
    : r.label + (r.sinceStart ? " for all " + wk(r.weeksIn) + " of history here" : " since the week of " + shortDate(r.since) + " (" + wk(r.weeksIn) + ")");
  $("regSub").textContent = "Growth " + sgn(r.growth) + " · Inflation " + sgn(r.inflation) + " · " + since;
  $("regMap").innerHTML = map(r);
  $("regMap").setAttribute("aria-label", "Regime map: " + r.label + ", growth " + sgn(r.growth) + ", inflation " + sgn(r.inflation) +
    ". The trail shows " + r.trail.length + " weekly readings, from " + (r.trail[0] ? shortDate(r.trail[0].date) : "") + ".");
  $("regBlurb").textContent = QUADRANTS[r.quadrant].blurb;
  /* Say why the dot and the label can disagree: a change building, or a reading on the line. */
  let note = "";
  if (r.pending) {
    note = "Readings have pointed to " + r.pending.label + " for " + r.pending.weeks + " of the " + r.pending.needed + " weeks needed to switch.";
  } else if (!r.provisional && r.readingQuadrant !== r.quadrant) {
    const q = QUADRANTS[r.quadrant];
    const crossed = v => Math.abs(v) >= r.band;
    const clear = (Math.sign(r.growth) !== q.growth && crossed(r.growth)) || (Math.sign(r.inflation) !== q.inflation && crossed(r.inflation));
    const to = QUADRANTS[r.readingQuadrant].label;
    /* Name the axis that crossed zero, so the label and the bars don't seem to disagree. */
    const axis = Math.sign(r.growth) !== q.growth ? ["Growth", r.growth] : ["Inflation", r.inflation];
    note = clear
      ? "This week's reading so far points to " + to + ". It counts toward a switch once the week closes."
      : axis[0] + " is " + sgn(axis[1]) + ", just across zero. Within ±" + r.band.toFixed(2) + " counts as no change, so the regime stays " + r.label + ".";
  }
  $("regPending").hidden = !note;
  $("regPending").textContent = note;
  /* One cell per week for the past year, coloured by the regime that week. */
  $("regStrip").innerHTML = r.strip.map(w => '<i class="' + w.regime + '" title="Week of ' + shortDate(w.week) + ": " + QUADRANTS[w.regime].label + '"></i>').join("");
  $("regStrip").setAttribute("aria-label", "Regime each week for the past " + r.strip.length + " weeks");
  $("regStripCap").textContent = !r.strip.length ? "" : "Past " + wk(r.strip.length) + (r.strip.length ? " from " + shortDate(r.strip[0].week) : "") + ", read each Friday · " +
    (r.switchesYear === 0 ? "no changes" : r.switchesYear === 1 ? "changed once" : "changed " + r.switchesYear + " times") + " in the past year";
  /* The axis score is the plain average of its bars. */
  $("regGrowthCap").textContent = "Growth inputs · average " + sgn(r.growth);
  $("regInflCap").textContent = "Inflation inputs · average " + sgn(r.inflation);
  $("regGrowth").innerHTML = bars(r.contributions.filter(c => c.axis === "growth"));
  $("regInfl").innerHTML = bars(r.contributions.filter(c => c.axis === "inflation"));
}
