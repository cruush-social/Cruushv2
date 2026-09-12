type BugButtonSlotListener = () => void;

/**
 * Screens with crowded chrome register a slot so the bug report trigger renders
 * inside their own controls instead of floating over them.
 *
 * The registry is a stack rather than one value. With a single value, a screen
 * unmounting cleared the slot even when another screen still wanted it, so the
 * button intermittently disappeared, most visibly on the map when a drawer
 * opened over it. Each element is remembered until its own screen releases it,
 * and the most recently registered live element holds the slot.
 */
const slots: HTMLElement[] = [];
const listeners = new Set<BugButtonSlotListener>();

function notify() {
  for (const listener of [...listeners]) {
    listener();
  }
}

export function registerBugButtonSlot(element: HTMLElement | null) {
  if (!element) {
    // React hands the ref null as the screen tears down. The node is still in
    // the tree at that instant, so the sweep runs a tick later, when it has
    // gone; any slot no longer in the document is dropped and the button is
    // told, so it leaves the dead node instead of vanishing with it.
    queueMicrotask(pruneDetachedSlots);
    return;
  }

  if (slots[slots.length - 1] === element) {
    return;
  }

  const existing = slots.indexOf(element);
  if (existing >= 0) {
    slots.splice(existing, 1);
  }

  slots.push(element);
  notify();
}

function pruneDetachedSlots() {
  let removed = false;
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    if (!slots[index].isConnected) {
      slots.splice(index, 1);
      removed = true;
    }
  }

  if (removed) {
    notify();
  }
}

/** Called when a screen tears down, so its slot stops holding the button. */
export function releaseBugButtonSlot(element: HTMLElement | null) {
  if (!element) {
    return;
  }

  const index = slots.indexOf(element);
  if (index < 0) {
    return;
  }

  slots.splice(index, 1);
  notify();
}

export function subscribeToBugButtonSlot(listener: BugButtonSlotListener) {
  listeners.add(listener);
  listener();

  return () => {
    listeners.delete(listener);
  };
}

export function getBugButtonSlot() {
  // A slot whose screen has gone leaves a detached node behind, so the holder
  // is the most recent element still in the document.
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    const candidate = slots[index];
    if (candidate.isConnected) {
      return candidate;
    }
  }

  return null;
}

/** Test helper: no screen holds the slot at the start of a test. */
export function resetBugButtonSlotsForTest() {
  slots.length = 0;
  notify();
}
