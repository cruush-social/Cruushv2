const DL_MODE_STORAGE_KEY = 'cruush:dl-mode-enabled';
const DL_MODE_CHANGED_EVENT = 'cruush:dl-mode-changed';

export function isDlModeEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(DL_MODE_STORAGE_KEY) === 'true';
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
