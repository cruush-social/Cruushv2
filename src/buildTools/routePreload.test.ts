import { describe, expect, it } from 'vitest';
import { routePreloadFiles, routePreloadScript } from './routePreload';

describe('early route downloads', () => {
  it('executes the generated preload script without executing route code or duplicating links', () => {
    const script = routePreloadScript({ '/': ['assets/map.js'], '/feed': ['assets/feed.js'] }, '/');
    const run = new Function('location', 'document', script);
    document.head.innerHTML = '';
    run({ pathname: '/', search: '' }, document);
    run({ pathname: '/', search: '' }, document);
    expect(document.querySelectorAll('link[rel="modulepreload"]')).toHaveLength(1);
    expect(document.querySelector('link')?.getAttribute('href')).toMatch(/assets\/map\.js$/);
    expect(document.querySelector('script')).toBeNull();
    run({ pathname: '/feed/', search: '' }, document);
    expect(document.querySelectorAll('link')).toHaveLength(2);
    document.head.innerHTML = '';
    run({ pathname: '/', search: '?resetPasswordToken=example' }, document);
    expect(document.querySelector('link')).toBeNull();
  });
  it('loads only the selected route and its static dependency closure, including cycles once', () => {
    const chunk = (fileName: string, name: string, imports: string[] = []) => ({
      type: 'chunk' as const, fileName, facadeModuleId: `/repo/src/app/components/${name}.tsx`, imports,
    });
    const routes = routePreloadFiles({
      'map.js': chunk('map.js', 'MapHome', ['shared.js']),
      'view.js': chunk('view.js', 'MapView', ['shared.js', 'vendor.js']),
      'shared.js': chunk('shared.js', 'Shared', ['map.js']),
      'vendor.js': chunk('vendor.js', 'Vendor'),
      'profile.js': chunk('profile.js', 'ProfileView', ['shared.js']),
      'unopened.js': chunk('unopened.js', 'PlaceDetail'),
      'image.png': { type: 'asset' },
    });
    expect(routes['/map']).toEqual(['map.js', 'shared.js', 'view.js', 'vendor.js']);
    expect(routes['/']).toEqual(routes['/map']);
    expect(routes['/profile']).toEqual(['profile.js', 'shared.js', 'map.js']);
    expect(Object.values(routes).flat()).not.toContain('unopened.js');
    expect(routes['/reset-password']).toBeUndefined();
  });
});
