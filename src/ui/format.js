import { UP, DOWN } from "../config.js";

export const $ = id => document.getElementById(id);

/* Value in the item's display units (fmt.scale turns pp into bp, e.g. for spreads). */
export function fmtNum(v, fmt = {}) {
  const x = v * (fmt.scale || 1);
  const dp = fmt.dp == null ? 2 : fmt.dp;
  const n = Math.abs(x) >= 1000
    ? x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
    : x.toFixed(dp);
  return (fmt.prefix || "") + n + (fmt.suffix || "");
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
    '<stop offset="0" stop-color="' + col + '" stop-opacity="0.16"/>' +
    '<stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' +
    bandRect + (zero ? hline(0, 0.4) : "") + (ref != null ? hline(ref, 0.3) : "") +
    '<path d="' + d + "L" + X(n - 1).toFixed(1) + "," + h + "L" + X(0).toFixed(1) + "," + h + 'Z" fill="url(#' + gid + ')"/>' +
    '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' +
    "</svg>";
}
