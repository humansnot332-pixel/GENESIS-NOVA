// Genesis CRM service worker — makes the app installable and opens the shell offline.
// Data (Supabase) is never cached: every API call always goes to the network.
const CACHE = "gnova-v8";
const SHELL = ["./", "index.html", "styles.css", "main.js", "core.js", "comms.js", "biz.js", "login-fx.js", "import.js", "i18n.js", "data.js", "config.js",
  "frame-guard.js", "supabase.js", "manifest.webmanifest", "icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// network-first for our own files (always fresh after a deploy), cache only as offline fallback
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.endsWith("quote.html")) return;
  // cache: "no-cache" → always ask the server (GitHub Pages otherwise lets the browser reuse a file for 10 min)
  e.respondWith(fetch(u.href, { cache: "no-cache", credentials: "same-origin" }).then((r) => {
    if (r.ok && r.type === "basic") { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
