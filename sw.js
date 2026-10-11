/* Rent Manager service worker – offline support.
   Bump CACHE_VERSION whenever you upload a new index.html so users get the update. */
const CACHE_VERSION = 'v1';
const SHELL_CACHE   = 'rm-shell-' + CACHE_VERSION;
const RUNTIME_CACHE = 'rm-runtime-' + CACHE_VERSION;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

/* Third-party hosts the app uses (SheetJS, Google Fonts, jsPDF, html2canvas) – cached on first use */
const CDN_HOSTS = [
  'cdn.sheetjs.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('rm-') && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Page navigations: network first, fall back to cached app */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  /* Same-origin files: cache first, refresh in background */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        const fetching = fetch(req).then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || fetching;
      })
    );
    return;
  }

  /* CDN libraries and fonts: cache first, store after first successful load */
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
          }
          return res;
        });
      })
    );
  }
  /* Everything else (e.g. wa.me) goes straight to the network */
});
