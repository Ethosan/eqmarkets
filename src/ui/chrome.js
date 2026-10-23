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

/* Sticky offsets: the section tabs sit under the status bar on narrow screens,
   and each indicator group's heading sticks under both. */
const tabsSticky = () => matchMedia("(max-width: 959px)").matches;
export function trackAppbar() {
  const set = () => {
    const bar = appbarHeight(), tabs = tabsSticky() ? $("tabs").offsetHeight : 0;
    document.documentElement.style.setProperty("--appbar-h", bar + "px");
    document.documentElement.style.setProperty("--sticky-top", bar + tabs + "px");
  };
  const ro = new ResizeObserver(set);
  ro.observe(document.querySelector(".appbar"));
  ro.observe($("tabs"));
  set();
}

/* Light or dark: the system's choice unless the reader picked one here. */
const THEME_KEY = "eqm.theme";
const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
function currentTheme() {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : systemDark() ? "dark" : "light";
}
function paintThemeButton() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  const b = $("themeBtn");
  b.setAttribute("aria-label", "Switch to " + next + " theme");
  b.title = "Switch to " + next + " theme";
  b.innerHTML = next === "dark"
    ? '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const meta = document.querySelectorAll('meta[name="theme-color"]');
  const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
  if (document.documentElement.dataset.theme) meta.forEach(m => { m.setAttribute("content", paper); m.removeAttribute("media"); });
}
export function initTheme() {
  paintThemeButton();
  $("themeBtn").addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked */ }
    paintThemeButton();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintThemeButton);
}

/* A card's secondary detail starts folded on phones and open on wider screens. */
export function foldOnPhones(ids) {
  if (!matchMedia("(max-width: 720px)").matches) return;
  ids.forEach(id => { const d = $(id); if (d) d.open = false; });
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
  btn.scrollIntoView({ block: "nearest", inline: "nearest" });
  const f = btn.dataset.filter;
  $("board").dataset.view = f;
  document.querySelectorAll(".group").forEach(sec => sec.classList.toggle("hidden", f !== "all" && sec.dataset.tab !== f));
  $("overview").classList.toggle("hidden", f !== "all" && f !== "models");
  $("models").classList.toggle("hidden", f !== "all" && f !== "models");
  $("method").classList.toggle("hidden", f !== "all" && f !== "models");
  $("lab")?.classList.toggle("hidden", f !== "lab");
  $("signals").classList.toggle("hidden", f !== "signals");
  onSelect?.(f);
  /* Switching after scrolling down: start the chosen section at the top. */
  if (focus !== undefined && window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
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
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + tabs.length) % tabs.length;
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
  /* A column of tabs in the rail, a row on narrow screens. */
  const orient = () => $("tabs").setAttribute("aria-orientation", tabsSticky() ? "horizontal" : "vertical");
  orient();
  matchMedia("(max-width: 959px)").addEventListener("change", orient);
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
