// Genesis CRM service worker — makes the app installable and opens the shell offline.
// Data (Supabase) is never cached: every API call always goes to the network.
const CACHE = "gnova-v97";
const SHELL = ["./", "index.html", "styles.css", "main.js", "core.js", "comms.js", "biz.js", "login-fx.js", "import.js", "legacy.js", "i18n.js", "data.js", "config.js", "rte.js", "obf.js", "vpo.js", "files.js", "push.js", "qcheck.js", "qpdf.js", "qpick.js", "lprod.js", "renup.js", "catimp.js", "sales.js", "proforma.js", "datebar.js", "daysum.js",
  "frame-guard.js", "supabase.js", "manifest.webmanifest", "icon-192.png",
  "fonts/inter-latin.woff2", "fonts/inter-latin-ext.woff2", "fonts/sora-latin.woff2"];

self.addEventListener("install", (e) => {
  // cache: "reload" → every file straight from the server (never an older copy from the browser's HTTP cache,
  // which made a new version still show the old screens until the next reload)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// our own files: answer from cache at once (instant open), fetch a fresh copy in the background.
// A deploy bumps CACHE above → new worker installs → page reloads itself to the new version.
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.endsWith("quote.html") || /\/(rest|auth|functions|storage|realtime)\/v1\//.test(u.pathname)) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const cached = await c.match(e.request);
    const net = fetch(u.href, { cache: "no-cache", credentials: "same-origin" }).then((r) => { if (r.ok && r.type === "basic") c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (cached) { e.waitUntil(net); return cached; }
    return (await net) || caches.match("index.html");
  }));
});

// ---- phone notifications (Web Push): a ticket given to this person — shown even when the app is closed
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  const opt = { body: d.body || "", icon: "icon-192.png", badge: "badge-96.png", data: { url: d.url || "" },
    vibrate: [250, 120, 250, 120, 400], requireInteraction: !!d.urgent, timestamp: Date.now() };
  if (d.tag) { opt.tag = d.tag; opt.renotify = true; }
  e.waitUntil(self.registration.showNotification(d.title || "Genesis Nova", opt));
});
// tap → the app (already open: it jumps to the ticket; closed: it opens on the ticket)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const hash = String(e.notification.data?.url || "").replace(/^[^#]*/, "");
  const url = new URL("./" + hash, self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find((c) => c.url.startsWith(self.registration.scope));
    if (w) { w.postMessage({ type: "open", hash }); return w.focus(); }
    return self.clients.openWindow(url);
  })());
});
