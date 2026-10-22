/* Alternative data sources for when FRED (fred.stlouisfed.org) is unreachable.
   Each fetcher returns the same shape as fredSeries(): { price, prev, dates, values, asOf }.
   All are free, no API key. The transport layer (viaTransports) handles proxying. */

import { viaTransports } from "./transport.js";

/* ── Treasury.gov Daily Yield Curve ────────────────────────────────────────
   Covers DGS3MO, DGS2, DGS10 (nominal) and DFII10 (real, from the real curve).
   The CSV has one row per day with all maturities as columns.
   We fetch the current year; for history we also fetch the prior year. */

const UST_BASE = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv";

async function fetchUstYieldCurve(year, type) {
  const url = UST_BASE + "/" + year + "/all?type=" + type +
    "&field_tdr_date_value=" + year + "&page&_format=csv";
  return viaTransports(url, async r => {
    const text = await r.text();
    const rows = text.trim().split("\n");
    if (rows.length < 3) return null;
    const header = rows[0].split(",").map(h => h.trim());
    return { header, rows: rows.slice(1) };
  }, 15000);
}

function parseUstRows(data, colName) {
  if (!data) return null;
  const colIdx = data.header.findIndex(h => h.toLowerCase() === colName.toLowerCase());
  if (colIdx < 0) return null;
  const dates = [], values = [];
  /* Treasury CSV is newest-first; reverse to oldest-first. */
  for (const row of data.rows.slice().reverse()) {
    const cols = row.split(",");
    const date = cols[0]?.trim();
    const v = parseFloat(cols[colIdx]?.trim());
    /* Treasury dates are MM/DD/YYYY */
    const m = date?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m && isFinite(v)) {
      dates.push(m[3] + "-" + m[1] + "-" + m[2]);
      values.push(v);
    }
  }
  const n = values.length;
  return n > 1 ? { price: values[n - 1], prev: values[n - 2], dates, values, asOf: dates[n - 1] } : null;
}

async function fetchUstNominal(maturity) {
  const year = new Date().getFullYear();
  const thisYear = await fetchUstYieldCurve(year, "daily_treasury_yield_curve");
  const s = parseUstRows(thisYear, maturity);
  if (s && s.dates.length > 5) return s;
  /* Fall back to prior year if current year has too few rows (early January). */
  const lastYear = await fetchUstYieldCurve(year - 1, "daily_treasury_yield_curve");
  const s2 = parseUstRows(lastYear, maturity);
  return s2 || s;
}

async function fetchUstReal(maturity) {
  const year = new Date().getFullYear();
  const thisYear = await fetchUstYieldCurve(year, "daily_treasury_real_yield_curve");
  const s = parseUstRows(thisYear, maturity);
  if (s && s.dates.length > 5) return s;
  const lastYear = await fetchUstYieldCurve(year - 1, "daily_treasury_real_yield_curve");
  const s2 = parseUstRows(lastYear, maturity);
  return s2 || s;
}

/* ── NY Fed ACM Term Premium ───────────────────────────────────────────────
   THREEFYTP10 equivalent. CSV at a fixed URL, updated weekly. */

async function fetchTermPremium() {
  const url = "https://www.newyorkfed.org/medialibrary/media/research/policy/termpremium/ACMTermPremium.csv";
  return viaTransports(url, async r => {
    const text = await r.text();
    const rows = text.trim().split("\n");
    if (rows.length < 3) return null;
    /* Find the 10-year column. Header: Date,OneYear,TwoYear,FiveYear,TenYear,... */
    const header = rows[0].split(",").map(h => h.trim().toLowerCase());
    const colIdx = header.findIndex(h => h.includes("tenyear") || h.includes("10"));
    if (colIdx < 0) return null;
    const dates = [], values = [];
    for (const row of rows.slice(1)) {
      const cols = row.split(",");
      const date = cols[0]?.trim();
      const v = parseFloat(cols[colIdx]?.trim());
      /* NY Fed dates are MM/DD/YYYY */
      const m = date?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m && isFinite(v)) {
        dates.push(m[3] + "-" + m[1] + "-" + m[2]);
        values.push(v / 100); /* CSV is in percent, we want decimal like FRED */
      }
    }
    const n = values.length;
    return n > 1 ? { price: values[n - 1], prev: values[n - 2], dates, values, asOf: dates[n - 1] } : null;
  }, 15000);
}

/* ── Computed Breakeven ────────────────────────────────────────────────────
   T10YIE = DGS10 − DFII10. If both are available from Treasury.gov, compute it.
   Falls back to FRED if Treasury.gov fails for either leg. */

async function fetchBreakeven(fredFn) {
  const nominal = await fetchUstNominal("10-Year");
  const real = await fetchUstReal("10-Year");
  if (nominal && real) {
    /* Align on common dates */
    const realMap = new Map(real.dates.map((d, i) => [d, real.values[i]]));
    const dates = [], values = [];
    for (let i = 0; i < nominal.dates.length; i++) {
      const d = nominal.dates[i];
      const r = realMap.get(d);
      if (r != null && isFinite(nominal.values[i]) && isFinite(r)) {
        dates.push(d);
        values.push(nominal.values[i] - r);
      }
    }
    const n = values.length;
    if (n > 1) return { price: values[n - 1], prev: values[n - 2], dates, values, asOf: dates[n - 1] };
  }
  /* Fall back to FRED */
  return fredFn ? await fredFn("T10YIE") : null;
}

/* ── Alternative fetcher dispatch ──────────────────────────────────────────
   Maps each FRED series ID to its best non-FRED alternative.
   Returns null if no alternative is available for that series. */

export async function fetchAlternative(item, fredFn) {
  const id = item.fredId;
  if (!id) return null;

  switch (id) {
    /* Treasury yields → Treasury.gov */
    case "DGS3MO": return fetchUstNominal("3-Month");
    case "DGS2":   return fetchUstNominal("2-Year");
    case "DGS10":  return fetchUstNominal("10-Year");

    /* Real yield → Treasury.gov real curve */
    case "DFII10": return fetchUstReal("10-Year");

    /* Breakeven → computed from Treasury.gov nominal − real */
    case "T10YIE": return fetchBreakeven(fredFn);

    /* Term premium → NY Fed ACM CSV */
    case "THREEFYTP10": return fetchTermPremium();

    /* Credit spreads, Fed balance sheet, jobless claims, financial conditions:
       no clean alternative — return null so the caller falls through to
       static fallbacks (see fallbacks.js) or the snapshot. */
    default: return null;
  }
}

/* Which series have a non-FRED alternative? Used to skip FRED entirely
   when we know an alternative exists (avoids waiting for FRED to time out). */
export const HAS_ALTERNATIVE = new Set([
  "DGS3MO", "DGS2", "DGS10", "DFII10", "T10YIE", "THREEFYTP10",
]);
