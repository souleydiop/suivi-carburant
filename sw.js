const CACHE = 'fuel-cache-v2';
const ASSETS = [
  '/suivi-carburant/',
  '/suivi-carburant/index.html',
  '/suivi-carburant/manifest.json',
  '/suivi-carburant/icon-192.png',
  '/suivi-carburant/icon-512.png',
  '/suivi-carburant/screenshot1.png',
  '/suivi-carburant/screenshot2.png',
  '/suivi-carburant/screenshot-wide.png'
];

// Install - cache all assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch - cache first strategy
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match('/suivi-carburant/index.html'));
    })
  );
});

// Periodic Background Sync
self.addEventListener('periodicsync', e => {
  if (e.tag === 'fuel-sync') {
    e.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'BACKGROUND_SYNC', timestamp: Date.now() });
  });
}

// Background Sync (when offline -> online)
self.addEventListener('sync', e => {
  if (e.tag === 'fuel-data-sync') {
    e.waitUntil(doBackgroundSync());
  }
});

// Push notifications (future use)
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'Carburant', body: 'Rappel de plein' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/suivi-carburant/icon-192.png',
      badge: '/suivi-carburant/icon-192.png'
    })
  );
});
