/* "How it's calculated" for each model card: data, maths, weights and every
   rule, in a few rows. Hidden behind a native disclosure so the card stays
   clean. One source of truth for the method text on the page. */

/* [card id, rows]. Each row: [label, text]. Text may contain <i>, <sub>, <sup>. */
const METHODS = [
  ["readCard", [
    ["Data", "1-month moves in 21 markets (Yahoo, FRED), and VIX and MOVE levels against their past year; items tagged Today use the day's move instead."],
    ["σ", "A move measured in that market's own typical move over the same span (a day for Today items, a month otherwise): 1σ is unusual, 2σ rare."],
    ["Tags", "How long a pattern has held: New today, This week, or 2+ weeks (the same rules run on the data a day, a week and two weeks back)."],
    ["Move score", "1-month change ÷ (volatility before the month × √21), capped at ±3. 1 is unusual, 2 is rare."],
    ["Rules", "16 fixed patterns, each with explicit thresholds (e.g. oil ≥ 1, grains ≥ 0.75 and ES ≤ −0.75 for cost-push). A rule's strength is its weakest condition; the 4 strongest are shown."],
    ["Weights", "None. Rules either fire or don't."],
    ["Limits", "Rules of thumb from cross-asset practice, not tested forecasts."],
  ]],
  ["biasCard", [
    ["Data", "Daily ES and NQ since 2000, roll-adjusted, plus every model's daily history rebuilt as it stood on each day."],
    ["Per signal", "Regression of the next 1, 5 or 21-day return on the signal, using only outcomes already known. Recent years count more (3-year half-life). Separate slopes for calm and stressed markets, pulled toward the overall slope by n ÷ (n + 504)."],
    ["Signals", "Trend followers, variance risk premium, risk appetite, absorption shift, yield-curve recession odds, 12−1 month momentum, and a 5-day reversal at the day and week horizons (plus turn of month, FOMC drift and pre-holiday at those horizons)."],
    ["Signs", "Fixed by the research behind each signal. A slope with the wrong sign is set to zero — and that signal then abstains for the day instead of voting with the historical mean, which would otherwise let a non-signal dilute the real ones. When every signal abstains at once, the read is the long-run average exactly, shown as \"no working signal\": recent data contradicts every signal's usual direction."],
    ["Weights", "Inverse of each signal's recent forecast error (1-year half-life); equal until a signal has a year of record."],
    ["Final", "Long-run average + λ × (combined forecast − long-run average). λ is 0 to 1, from how much the models beat the average over the last ~3 years."],
    ["Label", "Chance of a higher close vs the usual chance: bullish or bearish at ±1 point (day), ±2 (week), ±3 (month)."],
    ["Confidence", "High: past calls of this kind beat other days by 5+ points (in today's market state if 50+ calls), 70% of the weight agrees, λ ≥ 0.5 and Clark–West p < 0.10. Medium: 2+ points, 50% agreement and λ ≥ 0.2. Otherwise low."],
    ["Stressed", "Index volatility (EWMA) above its median of the past year."],
    ["Weeks like this", "Today's 5-day move in σ, bucketed at ±1σ and ±2σ. The record column shows that bucket's next-day and next-week up-rate and average return since 2000, matched to today's calm/stressed regime and 12−1 momentum sign when that leaves 30+ cases, relaxed otherwise (10+ at the plain bucket, or no claim). A base rate, not a forecast."],
    ["Limits", "Some inputs start late: the high-yield spread on FRED only from Oct 2023, Bitcoin from 2014, VIX3M from 2007. Before then risk appetite runs on fewer of its 8 inputs (at least 4). A backtest on one market's history."],
  ]],
  ["raiCard", [
    ["Trend inputs", "ES, Bitcoin, USD/JPY, dollar (inverted): 21-day log return ÷ (EWMA volatility × √21)."],
    ["Level inputs", "VIX, VIX/VIX3M, MOVE, high-yield spread (all inverted): (today − 1-year median) ÷ (1.4826 × median absolute deviation)."],
    ["Weights", "Equal. Each input capped at ±3. Needs at least 4 of 8."],
    ["Label", "3-day mean. +0.75 or more: risk-on. +0.25 to +0.75: leaning risk-on. −0.25 to +0.25: neutral. −0.75 to −0.25: leaning risk-off. Below −0.75: risk-off."],
    ["Volatility", "RiskMetrics EWMA, λ = 0.94: σ²<sub>t</sub> = 0.94 σ²<sub>t−1</sub> + 0.06 r²<sub>t−1</sub>."],
  ]],
  ["regimeCard", [
    ["Growth", "ES, copper/gold ratio, high-yield spread (inverted)."],
    ["Inflation", "10Y breakeven, DBC, DBA. Rolled funds, so no futures roll jumps."],
    ["Score", "Each input: average of its 3- and 6-month moves, each ÷ (volatility before the window × √length), capped at ±3. Equal weights; 2 of 3 inputs per axis needed."],
    ["Rules", "Read on each finished week (from Saturday, New York). Changes only after a new quadrant holds 3 finished weeks in a row. Within 0.15 of an axis counts as no change. The first regime also needs 3 steady weeks."],
    ["Dating", "A change is dated to the first week of the 3-week run."],
    ["Map", "Trail: the last 13 finished weeks, fainter with age. Large dot: this week so far. Strip: the regime each week for the past year."],
  ]],
  ["arCard", [
    ["Data", "Daily returns of ES, NQ, Bitcoin, gold, crude, dollar, USD/JPY, HYG, VIX, and daily changes in the 10Y yield."],
    ["Ratio", "Correlation matrix over 63 days. Share of total variance in the top 2 of 10 eigenvalues (Jacobi method)."],
    ["Shift", "ΔAR = (15-day mean − 1-year mean) ÷ 1-year standard deviation. +1 or more is flagged."],
  ]],
  ["recCard", [
    ["Formula", "P = Φ(−0.5333 − 0.6330 × S). S is the 21-day mean of the 10Y minus 3M Treasury yield, in percentage points (FRED H.15)."],
    ["Line", "30%."],
    ["Limits", "The NY Fed uses monthly averages and the bond-equivalent 3-month yield, so this can differ from its table by a point or two."],
  ]],
  ["ofCard", [
    ["Data", "The full CBOE delayed-quotes SPX option board (about 1.7 MB), refreshed every 20 minutes. Prices delayed 15 minutes; open interest from the previous session."],
    ["Net gamma", "Σ (call gamma × OI) − Σ (put gamma × OI), × 100 (contract multiplier) × index² × 1%: dollars of S&P hedging per 1% move. The usual naive positioning assumption: customers buy puts and sell covered calls, so dealers are long call gamma and short put gamma."],
    ["Profile", "Each option's Black–Scholes gamma recomputed at a grid of index levels around spot (the chart zooms to ±3%, ±8% or the full ±18% grid; the flip always comes from the widest one), holding its quoted IV fixed, dividend yield 1.25% and r the fed funds rate; options out to 126 days and within 30% of spot. Where the curve crosses zero is the flip level."],
    ["Walls", "Strike with the largest call open interest, put open interest, and |gamma × OI| within 25% of spot."],
    ["Flow", "Put/call ratios on today's SPX volume and open interest; the share of volume in same-day (0DTE) and same-week expiries."],
    ["Vol curve", "VIX9D/VIX, VXN/VIX, VVIX and SKEW from CBOE indices via Yahoo, each with its 1-year percentile."],
    ["Limits", "The dealer-positioning assumption is a simplification — real books mix customer flow both ways, and OI is one session stale. Context, not advice."],
  ]],
  ["ctaCard", [
    ["Signal", "For lookbacks of 21, 63, 126 and 252 days: z = move ÷ (EWMA volatility × √lookback), using log price (negative yield for the 10Y)."],
    ["Position", "Each lookback: z ÷ 2, capped at ±1. Equal-weight average of the four. ES and NQ are roll-adjusted."],
    ["Flip level", "Tomorrow each lookback compares against the close L days earlier. Above it the signal is long, below it short. If that price is on the far side of today's, the signal flips even at an unchanged close."],
    ["±2σ week", "Price moved by 2 × volatility × √5, lookbacks rolled forward 5 days; the change in position is the flow."],
    ["Limits", "An estimate from prices, not reported positions. Real funds differ in lookbacks and sizing."],
  ]],
  ["vrpCard", [
    ["Formula", "VIX − √(252 × mean of the last 21 squared daily ES log returns) × 100, in volatility points. ES roll-adjusted."],
    ["Labels", "Below 0 negative. 80th percentile of the past year or more rich, 20th or less thin."],
    ["Limits", "VIX looks 30 calendar days ahead; realized volatility looks 21 sessions back."],
  ]],
  ["sbCard", [
    ["Formula", "Correlation over 63 sessions of daily ES log returns (roll-adjusted) with the negative daily change in the 10Y yield."],
    ["Labels", "−0.2 or below: bonds hedge stocks. +0.2 or above: they fall together."],
  ]],
  ["calCard", [
    ["Holidays", "NYSE rules: fixed dates moved off weekends, Good Friday from Easter, Juneteenth from 2022. One-off closures aren't included."],
    ["FOMC", "Read from federalreserve.gov, checked weekly; a built-in list is the fallback."],
    ["Turn of month", "The last trading day and the first three of the next month."],
    ["Expiry", "Third Friday; Thursday when Friday is a holiday. March, June, September and December are quarterly."],
    ["Rebalancing", "ES month-to-date % minus the 10Y Treasury's, taken as −8.5 × the yield change. Flagged at 2 points."],
  ]],
];

export function initMethods() {
  for (const [id, rows] of METHODS) {
    const card = document.getElementById(id);
    if (!card || card.querySelector(".m-method")) continue;
    const d = document.createElement("details");
    d.className = "m-method";
    d.innerHTML = "<summary>How it's calculated</summary><dl>" +
      rows.map(([k, v]) => "<div><dt>" + k + "</dt><dd>" + v + "</dd></div>").join("") + "</dl>";
    card.appendChild(d);
  }
}
