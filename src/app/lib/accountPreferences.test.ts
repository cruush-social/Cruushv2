import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { loadAccountPreferences, readAccountPreference, saveAccountPreference, resetAccountPreferences, flushAccountPreferences } from './accountPreferences';
import { invalidatePendingApiReads } from './apiClient';
const response = (value: unknown) => new Response(JSON.stringify({ data: value }));
const login = (id: string) => localStorage.setItem('cruush_user', JSON.stringify({ id }));
const records: Record<string, Record<string, unknown>> = {};
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); resetAccountPreferences(); invalidatePendingApiReads();
  for (const key of Object.keys(records)) delete records[key];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const owner = JSON.parse(localStorage.getItem('cruush_user')!).id;
    records[owner] ??= {};
    if (init?.method === 'PUT') {
      records[owner][decodeURIComponent(url.split('/').at(-1)!)] = JSON.parse(init.body as string).value;
      return response({ saved: true });
    }
    return response(records[owner]);
  }));
});
afterEach(() => vi.unstubAllGlobals());
it('restores across logout/login and a fresh browser cache, without crossing accounts', async () => {
  login('one'); await loadAccountPreferences();
  await saveAccountPreference('map.seeking', { roles: ['switch'] });
  expect(localStorage.length).toBe(1); expect(sessionStorage.length).toBe(0);
  localStorage.clear(); resetAccountPreferences(); invalidatePendingApiReads();
  login('two'); await loadAccountPreferences(); expect(readAccountPreference('map.seeking', { roles: [] })).toEqual({ roles: [] });
  login('one'); invalidatePendingApiReads(); await loadAccountPreferences();
  expect(readAccountPreference('map.seeking', { roles: [] })).toEqual({ roles: ['switch'] });
  await saveAccountPreference('map.seeking', { roles: [] });
  resetAccountPreferences(); invalidatePendingApiReads(); await loadAccountPreferences();
  expect(readAccountPreference('map.seeking', { roles: [] })).toEqual({ roles: [] });
});
it('does not replace a newer choice when an older hydration finishes after its save', async () => {
  login('one'); let release!: (r: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const loading = loadAccountPreferences();
  await saveAccountPreference('feed.seeking', { roles: ['top'] });
  release(response({ 'feed.seeking': { roles: ['old'] } })); await loading;
  expect(readAccountPreference('feed.seeking', { roles: [] })).toEqual({ roles: ['top'] });
});
it('ignores a response after switching accounts', async () => {
  login('one'); let release!: (r: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const loading = loadAccountPreferences();
  login('two'); resetAccountPreferences(); invalidatePendingApiReads(); await loadAccountPreferences();
  release(response({ 'messages.search': 'private' })); await loading;
  expect(readAccountPreference('messages.search', '')).toBe('');
});
it('flushes queued choices and retries a failed save without overwriting other preferences', async () => {
  login('one'); await loadAccountPreferences();
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  await expect(saveAccountPreference('feed.purgatory', 'only')).rejects.toThrow('unavailable');
  const second = saveAccountPreference('places.radiusMiles', 25);
  await flushAccountPreferences(); await second;
  expect(records.one).toEqual({ 'feed.purgatory': 'only', 'places.radiusMiles': 25 });
});
it('migrates legacy accessibility only for its recorded owner', async () => {
  localStorage.setItem('cruush:legacy-preference-owner','one');
  localStorage.setItem('cruush:accessibility-preferences',JSON.stringify({largerText:true,colorBlindMode:true}));
  login('two'); await loadAccountPreferences();
  expect(records.two).toEqual({});
  login('one'); invalidatePendingApiReads(); await loadAccountPreferences(); await flushAccountPreferences();
  expect(records.one['display.accessibility']).toMatchObject({largerText:true,colorVisionMode:'deuteranopia'});
  expect(localStorage.getItem('cruush:accessibility-preferences')).toBeNull();
});
it('still calls server logout when a pending preference cannot save', async () => {
  login('one'); await loadAccountPreferences();
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  await expect(saveAccountPreference('messages.search','preview')).rejects.toThrow();
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  const { signOut } = await import('./authApi');
  await signOut();
  expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).endsWith('/api/auth/logout'))).toBe(true);
});
