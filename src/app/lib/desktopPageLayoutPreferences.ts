import { hasPreferenceAccount, readAccountPreference, saveAccountPreference, subscribeAccountPreferences } from './accountPreferences';
import { useEffect, useState } from 'react';

export type DesktopPageLayout = 'popups' | 'fullscreen';

export const DESKTOP_PAGE_LAYOUT_STORAGE_KEY = 'cruush.desktopPageLayout';
export const DESKTOP_PAGE_LAYOUT_CHANGED_EVENT = 'cruush:desktop-page-layout-changed';
export const DEFAULT_DESKTOP_PAGE_LAYOUT: DesktopPageLayout = 'popups';

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    mobile?: boolean;
  };
};

export function isDesktopPageLayoutDevice(
  navigatorValue: NavigatorWithUserAgentData | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator as NavigatorWithUserAgentData,
) {
  if (!navigatorValue) {
    return true;
  }

  if (navigatorValue.userAgentData?.mobile === true) {
    return false;
  }

  const userAgent = navigatorValue.userAgent ?? '';
  const touchMac = /Macintosh/i.test(userAgent) && navigatorValue.maxTouchPoints > 1;

  return !touchMac && !/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

export function getDesktopPageLayout(): DesktopPageLayout {
  if (typeof window === 'undefined') {
    return DEFAULT_DESKTOP_PAGE_LAYOUT;
  }

  try {
    const storedLayout = hasPreferenceAccount() ? readAccountPreference('display.desktopLayout', DEFAULT_DESKTOP_PAGE_LAYOUT) : window.localStorage.getItem(DESKTOP_PAGE_LAYOUT_STORAGE_KEY);
    return storedLayout === 'fullscreen' ? 'fullscreen' : DEFAULT_DESKTOP_PAGE_LAYOUT;
  } catch {
    return DEFAULT_DESKTOP_PAGE_LAYOUT;
  }
}

export function saveDesktopPageLayout(layout: DesktopPageLayout) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (hasPreferenceAccount()) void saveAccountPreference('display.desktopLayout', layout).catch(() => undefined);
    else window.localStorage.setItem(DESKTOP_PAGE_LAYOUT_STORAGE_KEY, layout);
  } catch {
    // Keep the active screen usable when storage is unavailable.
  }

  window.dispatchEvent(new CustomEvent<DesktopPageLayout>(DESKTOP_PAGE_LAYOUT_CHANGED_EVENT, {
    detail: layout,
  }));
}

export function addDesktopPageLayoutChangedListener(
  listener: (layout: DesktopPageLayout) => void,
) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleChange = (event: Event) => {
    const layout = event instanceof CustomEvent ? event.detail : getDesktopPageLayout();
    listener(layout === 'fullscreen' ? 'fullscreen' : DEFAULT_DESKTOP_PAGE_LAYOUT);
  };

  window.addEventListener(DESKTOP_PAGE_LAYOUT_CHANGED_EVENT, handleChange);
  const unsubscribe = subscribeAccountPreferences(() => listener(getDesktopPageLayout()));
  return () => { unsubscribe(); window.removeEventListener(DESKTOP_PAGE_LAYOUT_CHANGED_EVENT, handleChange); };
}

/** Desktop and landscape tablets may choose popup pages; phones never do. */
export function canChoosePopupLayout(width: number, height: number, navigatorValue: NavigatorWithUserAgentData | undefined = typeof navigator === 'undefined' ? undefined : navigator) {
  const userAgent = navigatorValue?.userAgent ?? '';
  const tablet = /iPad|Tablet/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && (navigatorValue?.maxTouchPoints ?? 0) > 1)
    || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent));
  if (tablet) return width > height;
  const phone = navigatorValue?.userAgentData?.mobile === true || /iPhone|iPod|Mobile/i.test(userAgent);
  if (phone) return false;
  if (width >= 1024) return true;
  return Math.min(width, height) >= 600 && width > height;
}

export function useCanChoosePopupLayout() {
  const read = () => typeof window === 'undefined' || canChoosePopupLayout(window.innerWidth, window.innerHeight);
  const [allowed, setAllowed] = useState(read);
  useEffect(() => {
    const update = () => setAllowed(read());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return allowed;
}
