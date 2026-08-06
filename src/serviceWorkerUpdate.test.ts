import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceWorkerSource = readFileSync('public/sw.js', 'utf8');
const recoverySource = readFileSync('public/service-worker-recovery.js', 'utf8');
const appEntrySource = readFileSync('src/main.tsx', 'utf8');
const indexSource = readFileSync('index.html', 'utf8');
const nginxConfig = readFileSync('nginx.conf', 'utf8');

describe('service worker update delivery', () => {
  it('bypasses stale mobile app shells when the login surface changes', () => {
    expect(serviceWorkerSource).toContain("const CACHE_NAME = 'cruush-app-shell-v21';");
    expect(serviceWorkerSource).toContain("const REFRESH_ID = 'v21';");
    expect(serviceWorkerSource).toContain('keys.map((key) => caches.delete(key))');
    expect(serviceWorkerSource).toContain("fetch(request, { cache: 'no-store' })");
    expect(serviceWorkerSource).toContain("event.data?.type === 'SKIP_WAITING'");
    expect(serviceWorkerSource).toContain("event.data?.type === 'CLIENT_REFRESH_REQUESTED'");
    expect(serviceWorkerSource).toContain('client.navigate(client.url)');
    expect(serviceWorkerSource).not.toContain('url.searchParams.set');
    expect(serviceWorkerSource).not.toContain('cruush-sw-refresh');
    expect(serviceWorkerSource).not.toContain('caches.match');
    expect(serviceWorkerSource).not.toContain('cache.put');
    expect(serviceWorkerSource).not.toContain('cache.addAll');
  });

  it('registers the worker without HTTP cache reuse and reloads controlled clients', () => {
    expect(appEntrySource).toContain('const APP_SHELL_REFRESH_ID = "v21";');
    expect(appEntrySource).toContain('const SERVICE_WORKER_SCRIPT_URL = `/sw.js?release=${APP_SHELL_REFRESH_ID}`;');
    expect(appEntrySource).toContain('navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT_URL, { updateViaCache: "none" })');
    expect(appEntrySource).toContain('navigator.serviceWorker.addEventListener("controllerchange"');
    expect(appEntrySource).toContain('navigator.serviceWorker.getRegistrations()');
    expect(appEntrySource).toContain('window.addEventListener("focus", refreshOnVisible)');
    expect(appEntrySource).toContain('document.addEventListener("visibilitychange", refreshOnVisible)');
    expect(appEntrySource).toContain('window.location.reload()');
    expect(appEntrySource).toContain('registration?.waiting?.postMessage({ type: "SKIP_WAITING" })');
    expect(appEntrySource).toContain('registration?.active?.postMessage({ type: "CLIENT_REFRESH_REQUESTED", refreshId: APP_SHELL_REFRESH_ID })');
    expect(indexSource).toContain('<script src="/service-worker-recovery.js?release=v21"></script>');
    expect(recoverySource).toContain("const APP_SHELL_REFRESH_ID = 'v21';");
    expect(recoverySource).toContain('navigator.serviceWorker.getRegistrations()');
    expect(recoverySource).toContain("navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT_URL, { updateViaCache: 'none' })");
    expect(recoverySource).toContain('refreshServiceWorker();');
  });

  it('serves the HTML shell and service worker with no-store headers', () => {
    expect(nginxConfig).toContain('location = /index.html');
    expect(nginxConfig).toContain('location = /sw.js');
    expect(nginxConfig).toContain('Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;');
    expect(nginxConfig).toContain('Pragma "no-cache" always;');
  });
});
