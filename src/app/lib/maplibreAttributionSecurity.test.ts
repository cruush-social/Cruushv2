import { describe, expect, it, vi } from 'vitest';
import maplibregl from 'maplibre-gl';

function renderAttribution(html: string) {
  const control = new maplibregl.AttributionControl({ compact: false, customAttribution: html });
  const map = {
    style: { tileManagers: {} },
    _getUIString: () => 'Attribution',
    getCanvasContainer: () => document.createElement('div'),
    on: vi.fn(),
    off: vi.fn(),
  };
  return control.onAdd(map as unknown as maplibregl.Map);
}

describe('installed MapLibre attribution sanitizer', () => {
  it('removes every adjacent dangerous attribute from the bundled runtime', () => {
    const container = renderAttribution('<a onclick="void 0" onmouseover="void 0" href="javascript:void 0" title="Credits">Map credits</a>');
    const link = container.querySelector('a')!;
    expect(link.textContent).toBe('Map credits');
    expect(link.getAttributeNames()).toEqual(['title']);
    expect(link.getAttribute('title')).toBe('Credits');
  });

  it('preserves safe attribution links and text', () => {
    const container = renderAttribution('<a href="https://example.invalid/credits" title="Credits">Map credits</a>');
    const link = container.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://example.invalid/credits');
    expect(link.textContent).toBe('Map credits');
  });
});
