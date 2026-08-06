const CACHE_NAME = 'cruush-app-shell-v20';
const LEGACY_CACHE_PREFIX = 'cruush-app-shell-';
const REFRESH_QUERY_PARAM = 'cruush_app_shell';
const REFRESH_QUERY_VALUE = 'v20';

async function deleteAppShellCaches() {
  const keys = await caches.keys();

  await Promise.all(keys
    .filter((key) => key.startsWith(LEGACY_CACHE_PREFIX))
    .map((key) => caches.delete(key)));
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
    deleteAppShellCaches()
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    deleteAppShellCaches()
      .then(() => self.clients.claim())
      .then(() => reloadControlledClients())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === 'CLIENT_REFRESH_REQUESTED' && event.data?.refreshId === REFRESH_ID) {
    event.waitUntil(
      deleteCachedShells()
    );
  }

  if (event.data?.type === 'CLIENT_REFRESH_REQUESTED') {
    event.waitUntil(
      deleteAppShellCaches()
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
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(fetch(request, { cache: 'no-store' }));
});
