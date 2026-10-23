/* Offline shell for Equarian Markets. scripts/build-sw.mjs fills in the cache name
   and the precache list from dist/ at build time, so every deploy gets a fresh cache
   (activate deletes the old generations) and the shell plus its exact assets are
   cached atomically at install — an offline or flaky launch always finds them.
   - Pages: network first, cached copy when offline; only a real HTML answer is cached.
   - /assets/* (fingerprinted by Vite): precached, then cache first, they never change.
   - Market data (every proxy in functions/_middleware.js) and cross-origin requests:
     never cached. A proxy missing here would be served cache-first forever. */
const CACHE = "__CACHE_NAME__";
const SHELL = JSON.parse("__SHELL_LIST__");
const LIVE = ["/yf/", "/fred/", "/fredx/", "/boj/", "/cftc/", "/fed/", "/ust/", "/cboe/", "/odw/"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (LIVE.some(p => url.pathname.startsWith(p))) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(res => {
          /* Only a real HTML answer may become the offline shell — never an error page. */
          if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put("/", copy));
          }
          return res;
        })
        /* Offline: the cached shell, whatever query the launch URL carries. */
        .catch(() => caches.match("/", { ignoreSearch: true }))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    /* A missing asset on a flaky network degrades to a 503 — a rejected fetch
       would blank the whole app. */
    }).catch(() => new Response("offline", { status: 503, headers: { "content-type": "text/plain" } })))
  );
});
