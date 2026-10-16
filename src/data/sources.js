import { BOJ_RATE } from "../config.js";
import { STATE } from "../state.js";
import { viaTransports } from "./transport.js";

/* Yahoo Finance daily chart: one year of closes. */
async function yahooSeries(symbol) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) +
    "?range=1y&interval=1d&includePrePost=false&cb=" + Date.now();
  return viaTransports(url, async r => {
    const j = await r.json();
    const res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res || !res.indicators) return null;
    const rawTs = res.timestamp || [];
    const rawCl = (res.indicators.quote[0] || {}).close || [];
    const ts = [], closes = [];
    rawCl.forEach((c, n) => { if (c != null && isFinite(c)) { ts.push(rawTs[n]); closes.push(c); } });
    if (!closes.length) return null;
    const meta = res.meta || {};
    const price = meta.regularMarketPrice != null ? meta.regularMarketPrice : closes[closes.length - 1];
    const prev = closes.length > 1 ? closes[closes.length - 2] : meta.chartPreviousClose ?? null;
    return { price, prev, ts, closes };
  });
}

/* FRED CSV download for a series id. */
async function fredSeries(id, days = 400) {
  const iso = d => d.toISOString().slice(0, 10);
  const url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + id +
    "&cosd=" + iso(new Date(Date.now() - days * 864e5)) + "&coed=" + iso(new Date());
  return viaTransports(url, async r => {
    const lines = (await r.text()).trim().split("\n").slice(1);
    const ts = [], closes = [];
    for (const ln of lines) {
      const [date, v] = ln.split(",");
      const f = parseFloat(v);
      if (isFinite(f)) { ts.push(Math.floor(Date.parse(date) / 1000)); closes.push(f); }
    }
    return closes.length > 1 ? { price: closes[closes.length - 1], prev: closes[closes.length - 2], ts, closes } : null;
  });
}

/* BOJ policy rate, scraped from the BOJ English homepage, cached 30 min. */
let bojCache = null;
async function bojRate() {
  if (bojCache && Date.now() - bojCache.ts < 30 * 60_000) return bojCache;
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
  bojCache = live
    ? { ...live, live: true, ts: Date.now() }
    : { value: BOJ_RATE.value, asOf: BOJ_RATE.asOf, live: false, ts: Date.now() };
  return bojCache;
}

/* CFTC Commitments of Traders: non-commercial net yen futures, in thousands of contracts. */
async function cotSeries() {
  const sel = "$select=report_date_as_yyyy_mm_dd,noncomm_positions_long_all,noncomm_positions_short_all";
  const tail = "&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=60";
  const queries = [
    sel + "&$where=cftc_contract_market_code=%27097741%27" + tail,
    sel + "&$where=starts_with(market_and_exchange_names,%27JAPANESE%20YEN%27)" + tail,
  ];
  for (const q of queries) {
    const out = await viaTransports("https://publicreporting.cftc.gov/resource/6dca-aqww.json?" + q, async r => {
      const rows = await r.json();
      if (!Array.isArray(rows) || rows.length < 2) return null;
      const ts = [], closes = [];
      rows.slice().reverse().forEach(row => {
        const l = parseFloat(row.noncomm_positions_long_all), s = parseFloat(row.noncomm_positions_short_all);
        const d = Date.parse(row.report_date_as_yyyy_mm_dd);
        if (isFinite(l) && isFinite(s) && isFinite(d)) { ts.push(Math.floor(d / 1000)); closes.push((l - s) / 1000); }
      });
      return closes.length > 1 ? { price: closes[closes.length - 1], prev: closes[closes.length - 2], ts, closes } : null;
    });
    if (out) return out;
  }
  return null;
}

/* Fetch one indicator into STATE. Keeps the last good value on failure. */
export async function fetchItem(item) {
  const keepLast = () => {
    const last = STATE[item.id];
    STATE[item.id] = last && !last.error ? { ...last, stale: true } : { error: true };
  };

  if (item.cot) {
    const s = await cotSeries();
    if (s) STATE[item.id] = { ...s, error: false, src: "cftc" }; else keepLast();
    return;
  }
  if (item.bojLive) {
    const r = await bojRate();
    STATE[item.id] = { price: r.value, prev: null, ts: null, closes: null, error: false, src: r.live ? "boj" : "manual", asOf: r.asOf };
    return;
  }
  if (item.fredId) {
    const s = await fredSeries(item.fredId, item.fredDays);
    if (s) { STATE[item.id] = { ...s, error: false, src: "fred" }; return; }
  }
  for (const sym of item.symbols) {
    const s = await yahooSeries(sym);
    if (s) { STATE[item.id] = { ...s, error: false, src: "yahoo" }; return; }
  }
  keepLast();
}
