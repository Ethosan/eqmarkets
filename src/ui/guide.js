/* "How to read this" guide: a sheet with a pre-trade routine, what the numbers
   mean, each model, a glossary of every indicator, and data timing. */
import { GROUPS } from "../config.js";
import { $ } from "./format.js";
import { swipeToClose } from "./sheet.js";

const SECTIONS = [
  { id: "routine", label: "Routine" },
  { id: "numbers", label: "The numbers" },
  { id: "rai", label: "Risk appetite" },
  { id: "ar", label: "Absorption" },
  { id: "rec", label: "Recession" },
  { id: "glossary", label: "Indicators" },
  { id: "timing", label: "Data timing" },
];

const UNIT = { price: "% moves", rate: "bp moves", level: "point moves" };
const CADENCE = it => it.weekly ? "weekly" : it.bojLive ? "changes at BOJ meetings" : it.computed ? "derived" : it.live || (it.symbols?.length && !it.fredId) ? "intraday" : "daily";

function glossary() {
  return GROUPS.map(g =>
    '<h4 class="g-group ' + g.cls + '"><span class="gdot" aria-hidden="true"></span>' + g.label + "</h4>" +
    '<dl class="g-terms">' + g.items.map(it =>
      "<div><dt><b>" + it.ticker + "</b> " + it.name + '</dt><dd>' + it.desc +
      ' <span class="g-meta">' + (UNIT[it.kind] || "") + " · " + CADENCE(it) + (it.invert ? " · higher = more stress" : "") + "</span></dd></div>"
    ).join("") + "</dl>"
  ).join("");
}

const BODY = () => `
<section id="g-routine" class="g-sec">
  <h3>A 30-second read before you trade</h3>
  <ol class="g-steps">
    <li><b>Regime.</b> Read the Risk Appetite label, then glance at its history: is it drifting toward risk-off or recovering? The direction over the last week matters as much as the level.</li>
    <li><b>Drivers.</b> Look at which bars are red. Stress in rates vol (MOVE) or credit (HY spread) that stocks haven't followed yet is a divergence. Those don't always resolve with stocks falling, but they're worth respecting.</li>
    <li><b>Fragility.</b> If the absorption ratio's ΔAR is above +1, markets are moving as one block and a selloff can spread fast. That's a reason to cut size, not a reason to short.</li>
    <li><b>Backdrop.</b> Recession odds move slowly. They tell you what kind of year it is, not what to do today.</li>
    <li><b>Your market.</b> Tap its card. Check where it sits in its 1-year range, and compare EWMA vol with 1-month vol: if EWMA is higher, volatility is picking up right now, so size down.</li>
  </ol>
  <p class="g-note">None of this is a trade signal. It's context, so you know what kind of tape you're stepping into.</p>
</section>

<section id="g-numbers" class="g-sec">
  <h3>What the numbers mean</h3>
  <dl class="g-defs">
    <div><dt>z-score (the ± numbers)</dt><dd>How far today is from normal, in "typical moves". 0 is an ordinary day, ±1 is common, ±2 is unusual (a few times a year), ±3 is rare. It uses the median and median absolute deviation of the past year rather than the mean, so one crash day doesn't distort the scale for months.</dd></div>
    <div><dt>Capped at ±3</dt><dd>In a panic some gauges hit 6 or 8. Capping each input at ±3 means anything past 3 counts as "extreme" and no single market can drag the whole index. It's a safety rail, not a margin of error.</dd></div>
    <div><dt>Percentile (1Y)</dt><dd>"83rd pctile" means today is higher than 83% of the days in the past year. Top or bottom decile (above 90 or below 10) is flagged in colour.</dd></div>
    <div><dt>bp (basis points)</dt><dd>1 bp = 0.01 percentage point. The 10-year going from 4.04% to 4.13% is +9 bp. Rates, spreads and credit are quoted in bp; prices in %; indices like VIX in points.</dd></div>
    <div><dt>Volatility (σ)</dt><dd>Annualised, so it's comparable across markets. Divide by 16 for a rough typical daily move: ES at 16% vol moves about 1% on a normal day. The 1-month figure is the plain average; EWMA weights recent days more (RiskMetrics, λ = 0.94), so it reacts first.</dd></div>
    <div><dt>Trend vs level</dt><dd>Assets that trend (ES, Bitcoin, USD/JPY, the dollar) are scored on their 1-month move divided by their own volatility. Gauges that mean-revert (VIX, MOVE, credit spreads) are scored on how unusual their level is.</dd></div>
  </dl>
</section>

<section id="g-rai" class="g-sec">
  <h3>Risk Appetite Index</h3>
  <p>One number for how much risk the market is willing to take, built from 8 inputs: equities, Bitcoin, yen carry, the dollar, equity vol (VIX), the VIX term structure, rates vol (MOVE) and high-yield credit spreads. Each input is scored, capped at ±3, and averaged with equal weights. It's in the tradition of the Credit Suisse and Goldman risk-appetite gauges.</p>
  <table class="g-table">
    <thead><tr><th>Reading</th><th>Label</th></tr></thead>
    <tbody>
      <tr><td class="num">+0.75 or more</td><td>Risk-on</td></tr>
      <tr><td class="num">+0.25 to +0.75</td><td>Leaning risk-on</td></tr>
      <tr><td class="num">−0.25 to +0.25</td><td>Neutral</td></tr>
      <tr><td class="num">−0.75 to −0.25</td><td>Leaning risk-off</td></tr>
      <tr><td class="num">−0.75 or less</td><td>Risk-off</td></tr>
    </tbody>
  </table>
  <p>Because it's an average of 8 inputs that rarely all agree, the index lives mostly between −1.5 and +1.5, which is why the needle's scale stops at ±2. The percentile next to the value tells you how unusual today's reading is for the index itself. The label uses a 3-day average so it doesn't flicker around a threshold.</p>
</section>

<section id="g-ar" class="g-sec">
  <h3>Absorption ratio</h3>
  <p>How much of the day-to-day movement across 10 markets (ES, NQ, Bitcoin, gold, crude, the dollar, USD/JPY, high-yield bonds, the 10-year and VIX) is explained by the top one or two common forces. From Kritzman, Li, Page and Rigobon (2011).</p>
  <p><b>The level is less useful than the change.</b> ΔAR compares the last 15 days with the past year. Above +1, markets have started moving together: diversification stops working and shocks travel. The authors found most big drawdowns came after spikes in ΔAR. Below −1, markets are decoupling, which is usually calm.</p>
</section>

<section id="g-rec" class="g-sec">
  <h3>Recession probability</h3>
  <p>The New York Fed's yield-curve model: the chance of a US recession within 12 months, from the gap between the 10-year and 3-month Treasury yields (averaged over a month). When short rates sit above long rates, the curve is inverted and the odds rise. Every US recession since the late 1960s was preceded by an inversion, though the lead time ranged from about 6 months to 2 years.</p>
  <p>Above 30% has historically been a warning zone (the dashed line on the chart). This version uses daily data, so it can differ from the NY Fed's monthly figure by a point or two.</p>
</section>

<section id="g-glossary" class="g-sec">
  <h3>Every indicator</h3>
  ${glossary()}
</section>

<section id="g-timing" class="g-sec">
  <h3>How fresh is the data?</h3>
  <dl class="g-defs">
    <div><dt>Futures, FX, VIX, crypto</dt><dd>Yahoo Finance, refreshed every minute. Exchange quotes can run up to about 15 minutes behind.</dd></div>
    <div><dt>Treasury yields, spreads, credit</dt><dd>FRED (St. Louis Fed), daily closes, usually a business day behind. The live 10Y card uses the CBOE quote instead.</dd></div>
    <div><dt>NFCI and STLFSI</dt><dd>Weekly. NFCI comes out on Wednesdays, the St. Louis index on Thursdays.</dd></div>
    <div><dt>Yen positioning (COT)</dt><dd>CFTC, weekly. Positions as of Tuesday, released Friday afternoon New York time, so it's always a few days old.</dd></div>
    <div><dt>BOJ rate</dt><dd>Read from the BOJ website. Changes only at policy meetings, eight a year.</dd></div>
  </dl>
  <p class="g-note">A dimmed card means its feed missed the last refresh and it's showing the last good value.</p>
</section>`;

let built = false;
function build() {
  if (built) return;
  built = true;
  $("gNav").innerHTML = SECTIONS.map(s => '<button type="button" data-sec="' + s.id + '">' + s.label + "</button>").join("");
  $("gBody").innerHTML = BODY();
  $("gNav").addEventListener("click", e => {
    const b = e.target.closest("button[data-sec]");
    if (b) goTo(b.dataset.sec);
  });
}

function goTo(id) {
  const el = $("g-" + id);
  if (!el) return;
  const dlg = $("guide");
  dlg.scrollTo({ top: el.offsetTop - $("gNav").offsetHeight - 8, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

export function openGuide(section) {
  build();
  const dlg = $("guide");
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  if (section) requestAnimationFrame(() => goTo(section));
}

export function initGuide({ onReplayTour }) {
  const dlg = $("guide");
  $("gClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  $("gTour").addEventListener("click", () => { dlg.close(); onReplayTour(); });
  $("guideBtn").addEventListener("click", () => openGuide());
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-guide]");
    if (b) openGuide(b.dataset.guide);
  });
  swipeToClose(dlg, [$("gGrab"), dlg.querySelector(".d-head")]);
}
