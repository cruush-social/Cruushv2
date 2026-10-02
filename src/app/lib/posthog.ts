import posthog from 'posthog-js';
import { getSanitizedAnalyticsPath } from './analyticsPath';

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

let initialized = false;
let pendingPageView: { path: string; title: string } | null = null;

function getPostHogKey() {
  return import.meta.env.VITE_POSTHOG_KEY?.trim() ?? '';
}

export function getPostHogHost() {
  return import.meta.env.VITE_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST;
}

export function initializePostHog() {
  const key = getPostHogKey();

  if (!key || typeof window === 'undefined') {
    return false;
  }

  if (initialized) {
    return true;
  }

  posthog.init(key, {
    api_host: getPostHogHost(),
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: 'memory',
    loaded: () => {
      if (!pendingPageView) {
        return;
      }

      const { path, title } = pendingPageView;
      pendingPageView = null;
      capturePostHogPageView(path, title);
    },
  });
  posthog.opt_in_capturing();
  initialized = true;

  return true;
}

export function trackPostHogPageView(
  path: string,
  title = typeof document === 'undefined' ? '' : document.title,
) {
  const wasInitialized = initialized;

  if (!wasInitialized) {
    pendingPageView = { path, title };
  }

  if (!initializePostHog()) {
    pendingPageView = null;
    return false;
  }

  if (!wasInitialized) {
    return true;
  }

  capturePostHogPageView(path, title);
  return true;
}

function capturePostHogPageView(path: string, title: string) {

  const sanitizedPath = getSanitizedAnalyticsPath(path);
  posthog.capture('$pageview', {
    $current_url: `${window.location.origin}${sanitizedPath}`,
    $pathname: sanitizedPath,
    $title: title,
  }, { send_instantly: true });

}
