import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { trackPostHogPageView } from '../lib/posthog';

export default function PostHogPageTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPostHogPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}
