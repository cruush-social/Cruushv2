import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from './toast';
import {
  getAccessibilityPreferences,
  saveAccessibilityPreferences,
} from './accessibilityPreferences';

const vibrate = vi.fn(() => true);

vi.mock('sonner', () => {
  const base = vi.fn(() => 'id');
  return {
    toast: Object.assign(base, {
      success: vi.fn(() => 'id'),
      error: vi.fn(() => 'id'),
      warning: vi.fn(() => 'id'),
      dismiss: vi.fn(),
      message: vi.fn(() => 'id'),
    }),
  };
});

describe('toast', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vibrate.mockClear();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
  });

  it('is felt when something worked, and differently when it did not', () => {
    toast.success('Saved');
    toast.error('That did not send');

    expect(vibrate).toHaveBeenCalledTimes(2);
    // A failure is a double pulse, so it is not mistaken for a success.
    expect(vibrate.mock.calls[0][0]).toBe(18);
    expect(vibrate.mock.calls[1][0]).toEqual([12, 40, 12]);
  });

  it('stays silent once Haptic feedback is off', () => {
    saveAccessibilityPreferences({ ...getAccessibilityPreferences(), hapticFeedback: false });
    vibrate.mockClear();

    toast.success('Saved');
    toast.error('That did not send');

    expect(vibrate).not.toHaveBeenCalled();
  });

  it('still raises the toast, whatever the phone does', async () => {
    const { toast: sonnerToast } = await import('sonner');

    toast.success('Saved');

    expect(sonnerToast.success).toHaveBeenCalledWith('Saved');
  });
});
