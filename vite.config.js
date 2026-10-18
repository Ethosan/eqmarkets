import { defineConfig } from "vite";

/* Local copies of the netlify.toml rewrites, so `npm run dev` and `npm run preview`
   reach the data sources same-origin, as the deployed site does. sec-ch-ua is
   dropped because FRED answers 500 when it names HeadlessChrome. */
const UPSTREAM = {
  "/yf": "https://query1.finance.yahoo.com",
  "/fred": "https://fred.stlouisfed.org",
  "/boj": "https://www.boj.or.jp",
  "/fed": "https://www.federalreserve.gov",
  "/cftc": "https://publicreporting.cftc.gov",
  "/cboe": "https://cdn-api.cboe.com",
};

const proxy = Object.fromEntries(Object.entries(UPSTREAM).map(([prefix, target]) => [prefix + "/", {
  target,
  changeOrigin: true,
  rewrite: path => path.slice(prefix.length),
  configure: p => p.on("proxyReq", req => req.removeHeader("sec-ch-ua")),
}]));
/* /fredx/<id>/<start>/<path>: the id and start only make the URL unique (see transport.js). */
proxy["/fredx/"] = { ...proxy["/fred/"], rewrite: path => path.replace(/^\/fredx\/[^/]+\/[^/]+/, "") };

export default defineConfig({
  server: { proxy },
  preview: { proxy },
});
