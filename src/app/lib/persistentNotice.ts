const NOTICE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function noticeCookieName(key: string) {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getNoticeCookie(key: string) {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookieName = noticeCookieName(key);
  const cookiePrefix = `${cookieName}=`;
  const cookie = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(cookiePrefix));

  return cookie?.slice(cookiePrefix.length) ?? null;
}

function getSharedCookieDomain(hostname: string) {
  if (hostname === 'cruush.app' || hostname.endsWith('.cruush.app')) {
    return '.cruush.app';
  }

  return '';
}

export function hasPersistentNoticeFlag(key: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    if (window.localStorage.getItem(key) === 'true') {
      return true;
    }
  } catch {
    // Some mobile/privacy contexts can block localStorage.
  }

  return getNoticeCookie(key) === 'true';
}

export function setPersistentNoticeFlag(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, 'true');
  } catch {
    // The cookie still lets the dismissal survive localStorage failures.
  }

  if (typeof document === 'undefined') {
    return;
  }

  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const sharedDomain = getSharedCookieDomain(window.location.hostname);
  const domain = sharedDomain ? `; Domain=${sharedDomain}` : '';
  document.cookie = `${noticeCookieName(key)}=true; Max-Age=${NOTICE_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}${domain}`;
}

export function clearPersistentNoticeFlag(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Clearing the cookie below is still worth attempting.
  }

  if (typeof document === 'undefined') {
    return;
  }

  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const sharedDomain = getSharedCookieDomain(window.location.hostname);
  const domain = sharedDomain ? `; Domain=${sharedDomain}` : '';
  document.cookie = `${noticeCookieName(key)}=; Max-Age=0; Path=/; SameSite=Lax${secure}${domain}`;
}

/** Removes account notices even when only their cookie fallback remains. */
export function clearDeletedAccountNoticeFlags(userId: string) {
  if (typeof window === 'undefined') return;

  const firstPostKey = `cruush:first-feed-post-prompt-seen:${userId}`;
  const rewardPrefix = `cruush:plus-card:${userId}:`;
  const keys = [firstPostKey];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(rewardPrefix)) keys.push(key);
    }
  } catch { /* Cookie cleanup remains possible when storage is unavailable. */ }
  for (const key of keys) {
    try { clearPersistentNoticeFlag(key); } catch { /* Continue with the other copies. */ }
  }

  if (typeof document === 'undefined') return;
  const firstPostCookie = noticeCookieName(firstPostKey);
  const rewardCookiePrefix = noticeCookieName(rewardPrefix);
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    const sharedDomain = getSharedCookieDomain(window.location.hostname);
    for (const entry of document.cookie.split(';')) {
      const name = entry.trim().split('=')[0];
      if (name !== firstPostCookie && !name.startsWith(rewardCookiePrefix)) continue;
      // Remove both the current shared cookie and historical host-only copies.
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
      if (sharedDomain) {
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}; Domain=${sharedDomain}`;
      }
    }
  } catch { /* A blocked cookie store must not interrupt successful deletion. */ }
}
