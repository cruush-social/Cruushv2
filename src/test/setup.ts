import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverMock;

Element.prototype.scrollIntoView ??= function scrollIntoView() {};

// This jsdom build ships no Web Storage, so every suite that reads DL Mode or
// any other stored preference died in beforeEach instead of running.
class MemoryStorage implements Storage {
  #entries = new Map<string, string>();

  get length() {
    return this.#entries.size;
  }

  clear() {
    this.#entries.clear();
  }

  getItem(key: string) {
    return this.#entries.get(String(key)) ?? null;
  }

  key(index: number) {
    return [...this.#entries.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.#entries.delete(String(key));
  }

  setItem(key: string, value: string) {
    this.#entries.set(String(key), String(value));
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (!window[name]) {
    Object.defineProperty(window, name, { configurable: true, value: new MemoryStorage() });
  }
}
