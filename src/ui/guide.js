/* "How to read this" guide: a sheet with a pre-trade routine, what the numbers
   mean, each model, a glossary of every indicator, and data timing. */
import { GROUPS } from "../config.js";
import { $ } from "./format.js";
import { swipeToClose } from "./sheet.js";

const SECTIONS = [
  { id: "routine", label: "Routine" },
  { id: "read", label: "Today's read" },
  { id: "bias", label: "Market bias" },
  { id: "regime", label: "Regime" },
  { id: "numbers", label: "The numbers" },
  { id: "rai", label: "Risk appetite" },
  { id: "ar", label: "Absorption" },
  { id: "rec", label: "Recession" },
  { id: "flows", label: "Flows" },
  { id: "oflow", label: "Option flow" },
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
    <li><b>Today's read.</b> Start with the sentences at the top. Each one names the numbers behind it, so you can check it against the rows below.</li>
    <li><b>Mood.</b> Read the Risk Appetite label, then glance at its history: is it drifting toward risk-off or recovering? The direction over the last week matters as much as the level.</li>
    <li><b>Drivers.</b> Look at which bars are red. Stress in rates vol (MOVE) or credit (HY spread) that stocks haven't followed yet is a divergence. They don't always end with stocks falling.</li>
    <li><b>Fragility.</b> If the absorption ratio's ΔAR is above +1, markets are moving as one block and a selloff can spread fast. That's a reason to cut size, not a reason to short.</li>
    <li><b>Backdrop.</b> The macro regime and the recession odds move slowly. They tell you what kind of quarter or year it is, not what to do today.</li>
    <li><b>Your market.</b> Tap its row. Check where it sits in its 1-year range, and compare EWMA vol with 1-month vol: if EWMA is higher, volatility is picking up right now, so size down.</li>
    <li><b>One number, fast.</b> The filter box on the left rail narrows all 45 rows by name, ticker or group as you type; press / anywhere to jump to it, Esc to clear.</li>
  </ol>
  <p class="g-note">None of this is a trade signal. It's context, so you know what kind of tape you're stepping into.</p>
</section>

<section id="g-read" class="g-sec">
  <h3>Today's read</h3>
  <p>A short list of what stands out across markets this month, written by fixed rules rather than a model. Each rule looks for a specific pattern, and fires only when the numbers cross its thresholds. For example: "energy and food rising while stocks fall" needs oil up at least 1σ, grains up at least 0.75σ and ES down at least 0.75σ, then checks whether 10Y breakevens confirm it. The strongest four are shown, and the chips under each one are the exact numbers it used.</p>
  <p>σ here is a <b>vol-scaled move</b>: the 1-month change divided by the move you'd normally expect over a month, given that market's volatility <i>before</i> the move started. So 1σ in natural gas is a much bigger price change than 1σ in the S&amp;P, but both are equally unusual for that market. A bell curve says moves beyond 2σ happen about 1 month in 20; real markets have fat tails, so they happen more often than that.</p>
  <p>These are rules of thumb from standard cross-asset practice, not forecasts. When nothing fires, it says so.</p>
  <p><b>Explain in plain English</b> sends the same numbers (only numbers, never text) to Mistral AI, which writes a two-paragraph note. It's told to use only the data on the page, to say "likely" rather than claim causes, and never to give trade advice. It can still be wrong, so treat it as a second opinion and check it against the rows below.</p>
</section>

<section id="g-bias" class="g-sec">
  <h3>Market bias</h3>
  <p>One read for ES or NQ over the next day, week and month, built from every model on this page: trend followers, the variance risk premium, risk appetite, the absorption shift, the yield-curve recession odds and 12−1-month momentum, plus a 5-day reversal and turn-of-month, FOMC and pre-holiday timing for the day and week.</p>
  <p><b>How the signals are weighted.</b> It follows the method that has held up best in research on forecasting stock returns, chosen so the weights are never fitted to the period they're judged on:</p>
  <ol class="g-steps">
    <li><b>One simple forecast per signal.</b> Each signal gets its own regression of future returns on the signal, using only past data where the outcome was already known. Big all-in-one models fit history well and then fail on new data (Goyal &amp; Welch 2008); simple ones combined do much better (Rapach, Strauss &amp; Zhou 2010).</li>
    <li><b>The sign comes from the research.</b> Each signal can only push the way its research says (a high recession probability can only be bearish, for example). If the data says otherwise, that signal is switched off rather than flipped (Campbell &amp; Thompson 2008).</li>
    <li><b>Weights earned, not fitted.</b> The forecasts are averaged, weighted by how accurate each one has been on forecasts it made before seeing the outcome, with older errors counting less (half-life one year; Stock &amp; Watson 2004). A new signal gets an equal share until it has a year of its own record.</li>
    <li><b>Relationships can change.</b> Each signal's effect is estimated with recent years counting more (half-life three years), so the model doesn't treat 2003 like last year.</li>
    <li><b>Calm and stressed markets are treated separately.</b> When the index's own volatility is above its one-year norm, the market counts as stressed. Each signal gets one effect for calm markets and one for stressed ones, pulled toward its overall effect until there's enough history in that state to trust it. Research finds returns are more predictable in bad times than good ones.</li>
    <li><b>The models have to beat a plain average.</b> The final read blends the models with the long-run average, by how much better they've done than that average over the last few years. When conditions change and they stop helping, the read falls back to "no lean" instead of making confident wrong calls.</li>
  </ol>
  <p><b>No working signal.</b> Sometimes the recent window contradicts the research direction for <i>every</i> signal at once — the last few years of the meltup did that to momentum, trend and risk appetite at the monthly scale. When that happens the model does not force a read: the horizon shows a neutral at exactly the long-run-average chance, marked "no working signal", and the driver list says nothing is pushing it. That is the honest answer, not missing data.</p>
  <p><b>The label.</b> The forecast is turned into a chance the index is higher at the end of the horizon, using today's volatility. Bullish or bearish needs that chance to be at least 52% / 48% for a day, 53.5% / 46.5% for a week and 55% / 45% for a month; anything closer to a coin flip is neutral. These bands were set in advance, not tuned. Daily moves are mostly noise, so the daily read is usually neutral, and that's the honest answer.</p>
  <p><b>Confidence</b> asks three things: when the model made this call before, in the same kind of market as today (calm or stressed), was it right more often than chance (by at least 5 points for high, 2 for medium, over enough calls)? Do most of the signals' weight agree? And does the model beat the long-run average with statistical significance (Clark &amp; West 2007, p below 0.10)? All three for high, the first two for medium, otherwise low.</p>
  <p><b>Why it can lean the "wrong" way after a bad week.</b> The record column's <i>After a week like this</i> line is a base rate, not a forecast: it buckets the current 5-day move (in σ of its own volatility) and reports what followed comparable weeks since 2000 — matched to today's volatility regime and momentum direction when there are enough cases, and it says which. At the one-day horizon the most reliable regularity in this data is short-term reversal: a −2σ-or-worse week on NQ has been followed by a higher close 59% of the time (189 cases) and a higher week 63% of the time. Continuation, when it pays, lives at the monthly scale — that is what the momentum signal is for, and it pushes bearish when 12−1 momentum rolls over. The two often disagree on purpose: washouts get bought until they re-break, and a failed bounce inside a negative monthly trend is exactly when the monthly model's bearish side earns its keep.</p>
  <p><b>Track record.</b> The model is re-run over the full daily history since 2000 (at most every six hours, on your device), walking forward one day at a time. The longer the record, the harder it is for luck to look like skill. The card also says how it did in calm and in stressed markets separately. Out-of-sample R² compares its squared errors with simply forecasting the long-run average; for stock returns anything above zero is meaningful, and a few percent is a lot at monthly horizons. The utility gain is how much more a mean–variance investor would have earned per year, after risk, by sizing with this forecast instead of the long-run average. These are backtests on one market's history: they can and will be wrong.</p>
</section>

<section id="g-regime" class="g-sec">
  <h3>Macro regime</h3>
  <p>Most of what drives asset prices comes down to two questions: is growth surprising up or down, and is inflation? That gives four regimes, the framing behind Bridgewater's All Weather portfolio and AQR's research on macro sensitivities (Ilmanen, Maloney &amp; Ross, 2014).</p>
  <table class="g-table">
    <thead><tr><th>Regime</th><th>Growth · Inflation</th></tr></thead>
    <tbody>
      <tr><td>Goldilocks</td><td>↑ · ↓ Stocks and credit have done best</td></tr>
      <tr><td>Reflation</td><td>↑ · ↑ Commodities and cyclicals have led</td></tr>
      <tr><td>Stagflation</td><td>↓ · ↑ Cash and commodities have held up</td></tr>
      <tr><td>Slowdown</td><td>↓ · ↓ Government bonds have done best</td></tr>
    </tbody>
  </table>
  <p>Each axis is read from markets, which move before GDP and CPI are published. <b>Growth</b> averages the 3-month vol-scaled moves in ES, the copper/gold ratio and the high-yield credit spread (flipped, since wider spreads mean weaker growth). <b>Inflation</b> averages the 10-year breakeven, broad commodities (DBC) and agriculture (DBA). The commodity funds are used instead of front-month futures because continuous futures prices jump at every contract roll, which would show up as fake moves.</p>
  <p><b>Why it doesn't flip every few days.</b> A macro regime plays out over quarters, so each input averages its 3-month and 6-month moves, and the regime is read once a week, on Friday's close. It only changes after the new quadrant has held for three weeks in a row, and a reading within 0.15 of an axis doesn't count as crossing it. When a change is building, the card says so ("pointed to Reflation for 1 of the 3 weeks needed"), and the switch is dated to the week it started. The strip underneath shows the regime for each of the past 52 weeks.</p>
  <p>The dot is this week's reading so far; the trail is the last 13 finished weeks, fading with age, and starts at the dated end. The axis scores are the averages of the input bars. Averages of three inputs rarely go past ±2, which is why the map stops there.</p>
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

<section id="g-flows" class="g-sec">
  <h3>Flows, premia and the calendar</h3>
  <p><b>Trend followers (CTAs).</b> Managed-futures funds run hundreds of billions on rules that buy what's been rising and sell what's been falling. This estimates their position in each market the way the research on them does (Moskowitz, Ooi &amp; Pedersen 2012; Hurst, Ooi &amp; Pedersen 2017): the 1, 3, 6 and 12-month moves, each divided by the move volatility would predict, mapped to a position that's fully long at +2σ and fully short at −2σ, then averaged. The flip levels are where tomorrow's close would turn a signal around. The ±2σ week shows how much they'd have to buy or sell after a big week, as a share of their maximum position. Forced selling after a fall is how trend followers can make a drop worse. It's an estimate from prices, not their actual books.</p>
  <p><b>Variance risk premium.</b> VIX is what options say volatility will be over the next month. Realized volatility is what ES actually did over the last month. Options usually price more volatility than turns up, and that gap is the premium sellers of insurance earn. Research has found a wide premium was followed by better equity returns (Bollerslev, Tauchen &amp; Zhou 2009). Below zero is the warning sign: markets are moving more than options priced, which tends to happen in selloffs.</p>
  <p><b>Stock–bond correlation.</b> How ES and Treasury prices moved together over the last 63 sessions. Negative means bonds rallied on the days stocks fell, so a 60/40 portfolio is hedged. Positive means they fell together, as in 2022, when inflation was the shock. When it turns positive, balanced and risk-parity funds have to cut both, and "buy bonds as a hedge" stops working.</p>
  <p><b>Calendar.</b> Dates that reliably bring flows to index futures. The <i>turn of the month</i> (the last trading day and the first three) has historically carried a large share of equity returns, as salaries, pension contributions and fund inflows arrive (Lakonishok &amp; Smidt 1988; McConnell &amp; Xu 2008). <i>FOMC</i> days bring rate-decision volatility, and stocks have tended to drift up into the announcement (Lucca &amp; Moench 2015). <i>Option expiry</i>, especially quarterly quad witching, brings large hedging flows. <i>Month-end rebalancing</i>: funds that hold a fixed mix of stocks and bonds sell whichever did better that month, so a big lead for stocks can mean selling pressure in the last few sessions.</p>
</section>

<section id="g-oflow" class="g-sec">
  <h3>SPX option flow</h3>
  <p><b>Net dealer gamma.</b> Options dealers hedge every contract they sell. Their hedging flow can dampen moves or amplify them: when dealers are long gamma they sell rallies and buy dips, and when they are short gamma they have to chase the move. The card estimates that net gamma from the live SPX option board — dollars of S&P hedging per 1% move — under the standard assumption that customers buy puts and sell covered calls. Positive numbers lean calm; negative numbers lean violent.</p>
  <p><b>Flip level.</b> The index level where the estimate crosses zero. Above it hedging leans against the move; below it, with the move. A market trading just above its flip is closer to the unstable zone than the headline gamma suggests.</p>
  <p><b>Walls and 0DTE.</b> The strikes with the biggest call open interest, put open interest and gamma are levels hedging flow gravitates to near expiry. The gamma-profile chart marks those walls as dashed lines and can zoom to ±3%, ±8% or the full ±18% of spot. The share of the day's SPX volume trading in same-day expiries (0DTE) says how much of the flow is fast money recycling gamma intraday.</p>
  <p><b>The vol curve.</b> VIX9D/VIX above 1 means the front of the implied-vol curve is in backwardation — near-term fear above the 30-day price, a classic stress signature. VXN/VIX rising means Nasdaq vol is being bid harder than S&P vol: growth leadership being questioned under a calm surface. A high VVIX or SKEW means dealers are charging more for volatility risk and for crash insurance.</p>
</section>
<section id="g-glossary" class="g-sec">
  <h3>Every indicator</h3>
  ${glossary()}
</section>

<section id="g-timing" class="g-sec">
  <h3>How fresh is the data?</h3>
  <dl class="g-defs">
    <div><dt>Futures, FX, VIX, crypto</dt><dd>Yahoo Finance, refreshed every minute. Exchange quotes can run up to about 15 minutes behind.</dd></div>
    <div><dt>Commodity futures</dt><dd>Front-month contracts (copper, grains, gas, silver). The continuous price jumps when the front contract rolls, so a few percent of a big monthly move can be roll, not market. The regime model uses the rolled funds DBC and DBA to avoid this.</dd></div>
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
