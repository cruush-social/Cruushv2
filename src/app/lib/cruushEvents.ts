import type { CruushRecord } from './cruushApi';

export const CRUUSH_CHANGED_EVENT = 'cruush:changed';

export type CruushChangedPayload = {
  targetUserId: string;
  mutual: boolean;
  revoked?: boolean;
  permissions?: CruushRecord['permissions'];
};

export function emitCruushChanged(payload: CruushChangedPayload) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<CruushChangedPayload>(CRUUSH_CHANGED_EVENT, {
    detail: payload,
  }));
}

export function addCruushChangedListener(listener: (payload: CruushChangedPayload) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleCruushChanged = (event: Event) => {
    listener((event as CustomEvent<CruushChangedPayload>).detail);
  };

  window.addEventListener(CRUUSH_CHANGED_EVENT, handleCruushChanged);

  return () => {
    window.removeEventListener(CRUUSH_CHANGED_EVENT, handleCruushChanged);
  };
}
