/**
 * A profile the server refuses is not something to tap. Whoever hits the
 * refusal says so here, and the map drops that person on the spot rather than
 * leaving a tile that opens an empty card.
 */
const PROFILE_UNAVAILABLE_EVENT = 'cruush:profile-unavailable';

export function notifyProfileUnavailable(userId: string) {
  if (typeof window === 'undefined' || !userId) {
    return;
  }

  window.dispatchEvent(new CustomEvent<{ userId: string }>(PROFILE_UNAVAILABLE_EVENT, { detail: { userId } }));
}

export function addProfileUnavailableListener(listener: (userId: string) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handle = (event: Event) => {
    const userId = (event as CustomEvent<{ userId: string }>).detail?.userId;
    if (userId) {
      listener(userId);
    }
  };

  window.addEventListener(PROFILE_UNAVAILABLE_EVENT, handle);
  return () => window.removeEventListener(PROFILE_UNAVAILABLE_EVENT, handle);
}
