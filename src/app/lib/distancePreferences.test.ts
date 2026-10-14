import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestApi } from './apiClient';
import { act, renderHook, waitFor } from '@testing-library/react';
vi.mock('./apiClient', () => ({ requestApi: vi.fn() }));
import {
  DISTANCE_PREFERENCES_STORAGE_KEY,
  clearDeletedAccountDistancePreferences,
  formatDistanceLabel,
  formatDistanceWithAway,
  getDistancePreferences,
  saveDistancePreferences,
  useSyncDistancePreferences,
} from './distancePreferences';

describe('distancePreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(requestApi).mockImplementation(async (_path, init) => JSON.parse(String(init?.body)));
  });

  it('defaults to approximate mode when no preference is stored', () => {
    expect(getDistancePreferences()).toEqual({ mode: 'approximate' });
  });

  it('reads and saves precise and approximate preferences', async () => {
    await saveDistancePreferences({ mode: 'approximate' });
    expect(getDistancePreferences()).toEqual({ mode: 'approximate' });

    await saveDistancePreferences({ mode: 'precise' });
    expect(getDistancePreferences()).toEqual({ mode: 'precise' });
  });

  it('formats precise distance labels unchanged', () => {
    expect(formatDistanceLabel('0.4 mi', 'precise')).toBe('0.4 mi');
    expect(formatDistanceLabel('1.2 mi away', 'precise')).toBe('1.2 mi away');
    expect(formatDistanceLabel('You', 'precise')).toBe('You');
  });

  it('migrates the removed no-label preference to approximate', () => {
    window.localStorage.setItem(DISTANCE_PREFERENCES_STORAGE_KEY, JSON.stringify({ mode: 'off' }));
    expect(getDistancePreferences()).toEqual({ mode: 'approximate' });
  });

  it('removes numeric distances from approximate labels across profile and Feed formats', () => {
    for (const label of ['0.1 mi', '~2 mi', '0.4 mi away', '0.8 mi', '3.4 mi away', '<1 mi', '1-3 mi', '5 km']) {
      expect(formatDistanceLabel(label, 'approximate')).toBe('Nearby');
    }
    expect(formatDistanceLabel('You', 'approximate')).toBe('You');
    expect(formatDistanceLabel('Far far away', 'approximate')).toBe('Far far away');
    expect(formatDistanceLabel('Dark Room', 'approximate')).toBe('Dark Room');
    expect(formatDistanceWithAway('~2 mi', 'approximate')).toBe('Nearby');
  });

  it('preserves the saved preference on a failed migration and does not overwrite a later choice', async () => {
    window.localStorage.setItem(DISTANCE_PREFERENCES_STORAGE_KEY, JSON.stringify({ mode: 'precise' }));
    vi.mocked(requestApi).mockRejectedValueOnce(new Error('offline'));
    const failed = renderHook(() => useSyncDistancePreferences('member'));
    await act(async () => {});
    expect(getDistancePreferences().mode).toBe('approximate');
    expect(JSON.parse(window.localStorage.getItem(DISTANCE_PREFERENCES_STORAGE_KEY)!).mode).toBe('precise');
    failed.unmount();

    let finishMigration!: (value: { mode: 'precise' }) => void;
    vi.mocked(requestApi).mockResolvedValueOnce({ mode: 'approximate', configured: false });
    vi.mocked(requestApi).mockImplementationOnce(() => new Promise(resolve => { finishMigration = resolve; }));
    const replay = renderHook(() => useSyncDistancePreferences('member'));
    await waitFor(() => expect(finishMigration).toBeTypeOf('function'));
    let save!: Promise<void>;
    act(() => { save = saveDistancePreferences({ mode: 'approximate' }); });
    await act(async () => { finishMigration({ mode: 'precise' }); await save; });
    expect(getDistancePreferences().mode).toBe('approximate');
    expect(vi.mocked(requestApi)).toHaveBeenLastCalledWith('/api/privacy/distance-labels', expect.objectContaining({ body: JSON.stringify({ mode: 'approximate' }) }));
    replay.unmount();
  });

  it('does not expose numeric labels after a failed precise preference save', async () => {
    vi.mocked(requestApi).mockRejectedValueOnce(new Error('offline'));
    expect(await saveDistancePreferences({ mode: 'precise' }).then(() => 'unexpected success', error => error.message)).toBe('offline');
    expect(getDistancePreferences().mode).toBe('approximate');
  });

  it('does not restore a deleted account preference when its pending sync finishes', async () => {
    let finishSync!: (value: { mode: 'precise'; configured: boolean }) => void;
    localStorage.setItem(`${DISTANCE_PREFERENCES_STORAGE_KEY}:owner`, 'deleted-user');
    localStorage.setItem(DISTANCE_PREFERENCES_STORAGE_KEY, '{"mode":"precise"}');
    vi.mocked(requestApi).mockImplementationOnce(() => new Promise(resolve => { finishSync = resolve; }));
    const sync = renderHook(() => useSyncDistancePreferences('deleted-user'));
    await waitFor(() => expect(finishSync).toBeTypeOf('function'));

    act(() => clearDeletedAccountDistancePreferences('deleted-user', true));
    await act(async () => finishSync({ mode: 'precise', configured: true }));

    expect(localStorage.getItem(DISTANCE_PREFERENCES_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(`${DISTANCE_PREFERENCES_STORAGE_KEY}:owner`)).toBeNull();
    expect(getDistancePreferences().mode).toBe('approximate');
    sync.unmount();
  });
});
