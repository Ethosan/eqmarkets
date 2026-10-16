# Equarian Markets

A live macro dashboard for futures traders. Rates, credit, carry and the tape on one screen, read through a rule-based daily read and four quantitative models: a **Risk Appetite Index**, a **growth × inflation regime**, the **absorption ratio** of systemic risk, and the **NY Fed recession probability**.

> **History:** First built in July 2026 and deployed on Netlify. Moved to GitHub in October 2026, so the commit history starts there.

- **36 indicators** in five groups. **Rates:** 3M, 2Y, 10Y, 2s10s, 3m10y, 10Y real yield, 10Y breakeven, Kim–Wright term premium, DXY. **Risk:** VIX, VIX/VIX3M term structure, MOVE, HY and IG OAS, Chicago Fed NFCI, St. Louis Fed stress index, HYG, BTC. **Carry:** USD/JPY, EFFR, BOJ, CFTC yen positioning, carry-to-vol. **Commodities:** copper, copper/gold ratio, silver, natural gas, corn, wheat, soybeans, DBC (broad) and DBA (agriculture). **Tape:** ES, NQ, gold, crude.
- **Today's read:** fixed rules turn this month's cross-asset moves into plain-English observations (for example, oil and grains up while stocks fall reads as cost-push, checked against breakevens). Each line shows the exact numbers that triggered it. An optional **Explain in plain English** button has Mistral AI write a short note from the same numbers (see *AI explanations* below).
- **Macro regime:** a growth × inflation map (Goldilocks, Reflation, Stagflation, Slowdown) scored from 3-month market moves, with a 13-week trail, a confidence level and the date the regime began.
- **Three models**, each computed in the browser from two years of daily history:
  - **Risk Appetite Index v2:** equal-weighted, clipped scores. Trending assets enter as volatility-scaled momentum and stress gauges as robust z-scores. It shows a per-input contribution chart and a point-in-time 1Y history.
  - **Absorption ratio** (Kritzman et al. 2011): the variance share of the top fifth of eigenvectors across a 10-asset return panel, plus the standardized ΔAR shift.
  - **NY Fed yield-curve recession probability:** a probit on the 1-month average 3m10y spread, with a 2Y history.
- **Tour and guide:** a first-visit spotlight tour walks through each panel using that day's live numbers. The **Guide** button (and a **?** on each model) opens a reference covering a 30-second pre-trade routine, what z-scores, percentiles, bp and vol mean, each model's thresholds and caveats, a glossary of all 27 indicators, and how fresh each feed is. Add `?notour` to the URL to skip the tour.
- **Interactive charts:** hover or tap for a crosshair readout (date and value in the series' units; the arrow keys work too), with a value axis on round-number ticks and a date axis. Used on the detail sheet and all three model charts.
- **Unit-aware statistics:** each series has a `kind`. Prices use % changes and log-return vol; rates and spreads use bp changes and normal (bp) vol; indices use points. Cards show the 1M change and EWMA vol. The detail sheet adds 1W/1M/3M/YTD/1Y changes, 21-day and EWMA (λ = 0.94) vol, 1Y percentile, robust z, high/low and max drawdown.
- **Correct alignment:** Yahoo bars are dated in exchange-local time via `gmtoffset`, so FX and futures share a calendar. Curve spreads use H.15 closes on both legs. Models use as-of joins with a 7-day staleness cap.
- **Live status:** a 60-second refresh and market session chips (NYSE cash, CME Globex) for Singapore and New York. A stale marker appears if the feeds stop answering, and cards keep their last good value instead of blanking.
- **Installable app (PWA):** an install bar uses the browser's own prompt on Android and desktop, and shows the Share → Add to Home Screen steps on iPhone. It's also in the Guide. The last good data is saved on the device, so the app opens instantly and still shows the last values offline ("Offline · saved 14:31 SGT"). Long-press the home-screen icon for shortcuts to Models, Rates, Risk and the Tape (`/?tab=rates`). A notice offers a reload when a new version is deployed.

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

All of these are free and need no API key.

None of these send CORS headers, so the browser can't call them directly. `netlify.toml` rewrites the four paths to the upstream hosts, which makes them same-origin. Outside Netlify the app falls back to public CORS proxies.

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
| Growth score | mean of 63-day vol-scaled moves in ES, copper/gold, −HY OAS (≥ 2 of 3), 5-session mean |
| Inflation score | mean of 63-day vol-scaled moves in the 10Y breakeven, DBC, DBA (≥ 2 of 3), 5-session mean |
| Regime | quadrant of (growth, inflation); confidence: clear if both \|score\| ≥ 0.5, tentative if either < 0.2 |
| Today's read | 16 rules on 21-day vol-scaled moves and VIX/MOVE level z-scores; strength = weakest condition; top 4 shown |

All of this lives in `src/quant/` as pure functions, covered by `tests/quant.test.js`. The tests check them against closed-form cases: EWMA convergence to the true σ, eigenvalues of known matrices, an AR near 1 when one factor drives everything and near k/N for independent assets, the NY Fed probit formula, and bp units for rates.

References: Ilmanen, Maloney & Ross (2014), *Exploring Macroeconomic Sensitivities: How Investments Respond to Different Economic Environments*, JPM. Bridgewater Associates (2012), *The All Weather Story*. Moskowitz, Ooi & Pedersen (2012), *Time Series Momentum*, JFE. Erb & Harvey (2006), *The Strategic and Tactical Value of Commodity Futures*, FAJ. Gorton & Rouwenhorst (2006), *Facts and Fantasies about Commodity Futures*, FAJ. Kumar & Persaud (2002), *Pure Contagion and Investors' Shifting Risk Appetite*, IMF. Kritzman, Li, Page & Rigobon (2011), *Principal Components as a Measure of Systemic Risk*, JPM. Estrella & Mishkin (1996), *The Yield Curve as a Predictor of U.S. Recessions*, NY Fed. Estrella & Trubin (2006), *The Yield Curve as a Leading Indicator*, NY Fed. J.P. Morgan/Reuters (1996), *RiskMetrics Technical Document*. Gilchrist & Zakrajšek (2012), *Credit Spreads and Business Cycle Fluctuations*, AER. Kim & Wright (2005), *An Arbitrage-Free Three-Factor Term Structure Model*, Fed Board.

Caveat: the NY Fed fits its probit to monthly averages and the bond-equivalent 3M bill, so this daily version can differ from the published table by a point or two. Check `NYFED_PROBIT` in `src/quant/models.js` against the NY Fed's current release.

Why the regime uses DBC and DBA instead of the grain and energy futures: Yahoo's continuous front-month contracts (`ZC=F` and so on) jump on each roll date, by the gap between the expiring and the next contract. Over a 3-month window that can be several percent of fake "move". The funds hold and roll the futures themselves, so their prices don't jump. The commodity cards still show the futures, and the guide warns that big monthly moves there can include roll.

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
    snapshot.js         last good data saved on the device for instant and offline launch
  quant/
    stats.js            statistics: EWMA, robust z, percentiles, eigenvalues, alignment
    models.js           RAI, absorption ratio, recession probit, per-series stats
    regime.js           vol-scaled moves, growth × inflation regime
    narrative.js        rules behind Today's read
  ai/
    explain.js          payload validation and prompt building (shared with the function)
  model/
    derived.js          curve spreads, VIX term structure, carry-to-vol
    models.js           builds the models from fetched state
    facts.js            the numbers behind Today's read and the AI note
  ui/
    board.js            indicator cards
    detail.js           detail sheet (dialog)
    models-panel.js     models section rendering
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

The local dev server has no `/yf`-style proxies, so data arrives through the public CORS fallbacks, which can be slow or rate-limited. For the real thing, use a Netlify deploy preview or `netlify dev`.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests for the quant library |
| `npm run audit:design` | [impeccable](https://www.npmjs.com/package/impeccable) design anti-pattern scan (`npx impeccable` if not installed) |

## Deploy on Netlify

1. In Netlify: **Add new site → Import an existing project → GitHub →** `Ethosan/eqmarkets`. (For the existing site: **Site configuration → Build & deploy → Link repository**.)
2. Netlify reads `netlify.toml`: build command `npm run build`, publish directory `dist`. Nothing to fill in.
3. Every push to `main` deploys. Pull requests get deploy previews.

After a BOJ rate decision, if the live scrape ever fails, update `BOJ_RATE` in `src/config.js`.

## Notes

- Built for context, not trading advice.
- The service worker never caches market data; it only keeps the app shell for offline launch.
