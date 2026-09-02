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
    const storedLayout = window.localStorage.getItem(DESKTOP_PAGE_LAYOUT_STORAGE_KEY);
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
    window.localStorage.setItem(DESKTOP_PAGE_LAYOUT_STORAGE_KEY, layout);
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
  return () => window.removeEventListener(DESKTOP_PAGE_LAYOUT_CHANGED_EVENT, handleChange);
}
