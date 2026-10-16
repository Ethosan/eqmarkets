/* Market bias card: next day / week / month read for ES or NQ, with confidence,
   the signals behind it and the model's out-of-sample record. Loaded after the
   first refresh so it never delays the dashboard. */
import { cachedBias, computeBias } from "../model/bias.js";
import { $ } from "./format.js";

const KEY = "eqm.bias.view";
let data = null, inst = "es", hz = "m", busy = false;
try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); inst = v.inst || inst; hz = v.hz || hz; } catch { /* storage blocked */ }
const saveView = () => { try { localStorage.setItem(KEY, JSON.stringify({ inst, hz })); } catch { /* storage blocked */ } };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sgn = (x, dp = 1) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(dp);
const pc = (x, dp = 0) => (x == null || !isFinite(x) ? "—" : Math.round(x * 100 * 10 ** dp) / 10 ** dp + "%");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = d => { const t = new Date(d + "T00:00:00Z"); return MON[t.getUTCMonth()] + " " + t.getUTCFullYear(); };
const TONE = { Bullish: "u", Bearish: "d", Neutral: "n" };

function render() {
  const body = $("biasBody");
  document.querySelectorAll("#biasInst button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.inst === inst)));
  if (!data || !data[inst]) return;
  const d = data[inst];
  const name = inst === "es" ? "ES" : "NQ";
  $("biasAsOf").textContent = "Closes to " + d.asOf + (data.fresh ? "" : " · updating");

  body.querySelector(".bias-cols").innerHTML = d.horizons.map(x => {
    const n = x.now;
    if (!n) return `<button type="button" class="bias-col" data-hz="${x.key}" aria-pressed="${x.key === hz}"><span class="bias-h">${x.label}</span><span class="bias-l n">—</span><span class="bias-p">Not enough history</span></button>`;
    const move = (Math.exp(n.F) - 1) * 100, typ = n.sigma * 100;
    let conf = "";
    if (n.label === "Neutral") {
      conf = '<span class="bias-conf n">No tilt</span><span class="bias-why">' +
        (n.lambda < 0.05 ? "The models haven't beaten the long-run average lately, so they get no weight." : "The models lean too little to call.") + "</span>";
    } else {
      const w = n.why;
      conf = `<span class="bias-conf ${n.confidence.toLowerCase()}">${n.confidence} confidence</span>` +
        (w?.right != null ? `<span class="bias-why">Past ${n.label.toLowerCase()} calls beat the average ${pc(w.right)} of the time (${w.n.toLocaleString("en-US")} calls) vs ${pc(w.chance)} by chance</span>` : "");
    }
    return `<button type="button" class="bias-col" data-hz="${x.key}" aria-pressed="${x.key === hz}">` +
      `<span class="bias-h">${x.label}</span><span class="bias-l ${TONE[n.label]}">${n.label}</span>` +
      `<span class="bias-p num">${pc(n.p)} chance ${name} is higher, vs ${pc(n.base)} normally · expected ${sgn(move, 2)}% (typical move ±${typ.toFixed(1)}%)</span>${conf}</button>`;
  }).join("");

  const cur = d.horizons.find(x => x.key === hz) || d.horizons[d.horizons.length - 1];
  const n = cur.now, ev = cur.ev;
  const bars = body.querySelector(".bias-drivers");
  if (n) {
    const max = Math.max(1e-9, ...n.contrib.map(c => Math.abs(c.c)));
    bars.innerHTML = n.contrib.slice().sort((a, b) => b.c - a.c).map(c => {
      const w = Math.abs(c.c) / max * 50;
      return `<li title="${esc(c.src)} · weight ${pc(c.w)}"><span class="cb-l">${esc(c.label)} <em>${pc(c.w)}</em></span>` +
        `<span class="cb-bar"><i class="${c.c >= 0 ? "u" : "d"}" style="${c.c >= 0 ? "left" : "right"}:50%;width:${w.toFixed(1)}%"></i></span>` +
        `<span class="cb-v num">${sgn(c.c * 1e4, 1)}</span></li>`;
    }).join("");
    $("biasDrvCap").textContent = cur.label + ": each signal's pull on the forecast versus the long-run average, in bp, after the models' " + pc(n.lambda) +
      " weight · its share of the combination in grey · " + Math.round(n.agree * 100) + "% of that share leans the same way";
  } else bars.innerHTML = "";

  $("biasTrack").innerHTML = ev
    ? `<b>Track record, ${cur.label.toLowerCase()}:</b> ${ev.n.toLocaleString("en-US")} walk-forward forecasts, ${monthYear(ev.from)} to ${monthYear(ev.to)}, each made before its outcome. ` +
      `Out-of-sample R² ${sgn(ev.r2 * 100, 2)}% against the long-run average (models alone ${sgn(ev.r2Raw * 100, 2)}%, equal weights ${sgn(ev.r2Equal * 100, 2)}%), Clark–West p ${ev.cwP < 0.001 ? "<0.001" : ev.cwP.toFixed(3)}. ` +
      (ev.bull.n ? `Bullish calls beat the average ${pc(ev.bull.right)} of the time (${ev.bull.n.toLocaleString("en-US")}); ` : "") +
      (ev.bear.n ? `bearish calls fell short of it ${pc(ev.bear.right)} (${ev.bear.n.toLocaleString("en-US")}); ` : "") +
      `${name} rose in ${pc(ev.upRate)} of all periods. Using it instead of the long-run average, a mean–variance investor gained ${sgn(ev.cerGain * 100, 2)}% a year in certainty-equivalent return. ` +
      `Above zero on R² and the utility gain is what would show real skill; below zero, the dashboard says so rather than hiding it.`
    : "";
}

async function refresh(force) {
  if (busy) return;
  const c = cachedBias();
  if (c) { data = c; render(); $("biasBody").hidden = false; $("biasLoad").hidden = true; }
  if (c?.fresh && !force) return;
  busy = true;
  if (!c) { $("biasLoad").hidden = false; $("biasLoad").textContent = "Backtesting ES and NQ since 2000…"; }
  try {
    const out = await computeBias((dn, t) => { if (!c) $("biasLoad").textContent = "Loading daily history since 2000 · " + dn + "/" + t; });
    if (out) { data = out; $("biasBody").hidden = false; $("biasLoad").hidden = true; render(); }
    else if (!c) $("biasLoad").textContent = "Couldn't load enough history right now. It retries on your next visit.";
  } finally {
    busy = false;
  }
}

export function initBias() {
  $("biasInst").addEventListener("click", e => {
    const b = e.target.closest("button[data-inst]");
    if (!b) return;
    inst = b.dataset.inst; saveView(); render();
  });
  $("biasBody").addEventListener("click", e => {
    const b = e.target.closest("button[data-hz]");
    if (!b) return;
    hz = b.dataset.hz; saveView(); render();
  });
  refresh();
  /* Re-run when the cache goes stale while the page stays open. */
  setInterval(() => { if (!cachedBias()?.fresh) refresh(); }, 15 * 60_000);
}
