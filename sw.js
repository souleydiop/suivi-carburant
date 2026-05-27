// ═══════════════════════════════════════════════════════════════════════════════
// MONFINANCE SERVICE WORKER v2.0
// Cache-first + Offline + Background Sync + Periodic Sync + Push + Widgets
// ═══════════════════════════════════════════════════════════════════════════════

const APP_VERSION   = '3.0.0';
const STATIC_CACHE  = `finance-static-v${APP_VERSION}`;
const DATA_CACHE    = `finance-data-v${APP_VERSION}`;
const SYNC_TAG      = 'sync-transactions';
const PERIODIC_TAG  = 'periodic-finance-check';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Space+Mono:wght@400;700&display=swap'
];

// ─── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log(`[SW v${APP_VERSION}] Installing...`);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS.map(u => new Request(u, { cache: 'reload' })))
        .catch(e => console.warn('[SW] Pre-cache partial fail:', e)))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log(`[SW v${APP_VERSION}] Activating...`);
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then(keys => Promise.all(
        keys.filter(k => k !== STATIC_CACHE && k !== DATA_CACHE)
            .map(k => { console.log('[SW] Removing old cache:', k); return caches.delete(k); })
      )),
      // Register periodic sync
      self.registration.periodicSync
        ? self.registration.periodicSync.register(PERIODIC_TAG, { minInterval: 24 * 60 * 60 * 1000 })
            .then(() => console.log('[SW] Periodic sync registered'))
            .catch(e => console.log('[SW] Periodic sync not available:', e))
        : Promise.resolve(),
      self.clients.claim()
    ])
  );
});

// ─── FETCH ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.protocol === 'blob:') return;

  // Google Fonts → cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // App shell & assets → cache-first
  if (['.html','.js','.css','.png','.svg','.json','.ico','.webp','.woff2'].some(ext => url.pathname.endsWith(ext))
      || url.pathname === '/' || url.pathname.endsWith('/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Everything else → network with cache fallback
  event.respondWith(networkWithCacheFallback(request));
});

// ─── CACHE STRATEGIES ─────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName = STATIC_CACHE) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch { return offlinePage(); }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function networkWithCacheFallback(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return await cache.match(request) || offlinePage();
  }
}

function offlinePage() {
  return caches.match('./index.html').then(r => r || new Response(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MonFinance — Hors ligne</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:20px}
    .icon{font-size:56px;margin-bottom:16px}.title{font-size:22px;font-weight:700;color:#22d3ee;margin-bottom:8px}.sub{color:#475569;font-size:14px;margin-bottom:24px}
    button{background:#22d3ee;color:#0f172a;border:none;padding:12px 28px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer}</style></head>
    <body><div><div class="icon">💰</div><div class="title">MonFinance</div><div class="sub">Mode hors ligne — vos données locales sont disponibles</div>
    <button onclick="location.reload()">Réessayer</button></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  ));
}

// ─── BACKGROUND SYNC ──────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  console.log('[SW] Background sync event:', event.tag);

  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingTransactions());
  }
  if (event.tag === 'sync-export') {
    event.waitUntil(syncExport());
  }
});

async function syncPendingTransactions() {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage({ type: 'SYNC_COMPLETE', tag: SYNC_TAG }));
    console.log('[SW] Background sync complete');
  } catch (e) {
    console.error('[SW] Sync failed:', e);
    throw e; // Retry
  }
}

async function syncExport() {
  console.log('[SW] Export sync triggered');
}

// ─── PERIODIC BACKGROUND SYNC ─────────────────────────────────────────────────
self.addEventListener('periodicsync', event => {
  console.log('[SW] Periodic sync:', event.tag);

  if (event.tag === PERIODIC_TAG) {
    event.waitUntil(periodicFinanceCheck());
  }
});

async function periodicFinanceCheck() {
  console.log('[SW] Running periodic finance check...');
  try {
    // Notify clients of periodic check
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'PERIODIC_SYNC', timestamp: Date.now() }));

    // Show notification if no clients focused
    const focused = clients.some(c => c.focused);
    if (!focused && self.registration.showNotification) {
      await self.registration.showNotification('MonFinance 💰', {
        body: 'Pensez à enregistrer vos transactions du jour',
        icon: './icons/icon-192.png',
        badge: './icons/icon-72.png',
        tag: 'periodic-reminder',
        silent: true,
        data: { url: './' }
      });
    }
  } catch (e) {
    console.error('[SW] Periodic check failed:', e);
  }
}

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
self.addEventListener('push', event => {
  console.log('[SW] Push received');
  let data = { title: 'MonFinance', body: 'Nouvelle notification', url: './' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-72.png',
      image: data.image || undefined,
      tag: data.tag || 'monfinance-push',
      renotify: true,
      requireInteraction: data.requireInteraction || false,
      silent: false,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open',    title: '📊 Ouvrir' },
        { action: 'depense', title: '➖ Dépense' },
        { action: 'dismiss', title: 'Ignorer' }
      ],
      data: { url: data.url, action: data.action }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const { action } = event;
  const notifData = event.notification.data || {};

  let targetUrl = './';
  if (action === 'depense') targetUrl = './index.html?action=depense';
  else if (action === 'revenu') targetUrl = './index.html?action=revenu';
  else if (notifData.url) targetUrl = notifData.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const existing = clientList.find(c => c.url.includes('monfinance') || c.url.includes('index.html'));
      if (existing) { existing.focus(); existing.navigate(targetUrl); return; }
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('notificationclose', event => {
  console.log('[SW] Notification dismissed:', event.notification.tag);
});

// ─── WIDGETS ──────────────────────────────────────────────────────────────────
self.addEventListener('widgetinstall', event => {
  console.log('[SW] Widget installed:', event.widget?.tag);
  event.waitUntil(updateWidget(event.widget));
});

self.addEventListener('widgetuninstall', event => {
  console.log('[SW] Widget uninstalled:', event.widget?.tag);
});

self.addEventListener('widgetresume', event => {
  event.waitUntil(updateWidget(event.widget));
});

async function updateWidget(widget) {
  if (!widget || !self.widgets) return;
  try {
    const payload = JSON.stringify({
      solde: 'Données locales',
      updated: new Date().toLocaleDateString('fr-FR')
    });
    await self.widgets.updateByTag(widget.tag, { data: payload });
  } catch (e) {
    console.log('[SW] Widget update skipped:', e);
  }
}

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  const { data } = event;
  if (!data) return;

  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'GET_VERSION':
      event.ports?.[0]?.postMessage({ version: APP_VERSION, cache: STATIC_CACHE });
      break;

    case 'CACHE_URLS':
      if (Array.isArray(data.urls)) {
        caches.open(STATIC_CACHE).then(cache => cache.addAll(data.urls));
      }
      break;

    case 'CLEAR_CACHE':
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => event.ports?.[0]?.postMessage({ cleared: true }));
      break;

    case 'REGISTER_SYNC':
      self.registration.sync?.register(SYNC_TAG)
        .then(() => event.ports?.[0]?.postMessage({ registered: true }))
        .catch(e => event.ports?.[0]?.postMessage({ error: e.message }));
      break;

    case 'REQUEST_NOTIFICATION':
      self.registration.showNotification(data.title || 'MonFinance', {
        body: data.body || '',
        icon: './icons/icon-192.png',
        badge: './icons/icon-72.png',
        tag: data.tag || 'manual',
        data: { url: data.url || './' }
      });
      break;

    default:
      console.log('[SW] Unknown message type:', data.type);
  }
});

// ─── ERROR HANDLING ───────────────────────────────────────────────────────────
self.addEventListener('error', event => {
  console.error('[SW] Error:', event.message, event.filename, event.lineno);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[SW] Unhandled rejection:', event.reason);
});

console.log(`[SW] MonFinance Service Worker v${APP_VERSION} loaded`);
