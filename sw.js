// Offline support. App files come from the network first (revalidated, so a new
// version shows up on the next open) and fall back to the cached copy offline or
// when the network is slow. Exchange-rate and GitHub API calls are not cached.
const VERSION = 'pricebook-v6';
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
  './js/scan.js',
  './js/ocr.js',
  './js/translate.js',
  './js/market.js',
  './js/version.js',
  './icons/icon.svg',
  './icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never caches old files.
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
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

  // Fonts never change: cached copy first.
  if (isFont(url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }

  // App files: network first (revalidated with the server), cache when offline or after 4 s.
  const fromCache = () => caches.match(req, { ignoreSearch: true });
  const net = fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then((res) => {
    // Safari refuses a redirected response for a page load; hand back a plain copy.
    if (res.redirected) res = new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
    if (res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  e.respondWith(new Promise((resolve) => {
    let done = false;
    const finish = (res) => { if (!done && res) { done = true; resolve(res); } };
    net.then(finish, () => fromCache().then((hit) => finish(hit || Response.error())));
    setTimeout(() => fromCache().then(finish), 4000);
  }));
});
