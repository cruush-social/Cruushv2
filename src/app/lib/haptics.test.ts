import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canVibrate, haptic, installHaptics } from './haptics';
import {
  getAccessibilityPreferences,
  saveAccessibilityPreferences,
} from './accessibilityPreferences';

const vibrate = vi.fn(() => true);

// jsdom ships no PointerEvent, so the pointerType rides on a plain event.
function pointerDown(target: Element, pointerType: string) {
  const event = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

function touch(target: Element) {
  pointerDown(target, 'touch');
}

describe('haptics', () => {
  let uninstall = () => {};

  beforeEach(() => {
    window.localStorage.clear();
    vibrate.mockClear();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
    document.body.innerHTML = '';
    uninstall = installHaptics();
  });

  afterEach(() => {
    uninstall();
  });

  it('is on without anyone turning it on', () => {
    expect(getAccessibilityPreferences().hapticFeedback).toBe(true);
    expect(haptic('press')).toBe(true);
  });

  it('stops entirely once the setting is off', () => {
    saveAccessibilityPreferences({ ...getAccessibilityPreferences(), hapticFeedback: false });
    vibrate.mockClear();

    document.body.innerHTML = '<button type="button">Send</button>';
    touch(document.querySelector('button')!);

    expect(haptic('press')).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('answers a press anywhere, without the control asking', () => {
    // A touch lands on whatever is drawn under the finger, usually an icon or a
    // label inside the control rather than the control itself.
    document.body.innerHTML = '<button type="button"><svg data-testid="icon"></svg></button>';
    touch(document.querySelector('[data-testid="icon"]')!);

    document.body.innerHTML = '<div role="switch" aria-checked="false"><span>on</span></div>';
    touch(document.querySelector('span')!);

    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('says nothing for a control that cannot be used', () => {
    document.body.innerHTML = '<button type="button" disabled>Send</button>';
    touch(document.querySelector('button')!);

    document.body.innerHTML = '<button type="button" aria-disabled="true">Send</button>';
    touch(document.querySelector('button')!);

    expect(vibrate).not.toHaveBeenCalled();
  });

  it('says nothing for plain text, or for a mouse', () => {
    document.body.innerHTML = '<p>Just a paragraph</p><button type="button">Send</button>';
    touch(document.querySelector('p')!);
    pointerDown(document.querySelector('button')!, 'mouse');

    expect(vibrate).not.toHaveBeenCalled();
  });

  it('is a no-op where the browser has no vibration, which is every iPhone', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true, writable: true });

    expect(canVibrate()).toBe(false);
    // The interaction must still go through; a phone that cannot buzz is not a
    // reason to throw.
    expect(() => haptic('commit')).not.toThrow();
    expect(haptic('commit')).toBe(false);
  });
});
