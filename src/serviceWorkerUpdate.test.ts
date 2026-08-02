import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceWorkerSource = readFileSync('public/sw.js', 'utf8');
const appEntrySource = readFileSync('src/main.tsx', 'utf8');
const nginxConfig = readFileSync('nginx.conf', 'utf8');

describe('service worker update delivery', () => {
  it('bypasses stale mobile app shells when the login surface changes', () => {
    expect(serviceWorkerSource).toContain("const CACHE_NAME = 'cruush-app-shell-v7';");
    expect(serviceWorkerSource).toContain("fetch(OFFLINE_APP_SHELL_URL, { cache: 'reload' })");
    expect(serviceWorkerSource).toContain("fetch(request, { cache: 'reload' })");
    expect(serviceWorkerSource).toContain("event.data?.type === 'SKIP_WAITING'");
    expect(serviceWorkerSource).not.toContain("  '/',");
  });

  it('registers the worker without HTTP cache reuse and reloads controlled clients', () => {
    expect(appEntrySource).toContain('navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })');
    expect(appEntrySource).toContain('navigator.serviceWorker.addEventListener("controllerchange"');
    expect(appEntrySource).toContain('window.location.reload()');
    expect(appEntrySource).toContain('registration.waiting?.postMessage({ type: "SKIP_WAITING" })');
  });

  it('serves the HTML shell and service worker with no-store headers', () => {
    expect(nginxConfig).toContain('location = /index.html');
    expect(nginxConfig).toContain('location = /sw.js');
    expect(nginxConfig).toContain('Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;');
    expect(nginxConfig).toContain('Pragma "no-cache" always;');
  });
});
