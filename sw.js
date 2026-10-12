/* Laya service worker.
   Network first, so a fresh deploy always shows up. The cache is only a fallback
   for when she is offline (the shell and any books she has already opened). */
const CACHE = "laya-v1";
const SHELL = ["./", "index.html", "phone.css", "extras.css", "extras.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                 // Worker API, Spotify, GIPHY, fonts: never touched
  if (/\.(mp4|webm|mov)$/i.test(url.pathname)) return;         // wallpapers are big and stream by range
  if (req.headers.has("range")) return;
  if (url.pathname.endsWith("/admin.html")) return;            // keep the admin page out of the cache

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
