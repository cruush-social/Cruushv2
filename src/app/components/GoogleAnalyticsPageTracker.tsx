import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { trackPageView } from '../lib/googleAnalytics';
import { trackPostHogPageView } from '../lib/posthog';

export default function GoogleAnalyticsPageTracker() {
  const location = useLocation();

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    trackPageView(path);
    trackPostHogPageView(path);
  }, [location.pathname, location.search]);

  return null;
}
