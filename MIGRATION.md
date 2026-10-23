# Cloudflare Pages Migration — eqmarkets (markets.ethantam.dev)

> **Account**: Log into Cloudflare Dashboard as **ethantam0206@gmail.com** (not eatentam@gmail.com).

## What changed

- **`public/_headers`** (new): Security + cache headers from `netlify.toml`. Vite copies `public/` → `dist/` automatically.
- **`functions/_middleware.js`** (new): All 9 same-origin data proxies (Yahoo Finance, FRED, BOJ, Fed, Treasury, CFTC, CBOE, Oracular data worker). These first went into `public/_redirects`, but Cloudflare Pages can't proxy to another domain from `_redirects`: every feed fell through to `index.html` and the dashboard showed 0 of 51 feeds live. **`public/_routes.json`** runs Functions only on the proxy paths and `/api/*`.
- **`functions/api/explain.mjs`** (new): Cloudflare Pages Function replacing `netlify/functions/explain.mjs`. Changes:
  - `export default async function handler(req)` → `export async function onRequestPost(context)`
  - `process.env.X` → `context.env.X`
  - Netlify rate limit config removed; replaced with in-memory per-IP rate limiting (6 req/min)
  - Timeout increased from 9s to 25s (Cloudflare has longer limits)
  - IP header: `cf-connecting-ip` instead of Netlify's implicit IP
- **`tests/explain.test.js`**: Updated import path and handler invocation for Pages Functions API
- **`eslint.config.js`**: Updated glob from `netlify/**/*.mjs` to `functions/**/*.mjs`
- **`vite.config.js`**, **`src/data/transport.js`**, **`public/sw.js`**: Comments updated (netlify.toml → functions/_middleware.js)

## Cloudflare Pages Setup

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. Select **GitLab** → `eatentam/eqmarkets`
3. Configure:
   | Setting | Value |
   |---|---|
   | Project name | `eqmarkets` |
   | Production branch | `main` |
   | Root directory | `/` (leave as default) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
4. **Environment variables** (copy from Netlify → Site settings → Environment variables):
   | Variable | Scope |
   |---|---|
   | `MISTRAL_API_KEY` | Production + Preview (Functions) |
   | `EXPLAIN_MODEL` | Production + Preview (Functions) — optional |
5. **Compatibility flags**: None needed (no Node.js APIs used).
6. Click **Save and Deploy**

## Custom Domain

Add `markets.ethantam.dev` in Pages → Custom domains.

## Cross-Site References

- Text link to `https://oracular.ethantam.dev` in `signals-panel.js` — no change needed (oracular stays where it is).
- Proxy to `https://oracular-data.makan-bot.workers.dev` — unaffected by this migration.
- No hardcoded `*.netlify.app` URLs anywhere.

## Post-Migration

- Verify the site loads at `https://<project>.pages.dev`
- Verify at `https://markets.ethantam.dev`
- Verify all data proxies work: `/yf/`, `/fred/`, `/fredx/`, `/boj/`, `/fed/`, `/ust/`, `/cftc/`, `/cboe/`, `/odw/`
- Verify the "Explain" button works (calls `/api/explain`)
- Verify the feedback widget works
- Verify the service worker works
- Run `npm test` to confirm all 148 tests pass
