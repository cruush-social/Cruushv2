import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { lazyRoute } from './lazyRoute';

describe('lazyRoute', () => {
  const reload = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    reload.mockClear();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('reloads once when a chunk is missing, which is what a deploy causes', async () => {
    const load = vi.fn().mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
    const Component = lazyRoute(load as never) as unknown as { _payload: { _result: () => Promise<unknown> } };

    // Pull on the lazy payload the way React does when the route first renders.
    void (Component._payload._result as unknown as () => Promise<unknown>)();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('does not reload again inside the cooldown, so a broken chunk cannot loop', async () => {
    window.sessionStorage.setItem('cruush:chunk-reload-at', String(Date.now()));
    const load = vi.fn().mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
    const Component = lazyRoute(load as never) as unknown as { _payload: { _result: () => Promise<unknown> } };

    await expect((Component._payload._result as unknown as () => Promise<unknown>)()).rejects.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });
});
