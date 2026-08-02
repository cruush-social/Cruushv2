const CACHE_NAME = 'cruush-app-shell-v8';
const REFRESH_QUERY_PARAM = 'cruush_app_shell';
const REFRESH_QUERY_VALUE = 'v8';
const OFFLINE_APP_SHELL_URL = '/';
const APP_SHELL_URLS = [
  '/manifest.webmanifest',
  '/icons/favicon-16.png',
  '/icons/favicon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

async function refreshOfflineAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(OFFLINE_APP_SHELL_URL, { cache: 'no-store' });

  if (response.ok) {
    await cache.put(OFFLINE_APP_SHELL_URL, response.clone());
  }

  await cache.addAll(APP_SHELL_URLS);
}

function withRefreshMarker(clientUrl) {
  const url = new URL(clientUrl);

  if (url.origin !== self.location.origin) {
    return null;
  }

  if (url.searchParams.get(REFRESH_QUERY_PARAM) === REFRESH_QUERY_VALUE) {
    return null;
  }

  url.searchParams.set(REFRESH_QUERY_PARAM, REFRESH_QUERY_VALUE);
  return url.href;
}

async function reloadControlledClients() {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  await Promise.all(clients.map((client) => {
    if (client.url.startsWith(self.location.origin) && 'navigate' in client) {
      const nextUrl = withRefreshMarker(client.url);

      if (nextUrl) {
        return client.navigate(nextUrl);
      }
    }

    return undefined;
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    refreshOfflineAppShell()
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => reloadControlledClients())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'CLIENT_REFRESH_REQUESTED') {
    event.waitUntil(
      refreshOfflineAppShell()
        .then(() => reloadControlledClients())
        .catch(() => undefined)
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === 'string' ? payload.title : 'cruush';
  const body = typeof payload.body === 'string' ? payload.body : 'Open cruush to check it.';
  const sound = typeof payload.sound === 'string' ? payload.sound : 'heartbeat';
  const soundEnabled = typeof payload.soundEnabled === 'boolean' ? payload.soundEnabled : true;
  const url = typeof payload.url === 'string' ? payload.url : '/notifications';

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    silent: !soundEnabled,
    sound: soundEnabled ? sound : undefined,
    data: {
      sound: soundEnabled ? sound : '',
      url
    }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/notifications', self.location.origin).href;

  event.waitUntil(self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).then((clients) => {
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        client.navigate(targetUrl);
        return client.focus();
      }
    }

    return self.clients.openWindow(targetUrl);
  }));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(OFFLINE_APP_SHELL_URL, responseClone))
                .catch(() => undefined)
            );
          }

          return response;
        })
        .catch(() => caches.match(OFFLINE_APP_SHELL_URL))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
