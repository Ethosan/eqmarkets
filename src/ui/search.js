/* The rail's indicator filter: type a name, ticker or group and the 45 vital
   rows narrow live. "/" focuses it from anywhere, Esc clears it, and a query
   reaches across groups, so a single-group tab switches back to Overview.
   Pure DOM: board.js stamps each card with a data-q of what it matches on. */
import { $ } from "./format.js";

export function initSearch() {
  const input = $("q"), out = $("qOut"), board = $("board");
  const cards = [...board.querySelectorAll(".card")];
  const total = cards.length;

  const run = raw => {
    const q = raw.trim().toLowerCase();
    let shown = 0;
    for (const c of cards) {
      const hit = !q || c.dataset.q.includes(q);
      c.classList.toggle("q-hide", !hit);
      if (hit) shown++;
    }
    /* A group whose rows all fell away folds up; its caption shows the count. */
    board.querySelectorAll(".group").forEach(sec => {
      const vis = [...sec.querySelectorAll(".card")].filter(c => !c.classList.contains("q-hide")).length;
      sec.classList.toggle("q-empty", q !== "" && vis === 0);
      const sub = sec.querySelector(".group-sub");
      if (sub) sub.textContent = q === "" ? sub.dataset.total + " indicators" : vis + " of " + sub.dataset.total;
    });
    out.textContent = q === "" ? "" : shown ? shown + " of " + total + " shown" : "No matches · Esc clears";
    if (q !== "" && board.dataset.view !== "all") {
      const all = document.querySelector('.tab[data-filter="all"]');
      if (all && all.getAttribute("aria-selected") !== "true") all.click();
    }
  };

  input.addEventListener("input", () => run(input.value));
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") { input.value = ""; run(""); input.blur(); }
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector("dialog[open]") || document.documentElement.classList.contains("touring")) return;
    const t = e.target;
    if (t === input || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) return;
    e.preventDefault();
    input.focus();
    input.select();
  });
}
