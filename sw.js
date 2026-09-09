/**
 * Forexleey service worker
 *
 * Strategy is deliberately conservative for a finance app:
 *
 *   - App shell (HTML/icons/manifest): cache-first, so the app opens instantly
 *     and shows something useful with no connection.
 *   - API calls (/forecast, /ticker, /quote): NEVER cached. Serving a stale
 *     price or a stale forecast would be worse than showing an error — people
 *     may act on these numbers. Offline requests fail loudly instead.
 *
 * Bump CACHE_VERSION whenever you deploy, or users keep the old shell.
 */

const CACHE_VERSION = 'zeusvisions-v1';
const SHELL = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/maskable-512.png',
];

// Hosts whose responses must always come from the network.
const NEVER_CACHE = [
  'api.binance.com',
  'api.coingecko.com',
  'min-api.cryptocompare.com',
  'workers.dev',
  'up.railway.app',
  'onrender.com',
  'supabase.co',
  'paypal.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   // a missing shell file must not block install
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Live data: always network, never cached, never served stale.
  if (NEVER_CACHE.some((h) => url.hostname.includes(h))) {
    event.respondWith(fetch(req));
    return;
  }

  // Navigations: network first so deploys are picked up, cache as fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else (icons, css, fonts): cache first, refresh in background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
