import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapView, { createCruushVectorStyle, createMapMarkerBadge, getMapStyle } from './MapView';

const { MockMap, MockMarker, mapInstances, markerInstances } = vi.hoisted(() => {
  const mapInstances: MockMapInstance[] = [];
  const markerInstances: MockMarkerInstance[] = [];

  class MockMapInstance {
    static calls: unknown[] = [];
    container: HTMLElement;
    handlers = new Map<string, Array<(event?: unknown) => void>>();
    zoomIn = vi.fn();
    zoomOut = vi.fn();
    setCenter = vi.fn();
    setZoom = vi.fn();
    fitBounds = vi.fn();
    sources = new Map<string, any>();
    layers = new Map<string, any>();
    addSource = vi.fn((id: string, source: any) => {
      const storedSource = { ...source };
      storedSource.setData = vi.fn((data: any) => {
        storedSource.data = data;
      });
      this.sources.set(id, storedSource);
    });
    getSource = vi.fn((id: string) => this.sources.get(id));
    addLayer = vi.fn((layer: any) => {
      this.layers.set(layer.id, layer);
    });
    getLayer = vi.fn((id: string) => this.layers.get(id));
    removeLayer = vi.fn((id: string) => {
      this.layers.delete(id);
    });
    removeSource = vi.fn((id: string) => {
      this.sources.delete(id);
    });
    remove = vi.fn();

    constructor(options: { container: HTMLElement }) {
      this.container = options.container;
      MockMapInstance.calls.push(options);
      mapInstances.push(this);
    }

    on(event: string, handler: (event?: unknown) => void) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }

    trigger(event: string, payload?: unknown) {
      this.handlers.get(event)?.forEach((handler) => handler(payload));
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
  __esModule: true,
  default: {
    Map: MockMap,
    Marker: MockMarker,
  },
  Map: MockMap,
  Marker: MockMarker,
}));

describe('MapView', () => {
  beforeEach(() => {
    MockMap.calls = [];
    mapInstances.length = 0;
    markerInstances.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('initializes MapLibre and wires map and marker interactions', async () => {
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
            lastActiveLabel: 'Now',
            isCurrentUser: true,
            badge: createMapMarkerBadge(['Bottom'], []),
          },
          {
            id: 'user-1',
            displayName: 'Jordan',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            lastActiveLabel: '2m ago',
            badge: createMapMarkerBadge(['Top'], []),
          },
        ]}
      />
    );

    await waitFor(() => expect(MockMap.calls).toHaveLength(1));
    expect(MockMap.calls[0]).toEqual(expect.objectContaining({
      style: expect.objectContaining({
        sources: expect.objectContaining({
          openmaptiles: expect.objectContaining({
            type: 'vector',
            url: 'https://tiles.openfreemap.org/planet',
          }),
        }),
      }),
      minZoom: 10.5,
      maxBounds: [
        [-74.65, 40.35],
        [-73.45, 41.08],
      ],
      renderWorldCopies: false,
    }));
    expect(onMapReady).toHaveBeenCalledWith(mapInstances[0]);

    mapInstances[0].trigger('click');
    expect(onMapClick).toHaveBeenCalledTimes(1);

    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan on map' }));
    expect(onPinClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }));
    expect(markerInstances[1].element).toHaveAttribute('data-map-marker-pin', 'true');
    mapInstances[0].trigger('click', { originalEvent: { target: markerInstances[1].element } });
    expect(onMapClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Open You on map' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your approximate area')).toBeInTheDocument();
    expect(screen.queryByText('YOU')).not.toBeInTheDocument();
    expect(screen.queryByText('Now')).not.toBeInTheDocument();
    expect(screen.queryByText('2m ago')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('bottom')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your profile')).toBeInTheDocument();
    expect(screen.getByLabelText('top')).toBeInTheDocument();
    expect(screen.getByTestId('marker-badge-me')).toHaveClass('border-[#0BA8FF]/80');
    expect(screen.getByTestId('marker-badge-me').querySelector('svg')).toHaveClass('h-[1.0625rem]', 'w-[1.0625rem]');
    expect(screen.getByTestId('marker-badge-user-1')).toHaveClass('border-[#FF0072]/80');
    expect(screen.getByTestId('marker-heart-me')).toHaveAttribute('data-marker-theme', 'current');
    expect(screen.getByTestId('marker-heart-user-1')).toHaveAttribute('data-marker-theme', 'nearby');
    expect(screen.getByTestId('marker-current-fallback-me')).toBeInTheDocument();
    expect(screen.getByTestId('marker-current-fallback-me').querySelector('div')).not.toHaveClass('rounded-full', 'bg-black/70');
    expect(screen.getByTestId('marker-current-fallback-me').querySelector('svg')).toHaveClass('h-7', 'w-7', 'text-white');
    expect(screen.queryByTestId('marker-current-fallback-user-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('marker-heart-me')).toHaveClass('h-20', 'w-20');
    expect(markerInstances[0].element).toHaveClass('h-[88px]', 'w-[103px]');
    expect(markerInstances[0].element.className).not.toContain('drop-shadow');
    expect(markerInstances[1].element.className).not.toContain('drop-shadow');
    expect(screen.getByTestId('marker-heart-me').querySelector('filter')).toBeNull();
    expect(screen.getByTestId('marker-heart-user-1').querySelector('filter')).toBeNull();
  });

  it('does not recreate the map when the onMapReady callback identity changes', async () => {
    const firstOnMapReady = vi.fn();
    const secondOnMapReady = vi.fn();
    const onPinClick = vi.fn();
    const { rerender } = render(
      <MapView
        onMapReady={firstOnMapReady}
        onPinClick={onPinClick}
        markers={[]}
      />
    );

    await waitFor(() => expect(MockMap.calls).toHaveLength(1));
    expect(firstOnMapReady).toHaveBeenCalledWith(mapInstances[0]);

    rerender(
      <MapView
        onMapReady={secondOnMapReady}
        onPinClick={onPinClick}
        markers={[]}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(MockMap.calls).toHaveLength(1);
    expect(mapInstances[0].remove).not.toHaveBeenCalled();
    expect(secondOnMapReady).not.toHaveBeenCalled();
  });

  it('fits the discovery marker set when requested', async () => {
    render(
      <MapView
        fitToMarkers
        onPinClick={vi.fn()}
        focusCoordinates={{ approximateLatitude: 40.7128, approximateLongitude: -74.006 }}
        markers={[
          {
            id: 'me',
            displayName: 'You',
            approximateLatitude: 40.7128,
            approximateLongitude: -74.006,
            isCurrentUser: true,
          },
          {
            id: 'user-southwest',
            displayName: 'Jay',
            approximateLatitude: 40.6818,
            approximateLongitude: -74.039,
          },
          {
            id: 'user-northeast',
            displayName: 'Ren',
            approximateLatitude: 40.7398,
            approximateLongitude: -73.983,
          },
        ]}
      />
    );

    await waitFor(() => expect(mapInstances[0].fitBounds).toHaveBeenCalled());
    expect(mapInstances[0].fitBounds).toHaveBeenCalledWith(
      [
        [-74.039, 40.6818],
        [-73.983, 40.7398],
      ],
      expect.objectContaining({
        maxZoom: 14,
        padding: expect.objectContaining({
          bottom: 170,
          top: 140,
        }),
      })
    );
    expect(mapInstances[0].setZoom).not.toHaveBeenCalledWith(14);
  });

  it('does not reset the viewport after the initial discovery fit', async () => {
    const markers = [
      {
        id: 'me',
        displayName: 'You',
        approximateLatitude: 40.7128,
        approximateLongitude: -74.006,
        isCurrentUser: true,
      },
      {
        id: 'user-1',
        displayName: 'Jordan',
        approximateLatitude: 40.7138,
        approximateLongitude: -74.004,
        lastActiveLabel: '2m ago',
      },
    ];
    const { rerender } = render(
      <MapView
        fitToMarkers
        onPinClick={vi.fn()}
        focusCoordinates={{ approximateLatitude: 40.7128, approximateLongitude: -74.006 }}
        markers={markers}
      />
    );

    await waitFor(() => expect(mapInstances[0].fitBounds).toHaveBeenCalledTimes(1));

    rerender(
      <MapView
        fitToMarkers
        onPinClick={vi.fn()}
        focusCoordinates={{ approximateLatitude: 40.7128, approximateLongitude: -74.006 }}
        markers={markers.map((marker) => ({
          ...marker,
          lastActiveLabel: marker.id === 'user-1' ? 'just now' : marker.lastActiveLabel,
        }))}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(mapInstances[0].fitBounds).toHaveBeenCalledTimes(1);
    expect(mapInstances[0].setZoom).not.toHaveBeenCalledWith(14);

    rerender(
      <MapView
        fitToMarkers
        onPinClick={vi.fn()}
        focusCoordinates={{ approximateLatitude: 40.7128, approximateLongitude: -74.006 }}
        markers={markers.map((marker) => marker.id === 'user-1'
          ? {
              ...marker,
              approximateLatitude: 40.716,
              approximateLongitude: -74.001,
            }
          : marker)}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(mapInstances[0].fitBounds).toHaveBeenCalledTimes(1);
    expect(mapInstances[0].setZoom).not.toHaveBeenCalledWith(14);
  });

  it('renders NPC Ghost demo markers and blue demo radius circles', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'npc-ghost',
            displayName: 'NPC Ghost',
            approximateLatitude: 40.714,
            approximateLongitude: -74.004,
            displayMode: 'GHOST',
            animationHint: 'FADE_LAST_MINUTE',
            npcGhostDemo: true,
          },
        ]}
        demoRadiusCircles={[{
          center: {
            approximateLatitude: 40.714,
            approximateLongitude: -74.004,
          },
          radiusMeters: 1609,
        }]}
      />
    );

    await waitFor(() => expect(mapInstances[0]).toBeDefined());
    act(() => {
      mapInstances[0].trigger('load');
    });

    expect(await screen.findByTestId('marker-npc-ghost-halo-npc-ghost')).toBeInTheDocument();
    expect(screen.getByTestId('marker-heart-npc-ghost')).toHaveAttribute('data-marker-theme', 'npc-ghost-demo');
    await waitFor(() => {
      expect(mapInstances[0].addSource).toHaveBeenCalledWith(
        'npc-ghost-demo-radii',
        expect.objectContaining({ type: 'geojson' })
      );
    });
    const source = mapInstances[0].sources.get('npc-ghost-demo-radii');
    expect(source.data.features).toHaveLength(1);
    expect(mapInstances[0].addLayer).toHaveBeenCalledWith(expect.objectContaining({
      id: 'npc-ghost-demo-radii-line',
      paint: expect.objectContaining({
        'line-color': '#0BA8FF',
      }),
    }));
  });

  it('draws the owner Ghost Mode radius with a visible stroke on the dark map', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'me',
            displayName: 'You',
            approximateLatitude: 40.714,
            approximateLongitude: -74.004,
            displayMode: 'GHOST',
            isCurrentUser: true,
          },
        ]}
        radiusCircle={{
          center: {
            approximateLatitude: 40.714,
            approximateLongitude: -74.004,
          },
          radiusMeters: 1609,
        }}
      />
    );

    await waitFor(() => expect(mapInstances[0]).toBeDefined());
    act(() => {
      mapInstances[0].trigger('load');
    });

    await waitFor(() => {
      expect(mapInstances[0].addSource).toHaveBeenCalledWith(
        'owner-ghost-radius',
        expect.objectContaining({ type: 'geojson' })
      );
    });
    expect(mapInstances[0].addLayer).toHaveBeenCalledWith(expect.objectContaining({
      id: 'owner-ghost-radius-line',
      paint: expect.objectContaining({
        'line-color': '#1181FF',
        'line-opacity': 0.88,
        'line-width': 2.5,
      }),
    }));
  });

  it('renders photo markers with current and nearby styling', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'me',
            displayName: 'You',
            approximateLatitude: 40.73,
            approximateLongitude: -73.99,
            photo: 'https://example.com/me.jpg',
            isCurrentUser: true,
            lastActiveLabel: 'Now',
            badge: createMapMarkerBadge(['Vers'], []),
          },
          {
            id: 'user-photo',
            displayName: 'Kai',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            photo: 'https://example.com/kai.jpg',
            lastActiveLabel: '12m ago',
          },
        ]}
      />
    );

    expect(await screen.findByTestId('marker-photo-fill-me')).toHaveAttribute('href', 'https://example.com/me.jpg');
    expect(screen.getByTestId('marker-heart-me')).toHaveAttribute('data-has-photo', 'true');
    expect(screen.getByTestId('marker-heart-me')).toHaveAttribute('data-marker-theme', 'current');
    expect(screen.queryByTestId('marker-current-fallback-me')).not.toBeInTheDocument();
    expect(screen.getByTestId('marker-photo-fill-user-photo')).toHaveAttribute('href', 'https://example.com/kai.jpg');
    expect(screen.getByTestId('marker-heart-user-photo')).toHaveAttribute('data-has-photo', 'true');
    expect(screen.getByTestId('marker-heart-user-photo')).toHaveAttribute('data-marker-theme', 'nearby');
    expect(screen.queryByLabelText('versatile')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your profile')).toBeInTheDocument();
    expect(screen.getByTestId('marker-badge-me').querySelector('svg')).toHaveClass('h-[1.0625rem]', 'w-[1.0625rem]');
    expect(screen.queryByText('12m ago')).not.toBeInTheDocument();
  });

  it('renders mutual markers with the stable grey heart state', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'user-mutual',
            displayName: 'River',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            photo: 'https://example.com/river.jpg',
            badge: createMapMarkerBadge(['Bottom'], []),
            relationship: {
              kind: 'mutual_cruush',
              canMessage: true,
            },
          },
        ]}
      />
    );

    expect(await screen.findByTestId('marker-photo-fill-user-mutual')).toHaveAttribute('href', 'https://example.com/river.jpg');
    expect(screen.getByTestId('marker-heart-user-mutual')).toHaveAttribute('data-marker-theme', 'mutual');
    expect(screen.getByTestId('marker-heart-user-mutual')).toHaveClass('h-20', 'w-20');
    expect(markerInstances[0].element).toHaveClass('h-[88px]', 'w-[103px]');
    expect(screen.getByTestId('marker-badge-user-mutual')).toHaveClass('border-[#6f00ff]/80');
    expect(screen.getByLabelText('mutual cruush')).toBeInTheDocument();
    expect(screen.getByTestId('marker-relationship-user-mutual').querySelector('img')?.getAttribute('src')).toContain('safety-white');
  });

  it('keeps the positioned marker element stable on hover', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'user-hover',
            displayName: 'Noor',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            lastActiveLabel: '8m ago',
          },
        ]}
      />
    );

    expect(await screen.findByRole('button', { name: 'Open Noor on map' })).toBeInTheDocument();
    expect(markerInstances[0].element.className).not.toContain('hover:scale');
    expect(markerInstances[0].element.className).not.toContain('hover:drop-shadow');
    expect(markerInstances[0].element.className).not.toContain('transition-[filter]');
  });

  it('retries a default vector style error with raster fallback before showing a map error', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[]}
      />
    );

    await waitFor(() => expect(MockMap.calls).toHaveLength(1));

    act(() => {
      mapInstances[0].trigger('error', { error: new Error('tilejson failed') });
    });

    await waitFor(() => expect(MockMap.calls).toHaveLength(2));
    expect(mapInstances[0].remove).toHaveBeenCalledTimes(1);
    expect(MockMap.calls[1]).toEqual(expect.objectContaining({
      style: expect.objectContaining({
        sources: expect.objectContaining({
          osmRasterTiles: expect.objectContaining({
            type: 'raster',
            tiles: expect.arrayContaining(['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png']),
          }),
        }),
      }),
    }));
    expect(screen.queryByText(/Map tiles could not load/i)).not.toBeInTheDocument();

    act(() => {
      mapInstances[1].trigger('load');
    });

    await waitFor(() => expect(screen.queryByText(/Loading NYC map/i)).not.toBeInTheDocument());
    expect(screen.queryByText(/Map tiles could not load/i)).not.toBeInTheDocument();
  });

  it('retries the default vector style with raster fallback when map load hangs', async () => {
    vi.useFakeTimers();

    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[]}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(MockMap.calls).toHaveLength(1);
    expect(screen.getByText(/Loading NYC map/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4500);
    });

    expect(MockMap.calls).toHaveLength(2);
    expect(mapInstances[0].remove).toHaveBeenCalledTimes(1);
    expect(MockMap.calls[1]).toEqual(expect.objectContaining({
      style: expect.objectContaining({
        sources: expect.objectContaining({
          osmRasterTiles: expect.objectContaining({
            type: 'raster',
          }),
        }),
      }),
    }));

    act(() => {
      mapInstances[1].trigger('load');
    });

    expect(screen.queryByText(/Loading NYC map/i)).not.toBeInTheDocument();
  });

  it('clears the loading state when the raster fallback renders before load fires', async () => {
    vi.useFakeTimers();

    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[]}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      mapInstances[0].trigger('render');
      vi.advanceTimersByTime(4500);
    });

    expect(MockMap.calls).toHaveLength(2);
    expect(screen.getByText(/Loading NYC map/i)).toBeInTheDocument();

    act(() => {
      mapInstances[1].trigger('render');
      vi.advanceTimersByTime(1199);
    });

    expect(screen.getByText(/Loading NYC map/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByText(/Loading NYC map/i)).not.toBeInTheDocument();
  });

  it('does not show the map error banner for nonfatal tile errors after load', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[]}
      />
    );

    await waitFor(() => expect(MockMap.calls).toHaveLength(1));

    act(() => {
      mapInstances[0].trigger('load');
      mapInstances[0].trigger('error', { error: new Error('glyph tile failed') });
    });

    expect(screen.queryByText(/Map tiles could not load/i)).not.toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith('Nonfatal map tile error after load:', expect.any(Object));

    warnSpy.mockRestore();
  });

  it('uses hosting badges only when no known position badge exists', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'user-hosting',
            displayName: 'Mika',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            badge: createMapMarkerBadge(['unknown'], ['Can Host']),
          },
        ]}
      />
    );

    expect(await screen.findByRole('button', { name: 'Open Mika on map' })).toBeInTheDocument();
    expect(screen.queryByLabelText('can host')).not.toBeInTheDocument();
    expect(screen.queryByTestId('marker-badge-user-hosting')).not.toBeInTheDocument();
  });

  it('does not render a badge for users without known position or hosting data', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'user-empty',
            displayName: 'River',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            badge: createMapMarkerBadge([], []),
          },
        ]}
      />
    );

    expect(await screen.findByRole('button', { name: 'Open River on map' })).toBeInTheDocument();
    expect(screen.queryByTestId('marker-badge-user-empty')).not.toBeInTheDocument();
  });

  it('creates a custom dark vector style with the cruush map palette', () => {
    const style = createCruushVectorStyle() as any;
    const layerById = new Map<string, any>(
      style.layers.map((layer: any) => [layer.id, layer] as [string, any])
    );

    expect(style.sources.openmaptiles).toEqual({
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
    });
    expect(style.glyphs).toBeUndefined();
    expect(layerById.get('background')?.paint['background-color']).toBe('#080808');
    expect(layerById.get('major-roads')?.paint['line-color']).toBe('#242424');
    expect(layerById.has('building-fill')).toBe(false);
    expect(layerById.has('building-outline')).toBe(false);
    expect(layerById.get('minor-road-labels')?.layout['symbol-placement']).toBe('line');
    expect(layerById.get('minor-road-labels')?.layout['symbol-spacing']).toBe(120);
    expect(layerById.get('minor-road-labels')?.layout['text-font']).toEqual(['Cormorant Garamond']);
    expect(layerById.get('minor-road-labels')?.paint['text-color']).toBe('#7f7f7f');
    expect(layerById.has('poi-dots')).toBe(false);
    expect(layerById.has('poi-labels')).toBe(false);
    expect(layerById.get('secondary-road-labels')?.paint['text-color']).toBe('#a0a0a0');
    expect(layerById.get('primary-road-labels')?.paint['text-color']).toBe('#d0d0d0');
    expect(layerById.get('prominent-road-labels')?.paint['text-color']).toBe('#ffffff');
    expect(layerById.get('secondary-road-labels')?.layout['text-font']).toEqual(['Cormorant Garamond']);
    expect(layerById.get('primary-road-labels')?.layout['text-font']).toEqual(['Cormorant Garamond Bold', 'Cormorant Garamond']);
    expect(layerById.get('prominent-road-labels')?.layout['text-font']).toEqual(['Cormorant Garamond Bold', 'Cormorant Garamond']);
    expect(layerById.get('place-labels')?.layout['text-font']).toEqual(['Cormorant Garamond Bold', 'Cormorant Garamond']);
    expect(layerById.get('secondary-road-labels')?.layout['text-transform']).toBeUndefined();
    expect(layerById.get('primary-road-labels')?.layout['text-transform']).toBeUndefined();
    expect(layerById.get('prominent-road-labels')?.layout['text-transform']).toBeUndefined();
    expect(layerById.get('place-labels')?.layout['text-transform']).toBeUndefined();
    expect(layerById.get('place-labels')?.layout['text-letter-spacing']).toBe(0.035);
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
