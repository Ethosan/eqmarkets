/* Board definition: which indicators appear, grouped by tab. */

export const UP = "#3DD68C";
export const DOWN = "#F2555A";

/* BOJ policy rate fallback. The app scrapes boj.or.jp first; this value is only
   used when that fails. Update after each BOJ move (8 meetings a year). */
export const BOJ_RATE = { value: 1.0, asOf: "since 17 Jun 2026" };

/* Refresh cadence for live quotes. */
export const REFRESH_MS = 60_000;

export const GROUPS = [
  { label: "Rates & the dollar", tab: "rates", cls: "g-rates", items: [
    { id: "us2y", symbols: ["2YY=F"], fredId: "DGS2", ticker: "2Y", name: "2-Year Treasury Yield",
      desc: "Tracks short-term central bank policy expectations.",
      fmt: { dp: 2, suffix: "%" }, changeMode: "bp" },
    { id: "us10y", symbols: ["^TNX"], ticker: "10Y", name: "10-Year Treasury Yield",
      desc: "Tracks long-term growth and inflation sentiment.",
      fmt: { dp: 2, suffix: "%" }, changeMode: "bp" },
    { id: "spread", computed: true, ticker: "2s10s", name: "Yield Curve Spread",
      desc: "10Y minus 2Y. The classic recession oracle.",
      fmt: { dp: 1, suffix: " bp" } },
    { id: "dxy", symbols: ["DX-Y.NYB", "DX=F"], ticker: "DXY", name: "US Dollar Index",
      desc: "The global currency wrecking ball.", fmt: { dp: 2 } },
  ]},
  { label: "Risk gauges", tab: "risk", cls: "g-risk", items: [
    { id: "vix", symbols: ["^VIX"], ticker: "VIX", name: "Volatility Index",
      desc: "Market fear and expected equity turbulence.", fmt: { dp: 2 }, invert: true },
    { id: "hyg", symbols: ["HYG"], ticker: "HYG", name: "High Yield Bond ETF",
      desc: "The canary in the coal mine for corporate credit stress.",
      fmt: { dp: 2, prefix: "$" } },
    { id: "hyoas", fredId: "BAMLH0A0HYM2", fredDays: 420, symbols: [], ticker: "HY OAS", name: "High Yield Credit Spread",
      desc: "ICE BofA US High Yield option-adjusted spread. The price of default fear.",
      fmt: { dp: 2, suffix: "%" }, changeMode: "bp", invert: true },
    { id: "btc", symbols: ["BTC-USD"], ticker: "BTC", name: "Bitcoin",
      desc: "The 24/7 risk appetite thermometer.", fmt: { dp: 0, prefix: "$" } },
  ]},
  { label: "Carry & policy", tab: "carry", cls: "g-carry", items: [
    { id: "usdjpy", symbols: ["JPY=X"], ticker: "USD/JPY", name: "Dollar-Yen",
      desc: "The carry trade's pressure gauge. Fast yen strength = unwind risk.",
      fmt: { dp: 2 } },
    { id: "fedfunds", fredId: "DFF", symbols: [], ticker: "FED", name: "Fed Funds Effective",
      desc: "The funding cost of the long leg, published daily.",
      fmt: { dp: 2, suffix: "%" }, changeMode: "bp" },
    { id: "boj", bojLive: true, symbols: [], ticker: "BOJ", name: "BOJ Policy Rate",
      desc: "The cheap leg that funds the global carry trade.",
      fmt: { dp: 2, suffix: "%" }, pillOverride: "policy" },
    { id: "jpycot", cot: true, symbols: [], ticker: "JPY COT", name: "Yen Spec Positioning",
      desc: "CFTC non-commercial net position in yen futures. The crowding gauge.",
      fmt: { dp: 1, suffix: "k" }, changeMode: "abs" },
    { id: "carryvol", computed: true, ticker: "C/V", name: "Carry-to-Vol Ratio",
      desc: "US-JP rate differential per unit of USD/JPY volatility.",
      fmt: { dp: 2 }, pillOverride: "ratio" },
  ]},
  { label: "The tape", tab: "tape", cls: "g-tape", items: [
    { id: "es", symbols: ["ES=F"], ticker: "ES", name: "S&P 500 Futures",
      desc: "The market's heartbeat. What your MES tracks tick for tick.", fmt: { dp: 2 } },
    { id: "nq", symbols: ["NQ=F"], ticker: "NQ", name: "Nasdaq 100 Futures",
      desc: "Where tech beta lives and MNQ follows.", fmt: { dp: 2 } },
    { id: "gc", symbols: ["GC=F"], ticker: "GC", name: "Gold Futures",
      desc: "The ancient hedge behind your MGC scalps.", fmt: { dp: 1, prefix: "$" } },
    { id: "cl", symbols: ["CL=F"], ticker: "CL", name: "WTI Crude Oil",
      desc: "The inflation input everyone forgets until it rips.", fmt: { dp: 2, prefix: "$" } },
  ]},
];

export const ALL = GROUPS.flatMap(g => g.items.map(it => ({ ...it, group: g })));
export const ITEM_BY_ID = Object.fromEntries(ALL.map(it => [it.id, it]));

/* Where each series comes from, for the detail sheet's source link. */
export function sourceUrl(item, src) {
  if (src === "fred" && item.fredId) return "https://fred.stlouisfed.org/series/" + item.fredId;
  if (src === "cftc") return "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm";
  if (src === "boj" || item.bojLive) return "https://www.boj.or.jp/en/";
  if (item.symbols && item.symbols.length) return "https://finance.yahoo.com/quote/" + encodeURIComponent(item.symbols[0]);
  return null;
}
