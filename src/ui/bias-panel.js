/* Market bias card: one plain sentence, a small table for the next day, week
   and month, what's pushing the selected read, and its record in plain
   answers. Loaded after the first refresh so it never delays the dashboard. */
import { cachedBias, computeBias } from "../model/bias.js";
import { $ } from "./format.js";

const KEY = "eqm.bias.view";
let data = null, inst = "es", hz = "m", busy = false;
try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); inst = v.inst || inst; hz = v.hz || hz; } catch { /* storage blocked */ }
const saveView = () => { try { localStorage.setItem(KEY, JSON.stringify({ inst, hz })); } catch { /* storage blocked */ } };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pc = x => (x == null || !isFinite(x) ? "—" : Math.round(x * 100) + "%");
const bp = x => (x >= 0 ? "+" : "−") + Math.abs(x * 1e4).toFixed(1);
const year = d => d.slice(0, 4);
const TONE = { Bullish: "u", Bearish: "d", Neutral: "n" };
const SHORT = { d: "day", w: "week", m: "month" };

/* "ES leans bullish over the next week and month." */
function lede(name, horizons) {
  const withReads = horizons.filter(x => x.now);
  const dead = withReads.length && withReads.every(x => x.now.noSignal);
  const leaning = horizons.filter(x => x.now && x.now.label !== "Neutral");
  if (!leaning.length) return "No clear lean on " + name + " right now.";
  const groups = ["Bullish", "Bearish"].map(lab => leaning.filter(x => x.now.label === lab).map(x => SHORT[x.key])).filter(g => g.length);
  const words = g => (g.length > 1 ? g.slice(0, -1).join(", ") + " and " + g[g.length - 1] : g[0]);
  const parts = ["Bullish", "Bearish"].filter(lab => leaning.some(x => x.now.label === lab))
    .map((lab, i) => lab.toLowerCase() + " over the next " + words(groups[i]));
  /* Say how much to trust it in the same breath: the weakest grade among the leans. */
  const order = ["Low", "Medium", "High"];
  const weakest = leaning.map(x => x.now.confidence).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  const noEdge = leaning.some(x => x.now.why?.right != null && x.now.why.right < x.now.why.chance + 0.01);
  const deadLine = dead ? " None of its signals has a usable relationship with recent data right now, so these reads are just the long-run average." : "";
  return name + " leans " + parts.join(", and ") + ", with " + weakest.toLowerCase() + " confidence." +
    (noEdge ? " Past calls like this did no better than other days." : "") + deadLine;
}

function stateLine(state) {
  if (state === 1) return "Volatility is above its one-year norm, so it's reading this as a stressed market.";
  if (state === 0) return "Volatility is below its one-year norm, so it's reading this as a calm market.";
  return "";
}

/* Plain-language verdict on out-of-sample R² against the long-run average. */
const vs = r2 => (r2 == null ? "not enough history" : r2 > 0.001 ? "beats the long-run average" : r2 < -0.001 ? "worse than the long-run average" : "about the same as the long-run average");

function render() {
  document.querySelectorAll("#biasInst button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.inst === inst)));
  if (!data || !data[inst]) return;
  const d = data[inst];
  const name = inst === "es" ? "ES" : "NQ";
  const state = d.horizons.find(x => x.now)?.now.state ?? null;
  $("biasAsOf").textContent = "Closes to " + d.asOf + (data.fresh ? "" : " · updating");
  $("biasLede").innerHTML = "<b>" + esc(lede(name, d.horizons)) + "</b> " + esc(stateLine(state));

  $("biasRows").innerHTML = d.horizons.map(x => {
    const n = x.now;
    const sel = x.key === hz;
    if (!n) return `<tr><th scope="row">Next ${SHORT[x.key]}</th><td colspan="3" class="muted">Not enough history</td></tr>`;
    let conf = '<span class="muted">No lean</span>';
    if (n.noSignal) {
      conf = '<span class="muted">No working signal</span>' +
        '<span class="bias-sub">recent moves contradict every signal’s usual direction, so this is the long-run-average read</span>';
    } else if (n.label !== "Neutral") {
      const w = n.why;
      conf = `<span class="bias-c ${n.confidence.toLowerCase()}">${n.confidence}</span>` +
        (w?.right != null ? `<span class="bias-sub">right ${pc(w.right)} of ${w.n.toLocaleString("en-US")} past calls${w.inState ? " in " + (state ? "stressed" : "calm") + " markets" : ""}, vs ${pc(w.chance)} on other days</span>` : "");
    }
    return `<tr class="${sel ? "on" : ""}"><th scope="row"><button type="button" data-hz="${x.key}" aria-pressed="${sel}">Next ${SHORT[x.key]}</button></th>` +
      `<td class="bias-l ${TONE[n.label]}">${n.label}</td>` +
      `<td class="num">${pc(n.p)} <span class="bias-sub">usually ${pc(n.base)}</span></td><td>${conf}</td></tr>`;
  }).join("");

  const cur = d.horizons.find(x => x.key === hz) || d.horizons[d.horizons.length - 1];
  const n = cur.now, ev = cur.ev;
  const bars = $("biasDrivers");
  if (n) {
    const max = Math.max(1e-9, ...n.contrib.map(c => Math.abs(c.c)));
    bars.innerHTML = n.contrib.slice().sort((a, b) => b.c - a.c).map(c => {
      const w = Math.abs(c.c) / max * 50;
      return `<li title="${esc(c.src)}"><span class="cb-l">${esc(c.label)}</span>` +
        `<span class="cb-bar"><i class="${c.c >= 0 ? "u" : "d"}" style="${c.c >= 0 ? "left" : "right"}:50%;width:${w.toFixed(1)}%"></i></span>` +
        `<span class="cb-v num">${bp(c.c)}</span></li>`;
    }).join("");
    $("biasDrvCap").textContent = n.noSignal
      ? "Nothing is pushing the next-" + SHORT[cur.key] + " read: recent moves contradict every signal's usual direction, so it's the long-run average."
      : "What's pushing the next-" + SHORT[cur.key] + " read, in basis points versus a normal " + SHORT[cur.key] +
        (n.lambda < 0.2 ? ". The models get little say right now because their recent record is weak." : ".");
  } else bars.innerHTML = "";

  const condRow = () => {
    const c = d.cond;
    if (!c) return "";
    if (!c.match || !c.h[1]) return `<div><dt>After a week like this</dt><dd>Too few comparable weeks (${esc(c.label)}) to count a record</dd></div>`;
    const sgnS = x => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2);
    const sgnBp = x => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(0) + "bp";
    const matched = c.match === "regime+momentum" ? " · matched to this week's volatility regime and momentum direction"
      : c.match === "regime" ? " · matched to this week's volatility regime"
      : c.match === "momentum" ? " · matched to this week's momentum direction" : "";
    const d1 = c.h[1], w1 = c.h[5];
    return `<div><dt>After a week like this</dt><dd>` +
      `A 5-day move ${esc(c.label)} — this week ${sgnS(c.rev)}σ — has been followed by a higher next day ${pc(d1.up)} of the time (${d1.n.toLocaleString("en-US")} weeks since 2000, avg ${sgnBp(d1.meanBp)})` +
      (w1 ? `, and a higher next week ${pc(w1.up)} (avg ${sgnBp(w1.meanBp)})` : "") +
      `<span class="bias-sub">${matched}. Short-term reversal, not momentum: the continuation edge, when there is one, lives at the monthly scale.</span></dd></div>`;
  };
  if (ev) {
    const calm = ev.byState?.[0], str = ev.byState?.[1];
    /* A call shows skill if it goes its way more often than on the days it isn't made. */
    const row = (title, g, what) => `<div><dt>${title}</dt><dd>${g.n >= 20 ? `Right ${pc(g.right)} of the time, vs ${pc(g.others)} on other days <span class="bias-sub">${g.n.toLocaleString("en-US")} calls; right means ${name} ${what} its long-run average</span>` : "Too few calls to judge"}</dd></div>`;
    $("biasRecord").innerHTML =
      `<div><dt>Beats a plain average?</dt><dd>${ev.r2 > 0.001 && ev.cwP < 0.1 ? "Yes" : ev.r2 > 0 ? "Slightly, not reliably" : "No"} <span class="bias-sub">${year(ev.from)}–${year(ev.to)}, p ${ev.cwP < 0.001 ? "<0.001" : ev.cwP.toFixed(2)}</span></dd></div>` +
      `<div><dt>Calm markets</dt><dd>${esc(vs(calm?.r2))}</dd></div>` +
      `<div><dt>Stressed markets</dt><dd>${esc(vs(str?.r2))}</dd></div>` +
      row("Bullish calls", ev.bull, "beat") + row("Bearish calls", ev.bear, "fell short of") + condRow();
  } else $("biasRecord").innerHTML = condRow();
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
