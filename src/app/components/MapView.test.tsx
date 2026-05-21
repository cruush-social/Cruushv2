import { fireEvent, render, screen } from '@testing-library/react';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapView, { createCruushVectorStyle, getMapStyle } from './MapView';

const { MockMap, MockMarker, mapInstances, markerInstances } = vi.hoisted(() => {
  const mapInstances: MockMapInstance[] = [];
  const markerInstances: MockMarkerInstance[] = [];

  class MockMapInstance {
    static calls: unknown[] = [];
    container: HTMLElement;
    handlers = new Map<string, Array<() => void>>();
    zoomIn = vi.fn();
    zoomOut = vi.fn();
    setCenter = vi.fn();
    setZoom = vi.fn();
    remove = vi.fn();

    constructor(options: { container: HTMLElement }) {
      this.container = options.container;
      MockMapInstance.calls.push(options);
      mapInstances.push(this);
    }

    on(event: string, handler: () => void) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }

    trigger(event: string) {
      this.handlers.get(event)?.forEach((handler) => handler());
    }
  }

  class MockMarkerInstance {
    element: HTMLElement;
    coordinates: [number, number] | null = null;
    map: MockMapInstance | null = null;
    remove = vi.fn();

    constructor(options: { element: HTMLElement }) {
      this.element = options.element;
      markerInstances.push(this);
    }

    setLngLat(coordinates: [number, number]) {
      this.coordinates = coordinates;
      return this;
    }

    addTo(map: MockMapInstance) {
      this.map = map;
      map.container.appendChild(this.element);
      return this;
    }
  }

  return {
    MockMap: MockMapInstance,
    MockMarker: MockMarkerInstance,
    mapInstances,
    markerInstances,
  };
});

vi.mock('maplibre-gl', () => ({
  default: {
    Map: MockMap,
    Marker: MockMarker,
  },
}));

describe('MapView', () => {
  beforeEach(() => {
    MockMap.calls = [];
    mapInstances.length = 0;
    markerInstances.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('initializes MapLibre and wires map and marker interactions', () => {
    const onMapClick = vi.fn();
    const onMapReady = vi.fn();
    const onPinClick = vi.fn();

    render(
      <MapView
        onMapClick={onMapClick}
        onMapReady={onMapReady}
        onPinClick={onPinClick}
        focusCoordinates={{ approximateLatitude: 40.73, approximateLongitude: -73.99 }}
        markers={[
          {
            id: 'me',
            displayName: 'You',
            approximateLatitude: 40.73,
            approximateLongitude: -73.99,
            isCurrentUser: true,
          },
          {
            id: 'user-1',
            displayName: 'Jordan',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
          },
        ]}
      />
    );

    expect(MockMap.calls).toHaveLength(1);
    expect(MockMap.calls[0]).toEqual(expect.objectContaining({
      style: expect.objectContaining({
        sources: expect.objectContaining({
          openmaptiles: expect.objectContaining({
            type: 'vector',
            url: 'https://tiles.openfreemap.org/planet',
          }),
        }),
      }),
    }));
    expect(onMapReady).toHaveBeenCalledWith(mapInstances[0]);

    mapInstances[0].trigger('click');
    expect(onMapClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open Jordan on map' }));
    expect(onPinClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }));
    expect(screen.queryByRole('button', { name: 'Open You on map' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your approximate area')).toBeInTheDocument();
  });

  it('creates a custom dark vector style with the Cruush map palette', () => {
    const style = createCruushVectorStyle() as any;
    const layerById = new Map(style.layers.map((layer: any) => [layer.id, layer]));

    expect(style.sources.openmaptiles).toEqual({
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
    });
    expect(style.glyphs).toBe('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf');
    expect(layerById.get('background')?.paint['background-color']).toBe('#080808');
    expect(layerById.get('major-roads')?.paint['line-color']).toBe('#242424');
    expect(layerById.get('minor-road-labels')?.paint['text-color']).toBe('#505050');
    expect(layerById.get('secondary-road-labels')?.paint['text-color']).toBe('#a0a0a0');
    expect(layerById.get('primary-road-labels')?.paint['text-color']).toBe('#d0d0d0');
    expect(layerById.get('prominent-road-labels')?.paint['text-color']).toBe('#ffffff');
    expect(layerById.get('poi-labels')?.paint['text-color']).toBe('#c0c0c0');
    expect(layerById.get('poi-dots')?.paint['circle-stroke-color']).toBe('#383838');
  });

  it('creates valid MapLibre style JSON for the default vector map', () => {
    expect(validateStyleMin(createCruushVectorStyle())).toEqual([]);
  });

  it('keeps the explicit style URL override as highest priority', () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://example.com/custom-style.json');
    vi.stubEnv('VITE_MAP_TILE_URL', 'https://tiles.example.com/{z}/{x}/{y}.png');

    expect(getMapStyle()).toBe('https://example.com/custom-style.json');
  });

  it('uses the raster tile URL override as a fallback before the default vector style', () => {
    vi.stubEnv('VITE_MAP_TILE_URL', 'https://tiles.example.com/{z}/{x}/{y}.png');
    vi.stubEnv('VITE_MAP_ATTRIBUTION', '&copy; Example Tiles');

    const style = getMapStyle() as any;

    expect(style.sources.osmRasterTiles).toEqual({
      type: 'raster',
      tiles: ['https://tiles.example.com/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; Example Tiles',
    });
    expect(style.layers).toEqual([
      {
        id: 'osm-raster-tiles',
        type: 'raster',
        source: 'osmRasterTiles',
      },
    ]);
  });

  it('allows vector tile and glyph URLs to be overridden without switching to raster tiles', () => {
    vi.stubEnv('VITE_MAP_VECTOR_TILEJSON_URL', 'https://tiles.example.com/planet.json');
    vi.stubEnv('VITE_MAP_GLYPHS_URL', 'https://fonts.example.com/{fontstack}/{range}.pbf');

    const style = getMapStyle() as any;

    expect(style.sources.openmaptiles.url).toBe('https://tiles.example.com/planet.json');
    expect(style.glyphs).toBe('https://fonts.example.com/{fontstack}/{range}.pbf');
    expect(style.layers.some((layer: any) => layer.id === 'major-roads')).toBe(true);
  });
});
