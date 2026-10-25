# Cloudflare Pages Migration — eqmarkets (markets.ethantam.dev)

> **Account**: Log into Cloudflare Dashboard as **ethantam0206@gmail.com** (not eatentam@gmail.com).

## What changed

- **`public/_headers`** (new): Security + cache headers from `netlify.toml`.
- **`public/_redirects`** (new): All 9 same-origin proxy redirects.
- **`functions/api/explain.mjs`** (new): Cloudflare Pages Function replacing `netlify/functions/explain.mjs`.
- **`tests/explain.test.js`**: Updated for Pages Functions API.
- **`eslint.config.js`**, **`vite.config.js`**, **`src/data/transport.js`**, **`public/sw.js`**: Comments updated.

## Cloudflare Pages Setup

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. Select **GitLab** → `eatentam/eqmarkets`
3. Configure:
   | Setting | Value |
   |---|---|
   | Project name | `eqmarkets` |
   | Production branch | `main` |
   | Root directory | `/` (default) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

4. **Environment variables** — 1 total (secret):

   | Variable | Where to get it |
   |---|---|
   | `MISTRAL_API_KEY` | [console.mistral.ai](https://console.mistral.ai) → API Keys → copy. OR Netlify → eqmarkets → env → Edit → DevTools trick (see below). |

   **Netlify masking workaround:** Click Edit on the var → click into the input field → Ctrl+A → Ctrl+C. If that pastes asterisks, open DevTools (F12) → Console → run:
   ```js
   document.querySelector('input:not([type="hidden"])').value
   ```

   > `EXPLAIN_MODEL` is not set — skip it (defaults to `mistral-medium-latest`).

5. **Compatibility flags**: None needed.
6. Click **Save and Deploy**

## Custom Domain

Add `markets.ethantam.dev` in Pages → Custom domains.

## Cross-Site References

- Text link to `https://oracular.ethantam.dev` — no change needed.
- Proxy to `https://oracular-data.ethantam.dev` — unaffected.
- No hardcoded `*.netlify.app` URLs.

## Post-Migration Checklist

- [ ] Site loads at `https://<project>.pages.dev`
- [ ] Site loads at `https://markets.ethantam.dev`
- [ ] All data proxies work: `/yf/`, `/fred/`, `/fredx/`, `/boj/`, `/fed/`, `/ust/`, `/cftc/`, `/cboe/`, `/odw/`
- [ ] "Explain" button works (`/api/explain`)
- [ ] Feedback widget works
- [ ] Service worker works
- [ ] `npm test` — 148 tests pass
