import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireOneTimeDialog, onOneTimeDialogReleased, releaseOneTimeDialog } from './oneTimeDialogQueue';

describe('oneTimeDialogQueue', () => {
  beforeEach(() => {
    releaseOneTimeDialog('first');
    releaseOneTimeDialog('second');
  });

  it('allows only one active one-time dialog', () => {
    expect(acquireOneTimeDialog('first')).toBe(true);
    expect(acquireOneTimeDialog('second')).toBe(false);
    expect(acquireOneTimeDialog('first')).toBe(true);

    releaseOneTimeDialog('first');

    expect(acquireOneTimeDialog('second')).toBe(true);
  });

  it('notifies waiting dialogs when the active dialog is released', () => {
    const listener = vi.fn();
    const unsubscribe = onOneTimeDialogReleased(listener);

    expect(acquireOneTimeDialog('first')).toBe(true);
    releaseOneTimeDialog('first');

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
