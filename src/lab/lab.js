/* Backtest lab (admin only, opened with ?admin=1). Loads long daily history,
   rebuilds the three models point-in-time, overlays them on an instrument and
   backtests rule-based strategies against buy and hold, including custom JS
   rules. Everything runs in the browser; window.eqlab exposes it to the console. */
import "../styles/lab.css";
import { INSTRUMENTS, MODEL_COUNT, buildFrame, loadInstrument, loadModelSeries } from "./data.js";
import { plot } from "./plot.js";
import {
  PRESETS, compileRule, drawdownPath, metrics, runRule, simulate, startIndex, volTarget,
} from "../quant/backtest.js";
import { regimeLabel } from "../quant/models.js";
import { stepDp } from "../ui/format.js";

const KEY = "eqm.lab";
const COLORS = {
  bh: "#8B92A0", rai: "#D9A84E", raiscale: "#E58F5B", ar: "#6E8BD9", rec: "#9C8FE0",
  combo: "#E56E76", trend: "#4FC1D9", custom: "#F2F3F5",
};
const RANGE_LABEL = { "2y": "2Y", "5y": "5Y", "10y": "10Y", max: "Max" };
const GREEN = a => `rgba(61, 214, 140, ${a})`;
const RED = a => `rgba(242, 85, 90, ${a})`;

const DEFAULT_CODE = `// Return the position to hold from the next bar: 1 long, 0 flat,
// 0.5 half, -1 short. Return null to keep the previous position.
if (ctx.raiS == null || ctx.dAR == null) return null;
const uptrend = ctx.price > (ctx.sma(100) ?? Infinity);
if (ctx.dAR >= 1 && ctx.raiS < 0) return 0;   // fragile and risk-off
return uptrend ? 1 : 0.5;`;

const PRESET_BY_ID = Object.fromEntries(PRESETS.map(p => [p.id, { ...p, rule: compileRule(p.code) }]));

const settings = {
  inst: "nq", range: "5y", lag: 1, cost: 1, vt: 0, log: true, overlay: "rai",
  on: ["bh", "rai", "ar", "rec", "combo"], code: DEFAULT_CODE,
};
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { /* storage blocked or bad JSON */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage blocked */ } };

const modelCache = {}, instCache = {};
const sync = new Set();
let frame = null, custom = null, loadToken = 0, last = null;
let q;

/* ------------------------------------------------------------- formatting */
const sgn = (x, dp = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(dp);
const pct = (x, dp = 1, signed = false) => (x == null || !isFinite(x) ? "—" : (signed ? sgn(x * 100, dp) : (x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(dp)) + "%");
const num = (x, dp = 2) => (x == null || !isFinite(x) ? "—" : x < 0 ? "−" + Math.abs(x).toFixed(dp) : x.toFixed(dp));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longDate = d => { const t = new Date(d + "T00:00:00Z"); return t.getUTCDate() + " " + MON[t.getUTCMonth()] + " " + t.getUTCFullYear(); };
const priceFmt = v => v.toLocaleString("en-US", { minimumFractionDigits: v >= 1000 ? 0 : 2, maximumFractionDigits: v >= 1000 ? 0 : 2 });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* Contiguous runs of the same shade colour, for chart backgrounds. */
function shadeRuns(values, colorOf) {
  const out = [];
  let cur = null;
  values.forEach((v, i) => {
    const c = v == null ? null : colorOf(v);
    if (cur && cur.color === c) { cur.i1 = i; return; }
    if (cur) out.push(cur);
    cur = c ? { i0: i, i1: i, color: c } : null;
  });
  if (cur) out.push(cur);
  return out;
}

/* ------------------------------------------------------------------ markup */
function skeleton() {
  return `
  <div class="lab-head">
    <h2 class="lab-title">Backtest lab</h2>
    <span class="lab-badge">Admin</span>
    <span class="lab-status num" id="labStatus" aria-live="polite"></span>
  </div>
  <div class="lab-controls">
    <label class="lab-field"><span>Instrument</span>
      <select id="labInst">${INSTRUMENTS.map(i => `<option value="${i.id}">${i.label}</option>`).join("")}</select></label>
    <div class="lab-field"><span id="labRangeL">History</span>
      <div class="seg" id="labRange" role="group" aria-labelledby="labRangeL">${Object.entries(RANGE_LABEL)
        .map(([k, l]) => `<button type="button" data-range="${k}" aria-pressed="false">${l}</button>`).join("")}</div></div>
    <label class="lab-field"><span>Execution</span>
      <select id="labLag"><option value="1">Signal close</option><option value="2">Next close</option></select></label>
    <label class="lab-field"><span>Cost, bp per side</span>
      <input id="labCost" type="number" min="0" max="50" step="0.5" inputmode="decimal"></label>
    <label class="lab-field"><span>Vol target</span>
      <select id="labVt"><option value="0">Off</option><option value="0.1">10%</option><option value="0.15">15%</option><option value="0.2">20%</option></select></label>
  </div>

  <div class="m-card lab-card">
    <div class="lab-card-head">
      <h3 class="m-kicker">Price and model overlay</h3>
      <label class="lab-inline">Shade by <select id="labOverlay"></select></label>
      <label class="lab-inline"><input type="checkbox" id="labLog"> Log scale</label>
    </div>
    <div id="labPrice" class="lab-plot"></div>
    <p class="m-cap" id="labModelCap"></p>
    <div id="labModel" class="lab-plot"></div>
    <p class="m-cap" id="labMeta"></p>
  </div>

  <div class="m-card lab-card">
    <div class="lab-card-head"><h3 class="m-kicker">Strategies</h3></div>
    <div class="lab-chips" id="labChips" role="group" aria-label="Strategies to compare"></div>
    <p class="m-cap lab-skip" id="labSkip" hidden></p>
    <p class="m-cap" id="labWindow"></p>
    <div id="labEquity" class="lab-plot"></div>
    <p class="m-cap">Drawdown from peak</p>
    <div id="labDD" class="lab-plot"></div>
    <div class="lab-tablewrap"><table class="lab-table num" id="labTable"></table></div>
    <p class="m-cap lab-foot">Futures use Yahoo's continuous front-month series, so roll gaps count as returns. QQQ and SPY use dividend-adjusted closes. Flat earns nothing, and Sharpe uses a zero risk-free rate. FRED inputs (recession model, HY OAS) are lagged one business day to match when they are published. Past performance in a backtest is not a forecast.</p>
    <div class="lab-actions"><button type="button" class="lab-btn" id="labCsv">Download CSV</button></div>
  </div>

  <div class="m-card lab-card">
    <div class="lab-card-head">
      <h3 class="m-kicker">Custom rule · JavaScript</h3>
      <label class="lab-inline">Load <select id="labPreset"><option value="">a preset…</option>${PRESETS
        .map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}<option value="default">the example</option></select></label>
    </div>
    <textarea id="labCode" class="lab-code" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off" rows="10" aria-label="Custom rule code"></textarea>
    <div class="lab-actions">
      <button type="button" class="lab-btn lab-run" id="labRun">Run rule</button>
      <span class="lab-out" id="labOut" aria-live="polite"></span>
    </div>
    <details class="lab-help">
      <summary>Rule reference</summary>
      <p>The rule is the body of <code>function (ctx)</code>, called once per bar with data up to that bar only. Return a position or <code>null</code>; values are clipped to ±3.</p>
      <dl>
        <dt><code>ctx.price</code></dt><dd>instrument close</dd>
        <dt><code>ctx.rai</code> · <code>ctx.raiS</code></dt><dd>Risk Appetite Index, raw and 3-day mean (σ)</dd>
        <dt><code>ctx.ar</code> · <code>ctx.dAR</code></dt><dd>absorption ratio (0–1) and its standardized shift (σ)</dd>
        <dt><code>ctx.rec</code></dt><dd>NY Fed 12-month recession probability (0–1)</dd>
        <dt><code>ctx.vix</code></dt><dd>VIX close</dd>
        <dt><code>ctx.sma(n)</code> · <code>ctx.ret(n)</code> · <code>ctx.vol(n)</code></dt><dd>n-bar average, log return, annualized vol of the instrument</dd>
        <dt><code>ctx.get(field, k)</code></dt><dd>any field k bars ago</dd>
        <dt><code>ctx.prev</code> · <code>ctx.state</code></dt><dd>last returned position; an object kept across bars</dd>
        <dt><code>ctx.i</code> · <code>ctx.date</code></dt><dd>bar index and ISO date</dd>
      </dl>
      <p>Console: <code>eqlab.test(ctx =&gt; ctx.raiS &gt; 0 ? 1 : 0)</code> backtests a rule against buy and hold and prints a table. <code>eqlab.frame</code> holds the aligned data.</p>
    </details>
  </div>`;
}

/* -------------------------------------------------------------------- data */
const status = t => { q("labStatus").textContent = t; };
const inst = () => INSTRUMENTS.find(i => i.id === settings.inst) || INSTRUMENTS[0];

function modelsFor(range) {
  if (!modelCache[range]) {
    modelCache[range] = loadModelSeries(range, (d, t) => status("Loading " + RANGE_LABEL[range] + " history · " + d + "/" + t))
      /* Partial loads are not cached, so picking the range again retries what failed. */
      .then(S => { if (Object.keys(S).length < MODEL_COUNT) delete modelCache[range]; return S; });
  }
  return modelCache[range];
}

function instrumentFor(it, range) {
  const k = it.id + "|" + range;
  if (!instCache[k]) instCache[k] = loadInstrument(it, range).then(s => { if (!s) delete instCache[k]; return s; });
  return instCache[k];
}

async function load() {
  const token = ++loadToken;
  const it = inst(), range = settings.range;
  status("Loading " + RANGE_LABEL[range] + " history…");
  q("labPanel").classList.add("busy");
  const [S, series] = await Promise.all([modelsFor(range), instrumentFor(it, range)]);
  if (token !== loadToken) return;
  if (!series || series.values.length < 300) {
    status("Couldn't load " + it.symbol + " history. Try again or pick another range.");
    q("labPanel").classList.remove("busy");
    return;
  }
  status("Rebuilding models…");
  await new Promise(r => setTimeout(r, 30));
  const t0 = performance.now();
  frame = buildFrame(S, series);
  frame.meta.symbol = it.symbol;
  frame.meta.ppy = it.ppy || 252;
  frame.meta.ms = Math.round(performance.now() - t0);
  q("labPanel").classList.remove("busy");
  const meta = frame.meta;
  q("labMeta").textContent = "RAI from " + meta.raiInputs.length + "/" + meta.raiTotal + " inputs · AR over " + meta.arAssets.length + " assets" +
    (meta.missing.length ? " · didn't load: " + meta.missing.join(", ") + " (pick the range again to retry)" : "") + ".";
  run();
}

/* -------------------------------------------------------------------- run */
function strategies() {
  const list = settings.on
    .map(id => (id === "custom" ? custom && { id, name: "Custom", rule: custom } : PRESET_BY_ID[id]))
    .filter(Boolean);
  return list;
}

function run() {
  if (!frame) return;
  const t0 = performance.now();
  const ppy = frame.meta.ppy, lag = settings.lag;
  const bhTargets = frame.price.map(() => 1);
  const list = strategies();
  const targets = {};
  for (const s of list) {
    try {
      let t = s.id === "bh" ? bhTargets : runRule(frame, s.rule, { ppy });
      if (settings.vt > 0 && s.id !== "bh") t = volTarget(t, frame.price, { target: settings.vt, ppy });
      targets[s.id] = t;
    } catch (e) {
      if (s.id === "custom") { custom = null; out("Error at " + e.message, true); renderChips(); }
    }
  }
  /* A model whose inputs didn't load gives a rule no signal at all; leave that
     strategy out rather than blanking the comparison. */
  const silent = list.filter(s => targets[s.id] && !targets[s.id].some(x => x != null));
  const active = list.filter(s => targets[s.id] && !silent.includes(s));
  const start = startIndex([bhTargets, ...active.map(s => targets[s.id])], lag);
  const n = frame.dates.length;
  q("labSkip").hidden = !silent.length;
  q("labSkip").textContent = silent.length
    ? "No signal from " + silent.map(s => s.name).join(", ") + " in this data, so " + (silent.length > 1 ? "they're" : "it's") +
      " left out. Usually a model input didn't load (see the note under the price chart); try again in a minute."
    : "";
  if (start < 0 || n - start < 40 || !active.length) {
    q("labWindow").textContent = "Not enough overlapping signal history for this selection. Try a longer range or fewer strategies.";
    last = null;
    renderPrice(null);
    status(RANGE_LABEL[settings.range] + " · " + frame.meta.symbol + " · nothing to compare");
    return;
  }
  const opt = { lag, costBp: settings.cost, start };
  const bench = simulate(frame.price, bhTargets, opt);
  const sims = Object.fromEntries(active.map(s => [s.id, s.id === "bh" ? bench : simulate(frame.price, targets[s.id], opt)]));
  const stats = Object.fromEntries(active.map(s => [s.id, metrics(frame.dates, sims[s.id], { ppy, bench: bench.ret })]));
  last = { active, sims, stats, start, targets };
  render();
  status(RANGE_LABEL[settings.range] + " · " + frame.meta.symbol + " · models " + frame.meta.ms + " ms, backtest " + Math.round(performance.now() - t0) + " ms");
}

/* ----------------------------------------------------------------- render */
function overlayOptions() {
  const base = [["rai", "RAI regime"], ["dar", "Fragility (ΔAR)"], ["rec", "Recession odds"], ["none", "Nothing"]];
  const pos = (last?.active || []).filter(s => s.id !== "bh").map(s => ["pos:" + s.id, "Position · " + s.name]);
  const opts = [...base, ...pos];
  if (!opts.some(([v]) => v === settings.overlay)) settings.overlay = "rai";
  q("labOverlay").innerHTML = opts.map(([v, l]) => `<option value="${v}"${v === settings.overlay ? " selected" : ""}>${esc(l)}</option>`).join("");
}

function renderPrice(win) {
  const ov = settings.overlay;
  if (!win) {
    plot(q("labPrice"), { dates: null, series: [] });
    plot(q("labModel"), { dates: null, series: [] });
    return;
  }
  const { s0 } = win;
  const dates = frame.dates.slice(s0);
  const slice = k => frame[k].slice(s0);
  let shade = [], model = null, cap = "";
  if (ov === "rai") {
    shade = shadeRuns(slice("raiS"), v => (v >= 0.75 ? GREEN(0.16) : v >= 0.25 ? GREEN(0.07) : v <= -0.75 ? RED(0.18) : v <= -0.25 ? RED(0.08) : null));
    cap = "Risk Appetite Index, 3-day mean (σ). Green: risk-on, red: risk-off; darker beyond ±0.75σ.";
    model = { series: [{ label: "RAI", values: slice("raiS"), color: COLORS.rai }], band: [-0.75, 0.75], refs: [0],
      format: v => sgn(v) + "σ · " + regimeLabel(v), tick: (v, st) => (Math.abs(v) < 1e-9 ? "0" : sgn(v, stepDp(st))) + "σ" };
  } else if (ov === "dar") {
    shade = shadeRuns(slice("dAR"), v => (v >= 1 ? RED(0.18) : v <= -1 ? GREEN(0.1) : null));
    cap = "Absorption ratio shift ΔAR (σ). Red: ≥ +1σ, markets coupling (fragile). Green: ≤ −1σ.";
    model = { series: [{ label: "ΔAR", values: slice("dAR"), color: COLORS.ar }], refs: [-1, 1],
      format: (v, s, i) => sgn(v) + "σ · AR " + pct(frame.ar[s0 + i], 0), tick: (v, st) => sgn(v, stepDp(st)) + "σ" };
  } else if (ov === "rec") {
    shade = shadeRuns(slice("rec"), v => (v >= 0.3 ? RED(0.14) : null));
    cap = "NY Fed 12-month recession probability. Red: 30% or more.";
    const vals = slice("rec");
    model = { series: [{ label: "Recession", values: vals, color: COLORS.rec }], refs: [0.3],
      domain: [0, Math.max(0.6, ...vals.filter(v => v != null)) * 1.05],
      format: v => pct(v, 1), tick: (v, st) => (v * 100).toFixed(stepDp(st * 100)) + "%" };
  } else if (ov.startsWith("pos:")) {
    const id = ov.slice(4);
    const sim = last.sims[id];
    const p = sim.pos.slice(s0);
    shade = shadeRuns(p, v => (v >= 0.999 ? GREEN(0.14) : v > 1e-9 ? GREEN(0.06) : v < -1e-9 ? RED(0.16) : null));
    const name = last.active.find(s => s.id === id).name;
    cap = "Position held by " + name + ", after the execution lag. Green: long (darker = full size), red: short.";
    model = { series: [{ label: "Position", values: p, color: COLORS[id], step: true }], refs: [0],
      domain: [Math.min(0, ...p) - 0.05, Math.max(1, ...p) + 0.05], format: v => num(v, 2) + "×", tick: (v, st) => v.toFixed(stepDp(st)) + "×" };
  }
  const it = inst();
  plot(q("labPrice"), {
    dates, sync, height: 260, log: settings.log, shade, label: it.label,
    series: [{ label: it.label.split(" · ")[0], values: frame.price.slice(s0), color: "#C9CDD4", width: 1.4 }],
    format: v => priceFmt(v), tick: v => (v >= 1000 ? Math.round(v).toLocaleString("en-US") : String(+v.toFixed(2))),
  });
  q("labModelCap").textContent = cap;
  q("labModel").hidden = !model;
  q("labModelCap").hidden = !model;
  if (model) plot(q("labModel"), { dates, sync, height: 110, label: cap, ...model });
}

function render() {
  const { active, sims, stats, start } = last;
  const dates = frame.dates.slice(start);
  const m0 = stats[active[0].id];
  q("labWindow").textContent = "Test window " + longDate(frame.dates[start]) + " to " + longDate(frame.dates[frame.dates.length - 1]) +
    " · " + m0.years.toFixed(1) + " years, " + m0.bars.toLocaleString("en-US") + " bars · " +
    (settings.lag === 1 ? "trades on the signal's close" : "trades one close later") + ", " + settings.cost + " bp per side" +
    (settings.vt > 0 ? ", vol target " + Math.round(settings.vt * 100) + "%" : "") +
    ". Starts when every selected strategy has a signal.";

  overlayOptions();
  renderPrice({ s0: start });


  plot(q("labEquity"), {
    dates, sync, height: 260, log: true, label: "Growth of $1",
    series: active.map(s => ({ label: s.name, values: sims[s.id].equity.slice(start), color: COLORS[s.id], width: s.id === "bh" ? 1.3 : 1.7, dash: s.id === "bh" ? "4 3" : null })),
    format: v => "$" + v.toFixed(2) + " (" + sgn((v - 1) * 100, 0) + "%)", tick: v => "$" + (v >= 10 ? v.toFixed(0) : +v.toFixed(2)),
  });
  const dd = active.map(s => ({ label: s.name, values: drawdownPath(sims[s.id].equity, start).slice(start), color: COLORS[s.id], width: s.id === "bh" ? 1.2 : 1.5, dash: s.id === "bh" ? "4 3" : null }));
  const ddMin = Math.min(...dd.flatMap(s => s.values.filter(v => v != null)));
  plot(q("labDD"), {
    dates, sync, height: 120, legend: false, label: "Drawdown", domain: [Math.min(-0.01, ddMin * 1.05), 0], series: dd,
    format: v => pct(v, 1), tick: (v, st) => (Math.abs(v) < 1e-9 ? "0" : (v * 100).toFixed(stepDp(st * 100))) + "%",
  });

  const cols = ["Strategy", "CAGR", "Vol", "Sharpe", "Sortino", "Max DD", "Calmar", "Exposure", "Trades/yr", "Hit rate", "β", "$1 →"];
  const best = Math.max(...active.map(s => stats[s.id]?.sharpe ?? -Infinity));
  q("labTable").innerHTML = "<thead><tr>" + cols.map(c => `<th scope="col">${c}</th>`).join("") + "</tr></thead><tbody>" +
    active.map(s => {
      const m = stats[s.id];
      if (!m) return "";
      const tone = x => (x == null ? "" : x < 0 ? ' class="d"' : "");
      return `<tr><th scope="row" title="${esc(s.desc || "Your custom rule")}"><i style="background:${COLORS[s.id]}"></i>${esc(s.name)}</th>` +
        `<td${tone(m.cagr)}>${pct(m.cagr, 1, true)}</td><td>${pct(m.vol, 1)}</td>` +
        `<td${m.sharpe === best && active.length > 1 ? ' class="best"' : tone(m.sharpe)}>${num(m.sharpe)}</td><td>${num(m.sortino)}</td>` +
        `<td class="d">${pct(m.mdd, 1)}</td><td>${num(m.calmar)}</td><td>${pct(m.exposure, 0)}</td>` +
        `<td>${num(m.tradesPerYear, 1)}</td><td>${pct(m.hit, 0)}</td><td>${num(m.beta)}</td><td>$${(1 + m.total).toFixed(2)}</td></tr>`;
    }).join("") + "</tbody>";
}

function renderChips() {
  const all = [...PRESETS, { id: "custom", name: "Custom", desc: custom ? "Your rule from the editor below" : "Run a rule in the editor below to enable" }];
  q("labChips").innerHTML = all.map(s => {
    const on = settings.on.includes(s.id) && (s.id !== "custom" || custom);
    return `<button type="button" class="lab-chip" data-id="${s.id}" aria-pressed="${on}" title="${esc(s.desc)}"${s.id === "custom" && !custom ? " disabled" : ""}>` +
      `<i style="background:${COLORS[s.id]}"></i>${esc(s.name)}</button>`;
  }).join("");
}

function out(text, err) {
  const o = q("labOut");
  o.textContent = text;
  o.classList.toggle("err", !!err);
}

/* ------------------------------------------------------------------- CSV */
function downloadCsv() {
  if (!last) return;
  const { active, sims, start } = last;
  const head = ["date", "price", "rai", "rai_3d", "ar", "dar", "rec_prob", ...active.flatMap(s => ["pos_" + s.id, "equity_" + s.id])];
  const f = (v, dp = 6) => (v == null || !isFinite(v) ? "" : +v.toFixed(dp));
  const rows = [head.join(",")];
  for (let i = start; i < frame.dates.length; i++) {
    rows.push([frame.dates[i], f(frame.price[i], 4), f(frame.rai[i]), f(frame.raiS[i]), f(frame.ar[i]), f(frame.dAR[i]), f(frame.rec[i]),
      ...active.flatMap(s => [f(sims[s.id].pos[i], 4), f(sims[s.id].equity[i] / sims[s.id].equity[start])])].join(","));
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
  a.download = "eqlab-" + settings.inst + "-" + settings.range + "-" + frame.dates[frame.dates.length - 1] + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ------------------------------------------------------------------ editor */
function compileCustom(quiet) {
  const code = q("labCode").value;
  try {
    const fn = compileRule(code);
    if (frame) runRule(frame, fn, { ppy: frame.meta.ppy });
    custom = fn;
    settings.code = code;
    if (!settings.on.includes("custom")) settings.on.push("custom");
    save();
    if (!quiet) out(frame ? "Rule ran on " + frame.dates.length.toLocaleString("en-US") + " bars." : "Rule compiled. It runs once data loads.");
    return true;
  } catch (e) {
    custom = null;
    out(e.name === "SyntaxError" ? "Syntax error: " + e.message : "Error at " + e.message, true);
    return false;
  } finally {
    renderChips();
  }
}

function replaceCode(text) {
  const ta = q("labCode");
  ta.focus();
  ta.select();
  /* insertText keeps the browser's undo history, so Ctrl+Z restores the old rule. */
  if (!document.execCommand?.("insertText", false, text)) ta.value = text;
}

/* -------------------------------------------------------------------- mount */
export function mountLab(root) {
  root.innerHTML = '<div class="lab-panel" id="labPanel">' + skeleton() + "</div>";
  q = id => root.querySelector("#" + id);

  q("labInst").value = settings.inst;
  q("labLag").value = String(settings.lag);
  q("labCost").value = settings.cost;
  q("labVt").value = String(settings.vt);
  q("labLog").checked = settings.log;
  q("labCode").value = settings.code;
  const pressRange = () => q("labRange").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.range === settings.range)));
  pressRange();

  q("labInst").addEventListener("change", e => { settings.inst = e.target.value; save(); load(); });
  q("labRange").addEventListener("click", e => {
    const b = e.target.closest("button[data-range]");
    if (!b) return;   /* the current range too: it retries a partial load */
    settings.range = b.dataset.range; save(); pressRange(); load();
  });
  q("labLag").addEventListener("change", e => { settings.lag = +e.target.value; save(); run(); });
  q("labCost").addEventListener("change", e => {
    const v = Math.max(0, Math.min(50, parseFloat(e.target.value) || 0));
    e.target.value = v; settings.cost = v; save(); run();
  });
  q("labVt").addEventListener("change", e => { settings.vt = +e.target.value; save(); run(); });
  q("labLog").addEventListener("change", e => { settings.log = e.target.checked; save(); if (last) renderPrice({ s0: last.start }); });
  q("labOverlay").addEventListener("change", e => { settings.overlay = e.target.value; save(); if (last) renderPrice({ s0: last.start }); });
  q("labChips").addEventListener("click", e => {
    const b = e.target.closest("button[data-id]");
    if (!b || b.disabled) return;
    const id = b.dataset.id;
    settings.on = settings.on.includes(id) ? settings.on.filter(x => x !== id) : [...settings.on, id];
    if (!settings.on.length) settings.on = ["bh"];
    save(); renderChips(); run();
  });
  q("labCsv").addEventListener("click", downloadCsv);
  q("labRun").addEventListener("click", () => { if (compileCustom()) run(); });
  q("labCode").addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (compileCustom()) run(); }
  });
  q("labPreset").addEventListener("change", e => {
    const v = e.target.value;
    if (!v) return;
    replaceCode(v === "default" ? DEFAULT_CODE : PRESET_BY_ID[v].code);
    e.target.value = "";
    out("Loaded. Edit it, then Run rule (Ctrl+Enter).");
  });

  if (settings.on.includes("custom")) compileCustom(true);
  renderChips();
  overlayOptions();

  window.eqlab = {
    get frame() { return frame; },
    get results() { return last; },
    presets: PRESETS,
    compileRule, runRule, simulate, metrics, volTarget,
    /* eqlab.test(ctx => ctx.raiS > 0 ? 1 : 0) or eqlab.test("return ctx.rec < 0.3 ? 1 : 0;") */
    test(rule, { lag = settings.lag, costBp = settings.cost } = {}) {
      if (!frame) throw new Error("Data not loaded yet");
      const ppy = frame.meta.ppy;
      const t = runRule(frame, typeof rule === "string" ? compileRule(rule) : rule, { ppy });
      const bh = frame.price.map(() => 1);
      const start = startIndex([t, bh], lag);
      if (start < 0) throw new Error("The rule never returned a position");
      const sim = simulate(frame.price, t, { lag, costBp, start });
      const b = simulate(frame.price, bh, { lag, costBp, start });
      const table = { rule: metrics(frame.dates, sim, { ppy, bench: b.ret }), buyHold: metrics(frame.dates, b, { ppy }) };
      console.table(table);
      return { ...table, targets: t, sim };
    },
  };

  load();
}
