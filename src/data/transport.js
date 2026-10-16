/* Ordered ways of reaching the upstream data sources.
   0: same-origin Netlify proxy (see netlify.toml), the reliable path once deployed.
   1-3: public CORS proxies, a fallback for running the page somewhere else. */
const TRANSPORTS = [
  u => u
    .replace("https://query1.finance.yahoo.com", "/yf")
    .replace("https://fred.stlouisfed.org", "/fred")
    .replace("https://www.boj.or.jp", "/boj")
    .replace("https://publicreporting.cftc.gov", "/cftc"),
  u => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  u => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
];

let preferred = 0;

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

/* Try each transport, starting with the last one that worked.
   `parse` turns a Response into a value, or throws/returns null to try the next. */
export async function viaTransports(url, parse, ms) {
  for (let k = 0; k < TRANSPORTS.length; k++) {
    const i = (preferred + k) % TRANSPORTS.length;
    try {
      const out = await parse(await fetchWithTimeout(TRANSPORTS[i](url), ms));
      if (out != null) {
        preferred = i;
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
