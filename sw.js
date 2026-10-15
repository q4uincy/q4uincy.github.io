/* sw.js: makes the site open instantly and work offline. Put it next to index.html.
   - pages: network first (you always get the newest version online), cached copy when offline
   - css/js/images/books: instant from cache, refreshed quietly in the background
   - your Cloudflare worker (login, chat, AI) is never cached or touched */
const V = "laya-v2";
const SHELL = ["./", "index.html", "phone.css", "extras.css", "extras.js", "notes.js", "wall-swipe.js", "reader-themes.js", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/favicon-48.png"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function put(req, res) {
  if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(V).then(c => c.put(req, copy)).catch(() => {}); }
  return res;
}
const networkFirst = req => fetch(req).then(r => put(req, r)).catch(() => caches.match(req).then(m => m || caches.match("index.html") || caches.match("./")));
const staleWhileRevalidate = req => caches.match(req).then(hit => {
  const net = fetch(req).then(r => put(req, r)).catch(() => hit);
  return hit || net;
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;       // video/audio ranges and posts: leave alone
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === "navigate" || req.destination === "document") return e.respondWith(networkFirst(req));
    return e.respondWith(staleWhileRevalidate(req));
  }
  if (FONT_HOSTS.includes(url.hostname)) return e.respondWith(staleWhileRevalidate(req));
  // everything else (worker API, wikipedia, youtube, giphy...) goes straight to the network
});
