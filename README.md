# Equarian Markets

A live macro dashboard for futures traders: rates, credit, carry and the tape on one screen, read through a **Risk Appetite Index** that says whether the market is leaning risk-on or risk-off.

- **17 indicators** in four groups: Treasury yields, the 2s10s curve and DXY; VIX, HYG, high-yield OAS and Bitcoin; USD/JPY, Fed funds, BOJ rate, CFTC yen positioning and carry-to-vol; ES, NQ, gold and crude.
- **Risk regime panel:** a composite index of level z-scores (VIX, HY OAS, DXY, ES, BTC, USD/JPY), weighted by their first principal component, with a one-year history strip and a needle. The *Methodology* section on the page explains every step.
- **Detail sheet:** tap any card for a 1M / 3M / 6M / 1Y chart, high, low, average, range change and a link to the source data.
- **Live, honest status:** a 60-second refresh, market session chips (NYSE cash, CME Globex) for Singapore and New York, and a stale marker if the feeds stop answering. Cards keep their last good value instead of blanking.
- **Installable PWA** that opens offline (data needs a connection).

## Data sources

| Data | Source | How it's reached |
|---|---|---|
| Futures, FX, indices, ETFs, BTC | Yahoo Finance chart API | `/yf/*` proxy |
| 2Y yield, Fed funds, HY OAS | FRED (St. Louis Fed) CSV | `/fred/*` proxy |
| BOJ policy rate | boj.or.jp homepage | `/boj/*` proxy, manual fallback in `src/config.js` |
| Yen speculative positioning | CFTC Commitments of Traders | `/cftc/*` proxy |

None of these send CORS headers, so the browser can't call them directly. `netlify.toml` rewrites the four paths to the upstream hosts, which makes them same-origin. Outside Netlify the app falls back to public CORS proxies.

## Project structure

```
index.html              page shell and static markup
src/
  main.js               boot, refresh loop
  config.js             indicator list, BOJ fallback, refresh interval
  state.js              latest series per indicator + small stats helpers
  data/
    transport.js        proxy fallbacks and timeouts
    sources.js          Yahoo, FRED, BOJ and CFTC fetchers
  model/
    derived.js          2s10s spread and carry-to-vol
    regime.js           Risk Appetite Index, PCA weights, regime chips
  ui/
    board.js            indicator cards
    detail.js           detail sheet (dialog)
    regime-panel.js     regime panel rendering
    chrome.js           clocks, session chips, tabs, progress bar
    notes.js            one-line reads per indicator
    format.js           number formatting and SVG charts
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
| `npm run audit:design` | [impeccable](https://www.npmjs.com/package/impeccable) design anti-pattern scan (`npx impeccable` if not installed) |

## Deploy on Netlify

1. In Netlify: **Add new site → Import an existing project → GitHub →** `Ethosan/eqmarkets`. (For the existing site: **Site configuration → Build & deploy → Link repository**.)
2. Netlify reads `netlify.toml`: build command `npm run build`, publish directory `dist`. Nothing to fill in.
3. Every push to `main` deploys. Pull requests get deploy previews.

After a BOJ rate decision, if the live scrape ever fails, update `BOJ_RATE` in `src/config.js`.

## Notes

- Built for context, not trading advice.
- The service worker never caches market data; it only keeps the app shell for offline launch.
