// Genesis CRM service worker — makes the app installable and opens the shell offline.
// Data (Supabase) is never cached: every API call always goes to the network.
const CACHE = "gnova-v13";
const SHELL = ["./", "index.html", "styles.css", "main.js", "core.js", "comms.js", "biz.js", "login-fx.js", "import.js", "i18n.js", "data.js", "config.js",
  "frame-guard.js", "supabase.js", "manifest.webmanifest", "icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// our own files: answer from cache at once (instant open), fetch a fresh copy in the background.
// A deploy bumps CACHE above → new worker installs → page reloads itself to the new version.
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.endsWith("quote.html")) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const cached = await c.match(e.request);
    const net = fetch(u.href, { cache: "no-cache", credentials: "same-origin" }).then((r) => { if (r.ok && r.type === "basic") c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (cached) { e.waitUntil(net); return cached; }
    return (await net) || caches.match("index.html");
  }));
});
