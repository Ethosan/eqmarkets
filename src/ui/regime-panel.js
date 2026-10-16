import { computeRegime, SHORT } from "../model/regime.js";
import { $, lineChart } from "./format.js";

export function renderRegime() {
  const r = computeRegime();
  $("regimeChips").innerHTML = r.chips
    .map(ch => '<li class="rchip"><i class="' + ch.c + '" aria-hidden="true"></i>' + ch.t + "</li>")
    .join("");

  const label = $("regimeLabel"), raiEl = $("regimeRai"), chart = $("raiChart"), weightsEl = $("pcaWeights");

  if (r.mode === "none") {
    label.textContent = "Insufficient data for a read";
    raiEl.textContent = "";
    chart.hidden = true;
    return;
  }

  label.textContent = r.label;
  $("needle").style.left = r.needle + "%";
  $("regimeTrack").setAttribute("aria-valuenow", Math.round(r.needle));
  $("regimeTrack").setAttribute("aria-valuetext", r.label);

  if (r.mode === "heuristic") {
    raiEl.textContent = "Heuristic mode · z-history unavailable";
    chart.hidden = true;
    return;
  }

  const wTag = r.weights ? "PCA weights · PC1 " + Math.round(r.explained * 100) + "%" : "equal weights";
  raiEl.textContent = "RAI " + (r.rai >= 0 ? "+" : "") + r.rai.toFixed(2) + "σ · " + r.inputs + " inputs · " + wTag;

  if (r.history) {
    chart.innerHTML = lineChart(r.history.slice(-220), { id: "rai", w: 600, h: 56, pad: 4, zero: true, color: "#D9A84E" });
    chart.hidden = false;
  } else {
    chart.hidden = true;
  }

  if (weightsEl) {
    weightsEl.textContent = r.weights
      ? "Current PC1 weights: " + r.ids.map(id => SHORT[id] + " " + r.weights[id].toFixed(2)).join(", ") +
        ". PC1 explains " + Math.round(r.explained * 100) + "% of input variance. The history strip applies the current weights retrospectively; the label and needle use a 3-day average of the index to avoid threshold flicker."
      : "Weights: equal this session (PCA needs more overlapping history). The label and needle use a 3-day average of the index.";
  }
}
