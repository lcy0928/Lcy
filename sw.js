// Offline support: app files are served from cache and refreshed in the
// background. Exchange-rate and GitHub API calls always go to the network.
const VERSION = 'pricebook-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/i18n.js',
  './js/store.js',
  './js/sites.js',
  './js/currency.js',
  './js/landed.js',
  './js/sync.js',
  './js/chart.js',
  './js/util.js',
  './js/detect.js',
  './js/opw.js',
  './js/alerts.js',
  './icons/icon.svg',
  './icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isFont = (url) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin && !isFont(url)) return;

  // Daily data: try the network first so prices are current, fall back to the cached copy offline.
  if (url.origin === self.location.origin && url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  const cached = caches.match(req, { ignoreSearch: url.origin === self.location.origin });
  const fresh = fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  });
  e.waitUntil(fresh.catch(() => {}));
  e.respondWith(cached.then((hit) => hit || fresh));
});
