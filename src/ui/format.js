import { UP, DOWN } from "../config.js";

export const $ = id => document.getElementById(id);

/* Value in the item's display units (fmt.scale turns pp into bp, e.g. for spreads). */
export function fmtNum(v, fmt = {}) {
  const x = v * (fmt.scale || 1);
  const dp = fmt.dp == null ? 2 : fmt.dp;
  const n = Math.abs(x) >= 1000
    ? x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
    : x.toFixed(dp);
  /* Typographic minus, sign ahead of any prefix: −$1.20, not $-1.20. */
  const abs = n.replace("-", "");
  return (x < 0 && /[1-9]/.test(abs) ? "−" : "") + (fmt.prefix || "") + abs + (fmt.suffix || "");
}

const signed = (x, dp) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(dp);

/* A change already expressed in the item's change units (see seriesStats). */
export function fmtDelta(item, x) {
  if (x == null || !isFinite(x)) return "—";
  if (item.kind === "price") return signed(x, 2) + "%";
  if (item.kind === "rate") return signed(x, 1) + " bp";
  return signed(x, item.fmt?.dp ?? 2);
}

/* Volatility in the item's units. */
export function fmtVol(item, x) {
  if (x == null || !isFinite(x)) return "—";
  if (item.kind === "price") return x.toFixed(1) + "%";
  if (item.kind === "rate") return x.toFixed(0) + " bp";
  return x.toFixed(item.fmt?.dp ?? 2);
}

/* Day change pill: % for prices, bp for rates, points for levels. */
export function fmtChange(item, price, prev) {
  if (prev == null) return null;
  const ch = price - prev;
  const units = item.kind === "price" ? (prev ? ch / prev * 100 : 0) : item.kind === "rate" ? ch * 100 : ch;
  const up = ch >= 0;
  const flat = Math.abs(item.kind === "price" ? units : ch) < (item.kind === "price" ? 0.005 : 1e-9);
  const good = item.invert ? !up : up;
  return { text: fmtDelta(item, units), up, flat, tone: flat ? "flat" : good ? "up" : "down" };
}

export const ordinal = n => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function clockIn(tz, opts = {}) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, ...opts,
  }).format(new Date(opts.at ?? Date.now()));
}

/* Area line chart as an SVG string.
   Options: zero (dashed zero line), ref (dashed reference value, e.g. median),
   band [lo, hi] (shaded range), domain [min, max] (fixed y-axis). */
export function lineChart(vals, { good = true, id = "s", w = 200, h = 40, pad = 3, zero = false, ref = null, band = null, domain = null, color } = {}) {
  if (!vals || vals.length < 2) return "";
  const n = vals.length;
  let mn = Math.min(...vals), mx = Math.max(...vals);
  if (zero) { mn = Math.min(mn, 0); mx = Math.max(mx, 0); }
  if (ref != null) { mn = Math.min(mn, ref); mx = Math.max(mx, ref); }
  if (band) { mn = Math.min(mn, band[0]); mx = Math.max(mx, band[1]); }
  if (domain) { [mn, mx] = domain; }
  if (mx === mn) mx = mn + 1e-9;
  const X = i => pad + i * (w - 2 * pad) / (n - 1);
  const Y = v => h - pad - (Math.max(mn, Math.min(mx, v)) - mn) * (h - 2 * pad) / (mx - mn);
  let d = "M" + X(0).toFixed(1) + "," + Y(vals[0]).toFixed(1);
  for (let i = 1; i < n; i++) d += "L" + X(i).toFixed(1) + "," + Y(vals[i]).toFixed(1);
  const col = color || (good ? UP : DOWN);
  const gid = "grad-" + id;
  const hline = (v, op) => '<line x1="0" y1="' + Y(v).toFixed(1) + '" x2="' + w + '" y2="' + Y(v).toFixed(1) +
    '" stroke="rgba(155,161,172,' + op + ')" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>';
  const bandRect = band
    ? '<rect x="0" y="' + Y(band[1]).toFixed(1) + '" width="' + w + '" height="' + (Y(band[0]) - Y(band[1])).toFixed(1) + '" fill="rgba(155,161,172,0.07)"/>'
    : "";
  return '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" style="stop-color:' + col + ';stop-opacity:.16"/>' +
    '<stop offset="1" style="stop-color:' + col + ';stop-opacity:0"/></linearGradient></defs>' +
    bandRect + (zero ? hline(0, 0.4) : "") + (ref != null ? hline(ref, 0.3) : "") +
    '<path d="' + d + "L" + X(n - 1).toFixed(1) + "," + h + "L" + X(0).toFixed(1) + "," + h + 'Z" fill="url(#' + gid + ')"/>' +
    '<path d="' + d + '" fill="none" style="stroke:' + col + '" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' +
    "</svg>";
}

/* Axis-label formatter: the item's prefix/suffix, with just enough decimals
   to tell the tick step apart (step 0.25 → 2 dp, step 50 → 0 dp). */
export function tickFmt(fmt = {}) {
  return (v, step) => {
    return fmtNum(v, { ...fmt, dp: stepDp(step * (fmt.scale || 1)), suffix: (fmt.suffix || "").trim() === "bp" ? "" : fmt.suffix });
  };
}

/* Decimals needed to tell ticks `step` apart (0.25 → 2, 2.5 → 1, 50 → 0). */
export function stepDp(step) {
  const st = step.toFixed(6).replace(/0+$/, "");
  return st.includes(".") ? Math.min(st.split(".")[1].length, 4) : 0;
}

/* Value at fraction q of a sorted array (linear interpolation). */
function quantile(sorted, q) {
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/* The banded vital track: `recent` (about three months) drawn inside the bands
   of `year` (the past year, which `recent` is part of). The outer tenth of the
   year's range on each side is shaded amber, the outer 2.5% red, the median is
   a dotted rule, and the latest point takes the colour of the zone it sits in.
   Returns { svg, zone } where zone is "", "a" or "r". */
export function bandTrack(recent, year, { w = 300, h = 34, pad = 4 } = {}) {
  if (!recent || recent.length < 2 || !year || year.length < 40) return { svg: "", zone: "" };
  const s = year.slice().sort((a, b) => a - b);
  const q = [0.025, 0.1, 0.5, 0.9, 0.975].map(p => quantile(s, p));
  let mn = Math.min(s[0], ...recent), mx = Math.max(s[s.length - 1], ...recent);
  if (mx === mn) mx = mn + 1e-9;
  const Y = v => h - pad - (v - mn) * (h - 2 * pad) / (mx - mn);
  const n = recent.length;
  const X = i => i * w / (n - 1);
  const last = recent[n - 1];
  const zone = last <= q[0] || last >= q[4] ? "r" : last <= q[1] || last >= q[3] ? "a" : "";
  /* The bands sit quietly in grey; only the one holding the latest reading lights up. */
  const band = (a, b, cls) => {
    const y1 = Y(Math.max(a, b)), y2 = Y(Math.min(a, b));
    const on = last >= Math.min(a, b) && last <= Math.max(a, b) ? " on" : "";
    return y2 - y1 > 0.2 ? '<rect class="' + cls + on + '" x="0" width="' + w + '" y="' + y1.toFixed(1) + '" height="' + (y2 - y1).toFixed(1) + '"/>' : "";
  };
  let d = "";
  for (let i = 0; i < n; i++) d += (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(recent[i]).toFixed(1);
  const svg = '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' +
    band(mn, q[0], "bt-r") + band(q[0], q[1], "bt-a") + band(q[3], q[4], "bt-a") + band(q[4], mx, "bt-r") +
    '<line class="bt-mid" x1="0" x2="' + w + '" y1="' + Y(q[2]).toFixed(1) + '" y2="' + Y(q[2]).toFixed(1) + '" vector-effect="non-scaling-stroke"/>' +
    '<path class="bt-line" d="' + d + '" vector-effect="non-scaling-stroke"/>' +
    "</svg>" +
    '<i class="bt-end ' + zone + '" style="top:' + (Y(last) / h * 100).toFixed(1) + '%"></i>';
  return { svg, zone };
}
