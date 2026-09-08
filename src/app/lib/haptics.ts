import { getAccessibilityPreferences } from './accessibilityPreferences';

/**
 * A short pulse under anything a member presses, so the app answers back in the
 * hand rather than only on the screen.
 *
 * Three lengths, all short enough to read as one tap rather than a buzz: a
 * press, a heavier one for something that committed, and a double for something
 * that failed. Anything longer stops feeling like feedback and starts feeling
 * like a phone call.
 */
export const HAPTIC_PATTERNS = {
  press: 8,
  commit: 18,
  reject: [12, 40, 12],
} as const;

export type HapticPattern = keyof typeof HAPTIC_PATTERNS;

/**
 * iOS Safari has never shipped the Vibration API, so on an iPhone this is
 * always false and every call below is a no-op. The setting still appears:
 * hiding it would make the app look different on two phones for a reason the
 * member cannot see.
 */
export function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function hapticsEnabled() {
  return getAccessibilityPreferences().hapticFeedback !== false;
}

export function haptic(pattern: HapticPattern = 'press') {
  if (!canVibrate() || !hapticsEnabled()) {
    return false;
  }

  try {
    return navigator.vibrate(HAPTIC_PATTERNS[pattern] as number | number[]);
  } catch {
    // A browser can refuse to vibrate without warning, and a silent phone is
    // never a reason to break the interaction that asked for it.
    return false;
  }
}

const INTERACTIVE_SELECTOR = [
  'button',
  '[role="button"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="menuitem"]',
  '[role="option"]',
  'a[href]',
  'summary',
  'input[type="checkbox"]',
  'input[type="radio"]',
].join(',');

function isDisabled(element: Element) {
  return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
}

type HapticsWindow = Window & { __cruushHapticsInstalled?: boolean };

/**
 * One listener for the whole app rather than a call inside every control. A
 * press is felt wherever it happens, including in controls added later, and no
 * component has to remember to ask.
 */
export function installHaptics() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const hapticsWindow = window as HapticsWindow;
  if (hapticsWindow.__cruushHapticsInstalled) {
    return () => {};
  }

  const onPointerDown = (event: PointerEvent) => {
    // A mouse and a stylus have nothing to vibrate.
    if (event.pointerType !== 'touch') {
      return;
    }

    const target = event.target instanceof Element ? event.target.closest(INTERACTIVE_SELECTOR) : null;
    if (!target || isDisabled(target)) {
      return;
    }

    haptic('press');
  };

  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  hapticsWindow.__cruushHapticsInstalled = true;

  return () => {
    document.removeEventListener('pointerdown', onPointerDown);
    hapticsWindow.__cruushHapticsInstalled = false;
  };
}
