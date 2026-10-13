import { useEffect, useRef, useState } from 'react';

/**
 * Several prompts mount together after onboarding and each used to decide on
 * its own whether to open, so a new account could meet three or four dialogs
 * stacked on top of each other. They now share one slot: whichever wants the
 * screen and sits highest in this order gets it, and the rest wait their turn.
 *
 * The order runs from the notice a member most needs to read to the one that
 * can wait longest.
 *
 * The map tutorial leads it for a different reason than the rest. It portals
 * to the body above the dialogs rather than being one, so while a dialog was
 * open its buttons sat inside that dialog's outside-click layer and did
 * nothing when tapped. Holding the slot keeps the two from ever overlapping.
 */
const PRIORITY = ['map-tutorial', 'push-permission', 'dl-mode-default', 'first-feed-post', 'mobile-install', 'purgatory-info', 'pulse-gesture', 'affiliate-login', 'earned-reward'] as const;

export type ExclusivePopupId = (typeof PRIORITY)[number];

const waiting = new Set<ExclusivePopupId>();
const listeners = new Set<() => void>();
export const LOGIN_POPUP_GAP_MS = 30_000;
const LOGIN_POPUPS = new Set<ExclusivePopupId>(['push-permission', 'mobile-install', 'purgatory-info', 'affiliate-login']);
let previousHolder: ExclusivePopupId | null = null;
let loginResumeAt = 0;
let resumeTimer: ReturnType<typeof setTimeout> | undefined;

function holder(): ExclusivePopupId | null {
  return PRIORITY.find((id) => waiting.has(id)
    && (!LOGIN_POPUPS.has(id) || Date.now() >= loginResumeAt)) ?? null;
}

function notify() {
  previousHolder = holder();
  for (const listener of [...listeners]) {
    listener();
  }
}

function release(id: ExclusivePopupId, wasPresented: boolean) {
  const wasShowing = previousHolder === id;
  waiting.delete(id);
  if (wasShowing && wasPresented && LOGIN_POPUPS.has(id)) {
    loginResumeAt = Date.now() + LOGIN_POPUP_GAP_MS;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(notify, LOGIN_POPUP_GAP_MS);
  }
  notify();
}

/**
 * Returns whether this prompt may show right now. Pass whether it would show
 * if it were the only one; the answer is that, narrowed by whoever else is
 * waiting. A prompt that unmounts or stops wanting the screen releases it, so
 * the next one appears without needing to be told.
 */
export function useExclusivePopup(id: ExclusivePopupId, wantsToShow: boolean, visible = wantsToShow) {
  const [, bump] = useState(0);
  const presented = useRef(false);
  if (visible && holder() === id) presented.current = true;

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
      release(id, presented.current);
      presented.current = false;
    }

    notify();

    return () => {
      release(id, presented.current);
      presented.current = false;
    };
  }, [id, wantsToShow]);

  return wantsToShow && holder() === id;
}

/** True only when every existing post-onboarding prompt has released the slot. */
export function usePopupQueueIdle() {
  const [, bump] = useState(0);

  useEffect(() => {
    const listener = () => bump((count) => count + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return waiting.size === 0 && Date.now() >= loginResumeAt;
}

/** Test helper: no prompt is waiting at the start of a test. */
export function resetExclusivePopupsForTest() {
  waiting.clear();
  previousHolder = null;
  loginResumeAt = 0;
  clearTimeout(resumeTimer);
  notify();
}
