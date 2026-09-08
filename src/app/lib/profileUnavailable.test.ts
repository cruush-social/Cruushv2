import { describe, expect, it, vi } from 'vitest';
import { addProfileUnavailableListener, notifyProfileUnavailable } from './profileUnavailable';

describe('profileUnavailable', () => {
  it('tells whoever is listening which person the server refused', () => {
    const seen: string[] = [];
    const stop = addProfileUnavailableListener((userId) => seen.push(userId));

    notifyProfileUnavailable('gone-1');
    notifyProfileUnavailable('');
    stop();
    notifyProfileUnavailable('gone-2');

    // The empty id never fires, and nothing arrives after the listener stops.
    expect(seen).toEqual(['gone-1']);
  });

  it('is a no-op with no window', () => {
    expect(() => notifyProfileUnavailable('x')).not.toThrow();
    expect(typeof vi).toBe('object');
  });
});
