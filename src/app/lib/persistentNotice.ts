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
