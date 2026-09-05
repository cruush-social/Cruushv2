(function () {
  const APP_SHELL_REFRESH_ID = 'v57';
  const SERVICE_WORKER_SCRIPT_URL = `/sw.js?release=${APP_SHELL_REFRESH_ID}`;

  if (!('serviceWorker' in navigator)) {
    return;
  }

  function requestWorkerRefresh(registration) {
    if (!registration) {
      return Promise.resolve();
    }

    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    if (registration.active) {
      registration.active.postMessage({ type: 'CLIENT_REFRESH_REQUESTED', refreshId: APP_SHELL_REFRESH_ID });
    }

    return registration.update().catch(function () {
      return undefined;
    });
  }

  function refreshServiceWorker() {
    navigator.serviceWorker.getRegistrations()
      .then(function (registrations) {
        return Promise.all(registrations.map(requestWorkerRefresh));
      })
      .catch(function () {
        return undefined;
      })
      .then(function () {
        return navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT_URL, { updateViaCache: 'none' });
      })
      .then(requestWorkerRefresh)
      .catch(function () {
        return undefined;
      });
  }

  refreshServiceWorker();
  window.addEventListener('load', refreshServiceWorker);
}());
