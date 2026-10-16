import { GROUPS } from "../config.js";
import { STATE } from "../state.js";
import { $, fmtNum, fmtChange, lineChart } from "./format.js";
import { noteFor } from "./notes.js";

/* Build the empty card grid once; updateCard fills it as data arrives. */
export function buildBoard(onOpen) {
  const board = $("board");
  let stagger = 0;
  for (const g of GROUPS) {
    const sec = document.createElement("section");
    sec.className = "group";
    sec.dataset.tab = g.tab;
    sec.setAttribute("aria-labelledby", "grp-" + g.tab);
    sec.innerHTML =
      '<div class="group-head"><h2 class="group-title" id="grp-' + g.tab + '">' + g.label + "</h2>" +
      '<span class="group-sub">3-month daily closes</span></div>';
    const grid = document.createElement("div");
    grid.className = "grid";
    for (const it of g.items) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "card " + g.cls;
      card.id = "card-" + it.id;
      card.setAttribute("aria-label", it.name + ": loading");
      card.innerHTML =
        '<span class="card-top"><span class="gdot" aria-hidden="true"></span><span class="tk">' + it.ticker + "</span>" +
        '<span class="pill flat skel" data-el="pill">.....</span></span>' +
        '<span class="val num skel" data-el="val">00000</span>' +
        '<span class="nm">' + it.name + "</span>" +
        '<span class="ds">' + it.desc + "</span>" +
        '<span class="note" data-el="note" hidden></span>' +
        '<span class="spark" data-el="spark"></span>';
      card.addEventListener("click", () => onOpen(it));
      grid.appendChild(card);
      setTimeout(() => card.classList.add("in"), stagger);
      stagger += 30;
    }
    sec.appendChild(grid);
    board.appendChild(sec);
  }
}

export function updateCard(item) {
  const card = $("card-" + item.id);
  const s = STATE[item.id];
  const el = name => card.querySelector('[data-el="' + name + '"]');
  const val = el("val"), pill = el("pill"), note = el("note"), spark = el("spark");
  val.classList.remove("skel");
  pill.classList.remove("skel");

  if (!s || s.error || s.price == null) {
    card.classList.add("err");
    val.textContent = "----";
    pill.textContent = "n/a";
    pill.className = "pill flat";
    note.hidden = false;
    note.textContent = "Feed unreachable · retrying next cycle";
    note.className = "note d";
    card.setAttribute("aria-label", item.name + ": unavailable");
    return;
  }
  card.classList.remove("err");
  card.classList.toggle("stale", !!s.stale);

  const shownBefore = card.dataset.px ? parseFloat(card.dataset.px) : null;
  card.dataset.px = s.price;
  const valueText = fmtNum(s.price, item.fmt);
  val.textContent = valueText;

  const ch = fmtChange(item, s.price, s.prev);
  if (!ch) {
    pill.textContent = item.pillOverride || "--";
    pill.className = "pill flat";
  } else {
    pill.textContent = (ch.up ? "▲ " : "▼ ") + ch.text;
    pill.className = "pill num " + ch.tone;
  }

  const nt = noteFor(item, s);
  const stale = s.stale ? "Last good value · feed retrying" : null;
  if (stale || nt) {
    note.hidden = false;
    note.textContent = stale || nt.t;
    note.className = "note " + (stale ? "" : nt.c);
  } else {
    note.hidden = true;
  }

  if (s.closes && s.closes.length > 1) {
    card.classList.remove("no-spark");
    const recent = s.closes.slice(-63);
    const trendUp = recent[recent.length - 1] >= recent[0];
    spark.innerHTML = lineChart(recent, { good: item.invert ? !trendUp : trendUp, id: item.id });
  } else {
    card.classList.add("no-spark");
    spark.innerHTML = "";
  }

  card.setAttribute("aria-label", item.name + " " + valueText + (ch ? ", " + ch.text : "") + ". Open details");

  if (shownBefore != null && Math.abs(shownBefore - s.price) > 1e-9) {
    const cls = s.price > shownBefore ? "flash-up" : "flash-down";
    val.classList.add(cls);
    setTimeout(() => val.classList.remove(cls), 900);
  }
}
