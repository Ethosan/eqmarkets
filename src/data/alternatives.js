/* Alternative data sources for when FRED (fred.stlouisfed.org) is unreachable.
   Each fetcher returns the same shape as fredSeries(): { price, prev, dates, values, asOf }.
   All are free, no API key. The transport layer (viaTransports) handles proxying. */

import { viaTransports } from "./transport.js";

/* ── Treasury.gov Daily Yield Curve ────────────────────────────────────────
   Covers DGS3MO, DGS2, DGS10 (nominal) and DFII10 (real, from the real curve).
   The CSV has one row per day with all maturities as columns, one file per year;
   the last three years are stitched together so the models' two-year windows fill. */

const UST_BASE = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv";
/* Years of history to stitch together: the models read two years of daily data. */
const UST_YEARS = 3;

/* One CSV per curve type and calendar year, fetched once per page load. */
const ustCache = new Map();
function fetchUstYieldCurve(year, type) {
  const key = type + ":" + year;
  if (!ustCache.has(key)) {
    const url = UST_BASE + "/" + year + "/all?type=" + type +
      "&field_tdr_date_value=" + year + "&page&_format=csv";
    const job = viaTransports(url, async r => {
      const rows = (await r.text()).trim().split("\n");
      if (rows.length < 2) return null;
      /* Headers are quoted ("10 Yr"); match on the bare, lower-cased label. */
      const header = rows[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
      return { header, rows: rows.slice(1) };
    }, 15000).catch(() => null);
    ustCache.set(key, job);
    /* a failed year is retried on the next refresh rather than cached */
    job.then(d => { if (!d) ustCache.delete(key); });
  }
  return ustCache.get(key);
}

/* Merge one column across years into a FRED-shaped series, oldest first. */
function parseUstColumn(years, colName) {
  const byDate = new Map();
  for (const data of years) {
    if (!data) continue;
    const colIdx = data.header.indexOf(colName.toLowerCase());
    if (colIdx < 0) continue;
    for (const row of data.rows) {
      const cols = row.split(",");
      /* Treasury dates are MM/DD/YYYY; values are percent, like FRED's DGS series */
      const m = cols[0]?.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const v = parseFloat(cols[colIdx]?.trim());
      if (m && isFinite(v)) byDate.set(m[3] + "-" + m[1] + "-" + m[2], v);
    }
  }
  const dates = [...byDate.keys()].sort(), values = dates.map(d => byDate.get(d));
  const n = values.length;
  return n > 1 ? { price: values[n - 1], prev: values[n - 2], dates, values, asOf: dates[n - 1] } : null;
}

async function fetchUstSeries(type, colName) {
  const year = new Date().getFullYear();
  const years = await Promise.all(Array.from({ length: UST_YEARS }, (_, i) => fetchUstYieldCurve(year - i, type)));
  return parseUstColumn(years, colName);
}
/* Column labels as Treasury's CSVs spell them */
const fetchUstNominal = col => fetchUstSeries("daily_treasury_yield_curve", col); /* "3 Mo", "2 Yr", "10 Yr" */
const fetchUstReal = col => fetchUstSeries("daily_treasury_real_yield_curve", col); /* "10 YR" */

/* ── Computed Breakeven ────────────────────────────────────────────────────
   T10YIE = DGS10 − DFII10. If both are available from Treasury.gov, compute it.
   Falls back to FRED if Treasury.gov fails for either leg. */

async function fetchBreakeven(fredFn) {
  const [nominal, real] = await Promise.all([fetchUstNominal("10 Yr"), fetchUstReal("10 YR")]);
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
    /* Treasury yields → Treasury.gov (the source FRED's DGS series come from) */
    case "DGS3MO": return fetchUstNominal("3 Mo");
    case "DGS2":   return fetchUstNominal("2 Yr");
    case "DGS10":  return fetchUstNominal("10 Yr");

    /* Real yield → Treasury.gov real curve */
    case "DFII10": return fetchUstReal("10 YR");

    /* Breakeven → computed from Treasury.gov nominal − real, as FRED defines T10YIE */
    case "T10YIE": return fetchBreakeven(fredFn);

    /* Everything else, term premium included, has no live source outside FRED.
       The NY Fed's ACM premium is a different model from Kim–Wright and its CSV
       sits behind a bot check, so it is not used. Returning null leaves the
       card on its last real reading, marked stale: never an invented number. */
    default: return null;
  }
}

/* Which series have a non-FRED alternative. */
export const HAS_ALTERNATIVE = new Set(["DGS3MO", "DGS2", "DGS10", "DFII10", "T10YIE"]);
