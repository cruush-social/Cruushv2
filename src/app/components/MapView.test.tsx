import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapView, { createCruushVectorStyle, createMapMarkerBadge, getMapStyle } from './MapView';
import { HEART_PIN_PHOTO_PATH } from '../lib/heartPin';

const GLASS_HEART_BORDER = 'rgba(255, 255, 255, 0.72)';

const { MockMap, MockMarker, mapInstances, markerInstances } = vi.hoisted(() => {
  const mapInstances: MockMapInstance[] = [];
  const markerInstances: MockMarkerInstance[] = [];

  class MockMapInstance {
    static calls: unknown[] = [];
    container: HTMLElement;
    handlers = new Map<string, Array<(event?: unknown) => void>>();
    style?: unknown;
    center: [number, number] | null = null;
    zoom = 12;
    pitch = 0;
    bearing = 0;
    zoomIn = vi.fn();
    zoomOut = vi.fn();
    setCenter = vi.fn((center: [number, number]) => {
      this.center = center;
    });
    setZoom = vi.fn((zoom: number) => {
      this.zoom = zoom;
    });
    getZoom = vi.fn(() => this.zoom);
    setPitch = vi.fn((pitch: number) => {
      this.pitch = pitch;
    });
    setBearing = vi.fn((bearing: number) => {
      this.bearing = bearing;
    });
    easeTo = vi.fn((options: { center?: [number, number]; zoom?: number; pitch?: number; bearing?: number }) => {
      if (options.center) {
        this.center = options.center;
      }
      if (typeof options.zoom === 'number') {
        this.zoom = options.zoom;
      }
      if (typeof options.pitch === 'number') {
        this.pitch = options.pitch;
      }
      if (typeof options.bearing === 'number') {
        this.bearing = options.bearing;
      }
    });
    setStyle = vi.fn((style: unknown) => {
      this.style = style;
    });
    setLight = vi.fn();
    fitBounds = vi.fn();
    sources = new Map<string, any>();
    layers = new Map<string, any>();
    getStyle = vi.fn(() => ({
      layers: [
        { id: 'background', type: 'background' },
        { id: 'landuse-blocks', type: 'fill' },
        { id: 'minor-roads', type: 'line' },
        { id: 'place-labels', type: 'symbol' },
      ],
    }));
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
    options: { element: HTMLElement; offset?: unknown; subpixelPositioning?: boolean };
    coordinates: [number, number] | null = null;
    map: MockMapInstance | null = null;
    remove = vi.fn(() => {
      this.element.remove();
    });

    constructor(options: { element: HTMLElement; offset?: unknown; subpixelPositioning?: boolean }) {
      this.element = options.element;
      this.options = options;
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

vi.mock('canvas-confetti', () => ({
  __esModule: true,
  default: vi.fn(),
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
    expect(screen.getByTestId('marker-badge-me')).toHaveClass('cruush-glass-soft', 'right-2', 'top-1/2', '-translate-y-1/2', 'border-[#0BA8FF]/80');
    expect(screen.getByTestId('marker-badge-me').querySelector('svg')).toHaveClass('h-[1.0625rem]', 'w-[1.0625rem]');
    expect(screen.getByTestId('marker-badge-user-1')).toHaveClass('cruush-glass-soft', 'right-1.5', 'top-1/2', '-translate-y-1/2', 'border-[#FF0072]/80');
    expect(screen.getByTestId('marker-heart-me')).toHaveAttribute('data-marker-theme', 'current');
    expect(screen.getByTestId('marker-heart-me').querySelector('.cruush-heart-glass-base')).toHaveAttribute('stroke', GLASS_HEART_BORDER);
    expect(screen.getByTestId('marker-heart-me').querySelector('.cruush-heart-glass-theme-border')).toHaveAttribute('stroke', GLASS_HEART_BORDER);
    expect(Array.from(screen.getByTestId('marker-heart-me').querySelectorAll('stop')).map((stop) => stop.getAttribute('stop-color'))).toEqual([
      '#00B8FF',
      '#0A7DF4',
      '#3236D4',
    ]);
    expect(screen.getByTestId('marker-heart-user-1')).toHaveAttribute('data-marker-theme', 'nearby');
    expect(screen.getByTestId('marker-current-fallback-me')).toBeInTheDocument();
    expect(screen.getByTestId('marker-current-fallback-me').querySelector('div')).not.toHaveClass('rounded-full', 'bg-black/70');
    expect(screen.getByTestId('marker-current-fallback-me').querySelector('svg')).toHaveClass('h-7', 'w-7', 'text-white');
    expect(screen.queryByTestId('marker-current-fallback-user-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('marker-heart-me')).toHaveClass('cruush-heart-glass-svg', 'h-20', 'w-20');
    expect(markerInstances[0].element).toHaveClass('h-[88px]', 'w-[103px]');
    expect(markerInstances[0].element.className).not.toContain('drop-shadow');
    expect(markerInstances[1].element.className).not.toContain('drop-shadow');
    expect(screen.getByTestId('marker-heart-me').querySelector('filter')).toBeNull();
    expect(screen.getByTestId('marker-heart-user-1').querySelector('filter')).toBeNull();
  });

  it('zooms to a mobile marker and shows its signal before opening the profile', async () => {
    const onPinClick = vi.fn();

    render(
      <MapView
        mobileSignalPreview
        onPinClick={onPinClick}
        markers={[
          {
            id: 'me',
            displayName: 'You',
            approximateLatitude: 40.73,
            approximateLongitude: -73.99,
            isCurrentUser: true,
          },
          {
            id: 'user-signal',
            displayName: 'Jordan',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            signal: '30m, 5\'8", 160lb, 6", average build',
          },
        ]}
      />
    );

    expect(await screen.findByTestId('marker-mobile-signal-me')).toHaveTextContent('You');

    fireEvent.click(await screen.findByRole('button', { name: 'Preview Jordan signal on map' }));

    expect(onPinClick).not.toHaveBeenCalled();
    expect(mapInstances[0].easeTo).toHaveBeenCalledWith(expect.objectContaining({
      center: [-74.01, 40.72],
      zoom: 15.6,
    }));
    expect(await screen.findByTestId('marker-mobile-signal-user-signal')).toHaveTextContent('30m, 5\'8", 160lb, 6", average build');
    expect(document.querySelectorAll('[data-mobile-signal-active="true"]')).toHaveLength(1);

    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan profile' }));

    expect(onPinClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-signal' }));
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
          bottom: 290,
          right: 220,
          top: 165,
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

  it('does not reapply focused zoom when marker rendering changes after user zooms', async () => {
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
        onPinClick={vi.fn()}
        focusCoordinates={{ approximateLatitude: 40.7128, approximateLongitude: -74.006 }}
        markers={markers}
      />
    );

    await waitFor(() => expect(mapInstances[0].setZoom).toHaveBeenCalledWith(14));
    expect(mapInstances[0].setCenter).toHaveBeenCalledTimes(1);
    expect(mapInstances[0].setZoom).toHaveBeenCalledTimes(1);

    rerender(
      <MapView
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

    expect(mapInstances[0].setCenter).toHaveBeenCalledTimes(1);
    expect(mapInstances[0].setZoom).toHaveBeenCalledTimes(1);
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

  it('draws app-color user heatmap below streets and labels when enabled by parent controls', async () => {
    const onHeatmapAvailabilityChange = vi.fn();
    const markers = [
      {
        id: 'me',
        displayName: 'You',
        approximateLatitude: 40.714,
        approximateLongitude: -74.004,
        isCurrentUser: true,
      },
      {
        id: 'user-heat-a',
        displayName: 'Heat A',
        approximateLatitude: 40.718,
        approximateLongitude: -74.002,
      },
      {
        id: 'npc-ghost',
        displayName: 'NPC Ghost',
        approximateLatitude: 40.719,
        approximateLongitude: -74.003,
        npcGhostDemo: true,
      },
    ];
    const { rerender } = render(
      <MapView
        onPinClick={vi.fn()}
        markers={markers}
        onHeatmapAvailabilityChange={onHeatmapAvailabilityChange}
      />
    );

    expect(screen.queryByRole('button', { name: /heat map/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mapInstances[0]).toBeDefined();
    });
    expect(onHeatmapAvailabilityChange).toHaveBeenLastCalledWith(true);

    act(() => {
      mapInstances[0].trigger('load');
    });

    await waitFor(() => {
      expect(mapInstances[0].addSource).toHaveBeenCalledWith(
        'cruush-user-heatmap',
        expect.objectContaining({ type: 'geojson' })
      );
    });
    const heatmapSource = mapInstances[0].sources.get('cruush-user-heatmap');
    expect(heatmapSource.data.features).toHaveLength(1);
    expect(heatmapSource.data.features[0].geometry.coordinates).toEqual([-74.002, 40.718]);

    const heatmapLayerCall = mapInstances[0].addLayer.mock.calls.find(([layer]) => layer.id === 'cruush-user-heatmap-layer');
    expect(heatmapLayerCall?.[1]).toBe('place-labels');
    expect(heatmapLayerCall?.[0]).toEqual(expect.objectContaining({
      id: 'cruush-user-heatmap-layer',
      type: 'heatmap',
      paint: expect.objectContaining({
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1.35, 14, 2.55, 16, 3.35],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 38, 14, 74, 16, 108],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0.62, 13, 0.86, 16.75, 0.74],
        'heatmap-color': expect.arrayContaining([
          'rgba(255, 0, 114, 0.44)',
          'rgba(111, 0, 255, 0.7)',
          'rgba(56, 38, 255, 0.82)',
          'rgba(17, 129, 255, 0.94)',
        ]),
      }),
    }));

    rerender(
      <MapView
        onPinClick={vi.fn()}
        markers={markers}
        heatmapEnabled={false}
        onHeatmapAvailabilityChange={onHeatmapAvailabilityChange}
      />
    );

    await waitFor(() => {
      expect(mapInstances[0].removeLayer).toHaveBeenCalledWith('cruush-user-heatmap-layer');
      expect(mapInstances[0].removeSource).toHaveBeenCalledWith('cruush-user-heatmap');
    });
    expect(screen.queryByRole('button', { name: /heat map/i })).not.toBeInTheDocument();
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
    expect(screen.getByTestId('marker-heart-me').querySelector('path[stroke]')).toHaveAttribute('stroke', GLASS_HEART_BORDER);
    expect(screen.getByTestId('marker-heart-me').querySelector('.cruush-heart-glass-theme-border')).toHaveAttribute('stroke', GLASS_HEART_BORDER);
    expect(screen.getByTestId('marker-heart-me').querySelector('clipPath path')).toHaveAttribute('d', HEART_PIN_PHOTO_PATH);
    expect(screen.getByTestId('marker-heart-me').querySelector('.cruush-heart-glass-rim')).toBeInTheDocument();
    expect(screen.queryByTestId('marker-current-fallback-me')).not.toBeInTheDocument();
    expect(screen.getByTestId('marker-photo-fill-user-photo')).toHaveAttribute('href', 'https://example.com/kai.jpg');
    expect(screen.getByTestId('marker-photo-fill-user-photo').getAttribute('clip-path')).toContain('marker-photo-clip-user-photo');
    expect(screen.getByTestId('marker-heart-user-photo')).toHaveAttribute('data-has-photo', 'true');
    expect(screen.getByTestId('marker-heart-user-photo')).toHaveAttribute('data-marker-theme', 'nearby');
    expect(screen.queryByLabelText('versatile')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your profile')).toBeInTheDocument();
    expect(screen.getByTestId('marker-badge-me')).toHaveClass('cruush-glass-soft');
    expect(screen.getByTestId('marker-badge-me').querySelector('svg')).toHaveClass('h-[1.0625rem]', 'w-[1.0625rem]');
    expect(screen.queryByText('12m ago')).not.toBeInTheDocument();
  });

  it('keeps the current user pin blue even when relationship metadata is present', async () => {
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
            relationship: {
              kind: 'mutual_cruush',
              canMessage: true,
            },
          },
        ]}
      />
    );

    expect(await screen.findByTestId('marker-photo-fill-me')).toHaveAttribute('href', 'https://example.com/me.jpg');
    expect(screen.getByTestId('marker-heart-me')).toHaveAttribute('data-marker-theme', 'current');
    expect(screen.getByTestId('marker-heart-me').querySelector('path[stroke]')).toHaveAttribute('stroke', GLASS_HEART_BORDER);
    expect(screen.getByTestId('marker-heart-me').querySelector('.cruush-heart-glass-theme-border')).toHaveAttribute('stroke', GLASS_HEART_BORDER);
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
    expect(screen.getByTestId('marker-heart-user-mutual')).toHaveClass('cruush-heart-glass-svg', 'h-20', 'w-20');
    expect(screen.getByTestId('marker-heart-user-mutual').querySelector('.cruush-heart-glass-theme-border')).toHaveAttribute('stroke', GLASS_HEART_BORDER);
    expect(markerInstances[0].element).toHaveClass('h-[88px]', 'w-[103px]');
    expect(screen.getByTestId('marker-badge-user-mutual')).toHaveClass('cruush-glass-soft', 'right-1.5', 'top-1/2', '-translate-y-1/2', 'border-[#6f00ff]/80');
    expect(screen.getByLabelText('mutual cruush')).toBeInTheDocument();
    expect(screen.getByTestId('marker-relationship-user-mutual')).toHaveClass('cruush-glass-soft', 'left-1.5', 'top-1/2', '-translate-y-1/2');
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

  it('renders the launch party marker without party-hat artwork', async () => {
    const onPinClick = vi.fn();

    render(
      <MapView
        onPinClick={onPinClick}
        markers={[
          {
            id: 'event-the-chocolate-factory-launch',
            kind: 'event',
            displayName: 'The Chocolate Factory',
            approximateLatitude: 40.70982,
            approximateLongitude: -73.92256,
            event: {
              slug: 'the-chocolate-factory-launch',
              venueName: 'The Chocolate Factory',
              attendeeCount: 500,
              raUrl: 'https://ra.co/events/2483120',
              iconAsset: 'party-hat',
            },
          },
        ]}
      />
    );

    const marker = await screen.findByRole('button', { name: 'Open The Chocolate Factory launch party on map' });
    const eventMarker = screen.getByTestId('launch-party-marker-event-the-chocolate-factory-launch');
    expect(marker).toHaveAttribute('data-map-marker-kind', 'event');
    expect(eventMarker).toHaveTextContent('500');
    expect(eventMarker).toHaveClass('rounded-full', 'border', 'bg-black/82');
    expect(eventMarker).not.toHaveClass('animate-cruush-party-dance');
    expect(eventMarker.querySelector('img')).toBeNull();
    fireEvent.click(marker);
    expect(onPinClick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'event' }));
  });

  it('clusters overlapping people pins into a zoomable count marker', async () => {
    const onPinClick = vi.fn();

    render(
      <MapView
        onPinClick={onPinClick}
        markers={[
          {
            id: 'me',
            displayName: 'You',
            approximateLatitude: 40.7128,
            approximateLongitude: -73.99,
            isCurrentUser: true,
          },
          {
            id: 'user-a',
            displayName: 'A',
            approximateLatitude: 40.7128,
            approximateLongitude: -73.99,
          },
          {
            id: 'user-b',
            displayName: 'B',
            approximateLatitude: 40.713,
            approximateLongitude: -73.9902,
          },
          {
            id: 'user-c',
            displayName: 'C',
            approximateLatitude: 40.742,
            approximateLongitude: -73.96,
          },
        ]}
      />
    );

    const cluster = await screen.findByRole('button', { name: 'Zoom into 2 nearby people on map' });
    expect(screen.getByTestId('people-cluster-marker-people-0')).toHaveTextContent('2');
    expect(screen.queryByRole('button', { name: 'Open A on map' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open B on map' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open C on map' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your approximate area')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(cluster);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onPinClick).not.toHaveBeenCalled();
    expect(mapInstances[0].setZoom).toHaveBeenCalledWith(15.5);
    const center = mapInstances[0].setCenter.mock.calls.at(-1)?.[0] as [number, number];
    expect(center[0]).toBeCloseTo(-73.9901, 4);
    expect(center[1]).toBeCloseTo(40.7129, 4);
    expect(await screen.findByRole('button', { name: 'Open A on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open B on map' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Zoom into 2 nearby people on map' })).not.toBeInTheDocument();
    });
  });

  it('spiderfies people sharing the same coordinates instead of zooming again', async () => {
    const onPinClick = vi.fn();

    render(
      <MapView
        onPinClick={onPinClick}
        markers={[
          {
            id: 'user-a',
            displayName: 'A',
            approximateLatitude: 40.7128,
            approximateLongitude: -73.99,
          },
          {
            id: 'user-b',
            displayName: 'B',
            approximateLatitude: 40.7128,
            approximateLongitude: -73.99,
          },
          {
            id: 'user-c',
            displayName: 'C',
            approximateLatitude: 40.742,
            approximateLongitude: -73.96,
          },
        ]}
      />
    );

    const cluster = await screen.findByRole('button', { name: 'Open 2 nearby people sharing this map spot' });
    expect(screen.getByTestId('people-cluster-marker-people-0')).toHaveTextContent('2');
    expect(screen.queryByRole('button', { name: 'Open A on map' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open B on map' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open C on map' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(cluster);
      await Promise.resolve();
      await Promise.resolve();
    });

    const firstSpiderfiedMarker = await screen.findByRole('button', { name: 'Open A on map' });
    const secondSpiderfiedMarker = screen.getByRole('button', { name: 'Open B on map' });
    expect(firstSpiderfiedMarker).toHaveAttribute('data-spiderfied', 'true');
    expect(firstSpiderfiedMarker).toHaveAttribute('data-spiderfy-count', '2');
    expect(secondSpiderfiedMarker).toHaveAttribute('data-spiderfied', 'true');
    expect(mapInstances[0].setZoom).not.toHaveBeenCalled();
    expect(onPinClick).not.toHaveBeenCalled();
    expect(markerInstances.some((marker) => marker.options.subpixelPositioning === true)).toBe(true);

    fireEvent.click(firstSpiderfiedMarker);
    expect(onPinClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-a' }));
  });

  it('keeps a focused person pin visible instead of hiding it in a nearby cluster', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        focusCoordinates={{
          approximateLatitude: 40.7128,
          approximateLongitude: -73.99,
        }}
        markers={[
          {
            id: 'user-focused',
            displayName: 'Focused',
            approximateLatitude: 40.7128,
            approximateLongitude: -73.99,
          },
          {
            id: 'user-nearby',
            displayName: 'Nearby',
            approximateLatitude: 40.713,
            approximateLongitude: -73.9902,
          },
        ]}
      />
    );

    expect(await screen.findByRole('button', { name: 'Open Focused on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Nearby on map' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Zoom into .* nearby people on map/ })).not.toBeInTheDocument();
  });

  it('clusters crowded venue users into a count circle when zoomed out', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        denseVenue={{
          id: 'launch-party',
          center: {
            approximateLatitude: 40.70982,
            approximateLongitude: -73.92256,
          },
          radiusMeters: 220,
          clusterZoom: 14,
          clusterThreshold: 3,
          maxIndividualMarkers: 80,
        }}
        markers={[
          {
            id: 'user-a',
            displayName: 'A',
            approximateLatitude: 40.70982,
            approximateLongitude: -73.92256,
          },
          {
            id: 'user-b',
            displayName: 'B',
            approximateLatitude: 40.70983,
            approximateLongitude: -73.92257,
          },
          {
            id: 'user-c',
            displayName: 'C',
            approximateLatitude: 40.70984,
            approximateLongitude: -73.92258,
          },
        ]}
      />
    );

    expect(await screen.findByRole('button', { name: 'Open 3 people at The Chocolate Factory on map' })).toBeInTheDocument();
    expect(screen.getByTestId('venue-cluster-marker-launch-party')).toHaveTextContent('3');
    expect(screen.queryByRole('button', { name: 'Open A on map' })).not.toBeInTheDocument();
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
    expect(layerById.has('building-extrusions-dark')).toBe(false);
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

  it('can add dark 3D building extrusions for map testing', () => {
    const style = createCruushVectorStyle('https://tiles.openfreemap.org/planet', undefined, true) as any;
    const layerById = new Map<string, any>(
      style.layers.map((layer: any) => [layer.id, layer] as [string, any])
    );
    const buildingLayer = layerById.get('building-extrusions-dark');

    expect(validateStyleMin(style)).toEqual([]);
    expect(style.light).toEqual({
      anchor: 'viewport',
      color: '#f2edf8',
      intensity: 0.28,
      position: [1.15, 210, 32],
    });
    expect(buildingLayer).toEqual(expect.objectContaining({
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13,
      filter: ['!=', ['get', 'hide_3d'], true],
    }));
    expect(buildingLayer.paint['fill-extrusion-color']).toEqual([
      'interpolate',
      ['linear'],
      ['get', 'render_height'],
      0,
      '#151515',
      120,
      '#FF0072',
      260,
      '#6F00FF',
      420,
      '#1181FF',
    ]);
    expect(buildingLayer.paint['fill-extrusion-height']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      13,
      0,
      14.4,
      ['get', 'render_height'],
    ]);
    expect(buildingLayer.paint['fill-extrusion-base']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      13,
      0,
      14.4,
      ['get', 'render_min_height'],
    ]);
    expect(buildingLayer.paint['fill-extrusion-opacity']).toBe(0.78);
    expect(style.layers.findIndex((layer: any) => layer.id === 'building-extrusions-dark'))
      .toBeLessThan(style.layers.findIndex((layer: any) => layer.id === 'minor-roads'));
  });

  it('creates valid MapLibre style JSON for the default vector map', () => {
    expect(validateStyleMin(getMapStyle() as any)).toEqual([]);
  });

  it('enables dark 3D buildings from the map test env flag', () => {
    vi.stubEnv('VITE_MAP_ENABLE_3D_BUILDINGS', 'true');

    const style = getMapStyle() as any;

    expect(style.layers.some((layer: any) => layer.id === 'building-extrusions-dark')).toBe(true);
    expect(validateStyleMin(style)).toEqual([]);
  });

  it('lets the runtime 3D setting override the map test env flag', () => {
    vi.stubEnv('VITE_MAP_ENABLE_3D_BUILDINGS', 'true');

    const disabledStyle = getMapStyle(false) as any;
    const enabledStyle = getMapStyle(true) as any;

    expect(disabledStyle.layers.some((layer: any) => layer.id === 'building-extrusions-dark')).toBe(false);
    expect(enabledStyle.layers.some((layer: any) => layer.id === 'building-extrusions-dark')).toBe(true);
  });

  it('pitches the map only when 3D buildings are enabled', async () => {
    vi.stubEnv('VITE_MAP_ENABLE_3D_BUILDINGS', 'true');

    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[]}
      />
    );

    await waitFor(() => expect(MockMap.calls).toHaveLength(1));
    expect(MockMap.calls[0]).toEqual(expect.objectContaining({
      zoom: 14.4,
      pitch: 45,
      bearing: -17.6,
      canvasContextAttributes: { antialias: true },
    }));
  });

  it('keeps the explicit style URL override as highest priority', () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://example.com/custom-style.json');
    vi.stubEnv('VITE_MAP_TILE_URL', 'https://tiles.example.com/{z}/{x}/{y}.png');

    expect(getMapStyle()).toBe('https://example.com/custom-style.json');
  });

  it('keeps the custom vector style when only a raster fallback URL is configured', () => {
    vi.stubEnv('VITE_MAP_TILE_URL', 'https://tiles.example.com/{z}/{x}/{y}.png');
    vi.stubEnv('VITE_MAP_ATTRIBUTION', '&copy; Example Tiles');

    const style = getMapStyle() as any;

    expect(style.sources.openmaptiles).toEqual({
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
    });
    expect(style.glyphs).toBeUndefined();
    expect(style.sources.osmRasterTiles).toBeUndefined();
    expect(style.layers.some((layer: any) => layer.id === 'major-roads')).toBe(true);
  });

  it('uses configured raster tiles only when explicitly enabled', () => {
    vi.stubEnv('VITE_MAP_USE_RASTER_TILES', 'true');
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
