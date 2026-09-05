import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getBugButtonSlot,
  registerBugButtonSlot,
  releaseBugButtonSlot,
  resetBugButtonSlotsForTest,
  subscribeToBugButtonSlot,
} from './bugButtonSlot';

describe('bugButtonSlot', () => {
  afterEach(() => {
    resetBugButtonSlotsForTest();
    document.body.innerHTML = '';
  });

  it('immediately synchronizes a subscriber when the map slot registered first', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    const listener = vi.fn();
    registerBugButtonSlot(slot);

    const unsubscribe = subscribeToBugButtonSlot(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getBugButtonSlot()).toBe(slot);
    unsubscribe();
  });

  it('keeps the button when one screen tears down while another still wants it', () => {
    // A single-value registry let an unmounting screen clear the slot out from
    // under a screen that was still showing, so the button vanished.
    const mapSlot = document.createElement('div');
    const drawerSlot = document.createElement('div');
    document.body.append(mapSlot, drawerSlot);

    registerBugButtonSlot(mapSlot);
    registerBugButtonSlot(drawerSlot);
    expect(getBugButtonSlot()).toBe(drawerSlot);

    releaseBugButtonSlot(drawerSlot);
    expect(getBugButtonSlot()).toBe(mapSlot);
  });

  it('skips a slot whose screen has gone', () => {
    const gone = document.createElement('div');
    const live = document.createElement('div');
    document.body.append(gone, live);

    registerBugButtonSlot(live);
    registerBugButtonSlot(gone);
    gone.remove();

    expect(getBugButtonSlot()).toBe(live);
  });
});
