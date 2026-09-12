import { hasPersistentNoticeFlag, setPersistentNoticeFlag } from './persistentNotice';
import { useEffect, useState } from 'react';

const DL_MODE_STORAGE_KEY = 'cruush:dl-mode-enabled';
const DL_MODE_CHANGED_EVENT = 'cruush:dl-mode-changed';
const DL_MODE_SHOW_ONLY_EXCEPTION_STORAGE_KEY = 'cruush:dl-mode-show-only-exception';

export type DlModeShowOnlyException = 'none' | 'mutual_cruushes' | 'mutual_crowds';
export type NsfwPhotoRestriction = 'mutual_cruushes' | 'mutual_crowds';
export type DlModePhotoRelationship = { isMutualCruush?: boolean; sharesCrowd?: boolean; nsfwPhotoRestriction?: NsfwPhotoRestriction };

export function getNsfwPhotoRestriction(explicit: boolean | null | undefined, relationship?: DlModePhotoRelationship) {
  return explicit === true ? relationship?.nsfwPhotoRestriction : undefined;
}

export function getNsfwPhotoRestrictionLabel(restriction?: NsfwPhotoRestriction) {
  return restriction === 'mutual_cruushes' ? 'MUTUAL CRUUSHES ONLY'
    : restriction === 'mutual_crowds' ? 'MUTUAL CROWDS ONLY' : undefined;
}

const DL_MODE_SHOW_ONLY_EXCEPTIONS = new Set<DlModeShowOnlyException>([
  'none',
  'mutual_cruushes',
  'mutual_crowds',
]);
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

export function getDlModeShowOnlyException(): DlModeShowOnlyException {
  if (typeof window === 'undefined') return 'none';
  const value = window.localStorage.getItem(DL_MODE_SHOW_ONLY_EXCEPTION_STORAGE_KEY);
  return DL_MODE_SHOW_ONLY_EXCEPTIONS.has(value as DlModeShowOnlyException)
    ? value as DlModeShowOnlyException
    : 'none';
}

export function setDlModeShowOnlyException(value: DlModeShowOnlyException) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DL_MODE_SHOW_ONLY_EXCEPTION_STORAGE_KEY, value);
  window.dispatchEvent(new CustomEvent(DL_MODE_CHANGED_EVENT, {
    detail: { enabled: isDlModeEnabled() },
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
    if (event.key === DL_MODE_STORAGE_KEY || event.key === DL_MODE_SHOW_ONLY_EXCEPTION_STORAGE_KEY || event.key === null) {
      listener(isDlModeEnabled());
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
  const [state, setState] = useState(() => ({ enabled: isDlModeEnabled() }));

  useEffect(() => addDlModeChangedListener((enabled) => setState({ enabled })), []);

  return state.enabled;
}

/**
 * Only a photo classified explicit is masked. Owner restrictions apply even
 * with DL Mode off; otherwise the viewer's DL setting and exception apply.
 * Unclassified photos are treated as safe: they belong to accounts whose media
 * has not been through classification yet, and masking them hid new users
 * entirely. Revisit if unclassified NSFW ever shows up in practice.
 */
export function shouldMaskPhoto(
  dlModeActive: boolean,
  explicit: boolean | null | undefined,
  relationship?: DlModePhotoRelationship,
) {
  if (explicit !== true) return false;
  if (getNsfwPhotoRestriction(explicit, relationship)) return true;
  if (!dlModeActive) return false;

  const exception = getDlModeShowOnlyException();
  if (exception === 'mutual_cruushes' && relationship?.isMutualCruush === true) return false;
  if (exception === 'mutual_crowds' && relationship?.sharesCrowd === true) return false;
  return true;
}
