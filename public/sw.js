const CACHE_NAME = 'cruush-app-shell-v102';
const REFRESH_ID = 'v102';

async function deleteCachedShells() {
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

async function refreshOpenClients() {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  await Promise.all(clients.map((client) => {
    if (!client.url.startsWith(self.location.origin) || !('navigate' in client)) {
      return undefined;
    }

    return client.navigate(client.url);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    deleteCachedShells()
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    deleteCachedShells()
      .then(() => self.clients.claim())
      .then(refreshOpenClients)
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
    icon: '/icons/notification-feed.png?v=v102',
    badge: '/icons/notification-feed.png?v=v102',
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

  event.respondWith(fetch(request));
});
