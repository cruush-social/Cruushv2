import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceWorkerSource = readFileSync('public/sw.js', 'utf8');
const recoverySource = readFileSync('public/service-worker-recovery.js', 'utf8');
const appEntrySource = readFileSync('src/main.tsx', 'utf8');
const indexSource = readFileSync('index.html', 'utf8');
const nginxConfig = readFileSync('nginx.conf', 'utf8');

/**
 * Release delivery marker: v177. The release id is written in five places and a deploy is only delivered if
 * all five agree. This used to be pinned as a literal, so every bump left the
 * test failing until someone remembered to edit it here too, which meant it
 * spent most of its life red and guarding nothing. Read the id from the worker
 * instead and hold the other four to it: still fails the moment one drifts,
 * without going stale on a bump.
 */
const releaseId = serviceWorkerSource.match(/const CACHE_NAME = 'cruush-app-shell-(v\d+)';/)?.[1];

describe('service worker update delivery', () => {
  it('names a release id in the worker', () => {
    expect(releaseId).toMatch(/^v\d+$/);
  });

  it('bypasses stale mobile app shells when the login surface changes', () => {
    expect(serviceWorkerSource).toContain(`const REFRESH_ID = '${releaseId}';`);
    expect(serviceWorkerSource).toContain('keys.map((key) => caches.delete(key))');
    expect(serviceWorkerSource).toContain("fetch(request, { cache: 'no-store' })");
    expect(serviceWorkerSource).toContain("event.data?.type === 'SKIP_WAITING'");
    expect(serviceWorkerSource).toContain("event.data?.type === 'CLIENT_REFRESH_REQUESTED'");
    expect(serviceWorkerSource).not.toContain('client.navigate(client.url)');
    expect(serviceWorkerSource).not.toContain('url.searchParams.set');
    expect(serviceWorkerSource).not.toContain('cruush-sw-refresh');
    expect(serviceWorkerSource).not.toContain('caches.match');
    expect(serviceWorkerSource).not.toContain('cache.put');
    expect(serviceWorkerSource).not.toContain('cache.addAll');
  });

  it('registers the worker without HTTP cache reuse and reloads once after control changes', () => {
    expect(appEntrySource).toContain(`const APP_SHELL_REFRESH_ID = "${releaseId}";`);
    expect(appEntrySource).toContain('const SERVICE_WORKER_SCRIPT_URL = `/sw.js?release=${APP_SHELL_REFRESH_ID}`;');
    expect(appEntrySource).toContain('navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT_URL, { updateViaCache: "none" })');
    expect(appEntrySource).toContain('navigator.serviceWorker.addEventListener("controllerchange"');
    expect(appEntrySource).toContain('window.location.reload()');
    expect(appEntrySource).toContain('let reloadStarted = false;');
    expect(appEntrySource).toContain('window.addEventListener("beforeinstallprompt", captureInstallPrompt)');
    expect(appEntrySource).toContain('registration?.waiting?.postMessage({ type: "SKIP_WAITING" })');
    expect(appEntrySource).toContain('registration?.active?.postMessage({ type: "CLIENT_REFRESH_REQUESTED", refreshId: APP_SHELL_REFRESH_ID })');
    expect(indexSource).toContain(`<script src="/service-worker-recovery.js?release=${releaseId}"></script>`);
    expect(recoverySource).toContain(`const APP_SHELL_REFRESH_ID = '${releaseId}';`);
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

  it('uses the current cruush app icon for phone notifications', () => {
    expect(serviceWorkerSource.match(/\/icons\/cruush-192\.png/g)).toHaveLength(2);
    expect(serviceWorkerSource).not.toContain('notification-feed.png');
  });
});
