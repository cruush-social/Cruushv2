import { useEffect, useRef } from 'react';
import { requestApi } from './apiClient';

type Listener = () => void | Promise<void>;
const listeners = new Set<Listener>();
const failed = new Set<Listener>();
const attempts = new Map<Listener, number>();
function notify(listener: Listener) {
  failed.delete(listener);
  const attempt = (attempts.get(listener) ?? 0) + 1;
  attempts.set(listener, attempt);
  void (async () => listener())().then(() => {
    if (attempts.get(listener) === attempt) failed.delete(listener);
  }).catch(() => {
    if (listeners.has(listener) && attempts.get(listener) === attempt) failed.add(listener);
  });
}
let revision: string | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let generation = 0;
let inFlight = false;

async function poll() {
  if (!listeners.size || document.visibilityState === 'hidden' || inFlight) return;
  const current = generation;
  inFlight = true;
  try {
    const result = await requestApi<{ revision: string }>('/api/content/visibility-revision');
    if (current !== generation || typeof result?.revision !== 'string') return;
    if (revision !== result.revision) {
      revision = result.revision;
      listeners.forEach(notify);
    } else {
      failed.forEach(notify);
    }
  } catch {
    // A failed check is not evidence that content permissions changed.
  } finally {
    if (current === generation) inFlight = false;
  }
}

export function refreshContentVisibility() {
  // The successful moderation response is authoritative even before the next poll.
  listeners.forEach(notify);
  void poll();
}

export function subscribeContentVisibility(listener: Listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('focus', poll);
    document.addEventListener('visibilitychange', poll);
    timer = setInterval(poll, 5000);
    void poll();
  } else if (revision !== null) {
    notify(listener);
  }
  return () => {
    listeners.delete(listener);
    failed.delete(listener);
    attempts.delete(listener);
    if (listeners.size) return;
    generation += 1;
    inFlight = false;
    revision = null;
    clearInterval(timer);
    window.removeEventListener('focus', poll);
    document.removeEventListener('visibilitychange', poll);
  };
}

/** Refresh mounted content without remounting its form or scroll container. */
export function useContentVisibilityRefresh(
  refresh: (isCurrent: () => boolean) => void | Promise<void>,
  identity?: string,
) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    let active = true;
    let request = 0;
    const unsubscribe = subscribeContentVisibility(() => {
      const current = ++request;
      return Promise.resolve(latest.current(() => active && current === request));
    });
    return () => { active = false; unsubscribe(); };
  }, [identity]);
}
