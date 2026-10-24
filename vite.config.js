import { defineConfig } from "vite";

/* Local copies of the proxies in functions/_middleware.js, so `npm run dev` and `npm run preview`
   reach the data sources same-origin, as the deployed site does. sec-ch-ua is
   dropped because FRED answers 500 when it names HeadlessChrome. */
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

const proxy = Object.fromEntries(Object.entries(UPSTREAM).map(([prefix, target]) => [prefix + "/", {
  target,
  changeOrigin: true,
  rewrite: path => path.slice(prefix.length),
  configure: p => p.on("proxyReq", req => req.removeHeader("sec-ch-ua")),
}]));
/* /fredx/<id>/<start>/<path>: the id and start only make the URL unique (see transport.js). */
proxy["/fredx/"] = { ...proxy["/fred/"], rewrite: path => path.replace(/^\/fredx\/[^/]+\/[^/]+/, "") };

import { readFileSync } from "fs";
import { resolve } from "path";
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { proxy },
  preview: { proxy },
});
