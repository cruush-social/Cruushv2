import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceWorkerSource = readFileSync('public/sw.js', 'utf8');
const appEntrySource = readFileSync('src/main.tsx', 'utf8');
const nginxConfig = readFileSync('nginx.conf', 'utf8');

describe('service worker update delivery', () => {
  it('bypasses stale mobile app shells when the login surface changes', () => {
    expect(serviceWorkerSource).toContain("const CACHE_NAME = 'cruush-app-shell-v9';");
    expect(serviceWorkerSource).toContain("key.startsWith(LEGACY_CACHE_PREFIX)");
    expect(serviceWorkerSource).toContain("fetch(request, { cache: 'no-store' })");
    expect(serviceWorkerSource).toContain("event.data?.type === 'SKIP_WAITING'");
    expect(serviceWorkerSource).toContain("event.data?.type === 'CLIENT_REFRESH_REQUESTED'");
    expect(serviceWorkerSource).toContain("url.searchParams.set(REFRESH_QUERY_PARAM, REFRESH_QUERY_VALUE)");
    expect(serviceWorkerSource).toContain("url.searchParams.get(REFRESH_QUERY_PARAM) === REFRESH_QUERY_VALUE");
    expect(serviceWorkerSource).not.toContain('caches.match');
    expect(serviceWorkerSource).not.toContain('cache.put');
    expect(serviceWorkerSource).not.toContain('cache.addAll');
  });

  it('registers the worker without HTTP cache reuse and reloads controlled clients', () => {
    expect(appEntrySource).toContain('const APP_SHELL_REFRESH_ID = "v9";');
    expect(appEntrySource).toContain('navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })');
    expect(appEntrySource).toContain('navigator.serviceWorker.addEventListener("controllerchange"');
    expect(appEntrySource).toContain('navigator.serviceWorker.getRegistrations()');
    expect(appEntrySource).toContain('window.addEventListener("focus", refreshOnVisible)');
    expect(appEntrySource).toContain('document.addEventListener("visibilitychange", refreshOnVisible)');
    expect(appEntrySource).toContain('window.location.reload()');
    expect(appEntrySource).toContain('registration?.waiting?.postMessage({ type: "SKIP_WAITING" })');
    expect(appEntrySource).toContain('registration?.active?.postMessage({ type: "CLIENT_REFRESH_REQUESTED", refreshId: APP_SHELL_REFRESH_ID })');
  });

  it('serves the HTML shell and service worker with no-store headers', () => {
    expect(nginxConfig).toContain('location = /index.html');
    expect(nginxConfig).toContain('location = /sw.js');
    expect(nginxConfig).toContain('Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;');
    expect(nginxConfig).toContain('Pragma "no-cache" always;');
  });
});
