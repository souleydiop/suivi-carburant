const CACHE = 'fuel-cache-v4';
const ASSETS = [
  '/suivi-carburant/',
  '/suivi-carburant/index.html',
  '/suivi-carburant/manifest.json',
  '/suivi-carburant/icon-192.png',
  '/suivi-carburant/icon-512.png',
  '/suivi-carburant/screenshot1.png',
  '/suivi-carburant/screenshot2.png',
  '/suivi-carburant/screenshot-wide.png',
  '/suivi-carburant/sw.js'
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
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ---- FETCH - Cache first, fallback network ----
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
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
    e.waitUntil(doSync());
  }
  if (e.tag === 'fuel-gdrive-sync') {
    e.waitUntil(doGdriveSync());
  }
});

async function doSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_COMPLETE', timestamp: Date.now() });
  });
}

async function doGdriveSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(client => {
    client.postMessage({ type: 'GDRIVE_SYNC', timestamp: Date.now() });
  });
}

// ---- PERIODIC BACKGROUND SYNC ----
self.addEventListener('periodicsync', e => {
  if (e.tag === 'fuel-periodic-sync') {
    e.waitUntil(doPeriodicSync());
  }
  if (e.tag === 'fuel-maint-check') {
    e.waitUntil(doMaintCheck());
  }
});

async function doPeriodicSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(client => {
    client.postMessage({ type: 'PERIODIC_SYNC', timestamp: Date.now() });
  });
}

async function doMaintCheck() {
  // Check maintenance due dates and notify
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(client => {
    client.postMessage({ type: 'MAINT_CHECK', timestamp: Date.now() });
  });
}

// ---- PUSH NOTIFICATIONS ----
self.addEventListener('push', e => {
  let data = {
    title: 'Suivi Carburant',
    body: 'Rappel : vérifiez votre carburant et entretiens.',
    icon: '/suivi-carburant/icon-192.png'
  };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch(err) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/suivi-carburant/icon-192.png',
      badge: '/suivi-carburant/icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'fuel-notification',
      renotify: true,
      data: { url: data.url || '/suivi-carburant/index.html' }
    })
  );
});

// ---- NOTIFICATION CLICK ----
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      for (const c of cs) {
        if (c.url.includes('suivi-carburant') && 'focus' in c) return c.focus();
      }
      return clients.openWindow(e.notification.data?.url || '/suivi-carburant/index.html');
    })
  );
});

// ---- FILE HANDLER ----
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.searchParams.has('action')) {
    e.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(cs => {
        if (cs.length > 0) cs[0].focus();
        else clients.openWindow('/suivi-carburant/index.html');
      })
    );
  }
});

// ---- WIDGET ----
self.addEventListener('widgetsave', e => {
  e.waitUntil(updateWidget(e.widget));
});
self.addEventListener('widgetresume', e => {
  e.waitUntil(updateWidget(e.widget));
});
async function updateWidget(widget) {
  if (!widget || !self.widgets) return;
  try {
    await self.widgets.updateByTag(widget.definition.tag, {
      data: JSON.stringify({ status: 'Suivi Carburant actif', timestamp: Date.now() }),
      template: widget.definition.ms_ac_template
    });
  } catch(err) {}
}

// ---- MESSAGE FROM APP ----
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'REGISTER_PERIODIC_SYNC') {
    self.registration.periodicSync?.register('fuel-periodic-sync', { minInterval: 86400000 }).catch(() => {});
    self.registration.periodicSync?.register('fuel-maint-check', { minInterval: 86400000 }).catch(() => {});
  }
});
