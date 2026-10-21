/* Research harness for the market-bias model (scripts/bias-research.mjs).

   Reproduces, outside the browser, exactly what the deployed model does:
   downloads full daily history from the same free sources, roll-adjusts the
   index futures, rebuilds every model input point-in-time (src/model/history.js
   buildFrame), runs the walk-forward combination forecast
   (src/quant/composite.js) and scores it out of sample. Used to compare signal
   sets before shipping them: the README's results table comes from here.

   Usage:  node scripts/bias-research.mjs [--refresh] [--since 2019-01-01]
   Series are cached in scripts/cache/*.json until --refresh. Not part of the
   app bundle; nothing in src/ imports it. */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE = path.join(ROOT, "scripts", "cache");
mkdirSync(CACHE, { recursive: true });

const imp = p => import(pathToFileURL(path.join(ROOT, p)).href);
const { rollAdjust } = await imp("src/data/roll.js");
const { buildFrame, reframe } = await imp("src/model/history.js");
const { HORIZONS, combinationForecast, evaluate, PREDICTORS } = await imp("src/quant/composite.js");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const P1 = Math.floor(Date.parse("1997-01-01") / 1000);

const ymd = ms => new Date(ms).toISOString().slice(0, 10);

/* Yahoo daily bars, exchange-local dates (same parsing as src/data/sources.js,
   minus the live-quote fold). */
async function yahoo(symbol, { adjusted = false } = {}) {
  const key = path.join(CACHE, "y-" + symbol.replace(/[^A-Z0-9]/gi, "_") + (adjusted ? "-tr" : "") + ".json");
  if (existsSync(key) && !process.argv.includes("--refresh")) return JSON.parse(readFileSync(key));
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${P1}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${symbol} http ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res?.indicators?.quote?.[0]?.close) throw new Error(symbol + ": no data");
  const off = (res.meta.gmtoffset || 0) * 1000;
  const ts = res.timestamp || [];
  const cl = (adjusted && res.indicators.adjclose?.[0]?.adjclose) || res.indicators.quote[0].close;
  const dates = [], values = [];
  cl.forEach((c, i) => {
    if (c == null || !isFinite(c)) return;
    const d = ymd(ts[i] * 1000 + off);
    if (dates.length && dates[dates.length - 1] === d) values[values.length - 1] = c;
    else { dates.push(d); values.push(c); }
  });
  const out = { dates, values };
  writeFileSync(key, JSON.stringify(out));
  return out;
}

/* FRED CSV, published one business day later (same as src/model/history.js). */
function nextWeekday(d) {
  const t = new Date(d + "T00:00:00Z");
  do t.setUTCDate(t.getUTCDate() + 1); while (t.getUTCDay() === 0 || t.getUTCDay() === 6);
  return t.toISOString().slice(0, 10);
}
async function fred(id) {
  const key = path.join(CACHE, "f-" + id + ".json");
  if (existsSync(key) && !process.argv.includes("--refresh")) return JSON.parse(readFileSync(key));
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=1997-01-01&coed=${ymd(Date.now())}`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${id} http ${r.status}`);
  const rows = (await r.text()).trim().split("\n");
  if (rows[0].split(",")[1]?.trim() !== id) throw new Error(id + ": unexpected CSV");
  const dates = [], values = [];
  for (const ln of rows.slice(1)) {
    const [date, v] = ln.split(",");
    const f = parseFloat(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && isFinite(f)) { dates.push(nextWeekday(date)); values.push(f); }
  }
  const out = { dates, values };
  writeFileSync(key, JSON.stringify(out));
  return out;
}

console.log("Fetching series (cached in scripts/cache/)…");
const jobs = {
  es: ["ES=F"], nq: ["NQ=F"], gspc: ["^GSPC"], ndx: ["^NDX"], vix: ["^VIX"], vix3m: ["^VIX3M"],
  vix9d: ["^VIX9D"], vxn: ["^VXN"], vvix: ["^VVIX"], move: ["^MOVE"], us10y: ["^TNX"],
  dxy: ["DX-Y.NYB"], usdjpy: ["JPY=X"], btc: ["BTC-USD"], hyg: ["HYG"], gc: ["GC=F"], cl: ["CL=F"],
  rsp: ["RSP"], spy: ["SPY"], hygtr: ["HYG", true], ieftr: ["IEF", true],
};
const S = {};
const settled = await Promise.allSettled(
  Object.entries(jobs).map(async ([id, [sym, adjusted]]) => { S[id] = await yahoo(sym, { adjusted }); })
);
for (const [i, st] of settled.entries()) {
  if (st.status === "rejected") console.log("  yahoo", Object.keys(jobs)[i], "FAILED:", st.reason.message);
}
for (const [id, seriesId] of Object.entries({ hyoas: "BAMLH0A0HYM2", dgs10: "DGS10", us3m: "DGS3MO" })) {
  try { S[id] = await fred(seriesId); } catch (e) { console.log("  fred", seriesId, "FAILED:", e.message); }
}

/* Roll-adjust the futures against the cash indices, as the app does. */
S.es = rollAdjust(S.es, S.gspc);
S.nq = rollAdjust(S.nq, S.ndx);
console.log(`  ES ${S.es.dates.length} bars (${S.es.dates[0]} → ${S.es.dates.at(-1)}), roll-adjusted ${S.es.rollAdjusted} days`);

const frames = {
  es: buildFrame(S, S.es),
  nq: reframe(buildFrame(S, S.es), S.nq),
};

const CAL = ["tom", "fomc", "preHoliday"];
/* Tried and rejected in the Oct 2026 research round (see README): kept here
   so the disclosure numbers stay reproducible. */
const TRIED = {
  lead: { id: "lead", sign: 1, label: "Growth leadership (NDX/SPX)", src: "Moskowitz, Ooi & Pedersen (2012)" },
  ew: { id: "ew", sign: 1, label: "Breadth (equal-weight)", src: "DeMiguel, Garlappi & Uppal (2009)" },
  vxn: { id: "vxn", sign: -1, label: "Nasdaq vol premium (VXN/VIX)", src: "Ang, Hodrick, Xing & Zhang (2006)" },
  v9d: { id: "v9d", sign: -1, label: "Front vol (VIX9D/VIX)", src: "Whaley (2009)" },
  vvixz: { id: "vvixz", sign: -1, label: "Vol of vol (VVIX)", src: "Baltussen, van Bekkum & van der Grient (2018)" },
  /* Oct 21 2026 round. Acceptance rule, fixed before the run: a candidate ships
     only if it raises the full-sample out-of-sample R² over v8 at 2 or more of
     the 3 horizons for BOTH ES and NQ, and the average post-2019 R² across the
     six instrument × horizon cells is not lower. */
  vixts: { id: "vixts", sign: 1, label: "VIX term structure (VIX/VIX3M)", src: "Fassas & Hourvouliades (2019)" },
  cred: { id: "cred", sign: 1, label: "Credit momentum (HYG vs IEF)", src: "Gilchrist & Zakrajšek (2012)" },
};
const MOM = ["mom", "rev"];
const VOL = ["vxn", "v9d", "vvixz"];
const byId = { ...TRIED, ...Object.fromEntries(PREDICTORS.map(p => [p.id, p])) };
const pick = ids => ids.map(x => (typeof x === "string" ? byId[x] : x));

const OLD = ["trend", "vrp", "raiS", "dAR", "rec"];
const VARIANTS = {
  "v7 as shipped": { preds: pick([...OLD, ...CAL]), opts: { dropZeroSlope: false } },
  "v7 + abstain": { preds: pick([...OLD, ...CAL]), opts: {} },
  "v8 (ship)": { preds: pick([...OLD, "mom", "rev", ...CAL]), opts: {} },
  "v8 all-12 (tried, not shipped)": { preds: pick([...OLD, ...MOM, ...VOL, ...CAL]), opts: {} },
  "v8 + vixts": { preds: pick([...OLD, ...MOM, "vixts", ...CAL]), opts: {} },
  "v8 + cred": { preds: pick([...OLD, ...MOM, "cred", ...CAL]), opts: {} },
  "v8 + vixts + cred": { preds: pick([...OLD, ...MOM, "vixts", "cred", ...CAL]), opts: {} },
};

const since = process.argv.includes("--since")
  ? process.argv[process.argv.indexOf("--since") + 1]
  : null;

const pct = x => (x == null ? "  n/a" : (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%");
const out = {};
for (const [inst, fr] of Object.entries(frames)) {
  out[inst] = {};
  console.log(`\n=== ${inst.toUpperCase()}  (${fr.dates.length} bars, frame signals: ${["mom","rev","lead","ew","vxn","v9d","vvixz","vixts","cred"].filter(k => fr[k].some(v => v != null)).join(", ")})`);
  for (const H of HORIZONS) {
    for (const [name, { preds, opts }] of Object.entries(VARIANTS)) {
      const res = combinationForecast(fr, H.h, { predictors: preds, ...opts });
      const ev = evaluate(res, { band: H.band, dates: fr.dates });
      const ev19 = since ? evaluate(res, { band: H.band, dates: fr.dates, since }) : null;
      if (!ev) continue;
      const tag = name.padEnd(24);
      console.log(
        `h=${String(H.h).padStart(2)} ${tag} R² ${pct(ev.r2).padStart(7)} raw ${pct(ev.r2Raw).padStart(7)}` +
        `  CW p ${(ev.cwP < 0.001 ? "<.001" : ev.cwP.toFixed(3)).padStart(6)}` +
        `  CER ${pct(ev.cerGain).padStart(7)}  λ ${ev.lambdaMean.toFixed(2)}` +
        `  bear ${ev.bear.n} (${ev.bear.right == null ? "-" : (ev.bear.right * 100).toFixed(0)}% vs ${ev.bear.others == null ? "-" : (ev.bear.others * 100).toFixed(0)}%)` +
        (ev19 ? `  [since ${since}: R² ${pct(ev19.r2)}]` : ""),
      );
      out[inst][`${H.key}|${name}`] = {
        r2: ev.r2, r2Raw: ev.r2Raw, cwP: ev.cwP, cerGain: ev.cerGain, lambda: ev.lambdaMean,
        n: ev.n, from: ev.from, to: ev.to,
        bull: ev.bull, bear: ev.bear, byState: ev.byState.map(s => ({ n: s.n, r2: s.r2 })),
        since: ev19 ? { r2: ev19.r2, cwP: ev19.cwP, n: ev19.n } : null,
        single: ev.single.map(s => ({ id: s.id, r2: s.r2, n: s.n })),
      };
    }
  }
}

writeFileSync(path.join(CACHE, "results.json"), JSON.stringify(out, null, 2));
console.log("\nPer-signal out-of-sample R² (new v8 set, monthly horizon):");
for (const inst of ["es", "nq"]) {
  const r = out[inst]["m|v8 (ship)"];
  if (!r) continue;
  console.log(`  ${inst}: ` + r.single.map(s => `${s.id} ${s.r2 == null ? "n/a" : (s.r2 * 100).toFixed(1)}`).join("  "));
}
console.log("\nWritten to scripts/cache/results.json");
