/* Generates dist/sw.js from public/sw.js after `vite build`: fills in a per-deploy
   cache name and the precache list — the shell plus every fingerprinted asset in
   dist/assets/ and every icon — so the offline copy is complete at install and each
   deploy's activate deletes the previous generations instead of accumulating them.
   The cache name is a hash of the precache list, so it changes with every deploy. */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const html = readFileSync(join(dist, "index.html"), "utf8");
const widget = html.match(/src="(\/feedback-widget\.js[^"]*)"/);
const assets = readdirSync(join(dist, "assets"))
  .filter(f => /\.(js|css|woff2?|png|svg|webp)$/.test(f))
  .map(f => "/assets/" + f);
const icons = readdirSync(join(dist, "icons")).map(f => "/icons/" + f);
const shell = [
  "/",
  "/manifest.webmanifest",
  ...(widget ? [widget[1]] : []),
  ...icons,
  ...assets,
];

const cacheName = "eqm-v22-" + createHash("sha1").update(shell.join(" ")).digest("hex").slice(0, 8);

const tpl = readFileSync(join(root, "public", "sw.js"), "utf8");
const out = tpl
  .replace('"__CACHE_NAME__"', JSON.stringify(cacheName))
  .replace('"__SHELL_LIST__"', JSON.stringify(JSON.stringify(shell)));
if (out.includes("__CACHE_NAME__") || out.includes("__SHELL_LIST__")) {
  throw new Error("sw.js template placeholders were not filled");
}
writeFileSync(join(dist, "sw.js"), out);
console.log(`sw.js: cache ${cacheName}, ${shell.length} entries precached`);
