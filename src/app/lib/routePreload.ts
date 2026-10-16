// Match only the requested page; no component mounts or data access.
export function initialRouteKey(pathname: string) {
  if (pathname === '/' || pathname === '/map') return 'map';
  if (pathname === '/profile/edit') return 'profileEdit';
  if (/^\/profile(?:\/[^/]+)?$/.test(pathname)) return 'profile';
  const routes: Record<string, string> = {
    '/feed': 'feed',
    '/messages': 'messages',
    '/notifications': 'notifications',
    '/cruush': 'cruush',
    '/settings': 'settings',
    '/settings/badges': 'badges',
    '/store': 'store',
    '/store/pulse': 'store',
  };
  return routes[pathname];
}

// Share the preload with React.lazy; a failed speculative load remains retryable.
export function sharedRouteLoader<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= load().catch(error => {
      pending = null;
      throw error;
    });
    return pending;
  };
}
