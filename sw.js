const CACHE = 'fuel-cache-v1';
const ASSETS = [
  '/suivi-carburant/',
  '/suivi-carburant/index.html',
  '/suivi-carburant/manifest.json',
  '/suivi-carburant/icon-192.png',
  '/suivi-carburant/icon-512.png',
  '/suivi-carburant/screenshot1.png',
  '/suivi-carburant/screenshot2.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return resp;
      }).catch(() => caches.match('/suivi-carburant/index.html'));
    })
  );
});
