/* Flows and premia: trend-follower (CTA) positioning, the variance risk
   premium, the stock–bond correlation and the market calendar. */
import { buildCalendar, buildStockBond, buildTrend, buildVrp } from "../model/models.js";
import { fmtDay } from "../quant/calendar.js";
import { FOMC_STATE } from "../data/fomc.js";
import { percentileRank } from "../quant/stats.js";
import { $, fmtNum, ordinal, stepDp } from "./format.js";
import { chart } from "./chart.js";

const AMBER = "#D9A84E";
const sgn = (x, dp = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(dp);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sessions = (n, tradingToday) => (n === 0 ? (tradingToday ? "today" : "next session") : n === 1 ? "in 1 session" : "in " + n + " sessions");

export const FLOWS = { vrp: null, sb: null, trend: null, cal: null };

function renderTrend() {
  const t = buildTrend();
  FLOWS.trend = t;
  const bars = $("ctaBars"), side = $("ctaSide");
  if (!t.length) {
    $("ctaSub").textContent = "Needs a year of daily history";
    bars.innerHTML = ""; side.innerHTML = "";
    return;
  }
  const breadth = t.reduce((a, x) => a + x.pos, 0) / t.length;
  $("ctaSub").textContent = "Average across " + t.length + " markets " + sgn(breadth) + " · 1M, 3M, 6M and 12M signals, vol-scaled";
  bars.innerHTML = t.map(x => {
    const w = Math.min(1, Math.abs(x.pos)) * 50;
    const arrows = x.legs.map(l => (l.z >= 0 ? "▲" : "▼")).join("");
    const label = x.item.kind === "rate" ? "10Y Treasury" : x.item.ticker;
    return '<li><span class="cb-l">' + esc(label) + ' <em title="1M, 3M, 6M, 12M">' + arrows + "</em></span>" +
      '<span class="cb-bar"><i class="' + (x.pos >= 0 ? "u" : "d") + '" style="' + (x.pos >= 0 ? "left" : "right") + ":50%;width:" + w.toFixed(1) + '%"></i></span>' +
      '<span class="cb-v num">' + sgn(x.pos) + "</span></li>";
  }).join("");

  /* Detail for the two index futures most users trade. */
  side.innerHTML = t.filter(x => x.id === "es" || x.id === "nq").map(x => {
    const fmt = v => fmtNum(v, { dp: 0 });
    const flips = x.legs.map(l => {
      const d = (l.flip / x.last - 1) * 100;
      return "<li><span>" + ["1M", "3M", "6M", "12M"][x.legs.indexOf(l)] + (l.z >= 0 ? " long, flips below" : " short, flips above") +
        '</span><b class="num">' + fmt(l.flip) + ' <em>' + sgn(d, 1) + "%</em></b></li>";
    }).join("");
    const f = k => x.scenarios.find(s => s.k === k)?.flow;
    const flow = v => (v == null ? "—" : (v < 0 ? "sell " : "buy ") + Math.abs(v).toFixed(2));
    return '<div class="cta-mkt"><p class="cta-h"><b>' + x.item.ticker + "</b> " + sgn(x.pos) + " of max " + (x.pos >= 0 ? "long" : "short") + "</p>" +
      '<ul class="cta-flips">' + flips + "</ul>" +
      '<p class="cta-flow num">A −2σ week: <b class="d">' + flow(f(-2)) + '</b> · a +2σ week: <b class="u">' + flow(f(2)) + "</b></p></div>";
  }).join("") || '<p class="m-cap">ES and NQ need a year of history.</p>';
}

function renderVrp() {
  const v = buildVrp();
  FLOWS.vrp = v;
  const el = $("vrpValue"), sub = $("vrpSub"), ch = $("vrpChart");
  if (!v) { el.textContent = "—"; sub.textContent = "Needs VIX and ES history"; chart(ch, { dates: null, values: [] }); return; }
  const n = v.values.length, x = v.values[n - 1];
  const year = v.values.slice(-253, -1);
  const pct = year.length > 60 ? percentileRank(x, year) : null;
  el.textContent = sgn(x, 1) + " pts";
  const tag = x < 0 ? ["Negative", "d"] : pct != null && pct >= 0.8 ? ["Rich", "u"] : pct != null && pct <= 0.2 ? ["Thin", ""] : ["Normal", ""];
  sub.innerHTML = '<span class="m-tag ' + tag[1] + '">' + tag[0] + "</span> VIX " + v.vix[n - 1].toFixed(1) + " vs ES realized " + v.rv[n - 1].toFixed(1) + "%" +
    (pct == null ? "" : " · " + ordinal(Math.round(pct * 100)) + " pctile (1Y)");
  chart(ch, {
    dates: v.dates.slice(-252), values: v.values.slice(-252), zero: true, color: AMBER, height: 120, label: "Variance risk premium, 1 year",
    format: (y, i) => sgn(y, 1) + " pts · VIX " + v.vix.slice(-252)[i].toFixed(1) + ", realized " + v.rv.slice(-252)[i].toFixed(1),
    tick: (y, st) => (Math.abs(y) < 1e-9 ? "0" : sgn(y, stepDp(st))),
  });
}

function renderStockBond() {
  const c = buildStockBond();
  FLOWS.sb = c;
  const el = $("sbValue"), sub = $("sbSub"), ch = $("sbChart");
  if (!c) { el.textContent = "—"; sub.textContent = "Needs ES and 10Y history"; chart(ch, { dates: null, values: [] }); return; }
  const x = c.values[c.values.length - 1];
  const tag = x <= -0.2 ? ["Bonds hedge stocks", "u"] : x >= 0.2 ? ["Falling together", "d"] : ["Weak link", ""];
  el.textContent = sgn(x);
  sub.innerHTML = '<span class="m-tag ' + tag[1] + '">' + tag[0] + "</span> 63-day correlation, ES vs Treasury price moves";
  chart(ch, {
    dates: c.dates.slice(-504), values: c.values.slice(-504), zero: true, domain: [-1, 1], color: AMBER, height: 120,
    label: "Stock–bond correlation, 2 years", format: y => sgn(y), tick: y => (Math.abs(y) < 1e-9 ? "0" : sgn(y, 1)),
  });
}

function renderCalendar() {
  const c = buildCalendar();
  FLOWS.cal = c;
  const rows = [];
  const t = c.today;
  if (t?.tomDay != null) {
    rows.push(["Turn of month", "In the window today: " + (t.tomDay === -1 ? "the last trading day" : "day " + t.tomDay + " of the new month"), "u"]);
  } else if (c.tomStart) {
    rows.push(["Turn of month", fmtDay(c.tomStart.date) + ", " + sessions(c.tomStart.sessions, c.tradingToday) + ". The last trading day and the first three of the next month.", ""]);
  }
  const fomcSrc = FOMC_STATE.source === "built-in" ? " Dates from the built-in schedule (federalreserve.gov not reached yet)." : " Dates read from federalreserve.gov.";
  rows.push(["FOMC statement", (c.fomc ? fmtDay(c.fomc.date) + ", 2 pm ET, " + sessions(c.fomc.sessions, c.tradingToday) + "." : "No meeting scheduled in the calendar yet.") + fomcSrc, c.fomc && c.fomc.sessions <= 1 ? "a" : ""]);
  if (c.opex) {
    rows.push(["Option expiry", fmtDay(c.opex.date) + ", " + sessions(c.opex.sessions, c.tradingToday) + (c.opex.quad ? ". Quarterly: stock options, index options and futures expire together (quad witching)." : ". Monthly expiry."), c.opex.quad && c.opex.sessions <= 5 ? "a" : ""]);
  }
  if (c.holiday) rows.push(["Market holiday", fmtDay(c.holiday.date) + ", " + c.holiday.name, ""]);
  if (c.rebal) {
    const g = c.rebal.gap;
    const big = Math.abs(g) >= 2;
    const lead = g >= 0 ? "Stocks lead Treasuries by " : "Stocks trail Treasuries by ";
    rows.push(["Month-end rebalancing", lead + Math.abs(g).toFixed(1) + " pts this month (ES " + sgn(c.rebal.eq, 1) + "%, 10Y Treasury ≈ " + sgn(c.rebal.bond, 1) + "%)." +
      (big ? (g > 0 ? " Balanced funds tend to sell stocks into month-end after a gap like this." : " Balanced funds tend to buy stocks into month-end after a gap like this.") : " Too small to force much rebalancing.") +
      (c.monthEnd ? " Month ends " + fmtDay(c.monthEnd.date) + "." : ""), big ? "a" : ""]);
  }
  $("calList").innerHTML = rows.map(([k, v, tone]) => '<li class="' + tone + '"><span class="cal-k">' + k + '</span><span class="cal-v">' + esc(v) + "</span></li>").join("");
}

export function renderFlows() {
  renderTrend();
  renderVrp();
  renderStockBond();
  renderCalendar();
}
