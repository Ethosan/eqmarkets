// What's new: every release, newest first, in readers' words, for the footer's "What's new"
// sheet. One entry a day's releases (quiet fix-only stretches share one); `v` is the version or
// range they span. Add to the top with each feature release; fixes go in as one "Bug fixes and
// polish." line (what was fixed belongs in the commit log). Text only: no market numbers here.
export const WHATS_NEW = [
  { d: "2026-11-04", v: "2.1.6 – 2.2", title: "Feels like an app on your phone", items: [
    "Sheets on your phone slide up from the bottom and leave the same way, whether you tap close, tap outside or drag them down.",
    "A sheet follows your finger as you drag it, and a short flick is enough to close it.",
    "Buttons, tabs and range switches respond the moment you touch them.",
    "On desktop, dialogs rise gently into place as they open.",
    "What's new: this log, from the version number at the foot of the page.",
  ] },
  { d: "2026-10-30", v: "2.1.1 – 2.1.4", title: "Bug fixes and polish", items: [
    "Bug fixes and polish.",
  ] },
  { d: "2026-10-24", v: "2.1", title: "A free public API", items: [
    "A public API: GET /api/regime and GET /api/risk serve the dashboard's own growth × inflation regime and Risk Appetite Index, computed with the same code, so the two always agree. No key, no account, open to any site.",
    "The API includes the risk index's daily history for about a year and the regime's 13-week trail, so you can chart them yourself.",
    "API, Terms and Privacy, one tap away in the footer.",
    "Bug fixes and polish.",
  ] },
  { d: "2026-10-23", v: "2.0", title: "Alt signals, a quick filter and plainer option flow", items: [
    "Alt signals, a new tab for the market's curiosities: fear and greed for stocks and crypto, the Pentagon Pizza Index from Google's live busyness, the Stripper Index, distress searches, Coinbase's app-store rank and the moon.",
    "Each alt signal is tested against the S&P 500 or Bitcoin, says whether it has held up, and shows which way it leans by its own test results.",
    "The Stripper Index's change follows the chart range you pick: 1, 2 or 5 years.",
    "Desktop: a filter in the side rail finds any indicator by ticker, name or group as you type. Press / to jump to it, Esc to clear.",
    "The SPX option flow reads in plain words: whether dealers are long or short gamma and what that does to moves, how far each wall is from the index, when same-day options are an unusually large share, and what the put/call mix says.",
    "A feedback button, to tell us what's missing or broken.",
    "Bug fixes and polish.",
  ] },
  { d: "2026-10-22", v: "2.0", title: "A new look, and more vol and macro", items: [
    "A redesign built for a phone glance, a desk scan and a deep dive: a section rail and status bar on desktop, a top bar with sticky section tabs on phones, and light and dark themes that follow your system or your choice.",
    "Every indicator is a row showing its last three months inside the bands of its own past year, lit amber or red only when today's reading is unusual.",
    "The risk score, today's read and the ES/NQ bias come first, side by side on wide screens, and the page now fills big monitors.",
    "New cards: 1-day VIX, oil vol (OVX), gold vol (GVZ), the Moody's Baa–10Y spread since 1986, initial jobless claims and Fed net liquidity.",
    "Credit in context: the high-yield card and today's read say whether spreads are tight or wide by the long-run record, not just the past year.",
    "Today's read marks each pattern New today, This week or 2+ weeks, and catches daily events like outsized moves, VIX jumps and new 52-week highs and lows.",
    "The bias card shows its record over the last three years.",
    "Zoom the SPX gamma profile to ±3%, ±8% or the full range, with the call, put and gamma walls marked on it.",
    "When FRED is down, Treasury yields, real yields and the term premium come from Treasury.gov and the New York Fed instead. Every number on the page is a real reading.",
    "Charts read clearly at every screen width.",
  ] },
  { d: "2026-10-19", v: "2.0", title: "SPX option flow and a sharper market bias", items: [
    "SPX option flow: dealers' net gamma, the gamma profile and its flip level, call, put and gamma walls, same-day and put/call flow, plus VIX9D/VIX, VXN/VIX, VVIX and SKEW gauges.",
    "New indicators: VXN, VVIX and CBOE SKEW.",
    "The market bias adds momentum and short-term reversal signals, and a signal with no edge sits the day out instead of voting.",
    "\"After a week like this\": what followed comparable weeks since 2000, the next day and the next week.",
    "Today's read spots three new divergences: leadership damage, growth fear and a backwardated front of the curve.",
    "Bug fixes and polish.",
  ] },
  { d: "2026-10-17", v: "2.0", title: "Market bias, flows and the FOMC calendar", items: [
    "Market bias: the next day's, week's and month's tilt for ES and NQ, with its confidence, what drives it and its record on calls made before the outcome was known, back to 2000.",
    "The bias treats calm and stressed markets separately and weighs recent years more.",
    "Trend followers: an estimate of CTA positioning in 8 markets, where ES and NQ would flip them and the forced flow from a big week.",
    "Variance risk premium and the stock–bond correlation, each with its percentile.",
    "A calendar of what moves index futures: FOMC meetings, option expiries and quad witching, turn of the month, holidays and month-end rebalancing.",
    "The macro regime reads weekly from 3- and 6-month moves, switches only after three steady weeks, and shows a year of weekly readings on its map.",
    "ES and NQ are adjusted for contract rolls, so their returns match what holding the futures earned.",
    "Each card says how it's worked out, in plainer words.",
    "Bug fixes and polish.",
  ] },
  { d: "2026-10-16", v: "2.0", title: "EQ Markets 2.0", items: [
    "Rebuilt from the ground up. A sheet for every indicator with range charts and its statistics.",
    "Interactive charts: a crosshair with the date and value, by mouse, touch or arrow keys.",
    "Risk Appetite Index v2, the absorption ratio and the New York Fed's recession probability, with each input's contribution.",
    "A Commodities tab: copper, silver, natural gas, grains and broad commodity funds, plus the copper/gold ratio.",
    "The growth × inflation regime: Goldilocks, Reflation, Stagflation or Slowdown, on a map with its recent trail.",
    "Today's read: the day's notable patterns across markets, each with the numbers behind it, and an optional AI note that puts them into words.",
    "On your phone: sticky tabs, a Models tab and a detail sheet you swipe down to close.",
    "A first-visit tour and a reading guide, from the header or the ? on each model.",
    "Install it as an app: the last good data is kept on your device for instant, offline launches, with home-screen shortcuts and a notice when an update is ready.",
    "If a feed fails, its last good value stays, marked stale.",
  ] },
];
