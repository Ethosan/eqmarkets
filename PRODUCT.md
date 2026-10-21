# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: the owner, Ethan Tam**, trading ES and NQ futures. He opens it in three situations, all confirmed: a quick phone check before the US open or before a trade (what changed, what is the bias), a laptop session at the desk alongside charts (scanning many indicators), and deep dives into the models, method notes and backtest lab when researching.
- **Secondary: public visitors** who arrive from ethantam.dev or a shared link. They need to understand within seconds what the dashboard is saying and why, without already knowing the tool. It also works as a portfolio piece.

## Product Purpose

A live, top-down macro dashboard for index-futures trading: rates, credit, volatility, carry, commodities and the tape on one screen, turned into a plain-English daily read, quantitative models (Risk Appetite Index, growth × inflation regime, absorption ratio, NY Fed recession odds), flows and premia, SPX option flow, and a walk-forward market-bias forecast for ES and NQ with an honest out-of-sample record. Success: the trader knows the market's state and what changed in under a minute, and can drill into any number to see where it came from.

## Positioning

Every number is live, unit-aware and explained, and every model shows its own track record, including when it doesn't work (for example, the bias card's "last 3 years: doesn't beat a plain average"). Rules and models are fixed in advance and tested walk-forward; nothing is tuned on its own results. It does not give buy/sell calls.

## Operating Context

- Singapore-based user trading US hours; times are shown in SGT alongside NYSE and CME Globex session status.
- 60-second refresh from free public sources (Yahoo, FRED, CBOE, CFTC, BOJ) through same-origin Netlify proxies; feeds can fail (FRED had a maintenance outage on 21–22 Oct 2026), so cards keep last good values and say so.
- Installable PWA with offline snapshot and home-screen shortcuts (`/?tab=rates`, etc.).
- Optional AI explanation (Mistral, via a Netlify Function) of the rule-based read.
- Admin-only backtest lab at `?admin=1&tab=lab`.
- Deployed by pushing to GitLab `eatentam/eqmarkets` main (Netlify auto-build).

## Capabilities and Constraints

- Static Vite app in vanilla JS (no framework), CSS in `src/styles/`, tests with Vitest, lint with ESLint. The quant code (`src/quant`, `src/model`, `src/data`) is the product's substance and is out of scope for UI work.
- 45 indicator cards in five groups (Rates, Risk, Carry, Commodities, Tape), each with a detail sheet (chart with ranges, stats, source link).
- Panels: Today's read (+ AI explain), Market bias (ES/NQ, day/week/month), Risk Appetite Index, Macro regime map, Absorption ratio, Recession probability, Flows & premia, SPX option flow, Guide, first-visit tour, install prompt.
- The owner allowed cutting or hiding what isn't used during a redesign (21 Oct 2026); anything removed must be named to him afterwards.
- Terminology: σ (vol-scaled move), bp, percentile, z-score, OAS, VIX/VVIX, etc., as defined in the in-app Guide.

## Brand Commitments

- Name: Equarian Markets (short: EQ Markets), at markets.ethantam.dev; part of the ethantam.dev family alongside Oracular and 20bucks.
- Voice: plain English, humble and direct, no hype; no grades or credential flexing in public copy; numbers before adjectives; says when something doesn't work.

## Evidence on Hand

- Live data and the model scorecards are the only evidence. There are no users, testimonials or performance claims to show, and none may be invented.
- Backtest results and research rounds are documented in README.md and `scripts/cache/run-*.txt`.

## Product Principles

1. State before detail: what the market is doing and what changed today comes first; every number is one tap from its source and method.
2. Honest uncertainty: show records, confidence and failures as plainly as signals.
3. One screen, three depths: a glance on the phone, a scan at the desk, a deep dive when researching. The same page should serve all three without modes.
4. Never mislead: stale, missing or artifact-prone data is labelled, never silently shown as fresh.

## Accessibility & Inclusion

No product-specific requirement was established beyond WCAG 2.2 AA practice. The existing build already supports keyboard chart reading, reduced motion and installable offline use; a redesign must not regress these.
