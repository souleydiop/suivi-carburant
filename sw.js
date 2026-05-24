const CACHE = 'fuel-cache-v3';
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

// ---- INSTALL ----
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ---- ACTIVATE ----
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---- FETCH - Cache first ----
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp && resp.status === 200 && resp.type !== 'opaque') {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match('/suivi-carburant/index.html'));
    })
  );
});

// ---- BACKGROUND SYNC ----
self.addEventListener('sync', e => {
  if (e.tag === 'fuel-data-sync') {
    e.waitUntil(syncFuelData());
  }
});

async function syncFuelData() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_COMPLETE', timestamp: Date.now() });
  });
}

// ---- PERIODIC BACKGROUND SYNC ----
self.addEventListener('periodicsync', e => {
  if (e.tag === 'fuel-periodic-sync') {
    e.waitUntil(periodicSyncFuel());
  }
});

async function periodicSyncFuel() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(client => {
    client.postMessage({ type: 'PERIODIC_SYNC', timestamp: Date.now() });
  });
}

// ---- PUSH NOTIFICATIONS ----
self.addEventListener('push', e => {
  let data = { title: 'Suivi Carburant', body: 'N oubliez pas d enregistrer votre plein !' };
  try { if (e.data) data = e.data.json(); } catch(err) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/suivi-carburant/icon-192.png',
      badge: '/suivi-carburant/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: '/suivi-carburant/index.html' }
    })
  );
});

// ---- NOTIFICATION CLICK ----
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.openWindow(e.notification.data?.url || '/suivi-carburant/index.html')
  );
});

// ---- WIDGET SYNC ----
self.addEventListener('widgetsave', e => {
  e.waitUntil(updateWidget(e.widget));
});

self.addEventListener('widgetresume', e => {
  e.waitUntil(updateWidget(e.widget));
});

async function updateWidget(widget) {
  if (!widget) return;
  try {
    await self.widgets.updateByTag(widget.definition.tag, {
      data: JSON.stringify({ message: 'Suivi Carburant actif' }),
      template: widget.definition.ms_ac_template
    });
  } catch(err) {}
}
