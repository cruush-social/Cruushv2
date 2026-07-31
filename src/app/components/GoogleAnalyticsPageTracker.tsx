import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { trackPageView } from '../lib/googleAnalytics';

export default function GoogleAnalyticsPageTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}
