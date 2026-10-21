/* Installable app: service worker registration, an install bar (the browser's
   own prompt on Android and desktop, Share → Add to Home Screen steps on iOS),
   and a reload notice when a new version takes over. */
import { $ } from "./ui/format.js";

const DISMISS_KEY = "eqm.install.dismissed";
const DISMISS_FOR = 30 * 864e5;

const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

let deferred = null;

function dismissedRecently() {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_FOR; } catch { return false; }
}

export const canInstall = () => !standalone() && (deferred != null || isIOS());

const SHARE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true" style="vertical-align:-3px"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5v9h14v-9h-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function bar() {
  let el = $("pwaBar");
  if (el) return el;
  el = document.createElement("div");
  el.id = "pwaBar";
  el.className = "pwa-bar";
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", "Install the app");
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

/* Install: the browser prompt where there is one, otherwise the iOS steps. */
export async function install() {
  if (deferred) {
    deferred.prompt();
    const { outcome } = await deferred.userChoice.catch(() => ({ outcome: "dismissed" }));
    deferred = null;
    hideBar(outcome !== "accepted");
    refreshGuideButton();
    return;
  }
  if (isIOS()) showIOSSteps();
}

function showIOSSteps() {
  const el = bar();
  el.innerHTML =
    '<img src="/icons/icon-192.png" alt="" width="40" height="40">' +
    '<div class="pwa-txt"><b>Add to your Home Screen</b>' +
    "<span>Tap " + SHARE_ICON + " <b>Share</b>, then <b>Add to Home Screen</b>. It opens full screen and works offline.</span></div>" +
    '<button type="button" class="pwa-x" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
  el.querySelector(".pwa-x").addEventListener("click", () => hideBar(true));
  el.hidden = false;
}

function offerBar() {
  if (!canInstall() || dismissedRecently()) return;
  if (document.documentElement.classList.contains("touring") || document.querySelector("dialog[open]")) return;
  let seenTour = true;
  try { seenTour = !!localStorage.getItem("eqm.tour.v2"); } catch { /* storage blocked */ }
  if (!seenTour) return;
  const el = bar();
  el.innerHTML =
    '<img src="/icons/icon-192.png" alt="" width="40" height="40">' +
    '<div class="pwa-txt"><b>Install Equarian</b><span>Full screen, opens instantly, works offline.</span></div>' +
    '<button type="button" class="t-btn pwa-go">Install</button>' +
    '<button type="button" class="pwa-x" aria-label="Not now"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
  el.querySelector(".pwa-go").addEventListener("click", install);
  el.querySelector(".pwa-x").addEventListener("click", () => hideBar(true));
  el.hidden = false;
}

function hideBar(remember) {
  const el = $("pwaBar");
  if (el) el.hidden = true;
  if (remember) try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage blocked */ }
}

function refreshGuideButton() {
  const b = $("gInstall");
  if (b) b.hidden = !canInstall();
}

function updateNotice() {
  const el = bar();
  el.innerHTML =
    '<div class="pwa-txt"><b>New version ready</b><span>Reload to use it.</span></div>' +
    '<button type="button" class="t-btn pwa-go">Reload</button>' +
    '<button type="button" class="pwa-x" aria-label="Later"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
  el.querySelector(".pwa-go").addEventListener("click", () => location.reload());
  el.querySelector(".pwa-x").addEventListener("click", () => hideBar(false));
  el.hidden = false;
}

export function initPwa() {
  addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferred = e;
    refreshGuideButton();
  });
  addEventListener("appinstalled", () => { deferred = null; hideBar(false); refreshGuideButton(); });
  $("gInstall")?.addEventListener("click", () => { $("guide").close(); install(); });
  refreshGuideButton();
  /* Offer the bar once the visitor has had a look around, and again when the tour ends. */
  setTimeout(offerBar, 12_000);
  addEventListener("eqm:tourend", () => setTimeout(offerBar, 1500));

  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    /* First install also fires this; only a replaced worker means a new version. */
    if (hadController) updateNotice();
  });
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(reg => {
      /* Long-lived app windows: look for a new deploy when brought back to the front. */
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  });
}
