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

export function getGoogleAnalyticsMeasurementId() {
  const configuredMeasurementId = import.meta.env.VITE_GOOGLE_ANALYTICS_ID?.trim();

  if (configuredMeasurementId) {
    return configuredMeasurementId;
  }

  return import.meta.env.PROD ? DEFAULT_PRODUCTION_GOOGLE_ANALYTICS_ID : '';
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
      send_page_view: false
    });
    initializedMeasurementId = measurementId;
  }

  return true;
}

export function trackPageView(
  path: string,
  title = typeof document === 'undefined' ? '' : document.title
) {
  const measurementId = getGoogleAnalyticsMeasurementId();

  if (!loadGoogleAnalytics(measurementId)) {
    return;
  }

  window.gtag?.('event', 'page_view', {
    page_title: title,
    page_location: window.location.href,
    page_path: path
  });
}

export function trackCruushEvent(
  eventName: string,
  parameters: GoogleAnalyticsParameters = {}
) {
  if (!loadGoogleAnalytics()) {
    return;
  }

  window.gtag?.('event', eventName, {
    event_category: 'cruush_app',
    ...parameters
  });
}
