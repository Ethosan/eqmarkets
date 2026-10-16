/* Renders the Models section: Risk Appetite Index, absorption ratio and the
   yield-curve recession probability. */
import { ITEM_BY_ID } from "../config.js";
import { buildAbsorption, buildRai, buildRecession } from "../model/models.js";
import { regimeLabel } from "../quant/models.js";
import { $, stepDp } from "./format.js";
import { chart } from "./chart.js";

const AMBER = "#D9A84E";
const sgn = (x, dp = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(dp);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function renderRai() {
  const r = buildRai();
  const label = $("raiLabel"), val = $("raiValue"), chartEl = $("raiChart"), bars = $("raiBars");
  if (!r) {
    label.textContent = "Insufficient data";
    val.textContent = "Needs at least 4 inputs with history";
    chart(chartEl, { dates: null, values: [] }); bars.innerHTML = "";
    $("needle").style.left = "50%";
    return;
  }
  const x = r.smooth;
  label.textContent = regimeLabel(x);
  val.textContent = sgn(x) + "σ · " + r.contributions.length + "/" + r.total + " inputs · 3-day mean";
  /* ±2σ maps to the ends of the track. */
  const pos = Math.max(0, Math.min(100, 50 + x * 25));
  $("needle").style.left = pos + "%";
  $("raiTrack").setAttribute("aria-valuenow", x.toFixed(2));
  $("raiTrack").setAttribute("aria-valuetext", regimeLabel(x) + ", " + sgn(x) + " sigma");
  chart(chartEl, {
    dates: r.history.dates, values: r.history.values, zero: true, band: [-0.75, 0.75], color: AMBER, height: 170,
    label: "Risk Appetite Index history", format: v => sgn(v) + "σ · " + regimeLabel(v), tick: (v, st) => (Math.abs(v) < 1e-9 ? "0" : sgn(v, stepDp(st))) + "σ",
  });

  const max = 3;
  bars.innerHTML = r.contributions
    .slice()
    .sort((a, b) => b.score - a.score)
    .map(c => {
      const w = Math.min(Math.abs(c.score), max) / max * 50;
      const side = c.score >= 0 ? "left:50%" : "right:50%";
      return '<li><span class="cb-l">' + esc(c.label) + ' <em>' + (c.transform === "trend" ? "trend" : "level") + "</em></span>" +
        '<span class="cb-bar"><i class="' + (c.score >= 0 ? "u" : "d") + '" style="' + side + ";width:" + w.toFixed(1) + '%"></i></span>' +
        '<span class="cb-v num">' + sgn(c.score) + "</span></li>";
    }).join("");
}

function renderAbsorption() {
  const a = buildAbsorption();
  const v = $("arValue"), sub = $("arSub"), chartEl = $("arChart");
  if (!a) { v.textContent = "—"; sub.textContent = "Needs 5+ assets with 4 months of overlapping history"; chart(chartEl, { dates: null, values: [] }); return; }
  v.textContent = (a.latest * 100).toFixed(0) + "%";
  const shift = a.shift == null ? "shift n/a" : "ΔAR " + sgn(a.shift, 1) + "σ";
  const tone = a.shift == null ? "" : a.shift >= 1 ? "d" : a.shift <= -1 ? "u" : "";
  sub.innerHTML = '<span class="m-tag ' + tone + '">' + shift + "</span> Top " + a.k + " of " + a.n +
    " eigenvectors · 63-day window";
  $("arAssets").textContent = "1Y history. Universe: " + a.ids.map(id => ITEM_BY_ID[id].ticker).join(", ") + ".";
  chart(chartEl, {
    dates: a.dates.slice(-252), values: a.values.slice(-252), color: AMBER, height: 120,
    label: "Absorption ratio, 1 year", format: x => (x * 100).toFixed(1) + "%", tick: (x, st) => (x * 100).toFixed(stepDp(st * 100)) + "%",
  });
}

function renderRecession() {
  const r = buildRecession();
  const v = $("recValue"), sub = $("recSub"), chartEl = $("recChart");
  if (!r) { v.textContent = "—"; sub.textContent = "Needs FRED DGS10 and DGS3MO"; chart(chartEl, { dates: null, values: [] }); return; }
  const n = r.prob.length;
  const p = r.prob[n - 1];
  v.textContent = (p * 100).toFixed(1) + "%";
  const s = r.avgSpread[n - 1] * 100;
  const tone = p >= 0.3 ? "d" : p < 0.15 ? "u" : "";
  sub.innerHTML = '<span class="m-tag ' + tone + '">' + (p >= 0.3 ? "Elevated" : p < 0.15 ? "Low" : "Moderate") + "</span> " +
    "3m10y 1M avg " + sgn(s, 0) + " bp";
  const k = -504;
  chart(chartEl, {
    dates: r.dates.slice(k), values: r.prob.slice(k), ref: 0.3, domain: [0, Math.max(0.6, ...r.prob.slice(k)) * 1.05], color: AMBER, height: 120,
    label: "Recession probability, 2 years",
    format: (x, i) => (x * 100).toFixed(1) + "% · 3m10y " + sgn(r.avgSpread.slice(k)[i] * 100, 0) + " bp",
    tick: (x, st) => (x * 100).toFixed(stepDp(st * 100)) + "%",
  });
}

export function renderModels() {
  renderRai();
  renderAbsorption();
  renderRecession();
}
