type BugButtonSlotListener = () => void;

let slotElement: HTMLElement | null = null;
const listeners = new Set<BugButtonSlotListener>();

/**
 * Screens with crowded chrome (the map) register a slot so the bug report
 * trigger renders inside their own controls instead of floating over them.
 */
export function registerBugButtonSlot(element: HTMLElement | null) {
  if (slotElement === element) {
    return;
  }

  slotElement = element;
  listeners.forEach((listener) => listener());
}

export function subscribeToBugButtonSlot(listener: BugButtonSlotListener) {
  listeners.add(listener);
  listener();

  return () => {
    listeners.delete(listener);
  };
}

export function getBugButtonSlot() {
  return slotElement;
}
