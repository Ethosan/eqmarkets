/* App bar clocks, session status chips, filter tabs and the refresh progress bar. */
import { $, clockIn } from "./format.js";

/* ---------------------------------------------------------------- clocks */
function nyNow() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return { day: d.getDay(), mins: d.getHours() * 60 + d.getMinutes() };
}

function clockHtml(tz) {
  const t = clockIn(tz, { second: "2-digit" });
  return t.slice(0, 5) + '<span class="secs">' + t.slice(5) + "</span>";
}

function setStatus(el, text, cls) {
  const [name, ...rest] = text.split(" ");
  el.innerHTML = '<i aria-hidden="true"></i>' + name + (rest.length ? '<span class="st-word"> ' + rest.join(" ") + "</span>" : "");
  el.title = text;
  el.setAttribute("aria-label", text);
  el.className = "status " + cls;
}

export function tickClocks() {
  $("clkSg").innerHTML = clockHtml("Asia/Singapore");
  $("clkNy").innerHTML = clockHtml("America/New_York");
  const { day, mins } = nyNow();

  let eqT = "Cash closed", eqC = "";
  if (day >= 1 && day <= 5) {
    if (mins >= 570 && mins < 960) { eqT = "NYSE open"; eqC = "open"; }
    else if (mins >= 240 && mins < 570) { eqT = "Pre-market"; eqC = "mid"; }
    else if (mins >= 960 && mins < 1200) { eqT = "After-hours"; eqC = "mid"; }
  }
  setStatus($("chipEq"), eqT, eqC);

  let fT = "Globex open", fC = "open";
  if (day === 6 || (day === 0 && mins < 1080) || (day === 5 && mins >= 1020)) { fT = "Globex closed"; fC = ""; }
  else if (day >= 1 && day <= 4 && mins >= 1020 && mins < 1080) { fT = "Globex break"; fC = "mid"; }
  setStatus($("chipFut"), fT, fC);
}

/* ------------------------------------------------------------------ tabs */
const appbarHeight = () => document.querySelector(".appbar").offsetHeight;

/* The sticky tab bar sits under the app bar, whose height changes with wrapping. */
export function trackAppbar() {
  const set = () => document.documentElement.style.setProperty("--appbar-h", appbarHeight() + "px");
  new ResizeObserver(set).observe(document.querySelector(".appbar"));
  set();
}
const TAB_KEY = "eqm.tab";
let onSelect = null;

function selectTab(btn, focus) {
  const tabs = [...document.querySelectorAll(".tab")];
  tabs.forEach(b => {
    const on = b === btn;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  });
  if (focus) btn.focus();
  const f = btn.dataset.filter;
  document.querySelectorAll(".group").forEach(sec => sec.classList.toggle("hidden", f !== "all" && sec.dataset.tab !== f));
  $("models").classList.toggle("hidden", f !== "all" && f !== "models");
  $("method").classList.toggle("hidden", f !== "all" && f !== "models");
  $("lab")?.classList.toggle("hidden", f !== "lab");
  onSelect?.(f);
  /* Switching after scrolling down: return the bar to its resting spot so the
     chosen group starts right under it. A stuck sticky bar reports its stuck
     offsetTop, so measure the resting spot from the page head above it. */
  const bar = $("tabs");
  if (focus !== undefined) {
    const head = bar.previousElementSibling;
    const rest = head.getBoundingClientRect().bottom + window.scrollY + parseFloat(getComputedStyle(head).marginBottom);
    const top = Math.max(0, rest - appbarHeight() - (getComputedStyle(bar).position === "sticky" ? 0 : 4));
    if (window.scrollY > top) window.scrollTo({ top, behavior: "instant" });
  }
  try { localStorage.setItem(TAB_KEY, f); } catch { /* storage blocked */ }
}

/* onTab(filter) runs after every switch, including the initial one. */
export function initTabs(onTab) {
  onSelect = onTab;
  const tabs = [...document.querySelectorAll(".tab")];
  tabs.forEach(b => b.addEventListener("click", () => selectTab(b, false)));
  /* Arrow-key navigation, as in the WAI-ARIA tabs pattern. */
  $("tabs").addEventListener("keydown", e => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = tabs.length - 1;
    if (j == null) return;
    e.preventDefault();
    selectTab(tabs[j], true);
  });
  let saved = null;
  try { saved = localStorage.getItem(TAB_KEY); } catch { /* storage blocked */ }
  /* Home-screen shortcuts open a group directly: /?tab=rates */
  saved = new URLSearchParams(location.search).get("tab") || saved;
  selectTab(tabs.find(b => b.dataset.filter === saved) || tabs[0]);
}

/* -------------------------------------------------------------- progress */
const PROG = { active: false, start: 0, done: 0, total: 1, label: "", timer: null };

function progTick() {
  if (!PROG.active) return;
  const elapsed = Math.floor((Date.now() - PROG.start) / 1000);
  const frac = PROG.total ? PROG.done / PROG.total : 0;
  const creep = Math.min(9, (Date.now() - PROG.start) / 1000 * 5);
  $("progFill").style.width = Math.min(96, frac * 88 + creep) + "%";
  $("progCap").textContent = PROG.label + " · " + PROG.done + "/" + PROG.total + " · " + elapsed + "s";
}

export function progStart(label, total) {
  Object.assign(PROG, { active: true, start: Date.now(), done: 0, total, label });
  $("progWrap").hidden = false;
  if (!PROG.timer) PROG.timer = setInterval(progTick, 250);
  progTick();
}

export function progBump() {
  PROG.done++;
  progTick();
}

export function progEnd() {
  PROG.active = false;
  clearInterval(PROG.timer);
  PROG.timer = null;
  const f = $("progFill");
  f.style.width = "100%";
  setTimeout(() => { $("progWrap").hidden = true; f.style.width = "0%"; }, 500);
}
