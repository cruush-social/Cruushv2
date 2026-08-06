import { hasPersistentNoticeFlag, setPersistentNoticeFlag } from './persistentNotice';
import { useEffect, useState } from 'react';

const DL_MODE_STORAGE_KEY = 'cruush:dl-mode-enabled';
const DL_MODE_CHANGED_EVENT = 'cruush:dl-mode-changed';
export const DL_MODE_DEFAULT_NOTICE_KEY = 'cruush:dl-mode-default-notice-seen';

export function isDlModeEnabled() {
  if (typeof window === 'undefined') {
    return true;
  }

  const storedValue = window.localStorage.getItem(DL_MODE_STORAGE_KEY);

  return storedValue === null ? true : storedValue === 'true';
}

export function setDlModeEnabled(enabled: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DL_MODE_STORAGE_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(DL_MODE_CHANGED_EVENT, {
    detail: {
      enabled,
    },
  }));
}

export function shouldShowDlModeDefaultNotice() {
  if (typeof window === 'undefined') {
    return false;
  }

  return !hasPersistentNoticeFlag(DL_MODE_DEFAULT_NOTICE_KEY);
}

export function markDlModeDefaultNoticeSeen() {
  if (typeof window === 'undefined') {
    return;
  }

  setPersistentNoticeFlag(DL_MODE_DEFAULT_NOTICE_KEY);
}

export function addDlModeChangedListener(listener: (enabled: boolean) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleCustomEvent = (event: Event) => {
    listener(Boolean((event as CustomEvent<{ enabled?: boolean }>).detail?.enabled));
  };
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === DL_MODE_STORAGE_KEY) {
      listener(event.newValue === 'true');
    }
  };

  window.addEventListener(DL_MODE_CHANGED_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(DL_MODE_CHANGED_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
}

export function useDlMode() {
  const [enabled, setEnabled] = useState(() => isDlModeEnabled());

  useEffect(() => addDlModeChangedListener(setEnabled), []);

  return enabled;
}

/** Missing classification is unsafe and therefore remains masked. */
export function shouldMaskPhoto(dlModeActive: boolean, explicit: boolean | null | undefined) {
  return dlModeActive && explicit === true;
}
