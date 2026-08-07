const DEFAULT_PRODUCTION_GOOGLE_ANALYTICS_ID = 'G-7KE474D0RP';
const GOOGLE_ANALYTICS_SCRIPT_ID = 'cruush-google-analytics';

type GoogleAnalyticsParameters = Record<string, string | number | boolean | undefined>;
type GoogleAnalyticsFunction = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: GoogleAnalyticsFunction;
  }
}

let initializedMeasurementId: string | null = null;

const SAFE_ANALYTICS_QUERY_PARAMS = new Set(['mode']);

function getAnalyticsOrigin() {
  if (typeof window === 'undefined') {
    return 'https://cruush.app';
  }

  return window.location.origin;
}

function normalizeAnalyticsPathname(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);

  if (segments[0] === 'profile' && segments[1] && segments[1] !== 'edit') {
    return '/profile/:userId';
  }

  if (segments[0] === 'chat' && segments[1] === 'group' && segments[2]) {
    return '/chat/group/:chatId';
  }

  if (segments[0] === 'chat' && segments[1]) {
    return '/chat/:chatId';
  }

  if (segments[0] === 'groups' && segments[1]) {
    return '/groups/:groupId';
  }

  if (segments[0] === 'events' && segments[1] && segments[2] === 'pass-guide') {
    return '/events/:eventId/pass-guide';
  }

  if (segments[0] === 'events' && segments[1]) {
    return '/events/:eventId';
  }

  if (segments[0] === 'places' && segments[1]) {
    return '/places/:placeId';
  }

  if (segments[0] === 'checkout' && segments[1]) {
    return '/checkout/:sessionId';
  }

  return pathname || '/';
}

export function getGoogleAnalyticsMeasurementId() {
  const configuredMeasurementId = import.meta.env.VITE_GOOGLE_ANALYTICS_ID?.trim();

  if (configuredMeasurementId) {
    return configuredMeasurementId;
  }

  return import.meta.env.PROD ? DEFAULT_PRODUCTION_GOOGLE_ANALYTICS_ID : '';
}

export function getSanitizedAnalyticsPath(path: string) {
  const url = new URL(path || '/', getAnalyticsOrigin());
  const pathname = normalizeAnalyticsPathname(url.pathname);
  const safeSearchParams = new URLSearchParams();

  for (const key of SAFE_ANALYTICS_QUERY_PARAMS) {
    const values = url.searchParams.getAll(key);

    for (const value of values) {
      if (value) {
        safeSearchParams.append(key, value.slice(0, 40));
      }
    }
  }

  const search = safeSearchParams.toString();

  return search ? `${pathname}?${search}` : pathname;
}

export function loadGoogleAnalytics(measurementId = getGoogleAnalyticsMeasurementId()) {
  if (!measurementId || typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };

  if (!document.getElementById(GOOGLE_ANALYTICS_SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = GOOGLE_ANALYTICS_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }

  if (initializedMeasurementId !== measurementId) {
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      send_page_view: false,
    });
    initializedMeasurementId = measurementId;
  }

  return true;
}

export function trackPageView(
  path: string,
  title = typeof document === 'undefined' ? '' : document.title,
) {
  const measurementId = getGoogleAnalyticsMeasurementId();

  if (!loadGoogleAnalytics(measurementId)) {
    return;
  }

  const sanitizedPath = getSanitizedAnalyticsPath(path);

  window.gtag?.('event', 'page_view', {
    page_title: title,
    page_location: `${getAnalyticsOrigin()}${sanitizedPath}`,
    page_path: sanitizedPath,
  });
}

export function trackCruushEvent(
  eventName: string,
  parameters: GoogleAnalyticsParameters = {},
) {
  if (!loadGoogleAnalytics()) {
    return;
  }

  window.gtag?.('event', eventName, {
    event_category: 'cruush_app',
    ...parameters,
  });
}
