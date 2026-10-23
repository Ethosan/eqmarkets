/* Alt signals tab: the odd indicators traders swear by, each with its live reading,
   whether its feed is up, and whether it has ever held up in a test. Fun first, but
   the scoreboard keeps entertainment and evidence apart. Loaded the first time the
   tab opens, and again when it reopens after ten minutes. */
import { chart } from "./chart.js";
import { forwardAfter, isoDay, loadSignals, moonBuckets, moonPhase, MOON, nightlife, phaseBin, PHASES, pizza } from "../data/signals.js";

const STALE_MS = 10 * 60_000;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sgn = (x, dp = 1) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(dp);
const pct = (x, dp = 1) => sgn(x * 100, dp) + "%";
const ago = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? "just now" : m < 60 ? m + "m ago" : m < 1440 ? Math.round(m / 60) + "h ago" : Math.round(m / 1440) + "d ago"; };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = t => MON[+t.slice(5, 7) - 1] + " " + t.slice(0, 4);

let root = null, data = null, loading = null;
const ranges = { cnn: 365, crypto: 365, night: 60 };

/* --------------------------------------------------------------- verdicts */
/* One vocabulary for every card and the scoreboard. */
const V = {
  edge: { cls: "yes", text: "Held up" },
  none: { cls: "", text: "No edge found" },
  thin: { cls: "thin", text: "Too little history" },
  untestable: { cls: "", text: "Can't be tested" },
  down: { cls: "thin", text: "Feed down" },
};
const stamp = v => '<span class="sg-stamp ' + v.cls + '">' + v.text + "</span>";

function fgVerdict(test) {
  if (!test) return { v: V.down, why: "The price history for the test didn't load." };
  const sides = [["extreme fear", test.fear], ["extreme greed", test.greed]];
  const tested = sides.filter(([, s]) => s.t != null);
  const won = tested.filter(([, s]) => s.sig);
  const span = "Readings from " + test.from + " to " + test.to;
  if (won.length) return { v: V.edge, why: span + ": after " + won.map(([n]) => n).join(" and ") + ", the next " + test.h + " sessions differed from normal by more than chance (" + won.map(([, s]) => "t = " + sgn(s.t, 2)).join(", ") + ")." };
  if (tested.length) return { v: V.none, why: span + ": what followed the extremes was within chance of a normal month." };
  const ep = Math.max(test.fear.episodes, test.greed.episodes);
  return { v: V.thin, why: span + " give at most " + ep + " separate episode" + (ep === 1 ? "" : "s") + " at either extreme; a fair test needs " + test.minEp + "." };
}

/* ------------------------------------------------------------ fear & greed */
const fgZone = v => v < 25 ? { label: "Extreme fear", band: 0 } : v < 45 ? { label: "Fear", band: 1 } : v <= 55 ? { label: "Neutral", band: 2 } : v <= 75 ? { label: "Greed", band: 3 } : { label: "Extreme greed", band: 4 };
/* The 0–100 gauge: five bands at rest in grey; only the one holding the reading lights,
   amber for fear or greed, red for an extreme, never for neutral. */
function gauge(v) {
  const z = fgZone(v), tint = ["r", "a", "", "a", "r"][z.band];
  const edges = [0, 25, 45, 55, 75, 100];
  const bands = edges.slice(0, -1).map((lo, i) => '<i style="left:' + lo + "%;width:" + (edges[i + 1] - lo) + '%"' + (i === z.band && tint ? ' class="' + tint + '"' : "") + "></i>").join("");
  return '<div class="sg-gauge" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(v) + '" aria-label="' + z.label + '">' +
    bands + '<b style="left:' + Math.max(0, Math.min(100, v)) + '%" class="' + tint + '"></b></div>' +
    '<div class="track-legend" aria-hidden="true"><span>Extreme fear</span><span>Neutral</span><span>Extreme greed</span></div>';
}
function fgCard(key, emo, title, src, href, read, hist, test, asset, h) {
  const fv = read ? fgVerdict(test) : { v: V.down, why: "The feed isn't answering right now." };
  const rangeBtns = [[91, "3M"], [182, "6M"], [365, "1Y"]].map(([d, l]) => '<button type="button" data-k="' + key + '" data-d="' + d + '" aria-pressed="' + (ranges[key] === d) + '">' + l + "</button>").join("");
  const side = (name, s) => s.days ? name + ": " + s.days + " day" + (s.days === 1 ? "" : "s") + ", " + asset + " " + pct(s.avg) + " over the next " + h + " sessions on average" : name + ": no readings";
  return '<div class="m-card sg-card" id="sg-' + key + '">' +
    '<div class="m-top"><h3 class="m-kicker"><span class="sg-emo" aria-hidden="true">' + emo + "</span>" + title + "</h3>" +
    '<a class="m-sub sg-src" href="' + href + '" target="_blank" rel="noopener">' + src + "</a></div>" +
    (read ? '<div class="sg-read"><span class="m-value num">' + Math.round(read.v) + '</span><span class="sg-zone">' + fgZone(read.v).label + "</span>" +
      (read.sub ? '<span class="m-sub num">' + read.sub + "</span>" : "") + "</div>" + gauge(read.v) : '<p class="sg-none">No reading: the feed is down. It retries when you reopen this tab.</p>') +
    (hist?.length > 1 ? '<div class="of-head"><p class="m-cap">Daily readings, 0 to 100</p><div class="d-ranges" role="group" aria-label="Chart range">' + rangeBtns + '</div></div><div class="m-chart sg-chart" data-chart="' + key + '"></div>' : "") +
    '<div class="sg-test"><p>' + stamp(fv.v) + " " + esc(fv.why) + "</p>" +
    (test ? '<p class="m-cap">' + esc(side("Extreme fear", test.fear)) + " · " + esc(side("Extreme greed", test.greed)) + " · all days " + pct(test.base) + ".</p>" : "") + "</div>" +
    (read?.ts ? '<p class="m-cap">Updated ' + ago(read.ts) + (read.stale ? " · last good copy, source not answering" : "") + "</p>" : "") +
    "</div>";
}

/* ------------------------------------------------------------------- moon */
function moonCard(mb) {
  const now = Date.now(), p = moonPhase(now), bin = phaseBin(p);
  const toNew = 29.53059 * (1 - p), toFull = 29.53059 * ((0.5 - p + 1) % 1);
  let v, why;
  if (!mb) { v = V.down; why = "The S&P 500 history for the test didn't load."; }
  else if (!mb.passes) { v = V.none; why = "S&P 500, " + mb.from.slice(0, 4) + " to " + mb.to.slice(0, 4) + ": no phase's average daily return clears its 95% bar."; }
  else if (!mb.edge) { v = V.none; why = "S&P 500, " + mb.from.slice(0, 4) + " to " + mb.to.slice(0, 4) + ": " + mb.passes + " of 8 phases clear the 95% bar, but with eight tries that many passes happen by luck " + Math.round(mb.chance * 100) + "% of the time. Not an edge."; }
  else { v = V.edge; why = "S&P 500, " + mb.from.slice(0, 4) + " to " + mb.to.slice(0, 4) + ": " + mb.passes + " of 8 phases clear the 95% bar, and that many passes would happen by luck only " + (mb.chance * 100).toFixed(1) + "% of the time."; }
  const max = mb ? Math.max(...mb.rows.map(r => Math.abs(r.avg))) || 1 : 1;
  const bars = mb ? mb.rows.map((r, i) => {
    const w = Math.abs(r.avg) / max * 50, cls = r.sig ? (r.avg >= 0 ? "u" : "d") : "pos";
    return '<li' + (i === bin ? ' class="on"' : "") + '><span class="cb-l">' + MOON[i] + " " + r.phase + (i === bin ? " <em>now</em>" : "") + "</span>" +
      '<span class="cb-bar"><i class="' + cls + '" style="' + (r.avg >= 0 ? "left:50%" : "right:50%") + ";width:" + w.toFixed(1) + '%"></i></span>' +
      '<span class="cb-v num">' + sgn(r.avg * 100, 3) + "%</span></li>";
  }).join("") : "";
  return '<div class="m-card sg-card" id="sg-moon">' +
    '<div class="m-top"><h3 class="m-kicker"><span class="sg-emo" aria-hidden="true">' + MOON[bin] + "</span>The moon</h3>" +
    '<span class="m-sub">Lunar cycle vs the S&amp;P 500</span></div>' +
    '<div class="sg-read"><span class="regime-label">' + PHASES[bin] + '</span><span class="m-sub num">Full moon in ' + toFull.toFixed(1) + " days · new moon in " + toNew.toFixed(1) + "</span></div>" +
    '<p class="sg-blurb">Folklore says markets sag around the full moon. Each bar is the average S&amp;P 500 daily return on days in that phase; it is coloured only when it clears its 95% bar.</p>' +
    (bars ? '<ul class="cbars sg-moon" aria-label="Average daily return by moon phase">' + bars + "</ul>" : "") +
    '<div class="sg-test"><p>' + stamp(v) + " " + esc(why) + "</p></div></div>";
}

/* ------------------------------------------------------------------ pizza */
function pizzaCard(pz) {
  if (!pz) return '<div class="m-card sg-card" id="sg-pizza"><div class="m-top"><h3 class="m-kicker"><span class="sg-emo" aria-hidden="true">🍕</span>Pentagon Pizza Index</h3></div>' +
    '<p class="sg-none">No reading: the pizzint.watch feed is down. It retries when you reopen this tab.</p><div class="sg-test"><p>' + stamp(V.down) + "</p></div></div>";
  /* the ladder runs 5 (quiet) to 1 (maximum); 3 and 2 tint amber, 1 red, 5 and 4 never */
  const ladder = [5, 4, 3, 2, 1].map(n => '<li' + (pz.defcon === n ? ' class="on ' + (n === 1 ? "r" : n <= 3 ? "a" : "") + '"' : "") + '>' + n + "</li>").join("");
  const rows = pz.places.map(s => {
    const v = s.live != null ? s.live : s.usualNow;
    const hot = s.live != null && s.pctUsual != null ? (s.pctUsual >= 150 ? "r" : s.pctUsual >= 110 ? "a" : "") : "";
    return '<li><span class="cb-l">' + esc(s.name) + "</span>" +
      '<span class="cb-bar sg-fill">' + (v != null ? '<i class="' + (s.live != null ? "live " + hot : "usual") + '" style="width:' + Math.min(100, v) + '%"></i>' : "") + "</span>" +
      '<span class="cb-v num">' + (s.closed ? "closed" : s.live != null ? s.live + "%" : s.usualNow != null ? "~" + s.usualNow + "%" : "—") + "</span></li>";
  }).join("");
  const why = "There's no long record of readings to line up with world events" + (pz.since ? " (Oracular has logged it hourly since " + new Date(pz.since).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + ")" : "") + ", so it stays a curiosity.";
  return '<div class="m-card sg-card" id="sg-pizza">' +
    '<div class="m-top"><h3 class="m-kicker"><span class="sg-emo" aria-hidden="true">🍕</span>Pentagon Pizza Index</h3>' +
    '<a class="m-sub sg-src" href="https://www.pizzint.watch/" target="_blank" rel="noopener">pizzint.watch</a></div>' +
    '<div class="sg-read"><span class="regime-label">' + (pz.defcon ? "DOUGHCON " + pz.defcon : "No live reading") + "</span>" +
    '<span class="m-sub">' + (pz.defcon ? esc(pz.reason) + " · " : "") + pz.live + " of " + pz.places.length + " pizzerias reporting live</span></div>" +
    '<ol class="sg-ladder" aria-label="DOUGHCON level, 5 quiet to 1 maximum">' + ladder + "</ol>" +
    '<p class="sg-blurb">The theory: when the Pentagon works through the night, it orders pizza. This reads Google Maps busyness at the pizzerias nearest it. Solid bars are live; faint ones are Google\'s usual for this hour.</p>' +
    '<ul class="cbars sg-places">' + rows + "</ul>" +
    '<div class="sg-test"><p>' + stamp(V.untestable) + " " + esc(why) + "</p></div>" +
    (pz.ts ? '<p class="m-cap">Updated ' + ago(pz.ts) + (pz.stale ? " · last good copy" : "") + "</p>" : "") + "</div>";
}

/* -------------------------------------------------------------- stripper */
function nightCard(nl, raw) {
  if (!nl) return '<div class="m-card sg-card" id="sg-night"><div class="m-top"><h3 class="m-kicker"><span class="sg-emo" aria-hidden="true">🪩</span>The Stripper Index, measured</h3></div>' +
    '<p class="sg-none">No reading: the jobs feed is down. It retries when you reopen this tab.</p><div class="sg-test"><p>' + stamp(V.down) + "</p></div></div>";
  const rangeBtns = [[12, "1Y"], [24, "2Y"], [60, "5Y"]].map(([d, l]) => '<button type="button" data-k="night" data-d="' + d + '" aria-pressed="' + (ranges.night === d) + '">' + l + "</button>").join("");
  const read = nl.double ? "Double signal: nightlife jobs are falling while unemployment rises, the late-cycle pairing."
    : nl.jobsChg < 0 ? "Nightlife jobs are shrinking, but unemployment isn't rising with them. No double signal."
    : "Nightlife hiring is holding up. No stress signal.";
  return '<div class="m-card sg-card" id="sg-night">' +
    '<div class="m-top"><h3 class="m-kicker"><span class="sg-emo" aria-hidden="true">🪩</span>The Stripper Index, measured</h3>' +
    '<a class="m-sub sg-src" href="https://www.bls.gov/ces/" target="_blank" rel="noopener">BLS</a></div>' +
    '<div class="sg-read"><span class="m-value num">' + sgn(nl.jobsChg) + '%</span><span class="m-sub num">' + esc(nl.label.toLowerCase()) + " over 12 months, " + monthName(nl.last.t) + (nl.last.prelim ? " (preliminary)" : "") +
    " · unemployment " + nl.unrate.v + "% (" + sgn(nl.unrateChg) + " pts)</span></div>" +
    '<p class="sg-blurb">The theory: people cut bottle service before groceries, so dancers see a recession first. Club tips aren\'t published; payroll jobs at bars and nightclubs are the closest official count. ' + esc(read) + "</p>" +
    '<div class="of-head"><p class="m-cap">' + esc(nl.label) + ", thousands, monthly</p><div class=\"d-ranges\" role=\"group\" aria-label=\"Chart range\">" + rangeBtns + '</div></div><div class="m-chart sg-chart" data-chart="night"></div>' +
    '<div class="sg-test"><p>' + stamp(V.thin) + " This series starts in " + monthName(nl.since) + ". The only downturn in it is COVID, which closed the bars by order, so there is nothing fair to test it against.</p></div>" +
    '<p class="m-cap">' + esc(nl.source) + ", seasonally adjusted" + (raw?.stale ? " · last good copy, source not answering" : "") + "</p></div>";
}

/* ------------------------------------------------- searches and app rank */
function crowdCard(tr, cb) {
  const terms = tr?.terms || [];
  const max = Math.max(50, ...terms.map(x => Math.abs(x.pct ?? 0)));
  const rows = terms.map(x => {
    const p = x.pct, cls = p == null ? "" : p >= 50 ? "d" : p >= 25 ? "a" : "pos";
    return '<li><span class="cb-l">“' + esc(x.term) + '”</span><span class="cb-bar">' + (p != null ? '<i class="' + cls + '" style="' + (p >= 0 ? "left:50%" : "right:50%") + ";width:" + (Math.min(Math.abs(p), max) / max * 50).toFixed(1) + '%"></i>' : "") + "</span>" +
      '<span class="cb-v num">' + (p == null ? "—" : sgn(p, 0) + "%") + "</span></li>";
  }).join("");
  const spikes = terms.filter(x => x.pct != null && x.pct >= 25).length;
  const rank = cb?.overall;
  const rankText = !cb ? "Feed down" : rank === undefined ? "Chart unavailable" : rank ? "#" + rank + " free iPhone app in the US" : "Outside the top 100 free iPhone apps";
  return '<div class="m-card sg-card" id="sg-crowd">' +
    '<div class="m-top"><h3 class="m-kicker"><span class="sg-emo" aria-hidden="true">🔎</span>Distress searches and the Coinbase rank</h3></div>' +
    (tr ? '<div class="sg-read"><span class="regime-label">' + spikes + " of " + terms.length + ' spiking</span><span class="m-sub">Last full week vs its own 52-week average, US Google searches. +25% counts as a spike.</span></div>' +
      '<ul class="cbars sg-terms">' + rows + "</ul>" : '<p class="sg-none">Search data is down right now.</p>') +
    '<div class="sg-rank"><span class="sg-emo" aria-hidden="true">📱</span><div><p class="sg-rank-v">' + esc(rankText) + (cb?.finance ? " · #" + cb.finance + " in Finance" : "") + "</p>" +
    '<p class="m-cap">Coinbase hit #1 near the 2021 crypto top. Outside the top 100 means retail isn\'t chasing.' + (cb?.stale ? " Last good copy; the chart isn't answering." : "") + "</p></div></div>" +
    '<div class="sg-test"><p>' + stamp(V.untestable) + " A year of weekly searches with no recession in it, and no history of the app rank: neither can be checked here.</p></div></div>";
}

/* ------------------------------------------------------------- scoreboard */
function board(rows) {
  return '<table class="bias-table sg-board"><thead><tr><th scope="col">Signal</th><th scope="col">Now</th><th scope="col">Feed</th><th scope="col">Holds up?</th></tr></thead><tbody>' +
    rows.map(r => '<tr><th scope="row"><a href="#sg-' + r.id + '">' + r.emo + " " + r.name + "</a></th><td>" + esc(r.now) + '</td><td class="' + (r.feed === "Live" ? "" : "muted") + '">' + r.feed + "</td><td>" + stamp(r.v) + "</td></tr>").join("") +
    "</tbody></table>";
}

/* ----------------------------------------------------------------- render */
function render() {
  const { sig, pizza: pzRaw, night, spx, btc } = data;
  const cnn = sig.cnn, cr = sig.crypto;
  const cnnHist = (cnn?.hist || []).map(x => ({ d: isoDay(x.t), v: x.v }));
  const crHist = (cr?.hist || []).map(x => ({ d: isoDay(x.t), v: x.v }));
  const cnnTest = cnn ? forwardAfter(cnnHist, spx, { h: 21 }) : null;
  const crTest = cr ? forwardAfter(crHist, btc, { h: 30 }) : null;
  const mb = moonBuckets(spx), pz = pizza(pzRaw), nl = nightlife(night);
  const feed = o => !o ? "Down" : o.stale ? "Last good copy" : "Live";
  const cnnV = cnn ? fgVerdict(cnnTest).v : V.down, crV = cr ? fgVerdict(crTest).v : V.down;
  const bin = phaseBin(moonPhase(Date.now()));
  const rows = [
    { id: "cnn", emo: "😱", name: "Fear & Greed, stocks", now: cnn ? Math.round(cnn.score) + " · " + fgZone(cnn.score).label : "—", feed: feed(cnn), v: cnnV },
    { id: "crypto", emo: "🪙", name: "Fear & Greed, crypto", now: cr ? cr.value + " · " + fgZone(cr.value).label : "—", feed: feed(cr), v: crV },
    { id: "moon", emo: MOON[bin], name: "The moon", now: PHASES[bin], feed: "Computed", v: !mb ? V.down : mb.edge ? V.edge : V.none },
    { id: "pizza", emo: "🍕", name: "Pentagon Pizza Index", now: pz ? (pz.defcon ? "DOUGHCON " + pz.defcon : "No live reading") : "—", feed: pz ? (pz.stale ? "Last good copy" : "Live") : "Down", v: pz ? V.untestable : V.down },
    { id: "night", emo: "🪩", name: "Stripper Index", now: nl ? sgn(nl.jobsChg) + "% jobs, 12m" + (nl.double ? " · double signal" : "") : "—", feed: feed(night), v: nl ? V.thin : V.down },
    { id: "crowd", emo: "🔎", name: "Distress searches", now: sig.trends ? sig.trends.terms.filter(x => x.pct >= 25).length + " of " + sig.trends.terms.length + " spiking" : "—", feed: feed(sig.trends), v: sig.trends ? V.untestable : V.down },
    { id: "crowd", emo: "📱", name: "Coinbase app rank", now: !sig.coinbase ? "—" : sig.coinbase.overall ? "#" + sig.coinbase.overall : sig.coinbase.overall === null ? "Outside top 100" : "—", feed: feed(sig.coinbase), v: sig.coinbase ? V.untestable : V.down },
  ];
  root.innerHTML =
    '<div class="m-card m-wide sg-intro">' +
    '<div class="m-top"><h3 class="m-kicker">Alt signals <button type="button" class="m-help" data-guide="signals" aria-label="How the alt signals are tested">?</button></h3>' +
    '<span class="m-sub num">Loaded ' + ago(data.at) + ' · <button type="button" class="sg-reload">Reload</button></span></div>' +
    '<p class="sg-lede">The odd indicators traders swear by. Each one shows its live reading, whether its feed is up, and whether it has ever held up when tested against the index. Most of them are for fun, and the scoreboard says which.</p>' +
    board(rows) + "</div>" +
    fgCard("cnn", "😱", "Fear &amp; Greed, stocks", "CNN", "https://www.cnn.com/markets/fear-and-greed",
      cnn ? { v: cnn.score, sub: "1 week " + sgn(cnn.score - cnn.prevWeek, 0) + " · 1 month " + sgn(cnn.score - cnn.prevMonth, 0), ts: cnn.ts, stale: cnn.stale } : null, cnnHist, cnnTest, "the S&P 500", 21) +
    fgCard("crypto", "🪙", "Fear &amp; Greed, crypto", "alternative.me", "https://alternative.me/crypto/fear-and-greed-index/",
      cr ? { v: cr.value, sub: crHist.length > 7 ? "1 week " + sgn(cr.value - crHist[crHist.length - 8].v, 0) : "", ts: cr.ts, stale: cr.stale } : null, crHist, crTest, "Bitcoin", 30) +
    moonCard(mb) + pizzaCard(pz) + nightCard(nl, night) + crowdCard(sig.trends, sig.coinbase) +
    '<p class="m-wide sg-foot">Readings come from Oracular\'s data worker, which relays CNN, alternative.me, Apple\'s charts, Google Trends, pizzint.watch and the BLS; the tests use Yahoo\'s S&amp;P 500 and Bitcoin closes. For one company at a time, <a href="https://oracular.ethantam.dev" target="_blank" rel="noopener">Oracular</a> does the research. Entertainment and context, not advice.</p>';
  drawCharts(cnnHist, crHist, nl);
}

function drawCharts(cnnHist, crHist, nl) {
  const fg = (key, hist) => {
    const el = root.querySelector('[data-chart="' + key + '"]');
    if (!el) return;
    const from = isoDay(Date.now() - ranges[key] * 864e5), w = hist.filter(x => x.d >= from);
    chart(el, { dates: w.map(x => x.d), values: w.map(x => x.v), domain: [0, 100], band: [25, 75], color: "var(--series)", height: 140,
      label: "Fear and greed readings", format: v => Math.round(v) + " · " + fgZone(v).label, tick: v => String(Math.round(v)) });
  };
  fg("cnn", cnnHist);
  fg("crypto", crHist);
  const el = root.querySelector('[data-chart="night"]');
  if (el && nl) {
    const w = nl.series.slice(-ranges.night);
    chart(el, { dates: w.map(x => x.t + "-15"), values: w.map(x => x.v), color: "var(--series)", height: 140,
      label: nl.label + ", thousands", format: v => v.toFixed(1) + "k jobs", tick: v => v.toFixed(0) + "k" });
  }
}

async function load(force) {
  if (loading) return loading;
  if (!force && data && Date.now() - data.at < STALE_MS) return render();
  if (!data) root.innerHTML = '<div class="m-card m-wide"><p class="m-cap">Loading the alt signals and the price history to test them…</p></div>';
  loading = loadSignals().then(d => { data = d; render(); }).finally(() => { loading = null; });
  return loading;
}

/* Called each time the tab is selected. */
export function showSignals(el) {
  if (!root) {
    root = el;
    root.addEventListener("click", e => {
      const b = e.target.closest(".d-ranges button[data-k]");
      if (b) { ranges[b.dataset.k] = +b.dataset.d; render(); return; }
      if (e.target.closest(".sg-reload")) load(true);
    });
  }
  return load(false);
}
