/* Upstream data sources. Every series is normalised to
   { price, prev, dates: [YYYY-MM-DD], values: [], src, asOf }. */
import { STATE } from "../state.js";
import { viaTransports } from "./transport.js";
import { inRollWindow, rollAdjust, rollWindows } from "./roll.js";
import { parseChain } from "../quant/optionflow.js";
import { fetchAlternative, HAS_ALTERNATIVE } from "./alternatives.js";

/* Two years of history so one-year rolling statistics have a full window. */
const YAHOO_RANGE = "2y";
const FRED_DAYS = 800;

const isoDay = ms => new Date(ms).toISOString().slice(0, 10);

/* Yahoo Finance daily chart. Bar timestamps are in exchange time: FX bars, for
   example, open at 00:00 London, which is 23:00 UTC the day before. Shifting by
   meta.gmtoffset gives each bar its exchange-local trading date, so series from
   different venues line up on the same calendar. */
export async function yahooSeries(symbol, { range = YAHOO_RANGE, adjusted = false, from = null } = {}) {
  /* range=max comes back as monthly bars; an explicit period keeps it daily.
     `from` (ISO date) asks for history from that date only. */
  const now = Math.floor(Date.now() / 1000);
  const span = from ? "?period1=" + Math.floor(Date.parse(from + "T00:00:00Z") / 1000) + "&period2=" + now
    : range === "max" ? "?period1=0&period2=" + now : "?range=" + range;
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + span +
    "&interval=1d&includePrePost=false&cb=" + Date.now();
  return viaTransports(url, async r => {
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res?.indicators) return null;
    const meta = res.meta || {};
    const off = (meta.gmtoffset || 0) * 1000;
    const ts = res.timestamp || [];
    /* Adjusted closes fold in dividends and splits (total return for ETFs). */
    const cl = (adjusted && res.indicators.adjclose?.[0]?.adjclose) || res.indicators.quote?.[0]?.close || [];
    const dates = [], values = [];
    cl.forEach((c, i) => {
      if (c == null || !isFinite(c)) return;
      const d = isoDay(ts[i] * 1000 + off);
      if (dates.length && dates[dates.length - 1] === d) values[values.length - 1] = c; /* duplicate bar: keep latest */
      else { dates.push(d); values.push(c); }
    });
    if (values.length < 2) return null;
    /* Fold the live quote into today's bar, or append it if it starts a new session. */
    if (!adjusted && meta.regularMarketPrice != null && meta.regularMarketTime) {
      const liveDay = isoDay(meta.regularMarketTime * 1000 + off);
      if (liveDay === dates[dates.length - 1]) values[values.length - 1] = meta.regularMarketPrice;
      else if (liveDay > dates[dates.length - 1]) { dates.push(liveDay); values.push(meta.regularMarketPrice); }
    }
    const n = values.length;
    return { price: values[n - 1], prev: values[n - 2], dates, values, asOf: dates[n - 1] };
  });
}

/* Cash-index history for roll adjustment (see roll.js). The in-flight request
   is shared, so concurrent callers fetch once. Kept 30 minutes, or 1 minute
   inside a roll window, where today's cash return is used. A failed refetch
   keeps the last good copy. Long ranges start from the futures' first date. */
const indexCache = new Map();
function indexHistory(symbol, range, from) {
  const key = symbol + "|" + range;
  const today = new Date().toISOString().slice(0, 10);
  const y = +today.slice(0, 4);
  const ttl = inRollWindow(today, rollWindows(y - 1, y + 1)) ? 60_000 : 30 * 60_000;
  const c = indexCache.get(key);
  if (c && (c.pending || Date.now() - c.ts < ttl)) return c.pending || Promise.resolve(c.s);
  const pending = yahooSeries(symbol, range === "max" || range === "10y" || range === "5y" ? { range, from } : { range })
    .then(s => {
      const keep = s || c?.s || null;
      indexCache.set(key, { ts: s ? Date.now() : c?.ts ?? 0, s: keep });
      return keep;
    });
  indexCache.set(key, { ...(c || {}), pending });
  return pending;
}

/* Start the index request early, then adjust once both are in. */
export const prefetchIndex = (symbol, range = YAHOO_RANGE, from = null) => indexHistory(symbol, range, from);

export async function withRollAdjust(series, indexSymbol, range = YAHOO_RANGE) {
  if (!series || !indexSymbol) return series;
  const idx = await indexHistory(indexSymbol, range, series.dates[0]);
  return idx ? rollAdjust(series, idx) : series;
}

/* FRED CSV (no API key). Missing observations are "." or empty and are
   skipped. The header names the series; a CSV for any other series is
   rejected, so the next transport is tried. */
export async function fredSeries(id, days = FRED_DAYS) {
  const url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + id +
    "&cosd=" + isoDay(Date.now() - days * 864e5) + "&coed=" + isoDay(Date.now());
  return viaTransports(url, async r => {
    const rows = (await r.text()).trim().split("\n");
    if (rows[0]?.split(",")[1]?.trim() !== id) return null;
    const lines = rows.slice(1);
    const dates = [], values = [];
    for (const ln of lines) {
      const [date, v] = ln.split(",");
      const f = parseFloat(v);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && isFinite(f)) { dates.push(date); values.push(f); }
    }
    const n = values.length;
    return n > 1 ? { price: values[n - 1], prev: values[n - 2], dates, values, asOf: dates[n - 1] } : null;
  }, days > 1000 ? 30000 : 20000); /* FRED is slow, and slower still through a public proxy */
}

/* BOJ policy rate, scraped from the BOJ English homepage, cached 30 min. */
let bojCache = null;
async function bojRate() {
  if (bojCache && Date.now() - bojCache.ts < 30 * 60_000) return bojCache.live ? bojCache : null;
  const live = await viaTransports("https://www.boj.or.jp/en/", async r => {
    const text = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    let m = text.match(/Complementary Deposit Facility\s*([\d.]+)\s*%\s*since\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
    let value = m ? parseFloat(m[1]) : NaN;
    let asOf = m ? "since " + m[2] : "";
    if (!isFinite(value)) {
      m = text.match(/call rate to remain at around\s*([\d.]+)\s*percent/i);
      if (m) { value = parseFloat(m[1]); asOf = "BOJ guideline"; }
    }
    return isFinite(value) && value >= 0 && value <= 5 ? { value, asOf } : null;
  });
  /* A failed scrape is remembered for the same 30 minutes, so the homepage isn't
     re-fetched on every refresh; the card then keeps its last real reading. */
  bojCache = live ? { ...live, live: true, ts: Date.now() } : { live: false, ts: Date.now() };
  return bojCache.live ? bojCache : null;
}

/* CBOE delayed-quotes SPX chain (the whole option board, ~1.7 MB gzipped):
   the raw material for the option-flow panel. Delayed 15 minutes; open interest
   is from the previous session. Cached 20 minutes in memory; a failed refetch
   keeps the last good chain, marked stale. */
const CHAIN_URL = "https://cdn-api.cboe.com/api/global/delayed_quotes/options/_SPX.json";
let chainCache = null;

export async function spxChain() {
  if (chainCache && Date.now() - chainCache.ts < 20 * 60_000) return chainCache.s;
  const s = await viaTransports(CHAIN_URL, async r => {
    const j = await r.json();
    return parseChain(j);
  }, 45_000);
  const out = s ? { ...s, stale: false } : chainCache ? { ...chainCache.s, stale: true } : null;
  if (s) chainCache = { ts: Date.now(), s };
  return out;
}

/* CFTC Legacy Futures-Only COT: non-commercial net yen futures (thousands),
   three years of weekly reports for a positioning z-score. */
async function cotSeries() {
  const sel = "$select=report_date_as_yyyy_mm_dd,noncomm_positions_long_all,noncomm_positions_short_all";
  const tail = "&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=160";
  const queries = [
    sel + "&$where=cftc_contract_market_code=%27097741%27" + tail,
    sel + "&$where=starts_with(market_and_exchange_names,%27JAPANESE%20YEN%27)" + tail,
  ];
  for (const q of queries) {
    const out = await viaTransports("https://publicreporting.cftc.gov/resource/6dca-aqww.json?" + q, async r => {
      const rows = await r.json();
      if (!Array.isArray(rows) || rows.length < 2) return null;
      const dates = [], values = [];
      for (const row of rows.slice().reverse()) {
        const l = parseFloat(row.noncomm_positions_long_all), s = parseFloat(row.noncomm_positions_short_all);
        const d = String(row.report_date_as_yyyy_mm_dd || "").slice(0, 10);
        if (isFinite(l) && isFinite(s) && /^\d{4}-\d{2}-\d{2}$/.test(d)) { dates.push(d); values.push((l - s) / 1000); }
      }
      const n = values.length;
      return n > 1 ? { price: values[n - 1], prev: values[n - 2], dates, values, asOf: dates[n - 1] } : null;
    });
    if (out) return out;
  }
  return null;
}

/* Fetch one series into STATE. Keeps the last good value (marked stale) on failure.
   Order: CFTC / BOJ special cases; then Yahoo first for live items, FRED first otherwise.
   When FRED fails, Treasury.gov stands in for the Treasury yields and the breakeven.
   Every number shown is a real reading: with no live source the card keeps its last
   one, marked stale (or the device's saved copy), never a typed-in value. */
export async function fetchItem(item) {
  const keepLast = () => {
    const last = STATE[item.id];
    STATE[item.id] = last && !last.error ? { ...last, stale: true } : { error: true };
  };
  /* item.div rescales a series into its display units (claims: thousands). */
  const scaled = s => (item.div ? { ...s, price: s.price / item.div, prev: s.prev == null ? null : s.prev / item.div, values: s.values.map(v => v / item.div) } : s);
  const put = (s, src) => { STATE[item.id] = { ...scaled(s), error: false, stale: false, src }; };

  if (item.cot) { const s = await cotSeries(); if (s) put(s, "cftc"); else keepLast(); return; }
  if (item.bojLive) {
    const r = await bojRate();
    if (r) STATE[item.id] = { price: r.value, prev: null, dates: null, values: null, error: false, stale: false, src: "boj", asOf: r.asOf };
    else keepLast();
    return;
  }
  const yahoo = async () => {
    if (item.rollIndex) prefetchIndex(item.rollIndex).catch(() => {});
    for (const sym of item.symbols || []) {
      const s = await yahooSeries(sym);
      if (s) { put(item.rollIndex ? await withRollAdjust(s, item.rollIndex) : s, "yahoo"); return true; }
    }
    return false;
  };
  const fred = async () => {
    if (!item.fredId) return false;
    const s = await fredSeries(item.fredId, item.fredDays || FRED_DAYS);
    if (s) { put(s, "fred"); return true; }
    return false;
  };
  /* Non-FRED alternative (Treasury.gov, NY Fed, computed breakeven, etc.) */
  const alternative = async () => {
    if (!item.fredId || !HAS_ALTERNATIVE.has(item.fredId)) return false;
    const s = await fetchAlternative(item, id => fredSeries(id, item.fredDays || FRED_DAYS));
    if (s) { put(s, "alt"); return true; }
    return false;
  };
  /* Fetch order: live items try Yahoo first; FRED-dependent items try FRED first,
     then the Treasury.gov alternative, then Yahoo (for items that have both). */
  let ok;
  if (item.live) {
    ok = (await yahoo()) || (await fred()) || (await alternative());
  } else if (item.fredId) {
    ok = (await fred()) || (await alternative()) || (await yahoo());
  } else {
    ok = await yahoo();
  }
  if (!ok) keepLast();
}
