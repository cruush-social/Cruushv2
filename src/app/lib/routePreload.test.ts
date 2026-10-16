import { describe, expect, it, vi } from 'vitest';
import { initialRouteKey, sharedRouteLoader } from './routePreload';
describe('initial route code preload', () => {
  it('loads only the requested page including exact profile edit precedence', () => {
    expect(initialRouteKey('/')).toBe('map');
    expect(initialRouteKey('/map')).toBe('map');
    expect(initialRouteKey('/profile/edit')).toBe('profileEdit');
    expect(initialRouteKey('/profile/member-id')).toBe('profile');
    expect(initialRouteKey('/settings/badges')).toBe('badges');
    expect(initialRouteKey('/store/pulse')).toBe('store');
    expect(initialRouteKey('/feed')).toBe('feed');
  });
  it('does not guess nested routes, admin routes or auth screens', () => {
    for (const path of ['/feed/photo-preview','/settings/privacy','/admin/moderation','/login','/verify-email']) {
      expect(initialRouteKey(path)).toBeUndefined();
    }
  });
});

 it('shares an in-flight preload with the route and retries failures', async () => {
   const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: 'page' });
   const shared = sharedRouteLoader(load);
   const first = shared();
   expect(shared()).toBe(first);
   await expect(first).rejects.toThrow('offline');
   await expect(shared()).resolves.toEqual({ default: 'page' });
   expect(load).toHaveBeenCalledTimes(2);
 });
