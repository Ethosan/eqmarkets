/* Board definition: which indicators appear, grouped by tab.
   kind controls units everywhere:
     price  % changes, vol = annualized % of log returns
     rate   changes in bp, vol = annualized bp of daily changes (normal vol)
     level  changes in points, vol = annualized points (indices like VIX, NFCI)
   ppy = observations per year for annualizing (252 trading days, 365 for crypto). */

export const UP = "#3DD68C";
export const DOWN = "#F2555A";

/* BOJ policy rate fallback. The app scrapes boj.or.jp first; this value is only
   used when that fails. Update after each BOJ move (8 meetings a year). */
export const BOJ_RATE = { value: 1.0, asOf: "since 17 Jun 2026" };

export const REFRESH_MS = 60_000;

/* Series fetched for models only (not shown as cards). Spreads are built from
   FRED H.15 closes so both legs share the same timestamp. */
export const HIDDEN = [
  { id: "dgs10", fredId: "DGS10", kind: "rate" },
  { id: "vix3m", symbols: ["^VIX3M"], kind: "level" },
];

export const GROUPS = [
  { label: "Rates, curve & the dollar", tab: "rates", cls: "g-rates", items: [
    { id: "us3m", fredId: "DGS3MO", kind: "rate", ticker: "3M", name: "3-Month Treasury Bill",
      desc: "Constant-maturity bill yield (H.15). Anchors the policy end of the curve.", fmt: { dp: 2, suffix: "%" } },
    { id: "us2y", fredId: "DGS2", symbols: ["2YY=F"], kind: "rate", ticker: "2Y", name: "2-Year Treasury Yield",
      desc: "Market pricing of the policy path over two years.", fmt: { dp: 2, suffix: "%" } },
    { id: "us10y", symbols: ["^TNX"], fredId: "DGS10", live: true, kind: "rate", ticker: "10Y", name: "10-Year Treasury Yield",
      desc: "Live CBOE quote; growth, inflation and term-premium expectations.", fmt: { dp: 2, suffix: "%" } },
    { id: "spread", computed: true, kind: "rate", ticker: "2s10s", name: "2s10s Curve",
      desc: "10Y minus 2Y, both H.15 closes.", fmt: { dp: 1, suffix: " bp", scale: 100 } },
    { id: "spread3m", computed: true, kind: "rate", ticker: "3m10y", name: "3m10y Curve",
      desc: "10Y minus 3M. The spread behind the NY Fed recession model.", fmt: { dp: 1, suffix: " bp", scale: 100 } },
    { id: "real10", fredId: "DFII10", kind: "rate", ticker: "10Y TIPS", name: "10-Year Real Yield",
      desc: "Inflation-indexed yield. The real cost of money for duration.", fmt: { dp: 2, suffix: "%" } },
    { id: "be10", fredId: "T10YIE", kind: "rate", ticker: "10Y BE", name: "10-Year Breakeven Inflation",
      desc: "Nominal minus TIPS yield: market-implied average inflation.", fmt: { dp: 2, suffix: "%" } },
    { id: "tp10", fredId: "THREEFYTP10", kind: "rate", ticker: "TP", name: "10-Year Term Premium",
      desc: "Kim–Wright model estimate (Fed Board): compensation for duration risk.", fmt: { dp: 2, suffix: "%" } },
    { id: "dxy", symbols: ["DX-Y.NYB", "DX=F"], kind: "price", ticker: "DXY", name: "US Dollar Index",
      desc: "ICE dollar index against six majors.", fmt: { dp: 2 }, invert: true },
  ]},
  { label: "Risk & financial conditions", tab: "risk", cls: "g-risk", items: [
    { id: "vix", symbols: ["^VIX"], kind: "level", ticker: "VIX", name: "VIX",
      desc: "30-day implied vol of S&P 500 options.", fmt: { dp: 2 }, invert: true },
    { id: "vixts", computed: true, kind: "level", ticker: "VIX/VIX3M", name: "Vol Term Structure",
      desc: "Spot over 3-month VIX. Above 1 = backwardation, a stress signature.", fmt: { dp: 3 }, invert: true },
    { id: "move", symbols: ["^MOVE"], kind: "level", ticker: "MOVE", name: "MOVE Index",
      desc: "ICE BofA implied Treasury volatility: the bond market's VIX.", fmt: { dp: 1 }, invert: true },
    { id: "hyoas", fredId: "BAMLH0A0HYM2", kind: "rate", ticker: "HY OAS", name: "High Yield OAS",
      desc: "ICE BofA US High Yield option-adjusted spread. The price of default risk.", fmt: { dp: 2, suffix: "%" }, invert: true },
    { id: "igoas", fredId: "BAMLC0A0CM", kind: "rate", ticker: "IG OAS", name: "Investment Grade OAS",
      desc: "ICE BofA US Corporate option-adjusted spread.", fmt: { dp: 2, suffix: "%" }, invert: true },
    { id: "nfci", fredId: "NFCI", kind: "level", weekly: true, ticker: "NFCI", name: "Chicago Fed NFCI",
      desc: "105-indicator financial conditions index. 0 = average; positive = tighter.", fmt: { dp: 2 }, invert: true },
    { id: "stlfsi", fredId: "STLFSI4", kind: "level", weekly: true, ticker: "STLFSI", name: "St. Louis Fed Stress Index",
      desc: "18-series financial stress index. 0 = normal; positive = above-average stress.", fmt: { dp: 2 }, invert: true },
    { id: "hyg", symbols: ["HYG"], kind: "price", ticker: "HYG", name: "High Yield Bond ETF",
      desc: "Tradable credit proxy, intraday.", fmt: { dp: 2, prefix: "$" } },
    { id: "btc", symbols: ["BTC-USD"], kind: "price", ppy: 365, ticker: "BTC", name: "Bitcoin",
      desc: "24/7 risk appetite thermometer.", fmt: { dp: 0, prefix: "$" } },
  ]},
  { label: "Carry & policy", tab: "carry", cls: "g-carry", items: [
    { id: "usdjpy", symbols: ["JPY=X"], kind: "price", ticker: "USD/JPY", name: "Dollar-Yen",
      desc: "The carry trade's pressure gauge. Fast yen strength = unwind risk.", fmt: { dp: 2 } },
    { id: "fedfunds", fredId: "DFF", kind: "rate", ticker: "EFFR", name: "Fed Funds Effective",
      desc: "Funding cost of the long leg (NY Fed, daily).", fmt: { dp: 2, suffix: "%" } },
    { id: "boj", bojLive: true, kind: "rate", ticker: "BOJ", name: "BOJ Policy Rate",
      desc: "The cheap leg that funds the global carry trade.", fmt: { dp: 2, suffix: "%" }, pillOverride: "policy" },
    { id: "jpycot", cot: true, kind: "level", weekly: true, ticker: "JPY COT", name: "Yen Spec Positioning",
      desc: "CFTC non-commercial net yen futures, thousands of contracts.", fmt: { dp: 1, suffix: "k" } },
    { id: "carryvol", computed: true, kind: "level", ticker: "C/V", name: "Carry-to-Vol",
      desc: "Fed–BOJ gap divided by EWMA-annualized USD/JPY vol.", fmt: { dp: 2 }, pillOverride: "ratio" },
  ]},
  { label: "Commodities", tab: "cmdty", cls: "g-cmdty", items: [
    { id: "hg", symbols: ["HG=F"], kind: "price", ticker: "HG", name: "Copper Futures",
      desc: "Dr Copper: the industrial metal most tied to global growth. $/lb.", fmt: { dp: 3, prefix: "$" } },
    { id: "cugold", computed: true, kind: "price", ticker: "Cu/Au", name: "Copper/Gold Ratio",
      desc: "Growth metal over haven metal (×1000). Rises with growth expectations and tends to track the 10Y yield.", fmt: { dp: 3, scale: 1000 } },
    { id: "si", symbols: ["SI=F"], kind: "price", ticker: "SI", name: "Silver Futures",
      desc: "Half precious metal, half industrial input. $/oz.", fmt: { dp: 2, prefix: "$" } },
    { id: "ng", symbols: ["NG=F"], kind: "price", ticker: "NG", name: "Natural Gas",
      desc: "Henry Hub, $/MMBtu. Weather and storage driven, far more volatile than oil.", fmt: { dp: 3, prefix: "$" } },
    { id: "zc", symbols: ["ZC=F"], kind: "price", ticker: "ZC", name: "Corn",
      desc: "CBOT corn, cents per bushel. Feed, food and ethanol.", fmt: { dp: 2, suffix: "¢" } },
    { id: "zw", symbols: ["ZW=F"], kind: "price", ticker: "ZW", name: "Wheat",
      desc: "CBOT wheat, cents per bushel. The most geopolitics-sensitive grain.", fmt: { dp: 2, suffix: "¢" } },
    { id: "zs", symbols: ["ZS=F"], kind: "price", ticker: "ZS", name: "Soybeans",
      desc: "CBOT soybeans, cents per bushel. China demand and South American weather.", fmt: { dp: 2, suffix: "¢" } },
    { id: "dbc", symbols: ["DBC"], kind: "price", ticker: "DBC", name: "Broad Commodities",
      desc: "Invesco DB Commodity fund: 14 futures, energy-heavy, rolled for you (no roll jumps).", fmt: { dp: 2, prefix: "$" } },
    { id: "dba", symbols: ["DBA"], kind: "price", ticker: "DBA", name: "Agriculture Basket",
      desc: "Invesco DB Agriculture fund: grains, softs and livestock, rolled for you.", fmt: { dp: 2, prefix: "$" } },
  ]},
  { label: "The tape", tab: "tape", cls: "g-tape", items: [
    { id: "es", symbols: ["ES=F"], kind: "price", ticker: "ES", name: "S&P 500 Futures",
      desc: "The market's heartbeat. What your MES tracks tick for tick.", fmt: { dp: 2 } },
    { id: "nq", symbols: ["NQ=F"], kind: "price", ticker: "NQ", name: "Nasdaq 100 Futures",
      desc: "Where tech beta lives and MNQ follows.", fmt: { dp: 2 } },
    { id: "gc", symbols: ["GC=F"], kind: "price", ticker: "GC", name: "Gold Futures",
      desc: "The ancient hedge behind your MGC scalps.", fmt: { dp: 1, prefix: "$" } },
    { id: "cl", symbols: ["CL=F"], kind: "price", ticker: "CL", name: "WTI Crude Oil",
      desc: "The inflation input everyone forgets until it rips.", fmt: { dp: 2, prefix: "$" } },
  ]},
];

export const ALL = GROUPS.flatMap(g => g.items.map(it => ({ ...it, group: g })));
export const FETCHABLE = [...ALL.filter(it => !it.computed), ...HIDDEN];
export const ITEM_BY_ID = Object.fromEntries([...ALL, ...HIDDEN].map(it => [it.id, it]));

/* Risk Appetite Index inputs. sign: +1 risk-on when high, −1 stress when high. */
export const RAI_INPUTS = [
  { id: "es", label: "Equities (ES)", transform: "trend", sign: 1 },
  { id: "btc", label: "Bitcoin", transform: "trend", sign: 1 },
  { id: "usdjpy", label: "USD/JPY carry", transform: "trend", sign: 1 },
  { id: "dxy", label: "Dollar (DXY)", transform: "trend", sign: -1 },
  { id: "vix", label: "Equity vol (VIX)", transform: "level", sign: -1 },
  { id: "vixts", label: "VIX term structure", transform: "level", sign: -1 },
  { id: "move", label: "Rates vol (MOVE)", transform: "level", sign: -1 },
  { id: "hyoas", label: "HY credit spread", transform: "level", sign: -1 },
];

/* Growth × inflation regime inputs: vol-scaled 3-month changes.
   Commodity exposure comes from rolled funds (DBC, DBA) rather than front-month
   futures, whose continuous price jumps at each contract roll. sign: +1 when a
   rise means more growth / more inflation. */
export const REGIME_INPUTS = [
  { id: "es", axis: "growth", sign: 1, label: "Equities (ES)" },
  { id: "cugold", axis: "growth", sign: 1, label: "Copper/gold" },
  { id: "hyoas", axis: "growth", sign: -1, label: "HY credit spread" },
  { id: "be10", axis: "inflation", sign: 1, label: "10Y breakeven" },
  { id: "dbc", axis: "inflation", sign: 1, label: "Broad commodities" },
  { id: "dba", axis: "inflation", sign: 1, label: "Agriculture" },
];

/* Series scored for "Today's read" (1-month vol-scaled moves). */
export const READ_IDS = ["es", "nq", "btc", "gc", "si", "hg", "cugold", "cl", "ng", "zc", "zw", "zs", "dbc", "dba",
  "dxy", "usdjpy", "hyoas", "be10", "us10y", "us2y", "real10"];

/* Absorption-ratio universe: a cross-asset panel of daily returns (yield changes for rates). */
export const AR_UNIVERSE = ["es", "nq", "btc", "gc", "cl", "dxy", "usdjpy", "hyg", "us10y", "vix"];

export function sourceUrl(item, src) {
  if (src === "fred" && item.fredId) return "https://fred.stlouisfed.org/series/" + item.fredId;
  if (src === "cftc") return "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm";
  if (src === "boj" || item.bojLive) return "https://www.boj.or.jp/en/";
  if (item.symbols && item.symbols.length) return "https://finance.yahoo.com/quote/" + encodeURIComponent(item.symbols[0]);
  return null;
}
