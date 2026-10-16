# Equarian Markets

A live macro dashboard for futures traders: rates, credit, carry and the tape on one screen, read through three quantitative models: a **Risk Appetite Index**, the **absorption ratio** of systemic risk, and the **NY Fed recession probability**.

- **27 indicators** in four groups. **Rates:** 3M, 2Y, 10Y, 2s10s, 3m10y, 10Y real yield, 10Y breakeven, Kim–Wright term premium, DXY. **Risk:** VIX, VIX/VIX3M term structure, MOVE, HY and IG OAS, Chicago Fed NFCI, St. Louis Fed stress index, HYG, BTC. **Carry:** USD/JPY, EFFR, BOJ, CFTC yen positioning, carry-to-vol. **Tape:** ES, NQ, gold, crude.
- **Three models**, each computed in the browser from two years of daily history:
  - **Risk Appetite Index v2:** equal-weighted, clipped scores. Trending assets enter as volatility-scaled momentum and stress gauges as robust z-scores. It shows a per-input contribution chart and a point-in-time 1Y history.
  - **Absorption ratio** (Kritzman et al. 2011): the variance share of the top fifth of eigenvectors across a 10-asset return panel, plus the standardized ΔAR shift.
  - **NY Fed yield-curve recession probability:** a probit on the 1-month average 3m10y spread, with a 2Y history.
- **Interactive charts:** hover, tap or use the arrow keys for a crosshair readout (date and value in the series' units), with a value axis on round-number ticks and a date axis. Used on the detail sheet and all three model charts.
- **Unit-aware statistics:** each series has a `kind`. Prices use % changes and log-return vol; rates and spreads use bp changes and normal (bp) vol; indices use points. Cards show the 1M change and EWMA vol. The detail sheet adds 1W/1M/3M/YTD/1Y changes, 21-day and EWMA (λ = 0.94) vol, 1Y percentile, robust z, high/low and max drawdown.
- **Correct alignment:** Yahoo bars are dated in exchange-local time via `gmtoffset`, so FX and futures share a calendar. Curve spreads use H.15 closes on both legs. Models use as-of joins with a 7-day staleness cap.
- **Live, honest status:** a 60-second refresh, market session chips (NYSE cash, CME Globex) for Singapore and New York, and a stale marker if the feeds stop answering. Cards keep their last good value instead of blanking.
- **Installable PWA** that opens offline (data needs a connection).

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

All of this lives in `src/quant/` as pure functions, covered by `tests/quant.test.js`. The tests check them against closed-form cases: EWMA convergence to the true σ, eigenvalues of known matrices, an AR near 1 when one factor drives everything and near k/N for independent assets, the NY Fed probit formula, and bp units for rates.

References: Kumar & Persaud (2002), *Pure Contagion and Investors' Shifting Risk Appetite*, IMF. Kritzman, Li, Page & Rigobon (2011), *Principal Components as a Measure of Systemic Risk*, JPM. Estrella & Mishkin (1996), *The Yield Curve as a Predictor of U.S. Recessions*, NY Fed. Estrella & Trubin (2006), *The Yield Curve as a Leading Indicator*, NY Fed. J.P. Morgan/Reuters (1996), *RiskMetrics Technical Document*. Gilchrist & Zakrajšek (2012), *Credit Spreads and Business Cycle Fluctuations*, AER. Kim & Wright (2005), *An Arbitrage-Free Three-Factor Term Structure Model*, Fed Board.

Caveat: the NY Fed fits its probit to monthly averages and the bond-equivalent 3M bill, so this daily version can differ from the published table by a point or two. Check `NYFED_PROBIT` in `src/quant/models.js` against the NY Fed's current release.

## Project structure

```
index.html              page shell and static markup
src/
  main.js               boot, refresh loop
  config.js             indicator list, BOJ fallback, refresh interval
  state.js              latest series per indicator
  data/
    transport.js        proxy fallbacks and timeouts
    sources.js          Yahoo, FRED, BOJ and CFTC fetchers
  quant/
    stats.js            statistics: EWMA, robust z, percentiles, eigenvalues, alignment
    models.js           RAI, absorption ratio, recession probit, per-series stats
  model/
    derived.js          curve spreads, VIX term structure, carry-to-vol
    models.js           builds the three models from fetched state
  ui/
    board.js            indicator cards
    detail.js           detail sheet (dialog)
    models-panel.js     models section rendering
    chrome.js           clocks, session chips, tabs, progress bar
    notes.js            one-line reads per indicator
    chart.js            interactive chart: axes, crosshair, tooltip, keyboard
    format.js           number formatting and sparklines
  styles/               base tokens, layout, components
public/                 manifest, icons, service worker (copied as-is)
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
