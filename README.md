# Equarian Markets

A live macro dashboard for futures traders. Rates, credit, carry and the tape on one screen, read through a rule-based daily read and four quantitative models: a **Risk Appetite Index**, a **growth × inflation regime**, the **absorption ratio** of systemic risk, and the **NY Fed recession probability**.

> **History:** First built in July 2026 and deployed on Netlify. Moved to GitHub in October 2026, so the commit history starts there. Moved to GitLab ([eatentam/eqmarkets](https://gitlab.com/eatentam/eqmarkets)) on 17 Oct 2026 after the GitHub account was suspended.

| | |
|---|---|
| **Live** | https://markets.ethantam.dev |
| **Hosting** | Netlify site `eqmarkets` (static Vite build plus the Netlify Function `/api/explain`) |
| **Run locally** | `npm install && npm run dev` (see *Develop*) |
| **Settings** | `MISTRAL_API_KEY` (optional, enables AI explanations), `EXPLAIN_MODEL` (optional). Set in Netlify environment variables, scope Functions. |

- **36 indicators** in five groups. **Rates:** 3M, 2Y, 10Y, 2s10s, 3m10y, 10Y real yield, 10Y breakeven, Kim–Wright term premium, DXY. **Risk:** VIX, VIX/VIX3M term structure, MOVE, HY and IG OAS, Chicago Fed NFCI, St. Louis Fed stress index, HYG, BTC. **Carry:** USD/JPY, EFFR, BOJ, CFTC yen positioning, carry-to-vol. **Commodities:** copper, copper/gold ratio, silver, natural gas, corn, wheat, soybeans, DBC (broad) and DBA (agriculture). **Tape:** ES, NQ, gold, crude.
- **Today's read:** fixed rules turn this month's cross-asset moves into plain-English observations (for example, oil and grains up while stocks fall reads as cost-push, checked against breakevens). Each line shows the exact numbers that triggered it. An optional **Explain in plain English** button has Mistral AI write a short note from the same numbers (see *AI explanations* below).
- **Macro regime:** a growth × inflation map (Goldilocks, Reflation, Stagflation, Slowdown) scored from 3- and 6-month market moves and read weekly. It changes only after a new quadrant holds for three weeks, shows when a change is building, and has a 13-week trail and a 52-week history strip.
- **Method notes:** every model card has a "How it's calculated" toggle listing its data, formula, weights and rules.
- **Market bias:** a bullish / neutral / bearish tilt for ES and NQ over the next day, week and month, with a confidence grade, each signal's pull, and a walk-forward track record since 2000 (see *Market bias model* below).
- **Flows and premia:** an estimate of trend-follower (CTA) positioning in 8 markets, with the price levels where each signal flips and the forced flow from a ±2σ week; the variance risk premium (VIX minus ES realized vol); the stock–bond correlation; and a calendar of turn-of-month, FOMC, option expiry, holidays and month-end rebalancing pressure.
- **Three models**, each computed in the browser from two years of daily history:
  - **Risk Appetite Index v2:** equal-weighted, clipped scores. Trending assets enter as volatility-scaled momentum and stress gauges as robust z-scores. It shows a per-input contribution chart and a point-in-time 1Y history.
  - **Absorption ratio** (Kritzman et al. 2011): the variance share of the top fifth of eigenvectors across a 10-asset return panel, plus the standardized ΔAR shift.
  - **NY Fed yield-curve recession probability:** a probit on the 1-month average 3m10y spread, with a 2Y history.
- **Tour and guide:** a first-visit spotlight tour walks through each panel using that day's live numbers. The **Guide** button (and a **?** on each model) opens a reference covering a 30-second pre-trade routine, what z-scores, percentiles, bp and vol mean, each model's thresholds and caveats, a glossary of all 36 indicators, and how fresh each feed is. Add `?notour` to the URL to skip the tour.
- **Interactive charts:** hover or tap for a crosshair readout (date and value in the series' units; the arrow keys work too), with a value axis on round-number ticks and a date axis. Used on the detail sheet and all three model charts.
- **Unit-aware statistics:** each series has a `kind`. Prices use % changes and log-return vol; rates and spreads use bp changes and normal (bp) vol; indices use points. Cards show the 1M change and EWMA vol. The detail sheet adds 1W/1M/3M/YTD/1Y changes, 21-day and EWMA (λ = 0.94) vol, 1Y percentile, robust z, high/low and max drawdown.
- **Correct alignment:** Yahoo bars are dated in exchange-local time via `gmtoffset`, so FX and futures share a calendar. Curve spreads use H.15 closes on both legs. Models use as-of joins with a 7-day staleness cap.
- **Live status:** a 60-second refresh and market session chips (NYSE cash, CME Globex) for Singapore and New York. A stale marker appears if the feeds stop answering, and cards keep their last good value instead of blanking.
- **Installable app (PWA):** an install bar uses the browser's own prompt on Android and desktop, and shows the Share → Add to Home Screen steps on iPhone. It's also in the Guide. The last good data is saved on the device, so the app opens instantly and still shows the last values offline ("Offline · saved 14:31 SGT"). Long-press the home-screen icon for shortcuts to Models, Rates, Risk and the Tape (`/?tab=rates`). A notice offers a reload when a new version is deployed.

## Scope: Markets vs Oracular

Markets and [Oracular](https://oracular.ethantam.dev) are separate tools, and new features should stay on their side of the line.

| Markets (this repo) | Oracular |
|---|---|
| Top-down and cross-asset: rates, credit, vol, FX, commodities, index futures | Bottom-up: one company or ticker at a time |
| Live market data | Synthetic, deterministic data |
| Regimes, flows, premia and positioning (RAI, absorption, recession odds, CTA, VRP, stock–bond) | Investment memo, verdict badge and seven-factor scorecard |
| Calendar *events* that move index futures (turn of month, FOMC, expiry, rebalancing), tested as event studies | Per-ticker seasonality tables with t-statistics, lifecycle phase map |
| Testing whether a signal works (backtest lab, overfitting guards) | Options and derivatives analytics, alternative signals, research chat |

So Markets doesn't show single stocks, fundamentals, options chains, buy/hold verdicts or month-of-year seasonality tables, and Oracular doesn't do macro regimes or cross-asset flows.

## Data sources

| Data | Source | Series | How it's reached |
|---|---|---|---|
| Futures, FX, indices, ETFs, BTC | Yahoo Finance chart API | `ES=F NQ=F GC=F CL=F JPY=X DX-Y.NYB HYG BTC-USD ^TNX ^VIX ^VIX3M ^MOVE` | `/yf/*` proxy |
| Treasuries, real yields, breakevens | FRED (H.15, Fed Board) | `DGS3MO DGS2 DGS10 DFII10 T10YIE` | `/fred/*` proxy |
| Term premium | FRED (Kim–Wright, Fed Board) | `THREEFYTP10` | `/fred/*` |
| Credit spreads | FRED (ICE BofA) | `BAMLH0A0HYM2 BAMLC0A0CM` | `/fred/*` |
| Financial conditions | FRED (Chicago Fed, St. Louis Fed) | `NFCI STLFSI4` (weekly) | `/fred/*` |
| Fed funds | FRED (NY Fed) | `DFF` | `/fred/*` |
| BOJ policy rate | boj.or.jp homepage | scraped | `/boj/*` proxy, manual fallback in `src/config.js` |
| Yen speculative positioning | CFTC Legacy COT (Socrata `6dca-aqww`) | non-commercial net, 3 years | `/cftc/*` proxy |
| Commodities | Yahoo Finance chart API | `HG=F SI=F NG=F ZC=F ZW=F ZS=F DBC DBA` | `/yf/*` proxy |
| FOMC meeting dates | federalreserve.gov FOMC calendar page | scheduled statement days | `/fed/*` proxy, built-in fallback in `src/quant/calendar.js` |

All of these are free and need no API key.

**ES and NQ are roll-adjusted.** Yahoo's `ES=F` and `NQ=F` switch to the next contract at each quarterly expiry, and the next contract trades at a premium, so the raw series jumps 1–3% on the third Friday and the session after. Checked against the cash indices over five years, those days were the only large gaps (25 days over 0.4% for ES, 31 for NQ). Every calculation uses a back-adjusted series instead (`src/data/roll.js`): from 8 sessions before each quarterly expiry to 1 after (NYSE calendar, so it also covers the CME roll date), each day takes the cash index's return (`^GSPC`, `^NDX`) where the index has printed; every other day keeps the futures' own return, and the path is rebuilt back from today's price. Afterwards no daily gap to the index exceeds 0.4% and the typical one is 0.04%. Returns then roughly match what holding the futures earned: over five years 8.6% a year for ES instead of the raw series' 11.5% (the index did 11.3%; the difference is financing net of dividends). Using index returns on 10 sessions a quarter puts back a little carry on those days, so the adjusted series overstates futures returns by roughly 0.3–0.5% a year. GC and CL futures are not adjusted; the regime uses the rolled funds DBC and DBA instead.

**Credit spreads start in October 2023.** FRED only serves the ICE BofA high-yield and investment-grade spreads for the last three years. The dashboard needs two, so it isn't affected. In the long-history market-bias model and the lab, the Risk Appetite Index also lacks Bitcoin before 2014 and VIX3M before 2007, so for much of 2000–2023 it runs on 5 to 7 of its 8 inputs (it needs at least 4).

None of these send CORS headers, so the browser can't call them directly. `netlify.toml` rewrites the five paths to the upstream hosts, which makes them same-origin. Outside Netlify the app falls back to public CORS proxies.

## Methodology

| Quantity | Definition |
|---|---|
| Returns | log returns for prices; first differences for rates (bp) and levels |
| Realized vol | sample std (n−1) of the last 21 steps × √252 (√365 BTC, √52 weekly) |
| EWMA vol | RiskMetrics σ²ₜ = λσ²ₜ₋₁ + (1−λ)r²ₜ₋₁, λ = 0.94, seeded with the first 20 obs |
| Percentile | mid-rank of today's value within the prior year |
| Robust z | (x − median) / (1.4826 · MAD) over the trailing year; classical z if MAD = 0 |
| RAI trend score | ln(Pₜ / Pₜ₋₂₁) / (σ_EWMA · √21), signed, clipped ±3 |
| RAI level score | robust z of the level over 252 days, signed, clipped ±3 |
| RAI | mean of available scores (≥ 4 of 8); label on the 3-day mean, thresholds ±0.25σ / ±0.75σ |
| Absorption ratio | Σ top-k eigenvalues / Σ all, k = round(N/5), correlation matrix of 63-day returns (Jacobi eigen-solver) |
| ΔAR | (15-day mean AR − 252-day mean AR) / 252-day std AR |
| Recession probability | Φ(−0.5333 − 0.6330 · S̄), S̄ = 21-day mean of DGS10 − DGS3MO in pp |
| Carry-to-vol | (EFFR − BOJ) / annualized EWMA vol of USD/JPY |
| Vol-scaled move | Δₕ / (σ_EWMA at window start · √h): log change for prices, point change for rates; clipped ±3 |
| Growth score | mean of ES, copper/gold, −HY OAS (≥ 2 of 3), each the average of its 63- and 126-day vol-scaled moves |
| Inflation score | mean of the 10Y breakeven, DBC, DBA (≥ 2 of 3), each the average of its 63- and 126-day vol-scaled moves |
| Regime | read weekly (last close of each week); switches only after the new quadrant holds 3 completed weeks in a row, with a ±0.15 dead band around each axis; dated to the first week of the run |
| Today's read | 16 rules on 21-day vol-scaled moves and VIX/MOVE level z-scores; strength = weakest condition; top 4 shown |
| CTA position | mean over L ∈ {21, 63, 126, 252} of clip(zₗ / 2, ±1), zₗ = (xₜ − xₜ₋ₗ) / (σ_EWMA · √L), x = ln P (or −yield) |
| CTA flip level | the close tomorrow at which zₗ changes sign: xₜ₋ₗ₊₁ |
| CTA ±kσ week | position after xₜ + kσ√5 with every lookback rolled forward 5 days, minus today's |
| Variance risk premium | VIX − √(252 · mean r²) × 100 over ES's last 21 daily log returns, vol points |
| Stock–bond correlation | 63-day Pearson correlation of ES log returns with −Δ10Y yield |
| Month-end gap | ES month-to-date % − 10Y Treasury month-to-date % (≈ −8.5 × Δyield) |
| Turn of month | last NYSE trading day of the month and the first three of the next (holidays computed from the NYSE rules) |
| Option expiry | third Friday, or the Thursday before when Friday is a holiday; quad witching in Mar/Jun/Sep/Dec |
| FOMC dates | read from federalreserve.gov's calendar page at startup (cached a week) and merged over a built-in 2010–2027 list |

All of this lives in `src/quant/` as pure functions, covered by `tests/quant.test.js` and `tests/flows.test.js`. The tests check them against closed-form cases: EWMA convergence to the true σ, eigenvalues of known matrices, an AR near 1 when one factor drives everything and near k/N for independent assets, the NY Fed probit formula, and bp units for rates.

## Market bias model

One read per horizon (next 1, 5 and 21 sessions) for ES and NQ, built so that nothing is fitted to the period it is judged on (`src/quant/composite.js`, tests in `tests/composite.test.js`):

1. **One forecast per signal.** For each of trend followers, the variance risk premium, risk appetite, the absorption shift and the yield-curve recession odds (plus turn of month, FOMC and pre-holiday timing at the 1- and 5-day horizons), a univariate regression of the forward log return on the signal, estimated on an expanding window of observations whose outcome was known at the time. Goyal & Welch (2008) show big multivariate models fail out of sample; Rapach, Strauss & Zhou (2010) show simple ones combined hold up.
   Each regression weights recent years more (half-life three years), so relationships can drift (time-varying coefficients, Dangl & Halling 2012).
2. **Calm and stressed markets.** The market counts as stressed when the index's own EWMA volatility is above its median of the previous year. Each signal gets a slope for each state, shrunk toward its pooled slope by n / (n + 504) effective observations, so a state with little history stays close to the pooled estimate. Predictability is known to be concentrated in bad times (Rapach, Strauss & Zhou 2010; Henkel, Martin & Nardari 2011).
3. **Sign restriction** (Campbell & Thompson 2008). Each signal may only push the way its research says; a wrong-signed slope is set to zero.
4. **Combination** by discounted mean squared forecast error (Stock & Watson 2004), half-life one year; equal shares until a signal has a year of out-of-sample record.
5. **Earned weight against the long-run average.** Final forecast = M + λ(F − M), with λ the forecast-encompassing weight (Harvey, Leybourne & Newbold 1998) from past out-of-sample errors only (half-life three years, matching the regressions), clipped to [0, 1]. When the models stop helping, λ falls and the read goes back to "no tilt".
6. **Label** from the tilt in the chance of a higher close versus the long-run base rate, with bands fixed in advance (1, 2, 3 points for day, week, month). **Confidence** needs past calls of that kind, in the same market state as today when there are 50 or more, to have gone their way more often than on the days the call wasn't made (5 points for high, 2 for medium), most of the weight to agree, and Clark–West p below 0.10 for high.
7. **Scored out of sample:** R² against the prevailing historical mean, Clark & West (2007) with Newey–West errors, hit rates, calibration, and the certainty-equivalent gain of a mean–variance investor (γ = 3).

It runs in a Web Worker on full daily history from 2000 and is cached on the device for six hours. The scorecard is also split by market state, and the card says in plain words whether the model beats a plain average overall, in calm markets and in stressed ones.

**Results and variants tried** (out-of-sample R² for day / week / month, full history to Oct 2026). Four specifications were run, all disclosed here:

| Variant | ES | NQ |
|---|---|---|
| Expanding pooled slopes, λ half-life 1y (first version) | +0.01 / +0.04 / +0.22% | +0.04 / +0.30 / +1.35% |
| Adaptive calm/stressed slopes, λ half-life 1y | −0.01 / −0.08 / −0.47% | +0.14 / +0.69 / +1.93% |
| **Adaptive calm/stressed slopes, λ half-life 3y (live)** | +0.03 / 0.00 / −0.40% | +0.18 / +0.91 / +2.56% |
| Adaptive calm/stressed slopes, no λ (raw combination) | +0.06 / +0.27 / +0.56% | +0.30 / +1.54 / +5.28% |

NQ is significant at every horizon (Clark–West p ≤ 0.006); ES at none. The raw combination scores best over the full history but falls apart when the model has less history to learn from (−3.8% monthly when trained only from 2016), which the λ blend turns into roughly zero; that protection against changing conditions is why λ stays. Scored on 2019–2026 only, nothing is significant for ES or NQ. Directionally, the skill sits in bearish calls: on full history the index fell short of its average after 62% of NQ bearish calls versus 33% of other days, while bullish calls did no better than other days. The lab's *Market bias model* card shows the full scorecard, the Goyal–Welch cumulative error plot, weights over time and calibration.

References for the bias model: Dangl & Halling (2012), *Predictive Regressions with Time-Varying Coefficients*, JFE. Henkel, Martin & Nardari (2011), *Time-Varying Short-Horizon Predictability*, JFE. Goyal & Welch (2008), *A Comprehensive Look at the Empirical Performance of Equity Premium Prediction*, RFS. Campbell & Thompson (2008), *Predicting Excess Stock Returns Out of Sample*, RFS. Rapach, Strauss & Zhou (2010), *Out-of-Sample Equity Premium Prediction: Combination Forecasts and Links to the Real Economy*, RFS. Stock & Watson (2004), *Combination Forecasts of Output Growth in a Seven-Country Data Set*, JoF. Harvey, Leybourne & Newbold (1998), *Tests for Forecast Encompassing*, JBES. Clark & West (2007), *Approximately Normal Tests for Equal Predictive Accuracy in Nested Models*, JoE. DeMiguel, Garlappi & Uppal (2009), *Optimal Versus Naive Diversification*, RFS.

References for flows and premia: Moskowitz, Ooi & Pedersen (2012), *Time Series Momentum*, JFE. Hurst, Ooi & Pedersen (2017), *A Century of Evidence on Trend-Following Investing*, JPM. Bollerslev, Tauchen & Zhou (2009), *Expected Stock Returns and Variance Risk Premia*, RFS. Carr & Wu (2009), *Variance Risk Premiums*, RFS. Campbell, Pflueger & Viceira (2020), *Macroeconomic Drivers of Bond and Equity Risks*, JPE. Lakonishok & Smidt (1988), *Are Seasonal Anomalies Real?*, RFS. McConnell & Xu (2008), *Equity Returns at the Turn of the Month*, FAJ. Lucca & Moench (2015), *The Pre-FOMC Announcement Drift*, JF. Ariel (1990), *High Stock Returns before Holidays*, JF.

References: Ilmanen, Maloney & Ross (2014), *Exploring Macroeconomic Sensitivities: How Investments Respond to Different Economic Environments*, JPM. Bridgewater Associates (2012), *The All Weather Story*. Moskowitz, Ooi & Pedersen (2012), *Time Series Momentum*, JFE. Erb & Harvey (2006), *The Strategic and Tactical Value of Commodity Futures*, FAJ. Gorton & Rouwenhorst (2006), *Facts and Fantasies about Commodity Futures*, FAJ. Kumar & Persaud (2002), *Pure Contagion and Investors' Shifting Risk Appetite*, IMF. Kritzman, Li, Page & Rigobon (2011), *Principal Components as a Measure of Systemic Risk*, JPM. Estrella & Mishkin (1996), *The Yield Curve as a Predictor of U.S. Recessions*, NY Fed. Estrella & Trubin (2006), *The Yield Curve as a Leading Indicator*, NY Fed. J.P. Morgan/Reuters (1996), *RiskMetrics Technical Document*. Gilchrist & Zakrajšek (2012), *Credit Spreads and Business Cycle Fluctuations*, AER. Kim & Wright (2005), *An Arbitrage-Free Three-Factor Term Structure Model*, Fed Board.

Caveat: the NY Fed fits its probit to monthly averages and the bond-equivalent 3M bill, so this daily version can differ from the published table by a point or two. Check `NYFED_PROBIT` in `src/quant/models.js` against the NY Fed's current release.

Why the regime uses DBC and DBA instead of the grain and energy futures: Yahoo's continuous front-month contracts (`ZC=F` and so on) jump on each roll date, by the gap between the expiring and the next contract. Over a 3-month window that can be several percent of fake "move". The funds hold and roll the futures themselves, so their prices don't jump. The commodity cards still show the futures, and the guide warns that big monthly moves there can include roll.

## Backtest lab (admin)

A hidden **Lab** tab for testing the models as trading signals. Open the site with `?admin=1` to turn it on in that browser (`?admin=0` turns it off). It only hides UI: there is no secret behind it, and the lab code loads as its own chunk the first time the tab opens.

- **Data:** 2Y, 5Y, 10Y or full daily history for the model inputs and the instrument (NQ, ES, NDX, QQQ and SPY total return, gold, Bitcoin).
- **Point-in-time models:** RAI (raw and 3-day mean), absorption ratio and ΔAR, the recession probability, the variance risk premium, the stock–bond correlation and the trend-follower position are rebuilt for every day using only data up to that day. FRED series are treated as known one business day after their date, when they are published.
- **Overlay:** the price chart is shaded by RAI regime, ΔAR fragility, recession odds, the variance premium, the stock–bond correlation, trend-follower positioning, the turn of the month or any strategy's position, with the model in a synced pane below.
- **Strategies:** buy and hold, RAI regime, RAI scaled, absorption ΔAR (Kritzman et al.), recession filter, RAI + ΔAR, variance premium, CTA trend, turn of month, a 200-day trend baseline, and a **custom JavaScript rule**. Options: execution on the signal's close or the next one, cost in bp per side, and an EWMA volatility target.
- **Results:** growth of $1 (log), drawdowns, and CAGR, vol, Sharpe, Sortino, max drawdown, Calmar, exposure, trades per year, hit rate and beta to buy and hold, plus a CSV export. Every strategy is measured over the same window, starting when all selected strategies have a signal.
- **Is it real?** Guards against overfitting, the usual way backtests mislead:
  - an in-sample / out-of-sample split (last 30% or 50%), marked on every chart;
  - a 90% interval on Sharpe from 600 stationary block-bootstrap resamples (Politis & Romano 1994, 10-day blocks);
  - the deflated Sharpe ratio (Bailey & López de Prado 2014): the probability the true Sharpe is above zero, after fat tails and after counting every strategy variant tried in the session, including sweep cells;
  - a parameter sweep: any rule that reads `ctx.p.a` / `ctx.p.b` runs over a grid, shown as a heatmap scored on the in-sample period, with the best cell's out-of-sample Sharpe. A real edge is a broad plateau, not one bright cell.
- **Calendar effects:** an event study on the instrument's whole history: turn of month, FOMC day and the day before, option-expiry week, quad-witching week, expiry day, pre-holiday, and month-end after stocks led or lagged Treasuries by 2+ points. Each row has the mean event-day and other-day return in bp, Welch's t, a randomization p-value (2,000 same-size random day sets), the hit rate and the share of total return.
- **Console:** `eqlab.test(ctx => ctx.raiS > 0 ? 1 : 0)` prints a rule against buy and hold. `eqlab.frame` has the aligned data and `eqlab.events` the calendar study.

A rule is the body of `function (ctx)`, called once per bar. It returns a position (1 long, 0 flat, −1 short, clipped to ±3) or `null` to hold. `ctx` exposes only the current and past bars (`ctx.price`, `ctx.raiS`, `ctx.dAR`, `ctx.rec`, `ctx.vrp`, `ctx.sbCorr`, `ctx.trend`, `ctx.sma(n)`, `ctx.get(field, k)`…), so a rule can't peek ahead. The one exception is `ctx.cal(flag, ahead)`: calendar dates are known in advance, so a rule may ask whether the next bar is, say, a turn-of-month day. The engine is `src/quant/backtest.js`, tested in `tests/backtest.test.js` (lag, costs, holding on null, no look-ahead, vol targeting, ΔAR path).

Caveats: futures use Yahoo's continuous front-month series, so roll gaps count as returns. Flat earns nothing, and Sharpe uses a zero risk-free rate. A backtest over a few years of one market is a sanity check, not evidence of an edge.

## AI explanations (optional)

The **Explain in plain English** button calls `netlify/functions/explain.mjs`, which asks Mistral (`mistral-medium-latest`, Mistral Medium 3.5) for a two-paragraph note.

- **Turn it on:** Netlify → Site configuration → Environment variables → add `MISTRAL_API_KEY` (scope: Functions), then redeploy. Create the key at console.mistral.ai → API Keys. Without it the button says it isn't set up.
- **Optional:** `EXPLAIN_MODEL` to use a different Mistral model, for example `mistral-small-latest` (cheaper and faster) or `mistral-large-latest`.
- **What it sends:** only numbers. The browser posts the scores behind *Today's read*. The function checks them against a fixed schema (known ids, bounded finite numbers, ISO dates), rebuilds every sentence itself in `src/ai/explain.js`, and only then calls the API, so nothing typed by a visitor can reach the prompt.
- **Cost control:** a per-IP rate limit of 6 a minute (Netlify's in-code function rate limiting; check it's enabled on your plan), a 30-minute cache per identical data block, a 9-second timeout and at most 700 output tokens. A call costs about half a US cent on Medium 3.5 ($1.5/M input, $7.5/M output). **Set a monthly spend limit in the Mistral console (Admin → Limits)** as the backstop, because the endpoint is public.
- **Errors:** a rejected key, rate limit, timeout or empty answer each shows a short notice instead of partial text.

## Project structure

```
index.html              page shell and static markup
src/
  main.js               boot, refresh loop
  pwa.js                service worker, install bar, update notice
  config.js             indicator list, BOJ fallback, refresh interval
  state.js              latest series per indicator
  data/
    transport.js        proxy fallbacks and timeouts
    sources.js          Yahoo, FRED, BOJ and CFTC fetchers
    fomc.js             FOMC dates from federalreserve.gov, cached a week
    roll.js             quarterly roll adjustment for ES and NQ
    snapshot.js         last good data saved on the device for instant and offline launch
  quant/
    stats.js            statistics: EWMA, robust z, percentiles, eigenvalues, alignment
    models.js           RAI, absorption ratio, recession probit, per-series stats
    regime.js           vol-scaled moves, growth × inflation regime
    narrative.js        rules behind Today's read
    flows.js            variance risk premium, stock–bond correlation, CTA trend positioning
    calendar.js         NYSE holidays, FOMC dates, turn of month, option expiry, event study
    backtest.js         backtest engine: simulate, metrics, vol target, rules, presets, bootstrap, deflated Sharpe
    composite.js        market bias: walk-forward forecast combination and its out-of-sample scorecard
  lab/                  admin backtest lab (separate chunk)
    lab.js              controls, strategies, results, custom rule editor
    plot.js             multi-series chart with shading and synced crosshairs
    insights.js         calendar event study and parameter-sweep heatmap
  ai/
    explain.js          payload validation and prompt building (shared with the function)
  model/
    derived.js          curve spreads, VIX term structure, carry-to-vol
    models.js           builds the models from fetched state
    facts.js            the numbers behind Today's read and the AI note
    history.js          long history and the point-in-time model frame (lab and market bias)
    bias.js             market-bias build, cache and worker hand-off
    bias.worker.js      runs the market-bias build off the main thread
  ui/
    board.js            indicator cards
    detail.js           detail sheet (dialog)
    models-panel.js     models section rendering
    flows-panel.js      CTA positioning, variance premium, stock–bond correlation, calendar
    bias-panel.js       market bias card
    methods.js          "How it's calculated" notes on each model card
    read-panel.js       Today's read and the AI button
    regime-panel.js     regime map
    chrome.js           clocks, session chips, tabs, progress bar
    notes.js            one-line reads per indicator
    chart.js            interactive chart: axes, crosshair, tooltip, keyboard
    tour.js             first-run spotlight tour with live values
    guide.js            "how to read this" guide sheet
    sheet.js            swipe-to-dismiss for bottom sheets
    format.js           number formatting and sparklines
  styles/               base tokens, layout, components
public/                 manifest, icons, service worker (copied as-is)
netlify/functions/
  explain.mjs           POST /api/explain (Mistral)
netlify.toml            build settings, data proxies, headers
```

## Develop

Needs Node 20 or newer.

```sh
npm install
npm run dev          # http://localhost:5173
```

`vite.config.js` mirrors the `netlify.toml` proxies, so `npm run dev` and `npm run preview` fetch data same-origin like the deployed site. Open `http://localhost:5173/?admin=1&tab=lab` for the lab.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests for the quant library and backtest engine |
| `npm run audit:design` | [impeccable](https://www.npmjs.com/package/impeccable) design anti-pattern scan (`npx impeccable` if not installed) |

## Deploy on Netlify

1. In Netlify: **Add new site → Import an existing project → GitLab →** `eatentam/eqmarkets`. (For the existing site: **Site configuration → Build & deploy → Link repository**.)
2. Netlify reads `netlify.toml`: build command `npm run build`, publish directory `dist`. Nothing to fill in.
3. Every push to `main` deploys. Merge requests get deploy previews.

`.github/workflows/ci.yml` (lint, test, build) is left over from GitHub and does not run on GitLab.

After a BOJ rate decision, if the live scrape ever fails, update `BOJ_RATE` in `src/config.js`.

## Notes

- Built for context, not trading advice.
- The service worker never caches market data; it only keeps the app shell for offline launch.
