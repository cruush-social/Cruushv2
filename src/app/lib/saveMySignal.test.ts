import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveMySignal } from './profileApi';

/**
 * Editing the signal from the Pulse sheet used to PUT the whole profile, built
 * by spreading a server record into the strict payload schema, so the write was
 * rejected and the edit silently never landed. It goes to a narrow route now.
 */
describe('saveMySignal', () => {
  it('cuts off pasted or legacy overlong signals before sending', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ data: { signal: 'a'.repeat(35) } }) });
    vi.stubGlobal('fetch', fetchMock);
    await saveMySignal('a'.repeat(35) + 'overflow');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).signal).toBe('a'.repeat(35));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends only the signal and returns what the server stored', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ data: { signal: 'Out tonight' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const saved = await saveMySignal('Out tonight');

    expect(saved).toBe('Out tonight');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/profiles/me/signal');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ signal: 'Out tonight' });
  });
});
