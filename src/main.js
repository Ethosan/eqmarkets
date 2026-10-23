import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";

import { ALL, FETCHABLE, ITEM_BY_ID, REFRESH_MS } from "./config.js";
import { STATE } from "./state.js";
import { probe } from "./data/transport.js";
import { fetchItem } from "./data/sources.js";
import { computeDerived } from "./model/derived.js";
import { buildBoard, updateCard } from "./ui/board.js";
import { renderModels } from "./ui/models-panel.js";
import { renderFlows } from "./ui/flows-panel.js";
import { loadFomc } from "./data/fomc.js";
import { initMethods } from "./ui/methods.js";
import { initDetail, openDetail, refreshDetail } from "./ui/detail.js";
import { initSearch } from "./ui/search.js";
import { tickClocks, initTabs, trackAppbar, progStart, progBump, progEnd, initTheme, foldOnPhones } from "./ui/chrome.js";
import { $, clockIn } from "./ui/format.js";
import { initGuide } from "./ui/guide.js";
import { initRead } from "./ui/read-panel.js";
import { loadSnapshot, saveSnapshot } from "./data/snapshot.js";
import { initPwa } from "./pwa.js";
import { maybeStartTour, startTour } from "./ui/tour.js";

const STALE_AFTER = 5 * 60_000;
let nextAt = Date.now() + REFRESH_MS;
let running = false;
let lastOk = 0;
let reachable = null;

const wait = ms => new Promise(r => setTimeout(r, ms));
const anyOkNow = () => ALL.some(it => STATE[it.id] && !STATE[it.id].error);

function stampText() {
  if (!lastOk) return null;
  const at = clockIn("Asia/Singapore", { at: lastOk });
  const age = Date.now() - lastOk;
  return age > STALE_AFTER ? "Stale · last update " + at + " SGT" : "Updated " + at + " SGT";
}

async function refresh() {
  if (running) return;
  running = true;
  if (!reachable) {
    progStart("Probing feeds", 1);
    reachable = await probe();
  }
  progStart("Pulling feeds", FETCHABLE.length);

  if (reachable) {
    /* The batch has a deadline: a feed still running when it passes keeps its last
       value (marked stale) and is retried next cycle. Without it one flaky source
       freezes the progress bar one short and holds `running` until its retries
       exhaust, skipping every refresh in between. */
    await Promise.race([
      Promise.allSettled(FETCHABLE.map((it, i) =>
        wait(i * 110).then(() => fetchItem(it)).finally(progBump)
      )),
      wait(30_000),
    ]);
  }
  FETCHABLE.forEach(it => { if (!STATE[it.id]) STATE[it.id] = { error: true }; });
  computeDerived();
  ALL.forEach(updateCard);
  renderModels();
  if (anyOkNow()) maybeStartTour();
  refreshDetail();
  progEnd();

  feedHealth();
  /* Fresh data means a feed answered this cycle; derived cards don't count. */
  const anyOk = FETCHABLE.some(it => STATE[it.id] && !STATE[it.id].error && !STATE[it.id].stale);
  if (anyOk) { lastOk = Date.now(); saveSnapshot(); }
  $("liveDot").classList.toggle("on", anyOk);
  $("stamp").textContent = !anyOk && !navigator.onLine && lastOk
    ? "Offline · saved " + clockIn("Asia/Singapore", { at: lastOk }) + " SGT"
    : stampText() || "Feeds unreachable · tap to retry";
  $("modeNote").textContent = reachable ? "" :
    " · No data source answered. If you opened this file directly or in a sandboxed preview, deploy it to Netlify: quotes load there through the site's own proxy.";
  if (!anyOk) reachable = null; /* probe again next cycle */

  nextAt = Date.now() + REFRESH_MS;
  running = false;
}

/* How many feeds answered this cycle, and which source is down when one is. */
function feedHealth() {
  const bad = FETCHABLE.filter(it => !STATE[it.id] || STATE[it.id].error || STATE[it.id].stale);
  const el = $("feedHealth");
  if (!bad.length) { el.textContent = "All " + FETCHABLE.length + " feeds live"; el.classList.remove("warn"); return; }
  /* Say what is true: rows on a saved or last good value, and rows with no data at all. */
  const fred = FETCHABLE.filter(it => it.fredId && !it.symbols);
  const fredDown = fred.filter(it => bad.includes(it)).length >= fred.length / 2;
  const empty = bad.filter(it => !STATE[it.id] || STATE[it.id].error).length;
  const kept = bad.length - empty;
  const live = FETCHABLE.length - bad.length;
  const detail = [kept && kept + " on last values", empty && empty + " without data"].filter(Boolean).join(", ");
  el.innerHTML = '<span class="f-long">' + live + " of " + FETCHABLE.length + " feeds live" + (fredDown ? " · FRED not answering" : "") + " · " + detail + "</span>" +
    '<span class="f-short">' + (fredDown ? "FRED down · " : live + "/" + FETCHABLE.length + " live · ") + detail + "</span>";
  el.classList.add("warn");
}

/* Admin mode: ?admin=1 turns on the backtest lab tab for this browser, ?admin=0
   turns it off. It only hides UI; the lab uses the same public data. */
function adminMode() {
  const q = new URLSearchParams(location.search).get("admin");
  try {
    if (q === "1") localStorage.setItem("eqm.admin", "1");
    else if (q === "0") localStorage.removeItem("eqm.admin");
    return localStorage.getItem("eqm.admin") === "1";
  } catch {
    return q === "1";
  }
}
const ADMIN = adminMode();
if (!ADMIN) { $("tabLab").remove(); $("lab").remove(); }
let lab = null;
/* The lab is its own chunk, fetched the first time its tab opens. */
const openLab = f => { if (f === "lab" && ADMIN && !lab) lab = import("./lab/lab.js").then(m => m.mountLab($("lab"))); };
/* Alt signals is its own chunk too, fetched when its tab opens and refreshed on reopening. */
const openSignals = f => { if (f === "signals") import("./ui/signals-panel.js").then(m => m.showSignals($("signals"))).catch(() => {}); };

initTheme();
trackAppbar();
foldOnPhones(["raiMore", "biasMore"]);
/* Cards first: the saved or shortcut tab hides groups, so they must exist. */
buildBoard(item => openDetail(ITEM_BY_ID[item.id]));
initTabs(f => { openLab(f); openSignals(f); });
initSearch();
initDetail();
initGuide({ onReplayTour: startTour });
initMethods();
initRead();
tickClocks();
/* Paint the last session's data straight away (also the offline view), then refresh. */
const savedAt = loadSnapshot();
if (savedAt) {
  computeDerived();
  ALL.forEach(updateCard);
  renderModels();
  lastOk = savedAt;
  $("stamp").textContent = stampText();
}
/* After the first paint of live data: read the Fed's FOMC calendar, and start
   the market-bias model (its own chunk, ten years of history, cached). */
refresh().finally(() => {
  loadFomc().then(ok => { if (ok) renderFlows(); }).catch(() => {});
  import("./ui/bias-panel.js").then(m => m.initBias()).catch(() => {});
});

setInterval(() => {
  tickClocks();
  if (!running) {
    const t = navigator.onLine ? stampText() : null;
    if (t) $("stamp").textContent = t;
    if (Date.now() >= nextAt) refresh();
  }
}, 1000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - lastOk > 90_000) refresh();
});
$("stamp").addEventListener("click", refresh);

initPwa();
