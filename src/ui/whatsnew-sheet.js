/* "What's new" sheet: the release log in src/whatsnew.js, opened from the version link in the
   footer. Quiet on purpose: no badge, no popup, nothing on load; it's there for whoever looks. */
import { $ } from "./format.js";
import { swipeToClose, closeSheet } from "./sheet.js";
import { WHATS_NEW } from "../whatsnew.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtDate = d => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

let built = false;
function build() {
  if (built) return;
  built = true;
  $("wBody").innerHTML = WHATS_NEW.map(e => `
<section class="g-sec w-sec">
  <p class="w-meta"><time datetime="${esc(e.d)}">${esc(fmtDate(e.d))}</time> · v${esc(e.v)}</p>
  <h3>${esc(e.title)}</h3>
  <ul class="w-list">${e.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>
</section>`).join("");
}

export function initWhatsNew(version) {
  const btn = $("appVersion"), dlg = $("whatsnew");
  if (!btn || !dlg) return;
  btn.textContent = (version ? "v" + version + " · " : "") + "What's new";
  btn.addEventListener("click", () => {
    build();
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  });
  $("wClose").addEventListener("click", () => closeSheet(dlg));
  dlg.addEventListener("click", e => { if (e.target === dlg) closeSheet(dlg); });
  dlg.addEventListener("close", () => btn.focus());
  swipeToClose(dlg, [$("wGrab"), dlg.querySelector(".d-head")]);
}
