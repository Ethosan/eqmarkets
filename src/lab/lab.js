/* Backtest lab (admin only, opened with ?admin=1). Loads long daily history,
   rebuilds the models point-in-time, overlays them on an instrument and
   backtests rule-based strategies against buy and hold, including custom JS
   rules. Guards against overfitting: an in-sample / out-of-sample split, a
   bootstrap interval on Sharpe, the deflated Sharpe ratio and a parameter
   sweep. Also a calendar-effect event study. Everything runs in the browser;
   window.eqlab exposes it to the console. */
import "../styles/lab.css";
import { INSTRUMENTS, MODEL_COUNT, buildFrame, loadInstrument, loadModelSeries } from "../model/history.js";
import { plot } from "./plot.js";
import { EVENTS, renderEvents, renderHeatmap, runEvents } from "./insights.js";
import {
  PRESETS, bootstrapSharpe, compileRule, deflatedSharpe, drawdownPath, metrics, runRule, simulate, startIndex, volTarget,
} from "../quant/backtest.js";
import { regimeLabel } from "../quant/models.js";
import { HORIZONS, combinationForecast, evaluate, readNow } from "../quant/composite.js";
import { mean, std } from "../quant/stats.js";
import { stepDp } from "../ui/format.js";

const KEY = "eqm.lab";
const COLORS = {
  bh: "#8B92A0", rai: "#D9A84E", raiscale: "#E58F5B", ar: "#6E8BD9", rec: "#9C8FE0",
  combo: "#E56E76", vrp: "#5FC9A0", cta: "#C58BD9", tom: "#D9C24E", bias: "#F28C5B", trend: "#4FC1D9", custom: "#F2F3F5",
};
const RANGE_LABEL = { "2y": "2Y", "5y": "5Y", "10y": "10Y", max: "Max" };
const SPLITS = { 0: "Off", 0.3: "Last 30%", 0.5: "Last 50%" };
const GREEN = a => `rgba(61, 214, 140, ${a})`;
const RED = a => `rgba(242, 85, 90, ${a})`;
const AMBER = a => `rgba(217, 168, 78, ${a})`;

const DEFAULT_CODE = `// Return the position to hold from the next bar: 1 long, 0 flat,
// 0.5 half, -1 short. Return null to keep the previous position.
if (ctx.raiS == null || ctx.dAR == null) return null;
const uptrend = ctx.price > (ctx.sma(100) ?? Infinity);
if (ctx.dAR >= 1 && ctx.raiS < 0) return 0;   // fragile and risk-off
return uptrend ? 1 : 0.5;`;

const PRESET_BY_ID = Object.fromEntries(PRESETS.map(p => [p.id, { ...p, rule: compileRule(p.code) }]));

const settings = {
  inst: "nq", range: "5y", lag: 1, cost: 1, vt: 0, log: true, overlay: "rai", split: 0.3,
  on: ["bh", "rai", "ar", "rec", "combo"], code: DEFAULT_CODE,
  sweep: { a0: -1, a1: 1, an: 9, b0: 0.5, b1: 2, bn: 7, metric: "sharpe", pick: "is" },
};
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
  Object.assign(settings, saved, { sweep: { ...settings.sweep, ...saved.sweep } });
} catch { /* storage blocked or bad JSON */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage blocked */ } };

const modelCache = {}, instCache = {};
const sync = new Set();
/* Strategy variants evaluated this session (key → per-day Sharpe), the trial
   count behind the deflated Sharpe. */
const trials = new Map();
let frame = null, custom = null, loadToken = 0, last = null, events = null, sweepToken = 0, composite = null, biasH = "m";
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
  const sw = settings.sweep;
  const numIn = (id, v, step = "any") => `<input id="${id}" type="number" step="${step}" value="${v}" inputmode="decimal">`;
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
    <label class="lab-field"><span>Out-of-sample</span>
      <select id="labSplit">${Object.entries(SPLITS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
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
    <h4 class="lab-sub">Is it real? Robustness</h4>
    <div class="lab-tablewrap"><table class="lab-table num" id="labRobust"></table></div>
    <p class="m-cap lab-foot" id="labRobustNote"></p>
    <p class="m-cap lab-foot">Futures use Yahoo's continuous front-month series, so roll gaps count as returns. QQQ and SPY use dividend-adjusted closes. Flat earns nothing, and Sharpe uses a zero risk-free rate. FRED inputs (recession model, HY OAS) are lagged one business day to match when they are published. Past performance in a backtest is not a forecast.</p>
    <div class="lab-actions"><button type="button" class="lab-btn" id="labCsv">Download CSV</button></div>
  </div>

  <div class="m-card lab-card">
    <div class="lab-card-head"><h3 class="m-kicker">Calendar effects</h3></div>
    <p class="m-cap" id="labEventsCap"></p>
    <div class="lab-tablewrap"><table class="lab-table num lab-events" id="labEvents"></table></div>
    <p class="m-cap lab-foot">Daily close-to-close log returns of the instrument over the whole history loaded, in basis points. t is Welch's t-statistic for the difference; p is the share of 2,000 random sets of the same number of days whose average lands at least as far from the overall average (two-sided). Green or red rows have p below 0.05. With nine effects tested at once, expect about one p below 0.10 by luck alone. Share of return is the share of the period's total log return earned on those days.</p>
  </div>

  <div class="m-card lab-card">
    <div class="lab-card-head">
      <h3 class="m-kicker">Market bias model</h3>
      <div class="seg" id="labBiasH" role="group" aria-label="Horizon">${HORIZONS.map(H => `<button type="button" data-h="${H.key}" aria-pressed="false">${H.label}</button>`).join("")}</div>
    </div>
    <p class="m-cap" id="labBiasNow"></p>
    <div class="lab-tablewrap"><table class="lab-table num" id="labBiasTable"></table></div>
    <p class="m-cap">Cumulative squared-error advantage over the long-run average (Goyal &amp; Welch 2008). Rising = the model is beating it; falling = losing.</p>
    <div id="labBiasCum" class="lab-plot"></div>
    <p class="m-cap">Weights over time (inverse discounted out-of-sample error)</p>
    <div id="labBiasW" class="lab-plot"></div>
    <div class="lab-tablewrap"><table class="lab-table num" id="labBiasCal"></table></div>
    <p class="m-cap lab-foot">Walk-forward combination forecast of the instrument's log return over the horizon (Rapach, Strauss &amp; Zhou 2010): one sign-restricted regression per signal on an expanding window of known outcomes (Campbell &amp; Thompson 2008), combined by inverse discounted out-of-sample error (Stock &amp; Watson 2004, half-life one year). R² is out of sample against the prevailing historical mean; Clark–West (2007) is one-sided with Newey–West errors; the utility gain is for a mean–variance investor (γ = 3) rebalancing every horizon. Rule fields: <code>ctx.f1</code>, <code>ctx.f5</code>, <code>ctx.f21</code> (forecasts) and <code>ctx.p1</code>, <code>ctx.p5</code>, <code>ctx.p21</code> (chance up).</p>
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
        <dt><code>ctx.vrp</code></dt><dd>variance risk premium: VIX minus ES 21-day realized vol (vol points)</dd>
        <dt><code>ctx.sbCorr</code></dt><dd>63-day correlation of ES with Treasury price moves (−1 to 1)</dd>
        <dt><code>ctx.trend</code></dt><dd>trend-follower position in this instrument (−1 to 1)</dd>
        <dt><code>ctx.vix</code></dt><dd>VIX close</dd>
        <dt><code>ctx.f1</code> · <code>ctx.f5</code> · <code>ctx.f21</code></dt><dd>market-bias forecast of the log return over the next 1, 5, 21 bars (walk-forward)</dd>
        <dt><code>ctx.p1</code> · <code>ctx.p5</code> · <code>ctx.p21</code></dt><dd>its chance the instrument is higher at the end of that horizon</dd>
        <dt><code>ctx.cal(flag, ahead = 1)</code></dt><dd>calendar flag on the bar <code>ahead</code> bars from now: tom, monthEnd, fomc, preFomc, opex, opexWeek, quadWeek, preHoliday. With "Signal close", ahead 1 is the bar the position is held into.</dd>
        <dt><code>ctx.sma(n)</code> · <code>ctx.ret(n)</code> · <code>ctx.vol(n)</code></dt><dd>n-bar average, log return, annualized vol of the instrument</dd>
        <dt><code>ctx.get(field, k)</code></dt><dd>any field k bars ago</dd>
        <dt><code>ctx.p.a</code> · <code>ctx.p.b</code></dt><dd>parameters set by the sweep below (undefined otherwise, so write <code>ctx.p.a ?? default</code>)</dd>
        <dt><code>ctx.prev</code> · <code>ctx.state</code></dt><dd>last returned position; an object kept across bars</dd>
        <dt><code>ctx.i</code> · <code>ctx.date</code></dt><dd>bar index and ISO date</dd>
      </dl>
      <p>Console: <code>eqlab.test(ctx =&gt; ctx.raiS &gt; 0 ? 1 : 0)</code> backtests a rule against buy and hold and prints a table. <code>eqlab.frame</code> holds the aligned data and <code>eqlab.events</code> the calendar study.</p>
    </details>
  </div>

  <div class="m-card lab-card">
    <div class="lab-card-head"><h3 class="m-kicker">Parameter sweep</h3></div>
    <p class="m-cap">Runs the rule in the editor over a grid of <code>ctx.p.a</code> and <code>ctx.p.b</code>. Presets that read them say so in their first comment (try RAI + ΔAR). Set b steps to 1 for a single parameter. Pick the best cell on the in-sample period, then see what it did out of sample: that gap is what overfitting costs.</p>
    <div class="lab-controls lab-sweep">
      <div class="lab-field"><span>a: from, to, steps</span><div class="lab-trio">${numIn("swA0", sw.a0)}${numIn("swA1", sw.a1)}${numIn("swAn", sw.an, 1)}</div></div>
      <div class="lab-field"><span>b: from, to, steps</span><div class="lab-trio">${numIn("swB0", sw.b0)}${numIn("swB1", sw.b1)}${numIn("swBn", sw.bn, 1)}</div></div>
      <label class="lab-field"><span>Score</span>
        <select id="swMetric"><option value="sharpe">Sharpe</option><option value="cagr">CAGR</option><option value="mdd">Max drawdown</option><option value="calmar">Calmar</option></select></label>
      <label class="lab-field"><span>Score on</span>
        <select id="swPick"><option value="is">In-sample period</option><option value="full">Whole window</option></select></label>
    </div>
    <div class="lab-actions">
      <button type="button" class="lab-btn lab-run" id="swRun">Run sweep</button>
      <span class="lab-out" id="swOut" aria-live="polite"></span>
    </div>
    <div id="swMap" class="lab-heat"></div>
    <p class="m-cap lab-sweep-sum" id="swSum"></p>
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
  frame = buildFrame(S, series, { ppy: it.ppy || 252 });
  frame.meta.symbol = it.symbol;
  frame.meta.ppy = it.ppy || 252;
  events = runEvents(frame);
  composite = HORIZONS.map(H => {
    const res = combinationForecast(frame, H.h);
    frame["f" + H.h] = res.F;
    frame["p" + H.h] = res.pUp;
    return { H, res, ev: evaluate(res, { band: H.band, dates: frame.dates, ppy: frame.meta.ppy }) };
  });
  frame.meta.ms = Math.round(performance.now() - t0);
  q("labPanel").classList.remove("busy");
  const meta = frame.meta;
  q("labMeta").textContent = "RAI from " + meta.raiInputs.length + "/" + meta.raiTotal + " inputs · AR over " + meta.arAssets.length + " assets" +
    (meta.missing.length ? " · didn't load: " + meta.missing.join(", ") + " (pick the range again to retry)" : "") + ".";
  renderEventsCard();
  renderBias();
  q("swMap").innerHTML = ""; q("swSum").textContent = ""; q("swOut").textContent = "";
  run();
}

/* -------------------------------------------------------------------- run */
function strategies() {
  return settings.on
    .map(id => (id === "custom" ? custom && { id, name: "Custom", rule: custom, code: settings.code } : PRESET_BY_ID[id]))
    .filter(Boolean);
}

const trialKey = code => [code, settings.inst, settings.range, settings.lag, settings.cost, settings.vt].join("|");
function recordTrial(key, r) {
  const sd = std(r);
  if (sd > 0) trials.set(key, mean(r) / sd);
}
function trialStats() {
  const srs = [...trials.values()];
  return { n: Math.max(1, srs.length), srVar: srs.length > 1 ? std(srs) ** 2 : 0 };
}

const splitIndex = start => {
  const n = frame.dates.length;
  return settings.split > 0 ? start + Math.floor((n - 1 - start) * (1 - settings.split)) : null;
};

function targetsFor(rule, id, params) {
  const ppy = frame.meta.ppy;
  let t = id === "bh" ? frame.price.map(() => 1) : runRule(frame, rule, { ppy, params });
  if (settings.vt > 0 && id !== "bh") t = volTarget(t, frame.price, { target: settings.vt, ppy });
  return t;
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
      targets[s.id] = s.id === "bh" ? bhTargets : targetsFor(s.rule, s.id);
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
  for (const s of active) recordTrial(trialKey(s.code), sims[s.id].ret.slice(start + 1));
  const split = splitIndex(start);
  const robust = Object.fromEntries(active.map(s => {
    const r = sims[s.id].ret.slice(start + 1);
    const ts = trialStats();
    return [s.id, {
      ci: bootstrapSharpe(r, { ppy }),
      dsr: deflatedSharpe(r, { trials: ts.n, srVar: ts.srVar })?.dsr ?? null,
      is: split != null ? metrics(frame.dates, sims[s.id], { ppy, to: split }) : null,
      oos: split != null ? metrics(frame.dates, sims[s.id], { ppy, from: split }) : null,
    }];
  }));
  last = { active, sims, stats, start, targets, robust, split };
  render();
  status(RANGE_LABEL[settings.range] + " · " + frame.meta.symbol + " · models " + frame.meta.ms + " ms, backtest " + Math.round(performance.now() - t0) + " ms");
}

/* ----------------------------------------------------------------- render */
function overlayOptions() {
  const base = [["rai", "RAI regime"], ["dar", "Fragility (ΔAR)"], ["rec", "Recession odds"], ["vrp", "Variance premium"],
    ["sb", "Stock–bond correlation"], ["trend", "Trend followers"], ["bias", "Market bias, monthly"], ["tom", "Turn of month"], ["none", "Nothing"]];
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
  const sigmaTick = (v, st) => (Math.abs(v) < 1e-9 ? "0" : sgn(v, stepDp(st)));
  let shade = [], model = null, cap = "";
  if (ov === "rai") {
    shade = shadeRuns(slice("raiS"), v => (v >= 0.75 ? GREEN(0.16) : v >= 0.25 ? GREEN(0.07) : v <= -0.75 ? RED(0.18) : v <= -0.25 ? RED(0.08) : null));
    cap = "Risk Appetite Index, 3-day mean (σ). Green: risk-on, red: risk-off; darker beyond ±0.75σ.";
    model = { series: [{ label: "RAI", values: slice("raiS"), color: COLORS.rai }], band: [-0.75, 0.75], refs: [0],
      format: v => sgn(v) + "σ · " + regimeLabel(v), tick: (v, st) => sigmaTick(v, st) + "σ" };
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
  } else if (ov === "vrp") {
    shade = shadeRuns(slice("vrp"), v => (v < 0 ? RED(0.18) : null));
    cap = "Variance risk premium: VIX minus ES 21-day realized vol, in vol points. Red: realized above implied.";
    model = { series: [{ label: "VRP", values: slice("vrp"), color: COLORS.vrp }], refs: [0],
      format: v => sgn(v, 1) + " pts", tick: sigmaTick };
  } else if (ov === "sb") {
    shade = shadeRuns(slice("sbCorr"), v => (v >= 0.2 ? RED(0.14) : v <= -0.2 ? GREEN(0.08) : null));
    cap = "63-day correlation of ES with Treasury price moves. Red: above +0.2, bonds stop hedging. Green: below −0.2.";
    model = { series: [{ label: "Correlation", values: slice("sbCorr"), color: COLORS.ar }], refs: [0], domain: [-1, 1],
      format: v => sgn(v), tick: v => (Math.abs(v) < 1e-9 ? "0" : sgn(v, 1)) };
  } else if (ov === "trend") {
    shade = shadeRuns(slice("trend"), v => (v >= 0.5 ? GREEN(0.15) : v > 0 ? GREEN(0.06) : v <= -0.5 ? RED(0.18) : v < 0 ? RED(0.07) : null));
    cap = "Estimated trend-follower position in this instrument, −1 to +1 (1, 3, 6 and 12-month signals). Darker beyond ±0.5.";
    model = { series: [{ label: "CTA", values: slice("trend"), color: COLORS.cta }], refs: [0], domain: [-1.05, 1.05],
      format: v => sgn(v), tick: v => (Math.abs(v) < 1e-9 ? "0" : sgn(v, 1)) };
  } else if (ov === "bias") {
    const band = HORIZONS[2].band;
    shade = shadeRuns(slice("p21"), v => (v >= 0.5 + band ? GREEN(0.14) : v <= 0.5 - band ? RED(0.18) : null));
    cap = "Market bias: walk-forward chance of a higher close in 21 sessions. Green: bullish (55%+), red: bearish (45% or less).";
    model = { series: [{ label: "Chance up", values: slice("p21"), color: COLORS.bias }], refs: [0.5 - band, 0.5, 0.5 + band], domain: [0.2, 0.8],
      format: v => pct(v, 0), tick: v => pct(v, 0) };
  } else if (ov === "tom") {
    shade = shadeRuns(frame.cal.tom.slice(s0).map(x => (x ? 1 : null)), () => AMBER(0.22));
    cap = "";
  } else if (ov.startsWith("pos:")) {
    const id = ov.slice(4);
    const p = last.sims[id].pos.slice(s0);
    shade = shadeRuns(p, v => (v >= 0.999 ? GREEN(0.14) : v > 1e-9 ? GREEN(0.06) : v < -1e-9 ? RED(0.16) : null));
    const name = last.active.find(s => s.id === id).name;
    cap = "Position held by " + name + ", after the execution lag. Green: long (darker = full size), red: short.";
    model = { series: [{ label: "Position", values: p, color: COLORS[id], step: true }], refs: [0],
      domain: [Math.min(0, ...p) - 0.05, Math.max(1, ...p) + 0.05], format: v => num(v, 2) + "×", tick: (v, st) => v.toFixed(stepDp(st)) + "×" };
  }
  const it = inst();
  const marks = last?.split != null ? [{ i: last.split - s0, label: "Out of sample" }] : [];
  plot(q("labPrice"), {
    dates, sync, height: 260, log: settings.log, shade, label: it.label, marks,
    series: [{ label: it.label.split(" · ")[0], values: frame.price.slice(s0), color: "#C9CDD4", width: 1.4 }],
    format: v => priceFmt(v), tick: v => (v >= 1000 ? Math.round(v).toLocaleString("en-US") : String(+v.toFixed(2))),
    note: ov === "tom" ? i => (frame.cal.tom[s0 + i] ? "turn of month" : "") : null,
  });
  q("labModelCap").textContent = cap;
  q("labModel").hidden = !model;
  q("labModelCap").hidden = !model;
  if (model) plot(q("labModel"), { dates, sync, height: 110, label: cap, marks, ...model });
}

function render() {
  const { active, sims, stats, start, robust, split } = last;
  const dates = frame.dates.slice(start);
  const m0 = stats[active[0].id];
  q("labWindow").textContent = "Test window " + longDate(frame.dates[start]) + " to " + longDate(frame.dates[frame.dates.length - 1]) +
    " · " + m0.years.toFixed(1) + " years, " + m0.bars.toLocaleString("en-US") + " bars · " +
    (settings.lag === 1 ? "trades on the signal's close" : "trades one close later") + ", " + settings.cost + " bp per side" +
    (settings.vt > 0 ? ", vol target " + Math.round(settings.vt * 100) + "%" : "") +
    (split != null ? " · out of sample from " + longDate(frame.dates[split]) : "") +
    ". Starts when every selected strategy has a signal.";

  overlayOptions();
  renderPrice({ s0: start });

  const marks = split != null ? [{ i: split - start, label: "Out of sample" }] : [];
  plot(q("labEquity"), {
    dates, sync, height: 260, log: true, label: "Growth of $1", marks,
    series: active.map(s => ({ label: s.name, values: sims[s.id].equity.slice(start), color: COLORS[s.id], width: s.id === "bh" ? 1.3 : 1.7, dash: s.id === "bh" ? "4 3" : null })),
    format: v => "$" + v.toFixed(2) + " (" + sgn((v - 1) * 100, 0) + "%)", tick: v => "$" + (v >= 10 ? v.toFixed(0) : +v.toFixed(2)),
  });
  const dd = active.map(s => ({ label: s.name, values: drawdownPath(sims[s.id].equity, start).slice(start), color: COLORS[s.id], width: s.id === "bh" ? 1.2 : 1.5, dash: s.id === "bh" ? "4 3" : null }));
  const ddMin = Math.min(...dd.flatMap(s => s.values.filter(v => v != null)));
  plot(q("labDD"), {
    dates, sync, height: 120, legend: false, label: "Drawdown", domain: [Math.min(-0.01, ddMin * 1.05), 0], series: dd, marks,
    format: v => pct(v, 1), tick: (v, st) => (Math.abs(v) < 1e-9 ? "0" : (v * 100).toFixed(stepDp(st * 100))) + "%",
  });

  const nameCell = s => `<th scope="row" title="${esc(s.desc || "Your custom rule")}"><i style="background:${COLORS[s.id]}"></i>${esc(s.name)}</th>`;
  const tone = x => (x == null ? "" : x < 0 ? ' class="d"' : "");
  const cols = ["Strategy", "CAGR", "Vol", "Sharpe", "Sortino", "Max DD", "Calmar", "Exposure", "Trades/yr", "Hit rate", "β", "$1 →"];
  const best = Math.max(...active.map(s => stats[s.id]?.sharpe ?? -Infinity));
  q("labTable").innerHTML = "<thead><tr>" + cols.map(c => `<th scope="col">${c}</th>`).join("") + "</tr></thead><tbody>" +
    active.map(s => {
      const m = stats[s.id];
      if (!m) return "";
      return "<tr>" + nameCell(s) +
        `<td${tone(m.cagr)}>${pct(m.cagr, 1, true)}</td><td>${pct(m.vol, 1)}</td>` +
        `<td${m.sharpe === best && active.length > 1 ? ' class="best"' : tone(m.sharpe)}>${num(m.sharpe)}</td><td>${num(m.sortino)}</td>` +
        `<td class="d">${pct(m.mdd, 1)}</td><td>${num(m.calmar)}</td><td>${pct(m.exposure, 0)}</td>` +
        `<td>${num(m.tradesPerYear, 1)}</td><td>${pct(m.hit, 0)}</td><td>${num(m.beta)}</td><td>$${(1 + m.total).toFixed(2)}</td></tr>`;
    }).join("") + "</tbody>";

  const rc = ["Strategy", "Sharpe", "90% interval", "In-sample Sharpe", "Out-of-sample Sharpe", "Out-of-sample CAGR", "Deflated Sharpe"];
  q("labRobust").innerHTML = "<thead><tr>" + rc.map(c => `<th scope="col">${c}</th>`).join("") + "</tr></thead><tbody>" +
    active.map(s => {
      const m = stats[s.id], r = robust[s.id];
      if (!m) return "";
      const decay = r.is && r.oos && r.is.sharpe != null && r.oos.sharpe != null && r.oos.sharpe < r.is.sharpe - 0.5;
      return "<tr>" + nameCell(s) + `<td>${num(m.sharpe)}</td><td>${r.ci ? num(r.ci[0]) + " to " + num(r.ci[1]) : "—"}</td>` +
        `<td>${num(r.is?.sharpe)}</td><td${decay ? ' class="d"' : tone(r.oos?.sharpe)}>${num(r.oos?.sharpe)}</td><td${tone(r.oos?.cagr)}>${pct(r.oos?.cagr, 1, true)}</td>` +
        `<td${r.dsr != null && r.dsr >= 0.95 ? ' class="best"' : ""}>${r.dsr == null ? "—" : pct(r.dsr, 0)}</td></tr>`;
    }).join("") + "</tbody>";
  const ts = trialStats();
  q("labRobustNote").innerHTML = "90% interval: Sharpe across 600 block-bootstrap resamples of the daily returns (10-day blocks keep volatile spells together). " +
    "If it straddles buy and hold's Sharpe, the difference could be luck. " +
    (split != null ? "In-sample and out-of-sample split the test window at " + longDate(frame.dates[split]) + "; the presets weren't fitted on either, so a big drop (red) means the edge isn't stable. " : "Turn on Out-of-sample above to split the window. ") +
    "Deflated Sharpe (Bailey & López de Prado 2014) is the probability the true Sharpe is above zero after allowing for fat tails and for picking the best of the <b>" +
    ts.n + "</b> variants tried this session; 95% or more is green. " +
    '<button type="button" class="lab-link" id="labTrialReset">Reset the count</button>';
}

function renderEventsCard() {
  renderEvents(q("labEvents"), events);
  const n = frame.dates.length;
  q("labEventsCap").textContent = inst().label + ", " + longDate(frame.dates[0]) + " to " + longDate(frame.dates[n - 1]) +
    " (" + n.toLocaleString("en-US") + " sessions). FOMC rows start in 2010. Each row compares the average return on those days with every other day.";
}

function renderBias() {
  q("labBiasH").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.h === biasH)));
  const c = composite?.find(x => x.H.key === biasH);
  if (!c || !c.ev) {
    q("labBiasNow").textContent = "Not enough history for a walk-forward record. The model needs about three years before its first forecast; try 10Y or Max.";
    ["labBiasTable", "labBiasCal"].forEach(id => { q(id).innerHTML = ""; });
    plot(q("labBiasCum"), { dates: null, series: [] }); plot(q("labBiasW"), { dates: null, series: [] });
    return;
  }
  const { H, res, ev } = c;
  const now = readNow(res, ev, H.band);
  q("labBiasNow").textContent = now
    ? H.label + ": " + now.label + ", " + pct(now.p, 0) + " chance higher vs " + pct(now.base, 0) + " normally, expected " + sgn((Math.exp(now.F) - 1) * 100, 2) + "%" +
      (now.confidence ? ", " + now.confidence.toLowerCase() + " confidence" : "") + ". Models' weight against the long-run average now " + pct(now.lambda, 0) +
      " (average " + pct(ev.lambdaMean, 0) + "). Out of sample " + longDate(ev.from) + " to " + longDate(ev.to) + "."
    : "";
  const cols = ["Forecast", "Forecasts", "R² out of sample", "Clark–West p", "Bullish calls beat avg", "Bearish calls below avg", "Neutral", "Utility gain / yr", "Weight now"];
  const t = res.F.length - 1;
  const r2 = x => (x == null ? "—" : sgn(x * 100, 2) + "%");
  const rows = [
    `<tr><th scope="row"><b>Final (λ blend)</b></th><td>${ev.n.toLocaleString("en-US")}</td><td${ev.r2 < 0 ? ' class="d"' : ev.cwP < 0.1 ? ' class="best"' : ""}>${r2(ev.r2)}</td>` +
      `<td>${ev.cwP < 0.001 ? "<0.001" : ev.cwP.toFixed(3)}</td><td>${ev.bull.n ? pct(ev.bull.right, 0) + " of " + ev.bull.n : "—"}</td>` +
      `<td>${ev.bear.n ? pct(ev.bear.right, 0) + " of " + ev.bear.n : "—"}</td><td>${pct(ev.neutralShare, 0)}</td><td${ev.cerGain < 0 ? ' class="d"' : ""}>${sgn(ev.cerGain * 100, 2)}%</td><td>λ ${pct(res.lambda[t], 0)}</td></tr>`,
    `<tr><th scope="row">Models alone (raw combination)</th><td></td><td${ev.r2Raw < 0 ? ' class="d"' : ""}>${r2(ev.r2Raw)}</td><td colspan="6" class="muted">Before the encompassing weight λ shrinks it toward the long-run average.</td></tr>`,
    `<tr><th scope="row">Equal weights</th><td></td><td${ev.r2Equal < 0 ? ' class="d"' : ""}>${r2(ev.r2Equal)}</td><td colspan="6" class="muted">Same signals, 1/N weights: the check that the weighting itself isn't overfit (DeMiguel, Garlappi &amp; Uppal 2009).</td></tr>`,
    ...ev.single.map((s, k) => `<tr><th scope="row" title="${esc(s.src)}">${esc(s.label)}</th><td>${s.n.toLocaleString("en-US")}</td><td${s.r2 != null && s.r2 < 0 ? ' class="d"' : ""}>${r2(s.r2)}</td>` +
      `<td colspan="5" class="muted">${esc(s.src)}</td><td>${pct(res.w[k][t], 0)}</td></tr>`),
  ];
  q("labBiasTable").innerHTML = "<thead><tr>" + cols.map(x => `<th scope="col">${x}</th>`).join("") + "</tr></thead><tbody>" + rows.join("") + "</tbody>";
  q("labBiasCal").innerHTML = "<thead><tr><th scope=\"col\">Model's chance up</th><th scope=\"col\">Forecasts</th><th scope=\"col\">Average forecast</th><th scope=\"col\">Actually up</th></tr></thead><tbody>" +
    ev.calib.map(b => `<tr><th scope="row">${Math.round(b.lo * 100)}–${Math.min(100, Math.round(b.hi * 100))}%</th><td>${b.n.toLocaleString("en-US")}</td><td>${pct(b.mean, 1)}</td><td>${pct(b.up, 1)}</td></tr>`).join("") +
    "</tbody>";
  plot(q("labBiasCum"), {
    dates: ev.cumSse.dates, height: 160, label: "Cumulative squared-error advantage", refs: [0],
    series: [{ label: "Final", values: ev.cumSse.values, color: COLORS.bias }, { label: "Models alone", values: ev.cumSse.raw, color: "#8B92A0", dash: "4 3", width: 1.3 }],
    format: v => sgn(v * 1e4, 2) + " (×10⁻⁴)", tick: v => (Math.abs(v) < 1e-12 ? "0" : sgn(v * 1e4, 1)),
  });
  const i0 = res.F.findIndex(x => x != null);
  const wd = frame.dates.slice(i0);
  const palette = ["#C58BD9", "#5FC9A0", "#D9A84E", "#6E8BD9", "#9C8FE0", "#D9C24E", "#E56E76", "#4FC1D9"];
  plot(q("labBiasW"), {
    dates: wd, height: 160, label: "Weights over time", domain: [0, Math.max(0.4, ...res.w.flatMap(a => a.slice(i0).filter(v => v != null))) * 1.05],
    series: res.preds.map((p, k) => ({ label: p.label, values: res.w[k].slice(i0), color: palette[k % palette.length], width: 1.4 })),
    format: v => pct(v, 0), tick: v => pct(v, 0),
  });
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

/* ------------------------------------------------------------------ sweep */
const grid = (a0, a1, k) => (k <= 1 ? [a0] : Array.from({ length: k }, (_, i) => a0 + (a1 - a0) * i / (k - 1)));

async function runSweep() {
  if (!frame) return;
  const token = ++sweepToken;
  const sw = settings.sweep;
  const read = id => parseFloat(q(id).value);
  Object.assign(sw, { a0: read("swA0"), a1: read("swA1"), an: Math.round(read("swAn")), b0: read("swB0"), b1: read("swB1"), bn: Math.round(read("swBn")),
    metric: q("swMetric").value, pick: q("swPick").value });
  save();
  const so = q("swOut");
  if (![sw.a0, sw.a1, sw.b0, sw.b1].every(isFinite) || !(sw.an >= 1) || !(sw.bn >= 1)) { so.textContent = "Fill in every box."; so.classList.add("err"); return; }
  if (sw.an * sw.bn > 400) { so.textContent = "That's " + sw.an * sw.bn + " cells; keep it to 400 or fewer."; so.classList.add("err"); return; }
  let rule;
  const code = q("labCode").value;
  try { rule = compileRule(code); } catch (e) { so.textContent = "Syntax error: " + e.message; so.classList.add("err"); return; }
  if (!/ctx\.p\.a/.test(code)) { so.textContent = "The rule doesn't read ctx.p.a, so every cell would be the same. Load a preset that does, such as RAI + ΔAR."; so.classList.add("err"); return; }
  so.classList.remove("err");

  const as = grid(sw.a0, sw.a1, sw.an), bs = sw.bn > 1 ? grid(sw.b0, sw.b1, sw.bn) : [null];
  const cellsIn = as.flatMap(a => bs.map(b => ({ a, b })));
  const ppy = frame.meta.ppy, lag = settings.lag;
  try {
    for (let k = 0; k < cellsIn.length; k++) {
      const c = cellsIn[k];
      c.t = targetsFor(rule, "sweep", c.b == null ? { a: c.a } : { a: c.a, b: c.b });
      if (k % 6 === 5) { so.textContent = "Running " + (k + 1) + "/" + cellsIn.length + "…"; await new Promise(r => setTimeout(r, 0)); if (token !== sweepToken) return; }
    }
  } catch (e) { so.textContent = "Error at " + e.message; so.classList.add("err"); return; }
  const bh = frame.price.map(() => 1);
  const live = cellsIn.filter(c => c.t.some(x => x != null));
  const start = startIndex([bh, ...live.map(c => c.t)], lag);
  if (start < 0 || frame.dates.length - start < 60) { so.textContent = "Not enough overlapping history across the grid."; so.classList.add("err"); return; }
  if (settings.split === 0 && sw.pick === "is") { settings.split = 0.3; q("labSplit").value = "0.3"; save(); }
  const split = splitIndex(start);
  const scoreWin = sw.pick === "is" ? { to: split } : {};
  const opt = { lag, costBp: settings.cost, start };
  const benchSim = simulate(frame.price, bh, opt);
  const score = m => (m == null ? null : m[sw.metric]);
  const benchScore = score(metrics(frame.dates, benchSim, { ppy, ...scoreWin }));
  const cells = cellsIn.map(c => {
    if (!live.includes(c)) return { a: c.a, b: c.b, value: null };
    const sim = simulate(frame.price, c.t, opt);
    recordTrial(trialKey(code + "|a=" + c.a + "|b=" + c.b), sim.ret.slice(start + 1));
    return {
      a: c.a, b: c.b,
      value: score(metrics(frame.dates, sim, { ppy, ...scoreWin })),
      oos: split != null ? metrics(frame.dates, sim, { ppy, from: split })?.sharpe ?? null : null,
    };
  });
  if (token !== sweepToken) return;
  const valid = cells.filter(c => c.value != null && isFinite(c.value));
  const best = valid.reduce((x, c) => (!x || c.value > x.value ? c : x), null);
  const label = { sharpe: "Sharpe", cagr: "CAGR", mdd: "max drawdown", calmar: "Calmar" }[sw.metric];
  const fmt = v => (sw.metric === "cagr" || sw.metric === "mdd" ? pct(v, 0) : num(v));
  renderHeatmap(q("swMap"), { as, bs, cells, label, fmt, best, bench: benchScore });
  const beat = valid.filter(c => c.value > benchScore).length;
  const pos = valid.filter(c => (sw.metric === "mdd" ? true : c.value > 0)).length;
  const bName = b => (b == null ? "" : ", b = " + (+b.toFixed(4)));
  q("swSum").innerHTML = best
    ? `Best cell${sw.pick === "is" ? " in sample" : ""}: <b>a = ${+best.a.toFixed(4)}${bName(best.b)}</b>, ${label} ${fmt(best.value)}` +
      (best.oos != null ? ` → out-of-sample Sharpe <b>${num(best.oos)}</b>` : "") + `. ${beat} of ${valid.length} cells beat buy and hold (${fmt(benchScore)})` +
      (sw.metric === "mdd" ? "" : `, ${pos} are positive`) + ". A robust edge looks like a broad plateau of dark cells, not one dark spot."
    : "No cell produced a result.";
  so.textContent = cells.length + " cells · scored on " + (sw.pick === "is" ? "the in-sample period" : "the whole window") + ". Each cell counts toward the deflated Sharpe.";
  run();
}

/* ------------------------------------------------------------------- CSV */
function downloadCsv() {
  if (!last) return;
  const { active, sims, start } = last;
  const head = ["date", "price", "rai", "rai_3d", "ar", "dar", "rec_prob", "vrp", "stock_bond_corr", "cta_trend", "turn_of_month", "bias_f21", "bias_p21",
    ...active.flatMap(s => ["pos_" + s.id, "equity_" + s.id])];
  const f = (v, dp = 6) => (v == null || !isFinite(v) ? "" : +v.toFixed(dp));
  const rows = [head.join(",")];
  for (let i = start; i < frame.dates.length; i++) {
    rows.push([frame.dates[i], f(frame.price[i], 4), f(frame.rai[i]), f(frame.raiS[i]), f(frame.ar[i]), f(frame.dAR[i]), f(frame.rec[i]),
      f(frame.vrp[i], 3), f(frame.sbCorr[i], 4), f(frame.trend[i], 4), frame.cal.tom[i] ? 1 : 0, f(frame.f21[i]), f(frame.p21[i], 4),
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
  q("labSplit").value = String(settings.split);
  q("labLog").checked = settings.log;
  q("labCode").value = settings.code;
  q("swMetric").value = settings.sweep.metric;
  q("swPick").value = settings.sweep.pick;
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
  q("labSplit").addEventListener("change", e => { settings.split = +e.target.value; save(); run(); });
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
  q("labPanel").addEventListener("click", e => {
    if (e.target.id === "labTrialReset") { trials.clear(); run(); }
  });
  q("labCsv").addEventListener("click", downloadCsv);
  q("labRun").addEventListener("click", () => { if (compileCustom()) run(); });
  q("swRun").addEventListener("click", runSweep);
  q("labBiasH").addEventListener("click", e => {
    const b = e.target.closest("button[data-h]");
    if (b) { biasH = b.dataset.h; renderBias(); }
  });
  q("labCode").addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (compileCustom()) run(); }
  });
  q("labPreset").addEventListener("change", e => {
    const v = e.target.value;
    if (!v) return;
    replaceCode(v === "default" ? DEFAULT_CODE : PRESET_BY_ID[v].code);
    e.target.value = "";
    out("Loaded. Edit it, then Run rule (Ctrl+Enter), or sweep its parameters below.");
  });

  if (settings.on.includes("custom")) compileCustom(true);
  renderChips();
  overlayOptions();

  window.eqlab = {
    get frame() { return frame; },
    get results() { return last; },
    get events() { return events?.map(e => ({ event: e.name, ...e.stats })); },
    get bias() { return composite; },
    eventDefs: EVENTS,
    presets: PRESETS,
    compileRule, runRule, simulate, metrics, volTarget, bootstrapSharpe, deflatedSharpe,
    /* eqlab.test(ctx => ctx.raiS > 0 ? 1 : 0) or eqlab.test("return ctx.rec < 0.3 ? 1 : 0;") */
    test(rule, { lag = settings.lag, costBp = settings.cost, params } = {}) {
      if (!frame) throw new Error("Data not loaded yet");
      const ppy = frame.meta.ppy;
      const t = runRule(frame, typeof rule === "string" ? compileRule(rule) : rule, { ppy, params });
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
