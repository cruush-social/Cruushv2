// Automatically unregister stale Service Workers and clear caches on deployment updates
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.update();
    }
  }).catch(() => {});
}
