import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";

import { ALL, ITEM_BY_ID, REFRESH_MS } from "./config.js";
import { STATE } from "./state.js";
import { probe } from "./data/transport.js";
import { fetchItem } from "./data/sources.js";
import { computeDerived } from "./model/derived.js";
import { buildBoard, updateCard } from "./ui/board.js";
import { renderRegime } from "./ui/regime-panel.js";
import { initDetail, openDetail, refreshDetail } from "./ui/detail.js";
import { tickClocks, initTabs, progStart, progBump, progEnd } from "./ui/chrome.js";
import { $, clockIn } from "./ui/format.js";

const STALE_AFTER = 5 * 60_000;
let nextAt = Date.now() + REFRESH_MS;
let running = false;
let lastOk = 0;
let reachable = null;

const wait = ms => new Promise(r => setTimeout(r, ms));

function stampText() {
  if (!lastOk) return null;
  const at = clockIn("Asia/Singapore", { at: lastOk });
  const age = Date.now() - lastOk;
  return age > STALE_AFTER ? "Stale · last update " + at + " SGT" : "Updated " + at + " SGT";
}

async function refresh() {
  if (running) return;
  running = true;
  const fetchables = ALL.filter(it => !it.computed);
  if (!reachable) {
    progStart("Probing feeds", 1);
    reachable = await probe();
  }
  progStart("Pulling feeds", fetchables.length);

  if (reachable) {
    await Promise.allSettled(fetchables.map((it, i) =>
      wait(i * 140).then(() => fetchItem(it)).finally(progBump)
    ));
  }
  ALL.forEach(it => { if (!it.computed && !STATE[it.id]) STATE[it.id] = { error: true }; });
  computeDerived();
  ALL.forEach(updateCard);
  renderRegime();
  refreshDetail();
  progEnd();

  const anyOk = ALL.some(it => STATE[it.id] && !STATE[it.id].error && !STATE[it.id].stale);
  if (anyOk) lastOk = Date.now();
  $("liveDot").classList.toggle("on", anyOk);
  $("stamp").textContent = stampText() || "Feeds unreachable · tap to retry";
  $("modeNote").textContent = reachable ? "" :
    " · No data source answered. If you opened this file directly or in a sandboxed preview, deploy it to Netlify: quotes load there through the site's own proxy.";
  if (!anyOk) reachable = null; /* probe again next cycle */

  nextAt = Date.now() + REFRESH_MS;
  running = false;
}

initTabs();
initDetail();
buildBoard(item => openDetail(ITEM_BY_ID[item.id]));
tickClocks();
refresh();

setInterval(() => {
  tickClocks();
  if (!running) {
    const t = stampText();
    if (t) $("stamp").textContent = t;
    if (Date.now() >= nextAt) refresh();
  }
}, 1000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - lastOk > 90_000) refresh();
});
$("stamp").addEventListener("click", refresh);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
