import { useEffect, useState } from 'react';

/**
 * Several prompts mount together after onboarding and each used to decide on
 * its own whether to open, so a new account could meet three or four dialogs
 * stacked on top of each other. They now share one slot: whichever wants the
 * screen and sits highest in this order gets it, and the rest wait their turn.
 *
 * The order runs from the notice a member most needs to read to the one that
 * can wait longest.
 */
const PRIORITY = ['dl-mode-default', 'first-feed-post', 'side-quest', 'mobile-install'] as const;

export type ExclusivePopupId = (typeof PRIORITY)[number];

const waiting = new Set<ExclusivePopupId>();
const listeners = new Set<() => void>();

function holder(): ExclusivePopupId | null {
  return PRIORITY.find((id) => waiting.has(id)) ?? null;
}

function notify() {
  for (const listener of [...listeners]) {
    listener();
  }
}

/**
 * Returns whether this prompt may show right now. Pass whether it would show
 * if it were the only one; the answer is that, narrowed by whoever else is
 * waiting. A prompt that unmounts or stops wanting the screen releases it, so
 * the next one appears without needing to be told.
 */
export function useExclusivePopup(id: ExclusivePopupId, wantsToShow: boolean) {
  const [, bump] = useState(0);

  useEffect(() => {
    const listener = () => bump((count) => count + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (wantsToShow) {
      waiting.add(id);
    } else {
      waiting.delete(id);
    }

    notify();

    return () => {
      waiting.delete(id);
      notify();
    };
  }, [id, wantsToShow]);

  return wantsToShow && holder() === id;
}

/** Test helper: no prompt is waiting at the start of a test. */
export function resetExclusivePopupsForTest() {
  waiting.clear();
  notify();
}
