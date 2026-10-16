import { UP, DOWN } from "../config.js";

export const $ = id => document.getElementById(id);

export function fmtNum(v, fmt = {}) {
  const dp = fmt.dp == null ? 2 : fmt.dp;
  const n = Math.abs(v) >= 1000
    ? v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
    : v.toFixed(dp);
  return (fmt.prefix || "") + n + (fmt.suffix || "");
}

/* Change label for a move from prev to price, in the indicator's own units. */
export function fmtChange(item, price, prev) {
  if (prev == null) return null;
  const ch = price - prev;
  const pct = prev ? ch / prev * 100 : null;
  const up = ch >= 0;
  const sign = up ? "+" : "";
  let text;
  if (item.changeMode === "bp") text = sign + (ch * 100).toFixed(1) + " bp";
  else if (item.changeMode === "abs") text = sign + ch.toFixed(1) + (item.fmt && item.fmt.suffix ? item.fmt.suffix : "");
  else if (item.id === "spread") text = sign + ch.toFixed(1) + " bp";
  else text = sign + (pct ?? 0).toFixed(2) + "%";
  const flat = Math.abs(pct != null ? pct : ch) < 0.005;
  const good = item.invert ? !up : up;
  return { text, up, flat, tone: flat ? "flat" : good ? "up" : "down" };
}

export function clockIn(tz, opts = {}) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, ...opts,
  }).format(new Date(opts.at ?? Date.now()));
}

/* Area sparkline as an SVG string. */
export function lineChart(vals, { good = true, id = "s", w = 200, h = 40, pad = 3, zero = false, color } = {}) {
  if (!vals || vals.length < 2) return "";
  const n = vals.length;
  let mn = Math.min(...vals), mx = Math.max(...vals);
  if (zero) { mn = Math.min(mn, -0.4); mx = Math.max(mx, 0.4); }
  if (mx === mn) mx = mn + 1e-9;
  const X = i => pad + i * (w - 2 * pad) / (n - 1);
  const Y = v => h - pad - (v - mn) * (h - 2 * pad) / (mx - mn);
  let d = "M" + X(0).toFixed(1) + "," + Y(vals[0]).toFixed(1);
  for (let i = 1; i < n; i++) d += "L" + X(i).toFixed(1) + "," + Y(vals[i]).toFixed(1);
  const col = color || (good ? UP : DOWN);
  const gid = "grad-" + id;
  const zeroLine = zero
    ? '<line x1="0" y1="' + Y(0).toFixed(1) + '" x2="' + w + '" y2="' + Y(0).toFixed(1) +
      '" stroke="rgba(155,161,172,0.35)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>'
    : "";
  return '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' + col + '" stop-opacity="0.16"/>' +
    '<stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' + zeroLine +
    '<path d="' + d + "L" + X(n - 1).toFixed(1) + "," + h + "L" + X(0).toFixed(1) + "," + h + 'Z" fill="url(#' + gid + ')"/>' +
    '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' +
    "</svg>";
}
