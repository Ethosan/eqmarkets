/* The one way of reaching the upstream data sources: the same-origin proxy (see
   functions/_middleware.js), which the deployed site serves on every path. The public
   CORS proxies that used to follow it are gone — corsproxy.io answers 401 without an
   API key, allorigins blocks the request with CORS, and codetabs hangs until the
   timeout — so a proxy failure now fails fast instead of dragging a feed through a
   minute of dead retries while the progress bar sits one short. */
/* FRED CSVs go through /fredx/<id>/<start>/…: Cloudflare's edge cache keys on the
   path, not the query string, so with every series on one path it served one
   series' cached CSV for another whenever FRED returned an error. */
const fredPath = u => {
  const m = u.match(/^https:\/\/fred\.stlouisfed\.org\/graph\/fredgraph\.csv\?(.*)$/);
  if (!m) return u;
  const q = new URLSearchParams(m[1]);
  return "/fredx/" + encodeURIComponent(q.get("id") || "_") + "/" + (q.get("cosd") || "_") + "/graph/fredgraph.csv?" + m[1];
};

const TRANSPORTS = [
  u => fredPath(u)
    .replace("https://query1.finance.yahoo.com", "/yf")
    .replace("https://fred.stlouisfed.org", "/fred")
    .replace("https://www.boj.or.jp", "/boj")
    .replace("https://www.federalreserve.gov", "/fed")
    .replace("https://home.treasury.gov", "/ust")
    .replace("https://publicreporting.cftc.gov", "/cftc")
    .replace("https://cdn-api.cboe.com", "/cboe"),
];

/* The transport to try first: per upstream host once one has worked for it. */
let preferred = 0;
const preferredFor = new Map();
const hostOf = u => { try { return new URL(u).host; } catch { return ""; } };

async function fetchWithTimeout(url, ms = 9000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, cache: "no-store" });
    if (!r.ok) {
      /* Release the unread body, or the connection stays open after the abort timer is cleared. */
      r.body?.cancel().catch(() => {});
      throw new Error("http " + r.status);
    }
    return r;
  } finally {
    clearTimeout(t);
  }
}

/* Try each transport, starting with the last one that worked for this host.
   `parse` turns a Response into a value, or throws/returns null to try the next. */
export async function viaTransports(url, parse, ms) {
  const host = hostOf(url);
  const start = preferredFor.get(host) ?? preferred;
  for (let k = 0; k < TRANSPORTS.length; k++) {
    const i = (start + k) % TRANSPORTS.length;
    try {
      const out = await parse(await fetchWithTimeout(TRANSPORTS[i](url), ms));
      if (out != null) {
        preferredFor.set(host, i);
        return out;
      }
    } catch {
      /* try the next transport */
    }
  }
  return null;
}

/* Probe all transports at once and remember the first that answers.
   Returns false when nothing is reachable (offline, or a sandboxed preview). */
export async function probe() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1d&interval=1d&cb=" + Date.now();
  const results = await Promise.allSettled(TRANSPORTS.map(t =>
    fetchWithTimeout(t(url), 5000).then(r => r.json()).then(j => { if (!j || !j.chart) throw new Error("bad"); })
  ));
  const i = results.findIndex(r => r.status === "fulfilled");
  if (i >= 0) preferred = i;
  return i >= 0;
}
