import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, requestApiWithUploadRetry } from './apiClient';

describe('requestApiWithUploadRetry', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const okResponse = () => new Response(JSON.stringify({ data: { url: 'data:image/jpeg;base64,AA==' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  it('retries an upload whose connection dropped before any response', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(okResponse());

    const pending = requestApiWithUploadRetry<{ url: string }>('/api/profile-photos/prepare', { method: 'POST', body: new FormData() });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toEqual({ url: 'data:image/jpeg;base64,AA==' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retries and reports the API as unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Load failed'));

    const pending = requestApiWithUploadRetry('/api/profile-photos', { method: 'POST', body: new FormData() });
    const outcome = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(4000);

    const error = await outcome;
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe('API_UNAVAILABLE');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never repeats an upload the server answered', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Too large.' } }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(requestApiWithUploadRetry('/api/profile-photos', { method: 'POST', body: new FormData() })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
