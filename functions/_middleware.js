/* Same-origin proxies to the market data sources, so the browser can read them
   without CORS errors. Cloudflare Pages can't proxy to another domain from
   _redirects (the rule is ignored and the request falls through to index.html),
   so the rewrites live here. public/_routes.json runs this only on these paths.
   Keep UPSTREAM in step with vite.config.js. */
const UPSTREAM = {
  "/yf": "https://query1.finance.yahoo.com",
  "/fred": "https://fred.stlouisfed.org",
  "/ust": "https://home.treasury.gov",
  "/boj": "https://www.boj.or.jp",
  "/fed": "https://www.federalreserve.gov",
  "/cftc": "https://publicreporting.cftc.gov",
  "/cboe": "https://cdn-api.cboe.com",
  "/odw": "https://oracular-data.makan-bot.workers.dev",
};

/* Headers passed back to the page; everything else (cookies included) is dropped. */
const KEEP = ["content-type", "cache-control", "expires", "last-modified", "etag"];

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  let path = url.pathname;
  /* /fredx/<id>/<start>/<path>: the id and start only make the URL unique (see transport.js). */
  if (path.startsWith("/fredx/")) path = "/fred" + path.replace(/^\/fredx\/[^/]+\/[^/]+/, "");
  const prefix = Object.keys(UPSTREAM).find(p => path.startsWith(p + "/"));
  if (!prefix) return next();

  /* A fresh request rather than the browser's: no Origin (the Oracular data worker
     turns away other sites), no cookies, and no sec-ch-ua (FRED answers 500 when it
     names HeadlessChrome). */
  const headers = new Headers({ accept: request.headers.get("accept") || "*/*" });
  const ua = request.headers.get("user-agent");
  if (ua) headers.set("user-agent", ua);

  let res;
  try {
    res = await fetch(UPSTREAM[prefix] + path.slice(prefix.length) + url.search, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers,
    });
  } catch {
    return new Response("Upstream unreachable", { status: 502 });
  }
  const out = new Headers();
  for (const h of KEEP) { const v = res.headers.get(h); if (v) out.set(h, v); }
  return new Response(res.body, { status: res.status, headers: out });
}
