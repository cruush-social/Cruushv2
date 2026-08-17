import posthog from 'posthog-js';
import { getSanitizedAnalyticsPath } from './googleAnalytics';

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

let initialized = false;

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
  });
  initialized = true;

  return true;
}

export function trackPostHogPageView(
  path: string,
  title = typeof document === 'undefined' ? '' : document.title,
) {
  if (!initializePostHog()) {
    return false;
  }

  const sanitizedPath = getSanitizedAnalyticsPath(path);
  posthog.capture('$pageview', {
    $current_url: `${window.location.origin}${sanitizedPath}`,
    $pathname: sanitizedPath,
    $title: title,
  }, { send_instantly: true });

  return true;
}
