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
