// Kharcha-Paani service worker (offline quick add, Nov 11 2026).
// - Pages: always from the network; the last good copy of each page is kept
//   so the app still opens with no signal (behind the app lock).
// - Build files (/_next/static, content-hashed): from the cache once fetched.
// Nothing else is touched: Server Actions, Supabase and the Claude connector
// always go to the network.
const VERSION = "v1";
const PAGES = `kp-pages-${VERSION}`;
const STATIC = `kp-static-${VERSION}`;
const STATIC_LIMIT = 400;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== PAGES && key !== STATIC) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const OFFLINE_HTML = `<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Offline · Kharcha-Paani</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0a0a0a;color:#fafafa;font:15px/1.45 system-ui,-apple-system,sans-serif;text-align:center;padding:24px}a{display:inline-block;margin-top:20px;padding:12px 22px;border-radius:12px;background:#b6ff3b;color:#0a0a0a;font-weight:600;text-decoration:none}p{color:#a1a1aa;max-width:280px;margin:6px auto 0}</style></head><body><div><h1 style="font-size:20px;margin:0">You're offline</h1><p>This page hasn't been opened on this phone yet, so there's no saved copy.</p><a href="/">Open Home</a></div></body></html>`;

async function trimStatic(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - STATIC_LIMIT; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          await cache.put(req, res.clone());
          void trimStatic(cache);
        }
        return res;
      })(),
    );
    return;
  }

  // Full page loads only (soft navigations fall back to one when offline).
  if (req.mode !== "navigate" || url.pathname.startsWith("/api/") || url.pathname === "/login") return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(PAGES);
      try {
        const res = await fetch(req);
        // Only real pages: not the redirect to /login, not errors.
        // Saved in the background so the page still streams in as it loads.
        if (res.ok && !res.redirected && res.type === "basic") event.waitUntil(cache.put(url.pathname, res.clone()));
        return res;
      } catch {
        return (await cache.match(url.pathname)) ?? new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })(),
  );
});

// ── Phone reminders (#3, Nov 11 2026) ──
// The server sends { title, body, url, tag }; tapping opens `url` in the app.
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "Kharcha-Paani", {
      body: d.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: d.tag,
      data: { url: d.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin !== self.location.origin) continue;
        await w.focus();
        return w.navigate(url).catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    })(),
  );
});
