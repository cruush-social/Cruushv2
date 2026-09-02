type BugButtonSlotListener = () => void;

let slotElement: HTMLElement | null = null;
let slotElements: HTMLElement[] = [];
const listeners = new Set<BugButtonSlotListener>();

/**
 * Screens with crowded chrome (the map) register a slot so the bug report
 * trigger renders inside their own controls instead of floating over them.
 */
export function registerBugButtonSlot(element: HTMLElement | null) {
  if (element) {
    slotElements = [...slotElements.filter((candidate) => candidate !== element && candidate.isConnected), element];
    if (slotElement === element) {
      return;
    }
    slotElement = element;
    listeners.forEach((listener) => listener());
    return;
  }

  queueMicrotask(() => {
    slotElements = slotElements.filter((candidate) => candidate.isConnected);
    const nextSlot = slotElements.at(-1) ?? null;
    if (nextSlot === slotElement) {
      return;
    }
    slotElement = nextSlot;
    listeners.forEach((listener) => listener());
  });
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
