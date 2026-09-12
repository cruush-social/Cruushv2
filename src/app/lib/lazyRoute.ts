import { lazy, type ComponentType } from 'react';

const RELOAD_MARKER_KEY = 'cruush:chunk-reload-at';
/** One reload per minute at most, so a genuinely broken chunk cannot loop. */
const RELOAD_COOLDOWN_MS = 60_000;

function reloadedRecently() {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_MARKER_KEY) ?? '0');
    return Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markReloaded() {
  try {
    window.sessionStorage.setItem(RELOAD_MARKER_KEY, String(Date.now()));
  } catch {
    // A blocked sessionStorage only costs the loop guard, not the reload.
  }
}

/**
 * A deploy replaces every chunk filename. A tab still holding the previous
 * HTML then asks for a chunk that no longer exists, and the route it belongs to
 * simply fails to open. Reload once so the tab picks up the new HTML, rather
 * than leaving a page that will not load until the member figures it out.
 */
export function lazyRoute<T extends ComponentType<never>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await load();
    } catch (error) {
      if (typeof window !== 'undefined' && !reloadedRecently()) {
        markReloaded();
        window.location.reload();
        // Never resolves: the reload replaces this document.
        return await new Promise<{ default: T }>(() => undefined);
      }

      throw error;
    }
  });
}
