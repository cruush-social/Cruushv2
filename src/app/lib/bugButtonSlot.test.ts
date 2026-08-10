import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getBugButtonSlot,
  registerBugButtonSlot,
  subscribeToBugButtonSlot,
} from './bugButtonSlot';

describe('bugButtonSlot', () => {
  afterEach(() => {
    registerBugButtonSlot(null);
  });

  it('immediately synchronizes a subscriber when the map slot registered first', () => {
    const slot = document.createElement('div');
    const listener = vi.fn();
    registerBugButtonSlot(slot);

    const unsubscribe = subscribeToBugButtonSlot(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getBugButtonSlot()).toBe(slot);
    unsubscribe();
  });
});
