import { GROUPS } from "../config.js";
import { STATE } from "../state.js";
import { seriesStats } from "../quant/models.js";
import { $, bandTrack, clockIn, fmtNum, fmtChange, fmtDelta, fmtVol } from "./format.js";
import { ewmaVolPath, logReturns } from "../quant/stats.js";

/* Today's move in units of a normal day (EWMA vol known before today). */
function daySigma(item, values) {
  if (!values || values.length < 40) return null;
  const steps = item.kind === "price" ? logReturns(values) : values.slice(1).map((x, i) => x - values[i]);
  const vol = ewmaVolPath(steps)[steps.length - 2];
  return vol > 0 ? steps[steps.length - 1] / vol : null;
}
const sameName = it => it.name.toLowerCase().includes(it.ticker.toLowerCase());
import { noteFor } from "./notes.js";

/* Build the empty vitals table once; updateCard fills each row as data arrives.
   One row per indicator: name, value, today's change, the last three months
   inside the bands of its own past year, and its one-line reading. */
const COLS = '<div class="vit-cols" aria-hidden="true"><span>Indicator</span><span>Value</span><span>Today</span><span>3 months, in its 1-year bands</span><span>Reading</span></div>';

export function buildBoard(onOpen) {
  const board = $("board");
  for (const g of GROUPS) {
    const sec = document.createElement("section");
    sec.className = "group " + g.cls;
    sec.dataset.tab = g.tab;
    sec.setAttribute("aria-labelledby", "grp-" + g.tab);
    sec.innerHTML =
      '<div class="group-head"><h2 class="group-title" id="grp-' + g.tab + '">' + g.label + "</h2>" +
      '<span class="group-sub" data-total="' + g.items.length + '">' + g.items.length + " indicators</span></div>" + COLS;
    const grid = document.createElement("div");
    grid.className = "grid";
    for (const it of g.items) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "card " + g.cls;
      card.id = "card-" + it.id;
      card.title = it.desc;
      /* What the rail's filter box matches on: ticker, name, group. */
      card.dataset.q = (it.ticker + " " + it.name + " " + g.label).toLowerCase();
      card.setAttribute("aria-label", it.name + ": loading");
      card.innerHTML =
        '<span class="v-id"><span class="v-name"><span class="gdot" aria-hidden="true"></span>' +
        (sameName(it) ? "" : '<span class="tk">' + it.ticker + "</span>") + '<span class="nm' + (sameName(it) ? " solo" : "") + '">' + it.name + "</span></span>" +
        '<span class="cstats num" data-el="stats" hidden></span></span>' +
        '<span class="val num skel" data-el="val">00000</span>' +
        '<span class="pill flat skel" data-el="pill">.....</span>' +
        '<span class="spark" data-el="spark"></span>' +
        '<span class="note" data-el="note" hidden></span>';
      card.addEventListener("click", () => onOpen(it));
      grid.appendChild(card);
    }
    sec.appendChild(grid);
    board.appendChild(sec);
  }
}

export function updateCard(item) {
  const card = $("card-" + item.id);
  const s = STATE[item.id];
  const el = name => card.querySelector('[data-el="' + name + '"]');
  const val = el("val"), pill = el("pill"), note = el("note"), spark = el("spark"), stats = el("stats");
  val.classList.remove("skel");
  pill.classList.remove("skel");

  if (!s || s.error || s.price == null) {
    card.classList.add("err");
    val.textContent = "—";
    pill.textContent = "";
    pill.className = "pill";
    note.hidden = false;
    note.textContent = s?.reason || "No data · retrying";
    note.className = "note";
    stats.hidden = true;
    card.setAttribute("aria-label", item.name + ": unavailable");
    return;
  }
  card.classList.remove("err");
  card.classList.toggle("stale", !!s.stale);

  const shownBefore = card.dataset.px ? parseFloat(card.dataset.px) : null;
  card.dataset.px = s.price;
  const valueText = fmtNum(s.price, item.fmt);
  val.textContent = valueText;

  /* Plain signed figures; colour only when the day's move is rare for this market
     (amber beyond 2σ of a normal day, red beyond 3σ). */
  const ch = fmtChange(item, s.price, s.prev);
  if (!ch) {
    pill.textContent = item.pillOverride || "—";
    pill.className = "pill";
  } else {
    const z = item.weekly ? null : daySigma(item, s.values);
    pill.textContent = ch.text;
    pill.className = "pill num" + (z != null && Math.abs(z) >= 3 ? " r" : z != null && Math.abs(z) >= 2 ? " a" : "");
    pill.title = z == null ? "" : (z >= 0 ? "+" : "−") + Math.abs(z).toFixed(1) + "× a normal day's move";
  }

  const hasHist = s.values && s.values.length > 1;
  const st = hasHist ? seriesStats({ dates: s.dates, values: s.values }, item.kind, item.ppy || (item.weekly ? 52 : 252)) : null;
  const nt = noteFor(item, s, st);
  const stale = s.cached ? "Saved copy from " + clockIn("Asia/Singapore", { at: s.savedAt }) + " SGT" : s.stale ? "Last good value · source retrying" : null;
  if (stale || nt) {
    note.hidden = false;
    note.textContent = stale || nt.t;
    note.className = "note " + (stale ? "" : nt.c);
  } else {
    note.hidden = true;
  }

  /* Compact stats: one-month change and annualized EWMA vol in the series' units. */
  if (st && !item.weekly) {
    stats.hidden = false;
    stats.textContent = "1M " + fmtDelta(item, st.chg.m1) + " · σ " + fmtVol(item, st.volEwma);
  } else {
    stats.hidden = true;
  }

  /* Three months inside the bands of the past year (13 weeks / 52 for weekly series). */
  const ppy = item.ppy || (item.weekly ? 52 : 252);
  const track = hasHist ? bandTrack(s.values.slice(item.weekly ? -13 : -Math.round(63 * ppy / 252)), s.values.slice(-ppy - 1)) : null;
  if (track && track.svg) {
    card.classList.remove("no-spark");
    spark.innerHTML = track.svg;
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
