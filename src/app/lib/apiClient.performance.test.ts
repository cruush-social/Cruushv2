import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidatePendingApiReads, requestApi, resolveMediaThumbnailUrl, resolveMediaUrl } from './apiClient';

const photo = '/api/media/assets/11111111-1111-4111-8111-111111111111/display';
const response = (value: unknown) => new Response(JSON.stringify({ data: value }));
function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('API loading performance', () => {
  beforeEach(() => invalidatePendingApiReads());
  afterEach(() => {
    invalidatePendingApiReads();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('shares simultaneous reads but returns independent values and fetches again after completion', async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response({ rows: [2] }));
    vi.stubGlobal('fetch', fetchMock);
    const first = requestApi<{ rows: number[] }>('/api/profiles/me');
    const second = requestApi<{ rows: number[] }>('/api/profiles/me');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(response({ rows: [1] }));
    const [a, b] = await Promise.all([first, second]);
    a.rows.push(9);
    expect(b.rows).toEqual([1]);
    await expect(requestApi('/api/profiles/me')).resolves.toEqual({ rows: [2] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps abortable reads and different queries independent', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response([])));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([
      requestApi('/api/posts?limit=10'), requestApi('/api/posts?limit=20'),
      requestApi('/api/posts?limit=10', { signal: new AbortController().signal }),
      requestApi('/api/posts?limit=10', { signal: new AbortController().signal }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('invalidates sharing both when a write starts and when it completes', async () => {
    const reads = [deferredResponse(), deferredResponse(), deferredResponse()];
    const write = deferredResponse();
    const fetchMock = vi.fn()
      .mockReturnValueOnce(reads[0].promise).mockReturnValueOnce(write.promise)
      .mockReturnValueOnce(reads[1].promise).mockReturnValueOnce(reads[2].promise);
    vi.stubGlobal('fetch', fetchMock);
    const old = requestApi('/api/profiles/me');
    const mutation = requestApi('/api/profiles/me', { method: 'PUT', body: '{}' });
    const during = requestApi('/api/profiles/me');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    write.resolve(response({ saved: true }));await mutation;
    const fresh = requestApi('/api/profiles/me');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    reads[0].resolve(response('old'));await old;
    const sharedFresh = requestApi('/api/profiles/me');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    reads[1].resolve(response('during'));reads[2].resolve(response('fresh'));
    await expect(Promise.all([during, fresh, sharedFresh])).resolves.toEqual(['during', 'fresh', 'fresh']);
  });

  it('does not retain failed reads', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response('recovered'));
    vi.stubGlobal('fetch', fetchMock);
    const results = await Promise.allSettled([requestApi('/api/billing/me'), requestApi('/api/billing/me')]);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(requestApi('/api/billing/me')).resolves.toBe('recovered');
  });

  it('stops sharing after account invalidation and cross-tab session changes', async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn().mockImplementation(() => pending.promise.then((result) => result.clone()));
    vi.stubGlobal('fetch', fetchMock);
    const first = requestApi('/api/profiles/me');
    invalidatePendingApiReads();
    const second = requestApi('/api/profiles/me');
    window.dispatchEvent(new StorageEvent('storage', { key: 'cruush_user' }));
    const third = requestApi('/api/profiles/me');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    pending.resolve(response(null));await Promise.all([first, second, third]);
  });
});

describe('protected preview variants', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('selects thumbnail bytes while preserving display URLs for full-size viewers', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.cruush.app');
    expect(resolveMediaThumbnailUrl(photo)).toBe(photo.replace('/display', '/thumbnail'));
    expect(resolveMediaThumbnailUrl('https://api.cruush.app'+photo+'?retry=1#photo'))
      .toBe('https://api.cruush.app'+photo.replace('/display', '/thumbnail')+'?retry=1#photo');
    expect(resolveMediaUrl(photo)).toBe(photo);
  });
  it('leaves external photos, legacy photos, thumbnails and upload previews unchanged', () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    for (const source of ['https://other.example'+photo, '/api/media/profile-photos/old.jpg', photo.replace('/display', '/thumbnail'), 'blob:preview', 'data:image/png;base64,example']) {
      expect(resolveMediaThumbnailUrl(source)).toBe(resolveMediaUrl(source));
    }
  });
});
