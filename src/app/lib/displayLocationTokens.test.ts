import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDisplayLocationKeyCache, decryptDisplayLocationToken, preloadDisplayLocationKey } from './displayLocationTokens';
const { requestApi } = vi.hoisted(() => ({ requestApi: vi.fn() }));
vi.mock('./apiClient', () => ({ requestApi }));
const token = { version: 1, tokenId: 'token', keyId: 'key', ciphertext: 'AA', nonce: 'AA', expiresAtMs: Date.now() + 60_000, tokenVersion: 1 } as const;
const key = () => ({ version: 1, keyId: 'key', key: 'AA', expiresAtMs: Date.now() + 60_000 });
describe('display key loading', () => {
  beforeEach(() => { clearDisplayLocationKeyCache(); requestApi.mockReset();
    vi.stubGlobal('crypto', { subtle: {
      importKey: vi.fn().mockResolvedValue({}),
      decrypt: vi.fn().mockResolvedValue(new TextEncoder().encode(JSON.stringify({latE7: 407000000, lonE7: -739000000}))),
    }});
  });
  afterEach(() => vi.unstubAllGlobals());
  it('starts the key request before tokens arrive and reuses it for decryption', async () => {
    let resolve!: (value: unknown) => void;
    requestApi.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const preload = preloadDisplayLocationKey();
    expect(requestApi).toHaveBeenCalledTimes(1);
    const decrypted = decryptDisplayLocationToken(token);
    expect(requestApi).toHaveBeenCalledTimes(1);
    resolve(key());
    await preload; await decrypted;
    expect(crypto.subtle.decrypt).toHaveBeenCalledTimes(1);
  });
  it('shares one request and key import across a cold batch of 50 pins', async () => {
    requestApi.mockResolvedValue(key());
    const result = await Promise.all(Array.from({length:50}, () => decryptDisplayLocationToken(token)));
    expect(requestApi).toHaveBeenCalledTimes(1);
    expect(crypto.subtle.importKey).toHaveBeenCalledTimes(1);
    expect(crypto.subtle.decrypt).toHaveBeenCalledTimes(50);
    expect(result.every(p => p.latitude === 40.7)).toBe(true);
  });
  it('retries a failed request instead of retaining the rejection', async () => {
    requestApi.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(key());
    await expect(decryptDisplayLocationToken(token)).rejects.toThrow('offline');
    await expect(decryptDisplayLocationToken(token)).resolves.toMatchObject({latitude:40.7});
    expect(requestApi).toHaveBeenCalledTimes(2);
  });
  it('rejects an in-flight key after cache clear and fetches a fresh key', async () => {
    let resolve!: (value: unknown) => void;
    requestApi.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce(key());
    const old = decryptDisplayLocationToken(token);
    const rejected = expect(old).rejects.toThrow('cache was cleared');
    clearDisplayLocationKeyCache(); resolve(key()); await rejected;
    await expect(decryptDisplayLocationToken(token)).resolves.toMatchObject({latitude:40.7});
    expect(requestApi).toHaveBeenCalledTimes(2);
  });
  it('retains expiry refresh and key mismatch rejection', async () => {
    requestApi.mockResolvedValueOnce({...key(), expiresAtMs:Date.now()+1000}).mockResolvedValueOnce(key());
    await decryptDisplayLocationToken(token); await decryptDisplayLocationToken(token);
    expect(requestApi).toHaveBeenCalledTimes(2);
    await expect(decryptDisplayLocationToken({...token,keyId:'wrong'})).rejects.toThrow('stale');
    requestApi.mockResolvedValueOnce(key()); await decryptDisplayLocationToken(token);
    expect(requestApi).toHaveBeenCalledTimes(3);
  });
});
