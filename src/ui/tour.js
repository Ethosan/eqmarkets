/* First-run spotlight tour. Dims the page, cuts a hole around one real panel
   at a time and explains it with today's live values. Shown once per device
   after the first data load; replay from the guide. */
import { ALL, ITEM_BY_ID } from "../config.js";
import { QUADRANTS } from "../quant/regime.js";
import { regimeLabel } from "../quant/models.js";
import { ok } from "../state.js";
import { LAST } from "./models-panel.js";
import { fmtNum } from "./format.js";

/* v2: the tour gained Today's read and the macro regime, so show it once more. */
const KEY = "eqm.tour.v2";
const sgn = (x, dp = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(dp);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => matchMedia("(max-width: 680px)").matches;

function raiNow() {
  const r = LAST.rai;
  if (!r) return "Once the feeds load, the label tells you where it stands.";
  const more = r.pct != null && r.smooth < 0
    ? ", more risk-off than " + Math.round((1 - r.pct) * 100) + "% of the past year"
    : r.pct != null ? ", more risk-on than " + Math.round(r.pct * 100) + "% of the past year" : "";
  return "Right now it reads <b>" + sgn(r.smooth) + "</b>: " + regimeLabel(r.smooth).toLowerCase() + more + ".";
}

function driverNow() {
  const c = LAST.rai?.contributions;
  if (!c?.length) return "";
  const lo = c.reduce((a, b) => (b.score < a.score ? b : a));
  const hi = c.reduce((a, b) => (b.score > a.score ? b : a));
  return " Today the biggest drag is <b>" + lo.label + "</b> at " + sgn(lo.score) +
    (hi.score > 0 ? ", and the biggest support is <b>" + hi.label + "</b> at " + sgn(hi.score) : "") + ".";
}

/* The tape's first card that loaded, for the "tap a card" step. */
function sampleCard() {
  for (const id of ["es", "nq", "vix", "us10y"]) if (ok(id)) return id;
  return "es";
}

const STEPS = [
  {
    sel: "#readList .read-item",
    title: "Today's read",
    body: () => {
      const n = document.querySelectorAll("#readList .read-item").length;
      return "The quickest way in: what stands out across markets this month, written by fixed rules from the numbers on the page. " +
        (n > 1 ? "This is the strongest of today's " + n + ". " : "") +
        "The chips are the exact numbers behind each line, and the button below the list asks Mistral AI for a plain-English note.";
    },
  },
  {
    sel: "#raiHead",
    title: "Risk Appetite Index",
    body: () => "One number for how much risk the market wants to take, from 8 inputs across stocks, crypto, FX, vol and credit. Left is risk-off, right is risk-on. " + raiNow(),
  },
  {
    sel: "#raiBars",
    title: "What's driving it",
    body: () => "Each bar is one input's score: how unusual it is compared with its own past year. Green pushes risk-on, red pushes risk-off. Each is capped at ±3 so one panicking market can't take over the index." + driverNow(),
  },
  {
    sel: "#raiChart",
    title: "Read any day",
    body: () => (matchMedia("(hover: none)").matches ? "Touch and drag" : "Hover over") +
      " any chart to see the value on a given day. The shaded band is the in-between zone: above it is risk-on, below it is risk-off.",
  },
  {
    sel: "#regMap",
    title: "Macro regime",
    body: () => {
      const r = LAST.regime;
      const now = r ? " Right now: <b>" + r.label + "</b> (" + r.confidence + "). " + QUADRANTS[r.quadrant].blurb : "";
      return "Is growth rising or falling, and is inflation? Four regimes, read from 3-month market moves. The trail shows the last 13 weeks." + now;
    },
  },
  {
    sel: "#arCard",
    title: "Absorption ratio",
    body: () => {
      const a = LAST.ar;
      const now = a ? " Today it's <b>" + (a.latest * 100).toFixed(0) + "%</b>" + (a.shift != null ? " with ΔAR at " + sgn(a.shift, 1) : "") + "." : "";
      return "How much of the movement across 10 markets comes from one or two common forces. Watch ΔAR: above +1 means everything has started moving together, which is when selloffs spread." + now;
    },
  },
  {
    sel: "#recCard",
    title: "Recession odds",
    body: () => {
      const r = LAST.rec;
      const now = r ? " Today: <b>" + (r.prob[r.prob.length - 1] * 100).toFixed(1) + "%</b>." : "";
      return "The New York Fed's yield-curve model: the chance of a US recession within 12 months. It moves slowly, so treat it as the backdrop, not as timing." + now;
    },
  },
  {
    sel: "#tabs",
    title: "Jump to a group",
    body: () => "Rates, Risk, Carry, Commodities and the Tape each have a tab. Models shows just the model panels.",
    before: () => document.querySelector('.tab[data-filter="all"]')?.click(),
  },
  {
    sel: () => "#card-" + sampleCard(),
    title: "Every card is one market",
    body: () => {
      const id = sampleCard(), s = ok(id), it = ITEM_BY_ID[id];
      const v = s ? " (" + it.ticker + " is at " + fmtNum(s.price, it.fmt) + ")" : "";
      return "The coloured note says where it sits in its past year, and the bottom line shows the 1-month move and its volatility" + v + ". Tap any card for the full chart, multi-horizon changes and vol.";
    },
  },
  {
    sel: "#guideBtn",
    title: "The full guide",
    body: () => "A 30-second routine before you trade, what every number means, each model explained, and a glossary of all " + ALL.length + " indicators. You can replay this tour from there too.",
  },
];

let el = null, i = 0, active = false, lastFocus = null;

function target() {
  const s = STEPS[i].sel;
  return document.querySelector(typeof s === "function" ? s() : s);
}

/* Height of sticky chrome at the top (app bar, plus the tab bar on phones). */
function topInset() {
  const bar = document.querySelector(".appbar")?.offsetHeight || 0;
  const tabs = narrow() ? document.getElementById("tabs")?.offsetHeight || 0 : 0;
  return bar + tabs + 12;
}

function scrollToTarget(t) {
  const r = t.getBoundingClientRect();
  const popH = narrow() ? el.querySelector(".tour-pop").offsetHeight + 24 : 0;
  const room = innerHeight - topInset() - popH;
  const want = r.height < room ? window.scrollY + r.top - topInset() - Math.max(0, (room - r.height) / 3) : window.scrollY + r.top - topInset();
  /* The tab bar is sticky, so scroll it into place rather than past it. */
  const y = t.id === "tabs" ? Math.max(0, window.scrollY + r.top - 80) : want;
  window.scrollTo({ top: Math.max(0, y), behavior: "auto" });
}

function place() {
  if (!active) return;
  const t = target();
  const hole = el.querySelector(".tour-hole"), pop = el.querySelector(".tour-pop");
  if (!t) return;
  const r = t.getBoundingClientRect();
  const pad = 6;
  Object.assign(hole.style, {
    left: r.left - pad + "px", top: r.top - pad + "px",
    width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px",
  });
  if (narrow()) { pop.style.left = ""; pop.style.top = ""; return; }
  const pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 14, m = 12;
  /* Below, then above, then beside the target; overlap only as a last resort. */
  let top = r.bottom + gap, left = Math.min(innerWidth - pw - 16, Math.max(16, r.left));
  if (top + ph > innerHeight - m) top = r.top - gap - ph;
  if (top < m) {
    top = Math.min(innerHeight - ph - m, Math.max(m, r.top));
    if (r.right + gap + pw <= innerWidth - 16) left = r.right + gap;
    else if (r.left - gap - pw >= 16) left = r.left - gap - pw;
    else top = Math.min(innerHeight - ph - m, Math.max(m, r.top + m));
  }
  pop.style.left = left + "px";
  pop.style.top = top + "px";
}

function render() {
  const st = STEPS[i];
  st.before?.();
  const last = i === STEPS.length - 1;
  el.querySelector(".tour-step").textContent = i + 1 + " of " + STEPS.length;
  el.querySelector(".tour-title").textContent = st.title;
  el.querySelector(".tour-body").innerHTML = st.body();
  el.querySelector(".tour-dots").innerHTML = STEPS.map((_, k) => "<i" + (k === i ? ' class="on"' : "") + "></i>").join("");
  const back = el.querySelector("[data-tback]");
  back.hidden = i === 0;
  el.querySelector("[data-tskip]").hidden = last;
  el.querySelector("[data-tnext]").textContent = last ? "Done" : "Next";
  const t = target();
  if (t) scrollToTarget(t);
  place();
  el.querySelector("[data-tnext]").focus({ preventScroll: true });
}

function go(d) {
  const n = i + d;
  if (n < 0) return;
  if (n >= STEPS.length) return end();
  i = n;
  render();
}

function onKey(e) {
  if (!active) return;
  if (e.key === "Escape") { e.preventDefault(); end(); }
  else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  else if (e.key === "Tab") {
    /* Keep focus inside the tour card. */
    const f = [...el.querySelectorAll("button:not([hidden])")];
    const k = f.indexOf(document.activeElement);
    e.preventDefault();
    f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  }
}

function mount() {
  el = document.createElement("div");
  el.className = "tour-ov" + (reduced() ? " still" : "");
  el.innerHTML =
    '<div class="tour-hole" aria-hidden="true"></div>' +
    '<div class="tour-pop" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourBody">' +
    '<p class="tour-step num"></p>' +
    '<h2 class="tour-title" id="tourTitle"></h2>' +
    '<p class="tour-body" id="tourBody" aria-live="polite"></p>' +
    '<div class="tour-foot"><div class="tour-dots" aria-hidden="true"></div>' +
    '<div class="tour-acts"><button type="button" class="t-btn ghost" data-tskip>Skip</button>' +
    '<button type="button" class="t-btn ghost" data-tback>Back</button>' +
    '<button type="button" class="t-btn" data-tnext>Next</button></div></div></div>';
  el.querySelector("[data-tnext]").addEventListener("click", () => go(1));
  el.querySelector("[data-tback]").addEventListener("click", () => go(-1));
  el.querySelector("[data-tskip]").addEventListener("click", end);
  document.body.appendChild(el);
}

export function startTour() {
  if (active) return;
  if (!el) mount();
  lastFocus = document.activeElement;
  /* The first steps point at the models, which a saved or shortcut tab can hide. */
  document.querySelector('.tab[data-filter="all"]:not([aria-selected="true"])')?.click();
  active = true;
  i = 0;
  document.documentElement.classList.add("touring");
  el.hidden = false;
  addEventListener("keydown", onKey, true);
  addEventListener("resize", place);
  addEventListener("scroll", place, { passive: true });
  render();
  try { localStorage.setItem(KEY, "1"); } catch { /* storage blocked */ }
}

function end() {
  active = false;
  el.hidden = true;
  document.documentElement.classList.remove("touring");
  removeEventListener("keydown", onKey, true);
  removeEventListener("resize", place);
  removeEventListener("scroll", place);
  window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
  lastFocus?.focus?.({ preventScroll: true });
  dispatchEvent(new Event("eqm:tourend"));
}

/* Called after each refresh; starts the tour once, after the first real data. */
export function maybeStartTour() {
  let seen = false;
  try { seen = !!localStorage.getItem(KEY); } catch { seen = true; }
  if (seen || active || document.querySelector("dialog[open]")) return;
  if (new URLSearchParams(location.search).has("notour")) return;
  setTimeout(startTour, 600);
}
