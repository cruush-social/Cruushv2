import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapView, {
  MARKER_CLEARANCE_PX,
  MAP_SERVICE_MASK_LAYER_ID,
  MAP_SERVICE_MASK_SOURCE_ID,
  MAX_DISCOVERY_ZOOM,
  MIN_DISCOVERY_ZOOM,
  createCruushVectorStyle,
  createMapMarkerBadge,
  getMapStyle,
  separateOverlappingMarkers,
} from './MapView';
import {
  MAP_SERVICE_CENTER,
  MAP_SERVICE_MAX_BOUNDS,
  MAP_SERVICE_OUTSIDE_MASK,
} from '../lib/mapServiceArea';

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
    getZoom = vi.fn(() => 12);
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
    moveLayer = vi.fn((id: string) => {
      const layer = this.layers.get(id);
      if (layer) {
        this.layers.delete(id);
        this.layers.set(id, layer);
      }
    });
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
    remove = vi.fn(() => {
      this.element.remove();
    });

    offset: [number, number] | null = null;

    constructor(options: { element: HTMLElement; offset?: [number, number] }) {
      this.element = options.element;
      this.offset = options.offset ?? null;
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
    vi.unstubAllGlobals();
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
      minZoom: MIN_DISCOVERY_ZOOM,
      maxZoom: MAX_DISCOVERY_ZOOM,
      maxBounds: MAP_SERVICE_MAX_BOUNDS,
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
    expect(screen.getByTestId('marker-badge-me')).toHaveClass(
      'border-[#004BFF]/80',
      'right-[-0.25rem]',
      'top-[62%]',
      '-translate-y-1/2',
    );
    expect(screen.getByTestId('marker-badge-me').querySelector('svg')).toHaveClass('h-[1.0625rem]', 'w-[1.0625rem]');
    expect(screen.getByTestId('marker-badge-user-1')).toHaveClass('border-[#FF0072]/80');
    expect(screen.getByTestId('marker-heart-me')).toHaveAttribute('data-marker-theme', 'current');
    expect(Array.from(screen.getByTestId('marker-heart-me').querySelectorAll('stop')).map((stop) => stop.getAttribute('stop-color'))).toEqual([
      '#3826FF',
      '#004BFF',
      '#1181FF',
    ]);
    expect(screen.getByTestId('marker-heart-user-1')).toHaveAttribute('data-marker-theme', 'nearby');
    expect(screen.getByTestId('marker-current-fallback-me')).toBeInTheDocument();
    expect(screen.getByTestId('marker-current-fallback-me').querySelector('div')).not.toHaveClass('rounded-full', 'bg-black/70');
    expect(screen.getByTestId('marker-current-fallback-me').querySelector('svg')).toHaveClass('h-7', 'w-7', 'text-white');
    expect(screen.queryByTestId('marker-current-fallback-user-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('marker-heart-me')).toHaveClass('h-20', 'w-20');
    expect(screen.getByTestId('marker-heart-layer-me')).toHaveClass('w-[103px]');
    expect(markerInstances[0].element).toHaveClass('h-[88px]', 'w-[103px]');
    expect(markerInstances[0].element.className).not.toContain('drop-shadow');
    expect(markerInstances[1].element.className).not.toContain('drop-shadow');
    expect(screen.getByTestId('marker-heart-me').querySelector('filter')).toBeNull();
    expect(screen.getByTestId('marker-heart-user-1').querySelector('filter')).toBeNull();
  });

  it('starts inside the configured service boundary when no viewport is restored', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[]}
      />
    );

    await waitFor(() => expect(MockMap.calls).toHaveLength(1));
    expect(MockMap.calls[0]).toEqual(expect.objectContaining({
      center: [MAP_SERVICE_CENTER.longitude, MAP_SERVICE_CENTER.latitude],
      maxBounds: MAP_SERVICE_MAX_BOUNDS,
    }));
  });

  it('masks map pixels outside the circular service area without decorating the inside', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[]}
        radiusCircle={{
          center: {
            approximateLatitude: MAP_SERVICE_CENTER.latitude,
            approximateLongitude: MAP_SERVICE_CENTER.longitude,
          },
          radiusMeters: 1609,
        }}
      />
    );

    await waitFor(() => expect(mapInstances[0]).toBeDefined());
    act(() => {
      mapInstances[0].trigger('style.load');
      mapInstances[0].trigger('load');
    });

    expect(mapInstances[0].addSource).toHaveBeenCalledWith(MAP_SERVICE_MASK_SOURCE_ID, {
      type: 'geojson',
      data: MAP_SERVICE_OUTSIDE_MASK,
    });
    expect(mapInstances[0].addLayer).toHaveBeenCalledWith({
      id: MAP_SERVICE_MASK_LAYER_ID,
      type: 'fill',
      source: MAP_SERVICE_MASK_SOURCE_ID,
      paint: {
        'fill-antialias': false,
        'fill-color': '#080808',
        'fill-opacity': ['step', ['zoom'], 0, 11.5, 1],
      },
    });
    expect(mapInstances[0].layers.get(MAP_SERVICE_MASK_LAYER_ID)).not.toHaveProperty('outline');
    await waitFor(() => {
      expect(mapInstances[0].moveLayer).toHaveBeenCalledWith(MAP_SERVICE_MASK_LAYER_ID);
    });
    expect(Array.from(mapInstances[0].layers.keys()).at(-1)).toBe(MAP_SERVICE_MASK_LAYER_ID);
    expect(MockMap.calls[0]).toEqual(expect.objectContaining({
      maxBounds: MAP_SERVICE_MAX_BOUNDS,
    }));
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

  it('starts at a restored viewport when one is supplied', async () => {
    render(
      <MapView
        onMapClick={vi.fn()}
        onMapReady={vi.fn()}
        onPinClick={vi.fn()}
        initialViewport={{
          center: { approximateLatitude: 40.71, approximateLongitude: -74.02 },
          zoom: 13.25,
        }}
        markers={[]}
      />,
    );

    await waitFor(() => expect(MockMap.calls).toHaveLength(1));
    expect(MockMap.calls[0]).toEqual(expect.objectContaining({
      center: [-74.02, 40.71],
      zoom: 13.25,
    }));
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
        maxZoom: 15,
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

    expect(screen.queryByTestId('marker-npc-ghost-halo-npc-ghost')).not.toBeInTheDocument();
    const ghostHeart = screen.getByTestId('marker-heart-npc-ghost');
    expect(ghostHeart).toHaveAttribute('data-marker-theme', 'npc-ghost-demo');
    expect(ghostHeart.querySelector('path[fill="#0BA8FF"][stroke="#0BA8FF"]')).not.toBeNull();
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

  it('keeps Ghost markers static without changing the normal no-photo heart treatment', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[{
          id: 'ghost-static',
          displayName: 'River',
          approximateLatitude: 40.72,
          approximateLongitude: -74.01,
          displayMode: 'GHOST',
        }]}
      />,
    );

    const marker = await screen.findByTestId('marker-heart-ghost-static');
    const markerElement = marker.closest('[data-map-marker-pin="true"]');
    expect(markerElement).not.toHaveClass('opacity-45');
    expect(markerElement).not.toHaveAttribute('data-animation-hint');
    expect(markerElement).not.toHaveAttribute('data-ghost-rotation-terminal');
    expect(screen.queryByTestId('marker-ghost-pulse-ghost-static')).not.toBeInTheDocument();
    expect(screen.queryByTestId('marker-ghost-fly-icon-ghost-static')).not.toBeInTheDocument();
    expect(screen.queryByTestId('marker-ghost-puff-ghost-static')).not.toBeInTheDocument();
    expect(marker).toHaveAttribute('data-marker-theme', 'nearby');
    expect(marker.querySelector('path[fill]')).toHaveAttribute('fill', 'url(#marker-fill-ghost-static)');
    expect(marker.querySelector('path[stroke]')).toHaveAttribute('stroke', '#FF0072');
    expect(marker.querySelector('path[fill="#FF0072"]')).toBeNull();
    expect(marker.querySelector('path[style*="transform"]')).toBeNull();
  });

  it('draws the owner Ghost Mode radius around true location and a leash to the decoy', async () => {
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
        ghostLeash={{
          from: {
            approximateLatitude: 40.714,
            approximateLongitude: -74.004,
          },
          to: {
            approximateLatitude: 40.72,
            approximateLongitude: -74.001,
          },
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
    expect(mapInstances[0].addSource).toHaveBeenCalledWith(
      'owner-ghost-leash',
      expect.objectContaining({
        type: 'geojson',
        data: expect.objectContaining({
          geometry: {
            type: 'LineString',
            coordinates: [
              [-74.004, 40.714],
              [-74.001, 40.72],
            ],
          },
        }),
      }),
    );
    expect(mapInstances[0].addLayer).toHaveBeenCalledWith(expect.objectContaining({
      id: 'owner-ghost-leash-line',
      paint: expect.objectContaining({
        'line-color': '#0BA8FF',
        'line-opacity': 0.9,
        'line-width': 2.5,
        'line-dasharray': [2, 1.5],
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
            photoExplicit: false,
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
            photoExplicit: false,
            lastActiveLabel: '12m ago',
          },
        ]}
      />
    );

    expect(await screen.findByTestId('marker-photo-fill-me')).toHaveAttribute('href', 'https://example.com/me.jpg');
    expect(screen.getByTestId('marker-heart-me')).toHaveAttribute('data-has-photo', 'true');
    expect(screen.getByTestId('marker-heart-me')).toHaveAttribute('data-marker-theme', 'current');
    expect(screen.getByTestId('marker-heart-me').querySelector('path[stroke]')).toHaveAttribute('stroke', '#004BFF');
    expect(screen.queryByTestId('marker-current-fallback-me')).not.toBeInTheDocument();
    expect(screen.getByTestId('marker-photo-fill-user-photo')).toHaveAttribute('href', 'https://example.com/kai.jpg');
    expect(screen.getByTestId('marker-heart-user-photo')).toHaveAttribute('data-has-photo', 'true');
    expect(screen.getByTestId('marker-heart-user-photo')).toHaveAttribute('data-marker-theme', 'nearby');
    expect(screen.queryByLabelText('versatile')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your profile')).toBeInTheDocument();
    expect(screen.getByTestId('marker-badge-me').querySelector('svg')).toHaveClass('h-[1.0625rem]', 'w-[1.0625rem]');
    expect(screen.queryByText('12m ago')).not.toBeInTheDocument();
  });

  it('keeps an allowed Ghost Mode profile photo and regular pink map styling', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[{
          id: 'ghost-photo',
          displayName: 'River',
          approximateLatitude: 40.72,
          approximateLongitude: -74.01,
          displayMode: 'GHOST',
          photo: 'https://example.com/river.jpg',
          photoExplicit: false,
          signal: 'Around tonight',
          badge: createMapMarkerBadge(['Top'], []),
        }]}
      />
    );

    const heart = await screen.findByTestId('marker-heart-ghost-photo');
    expect(heart).toHaveAttribute('data-marker-theme', 'nearby');
    expect(heart).toHaveAttribute('data-has-photo', 'true');
    expect(screen.getByTestId('marker-photo-fill-ghost-photo')).toHaveAttribute('href', 'https://example.com/river.jpg');
    expect(heart.querySelector('path[stroke]')).toHaveAttribute('stroke', '#FF0072');
    expect(screen.getByTestId('marker-badge-ghost-photo')).toHaveClass('border-[#FF0072]/80');
    expect(screen.getByTestId('marker-signal-badge-ghost-photo')).toHaveClass('border-white/12');
  });

  it('keeps the signed-in Ghost marker electric blue without replacing its profile photo', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[{
          id: 'me',
          displayName: 'You',
          approximateLatitude: 40.72,
          approximateLongitude: -74.01,
          displayMode: 'GHOST',
          photo: 'https://example.com/me.jpg',
          photoExplicit: false,
          isCurrentUser: true,
          signal: 'Around tonight',
          badge: createMapMarkerBadge(['Top'], []),
        }]}
      />
    );

    const heart = await screen.findByTestId('marker-heart-me');
    expect(heart).toHaveAttribute('data-marker-theme', 'current');
    expect(heart).toHaveAttribute('data-has-photo', 'true');
    expect(screen.getByTestId('marker-photo-fill-me')).toHaveAttribute('href', 'https://example.com/me.jpg');
    expect(heart.querySelector('path[stroke]')).toHaveAttribute('stroke', '#0BA8FF');
    expect(screen.getByTestId('marker-badge-me')).toHaveClass('border-[#0BA8FF]');
    expect(screen.getByTestId('marker-signal-badge-me')).toHaveClass('border-[#0BA8FF]');
  });

  it('keeps an explicit Ghost Mode profile photo masked while DL Mode is on', async () => {
    const storageKey = 'cruush:dl-mode-enabled';
    const previousValue = window.localStorage.getItem(storageKey);
    window.localStorage.setItem(storageKey, 'true');

    try {
      render(
        <MapView
          onPinClick={vi.fn()}
          markers={[{
            id: 'ghost-explicit-photo',
            displayName: 'River',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            displayMode: 'GHOST',
            photo: 'https://example.com/river.jpg',
            photoExplicit: true,
          }]}
        />,
      );

      const heart = await screen.findByTestId('marker-heart-ghost-explicit-photo');
      expect(heart).toHaveAttribute('data-marker-theme', 'nearby');
      expect(heart).toHaveAttribute('data-has-photo', 'false');
      expect(screen.queryByTestId('marker-photo-fill-ghost-explicit-photo')).not.toBeInTheDocument();
      expect(heart.querySelector('path[fill]')).toHaveAttribute('fill', 'url(#marker-fill-ghost-explicit-photo)');
      expect(heart.querySelector('path[stroke]')).toHaveAttribute('stroke', '#FF0072');
    } finally {
      if (previousValue === null) {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, previousValue);
      }
    }
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
            photoExplicit: false,
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
    expect(screen.getByTestId('marker-heart-me').querySelector('path[stroke]')).toHaveAttribute('stroke', '#004BFF');
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
            photoExplicit: false,
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
    expect(screen.getByTestId('marker-badge-user-mutual')).toHaveClass(
      'border-[#6f00ff]/80',
      'right-[-0.25rem]',
      'top-[62%]',
      '-translate-y-1/2',
    );
    expect(screen.getByLabelText('mutual cruush')).toBeInTheDocument();
    expect(screen.getByTestId('marker-relationship-user-mutual')).toHaveClass(
      'border-[#6f00ff]/80',
      'left-[-0.25rem]',
      'top-[62%]',
      '-translate-y-1/2',
    );
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

  it('opens the profile on a short touch tap without leaving the pin previewed', async () => {
    const onPinClick = vi.fn();

    render(
      <MapView
        onPinClick={onPinClick}
        markers={[
          {
            id: 'user-touch-preview',
            displayName: 'Noor',
            signal: 'Around tonight',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            lastActiveLabel: '8m ago',
          },
        ]}
      />,
    );

    const markerButton = await screen.findByRole('button', { name: 'Open Noor on map' });
    const pointerDown = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(pointerDown, 'pointerType', { value: 'touch' });
    fireEvent(markerButton, pointerDown);
    fireEvent.click(markerButton, { detail: 1 });

    expect(onPinClick).toHaveBeenCalledOnce();
    expect(onPinClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-touch-preview' }));
    expect(markerButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('marker-heart-layer-user-touch-preview')).not.toHaveClass('scale-[1.16]');
    expect(screen.getByTestId('marker-signal-stack-user-touch-preview')).toHaveClass('opacity-0');
  });

  it('enlarges a heart pin and shows its signal on press-and-hold without opening the profile', async () => {
    const onPinClick = vi.fn();

    render(
      <MapView
        onPinClick={onPinClick}
        markers={[
          {
            id: 'user-touch-hold',
            displayName: 'River',
            signal: 'Come say hi',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            lastActiveLabel: 'Now',
          },
        ]}
      />,
    );

    const markerButton = await screen.findByRole('button', { name: 'Open River on map' });
    vi.useFakeTimers();
    const pointerDown = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(pointerDown, 'pointerType', { value: 'touch' });
    fireEvent(markerButton, pointerDown);
    act(() => vi.advanceTimersByTime(500));

    expect(markerButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('marker-heart-layer-user-touch-hold')).toHaveClass('scale-[1.34]');
    expect(screen.getByTestId('marker-signal-stack-user-touch-hold')).toHaveClass('opacity-100');
    const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    fireEvent(markerButton, contextMenu);
    expect(contextMenu.defaultPrevented).toBe(true);

    fireEvent.pointerUp(markerButton, { pointerType: 'touch' });
    fireEvent.click(markerButton, { detail: 1 });
    expect(onPinClick).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(351));
    mapInstances[0].trigger('click');
    expect(markerButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('marker-heart-layer-user-touch-hold')).not.toHaveClass('scale-[1.34]');
    expect(screen.getByTestId('marker-signal-stack-user-touch-hold')).toHaveClass('opacity-0');
  });

  it('keeps a touch hold active when equivalent marker data rerenders', async () => {
    const marker = {
      id: 'user-touch-rerender',
      displayName: 'Ari',
      signal: 'Free tonight',
      approximateLatitude: 40.72,
      approximateLongitude: -74.01,
      lastActiveLabel: 'Now',
    };
    const onPinClick = vi.fn();
    const { rerender } = render(<MapView onPinClick={onPinClick} markers={[marker]} />);
    const originalButton = await screen.findByRole('button', { name: 'Open Ari on map' });

    vi.useFakeTimers();
    const pointerDown = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(pointerDown, 'pointerType', { value: 'touch' });
    fireEvent(originalButton, pointerDown);
    rerender(<MapView onPinClick={onPinClick} markers={[{ ...marker }]} />);
    act(() => vi.advanceTimersByTime(500));

    const currentButton = screen.getByRole('button', { name: 'Open Ari on map' });
    expect(currentButton).toBe(originalButton);
    expect(currentButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('marker-heart-layer-user-touch-rerender')).toHaveClass('scale-[1.34]');
    expect(screen.getByTestId('marker-signal-stack-user-touch-rerender')).toHaveClass('opacity-100');
    expect(onPinClick).not.toHaveBeenCalled();
  });

  it('cancels the press-and-hold preview when the touch moves to pan the map', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'user-touch-pan',
            displayName: 'Kai',
            signal: 'Out now',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            lastActiveLabel: 'Now',
          },
        ]}
      />,
    );

    const markerButton = await screen.findByRole('button', { name: 'Open Kai on map' });
    vi.useFakeTimers();
    const pointerDown = new Event('pointerdown', { bubbles: true });
    Object.defineProperties(pointerDown, {
      clientX: { value: 20 },
      clientY: { value: 20 },
      pointerType: { value: 'touch' },
    });
    fireEvent(markerButton, pointerDown);
    const pointerMove = new Event('pointermove', { bubbles: true });
    Object.defineProperties(pointerMove, {
      clientX: { value: 40 },
      clientY: { value: 20 },
      pointerType: { value: 'touch' },
    });
    fireEvent(markerButton, pointerMove);
    act(() => vi.advanceTimersByTime(500));

    expect(markerButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('marker-heart-layer-user-touch-pan')).not.toHaveClass('scale-[1.16]');
    expect(screen.getByTestId('marker-signal-stack-user-touch-pan')).toHaveClass('opacity-0');
  });

  it('uses the corrected V2 signal position above the marker frame', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'user-signal',
            displayName: 'Noor',
            signal: 'Around tonight',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            lastActiveLabel: '8m ago',
          },
        ]}
      />,
    );

    const signalStack = await screen.findByTestId('marker-signal-stack-user-signal');
    const heartLayer = screen.getByTestId('marker-heart-layer-user-signal');
    expect(signalStack).toHaveAttribute('data-signal-position', 'v2-frame-top');
    expect(signalStack).toHaveClass('left-1/2', 'top-0', '-translate-x-1/2', '-translate-y-full');
    expect(heartLayer).toContainElement(signalStack);
    expect(signalStack).toHaveClass('opacity-0', 'group-hover:opacity-100', 'group-focus-within:opacity-100');
  });

  it('keeps the signal visible and pulses the unchanged heart unit during an active Ping', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'user-pinging',
            displayName: 'River',
            signal: 'Come say hi',
            latestFeedPostPreview: 'Latest post stays hover-only',
            badge: createMapMarkerBadge(['Top'], []),
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            activePing: {
              id: 'ping-1',
              expiresAt: '2026-08-09T19:00:00.000Z',
            },
            relationship: {
              kind: 'mutual_cruush',
              precision: 'fuzzy',
              canMessage: true,
            },
          },
        ]}
      />,
    );

    const signalStack = await screen.findByTestId('marker-signal-stack-user-pinging');
    const heart = screen.getByTestId('marker-heart-user-pinging');
    const heartLayer = screen.getByTestId('marker-heart-layer-user-pinging');
    const signalBadge = screen.getByTestId('marker-signal-badge-user-pinging');
    const positionBadge = screen.getByTestId('marker-badge-user-pinging');
    const relationshipBadge = screen.getByTestId('marker-relationship-user-pinging');
    const postPreview = screen.getByTestId('marker-post-preview-user-pinging');
    expect(signalStack).toHaveClass('opacity-100');
    expect(signalStack).not.toHaveClass('opacity-0');
    expect(postPreview).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100',
    );
    expect(heart).toHaveClass('z-10');
    expect(heart).not.toHaveClass('cruush-map-ping-heart');
    expect(heartLayer).toHaveClass('cruush-map-ping-heart');
    expect(heart.querySelector('path[stroke="#C8FF31"]')).not.toBeNull();
    expect(signalBadge).toHaveClass('border-[#C8FF31]');
    expect(signalBadge).toHaveClass('shadow-[0_12px_30px_rgba(0,0,0,0.45)]');
    expect(positionBadge).toHaveClass('border-[#C8FF31]');
    expect(relationshipBadge).toHaveClass('border-[#C8FF31]');
    expect(heartLayer).toContainElement(positionBadge);
    expect(heartLayer).toContainElement(relationshipBadge);
    expect(heartLayer).not.toContainElement(postPreview);
    expect(heartLayer).toContainElement(signalStack);
    expect(markerInstances[0].element).toHaveAttribute('data-active-ping', 'true');
    expect(screen.queryByTestId('marker-ping-rings-user-pinging')).not.toBeInTheDocument();
    const unchangedFill = heart.querySelector('path[fill="url(#marker-fill-user-pinging)"]');
    expect(unchangedFill).toHaveAttribute('fill-opacity', '1');
    expect(heart.querySelector('path[fill="#C8FF31"]')).toBeNull();
  });

  it('retries the default vector style with raster fallback before showing a map error', async () => {
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
    expect(mapInstances[0].fitBounds).toHaveBeenCalledWith(
      [[-73.9902, 40.7128], [-73.99, 40.713]],
      expect.objectContaining({ maxZoom: 15.25 }),
    );
    expect(mapInstances[0].setCenter).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Zoom into 2 nearby people on map' })).toBeInTheDocument();
  });

  it('keeps active Ping hearts above ordinary people clusters during zoom-out', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'user-pinging',
            displayName: 'Pinging',
            approximateLatitude: 40.7128,
            approximateLongitude: -73.99,
            activePing: { id: 'ping-1', expiresAt: '2026-08-11T19:00:00.000Z' },
          },
          {
            id: 'user-a',
            displayName: 'A',
            approximateLatitude: 40.7129,
            approximateLongitude: -73.9901,
          },
          {
            id: 'user-b',
            displayName: 'B',
            approximateLatitude: 40.713,
            approximateLongitude: -73.9902,
          },
        ]}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Open Pinging on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom into 2 nearby people on map' })).toBeInTheDocument();

    const pingMarker = markerInstances.find((instance: any) => instance.element.dataset.activePing === 'true');
    const clusterMarker = markerInstances.find((instance: any) => instance.element.dataset.mapMarkerKind === 'cluster');
    expect(pingMarker?.element.style.zIndex).not.toBe('');
    expect(Number(pingMarker?.element.style.zIndex)).toBeGreaterThan(Number(clusterMarker?.element.style.zIndex || 0));
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
    expect(layerById.get('background')?.paint['background-color']).toBe('#050506');
    expect(layerById.get('major-roads')?.paint['line-color']).toBe('#4c4c56');
    expect(layerById.get('minor-road-labels')?.layout['symbol-placement']).toBe('line');
    expect(layerById.get('minor-road-labels')?.layout['symbol-spacing']).toBe(120);
    expect(layerById.get('minor-road-labels')?.layout['text-font']).toEqual(['Cormorant Garamond']);
    expect(layerById.get('minor-road-labels')?.paint['text-color']).toBe('#9c9ca4');
    expect(layerById.get('secondary-road-labels')?.paint['text-color']).toBe('#b4b4bc');
    expect(layerById.get('primary-road-labels')?.paint['text-color']).toBe('#dcdce2');
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
    expect(validateStyleMin(getMapStyle() as any)).toEqual([]);
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

function pixelDistance(a: { approximateLatitude: number; approximateLongitude: number },
                       b: { approximateLatitude: number; approximateLongitude: number },
                       zoom: number) {
  const worldSize = 512 * 2 ** zoom;
  const project = (m: { approximateLatitude: number; approximateLongitude: number }) => {
    const sinLatitude = Math.min(0.9999, Math.max(-0.9999, Math.sin(m.approximateLatitude * Math.PI / 180)));
    return {
      x: (m.approximateLongitude + 180) / 360 * worldSize,
      y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * worldSize,
    };
  };
  const p1 = project(a);
  const p2 = project(b);
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

describe('spiderfy clusters', () => {
  it('fans same-spot people out on tap instead of zooming', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          { id: 'a', displayName: 'A', approximateLatitude: 40.7128, approximateLongitude: -73.99 },
          { id: 'b', displayName: 'B', approximateLatitude: 40.7128, approximateLongitude: -73.99 },
          { id: 'c', displayName: 'C', approximateLatitude: 40.7128, approximateLongitude: -73.99 },
        ]}
      />
    );

    const cluster = await screen.findByRole('button', { name: /sharing this map spot/ });

    await act(async () => {
      fireEvent.click(cluster);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Tapping expands the members in place; it must not zoom the map.
    expect(mapInstances[0].setZoom).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Open A on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open B on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open C on map' })).toBeInTheDocument();

    const offsets = markerInstances.map((m: any) => m.offset).filter(Boolean);
    expect(offsets).toHaveLength(3);
    // Every member gets a distinct offset so none of them stack.
    expect(new Set(offsets.map((o: number[]) => o.join(','))).size).toBe(3);
  });
});

describe('separateOverlappingMarkers', () => {
  it('separates two ordinary user pins that share coordinates', () => {
    const a = { ...me, id: 'a', isCurrentUser: false };
    const b = { ...me, id: 'b', isCurrentUser: false };
    const [ra, rb] = separateOverlappingMarkers([a, b], zoom);

    expect(pixelDistance(ra, rb, zoom)).toBeGreaterThanOrEqual(MARKER_CLEARANCE_PX - 0.5);
  });

  it('separates a whole crowd so no two pins overlap', () => {
    const crowd = Array.from({ length: 6 }, (_, i) => ({ ...me, id: `p${i}`, isCurrentUser: false }));
    const out = separateOverlappingMarkers(crowd, zoom);

    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        expect(pixelDistance(out[i], out[j], zoom)).toBeGreaterThanOrEqual(MARKER_CLEARANCE_PX - 0.5);
      }
    }
  });

  const zoom = 14;
  const me = {
    id: 'me',
    displayName: 'Julien',
    approximateLatitude: 40.6782,
    approximateLongitude: -73.9442,
    isCurrentUser: true,
  } as any;

  it('pushes a pin sharing the current user coordinates out of the pin footprint', () => {
    const other = { ...me, id: 'other', displayName: 'Someone', isCurrentUser: false };
    const [, moved] = separateOverlappingMarkers([me, other], zoom);

    expect(pixelDistance(me, moved, zoom)).toBeGreaterThanOrEqual(MARKER_CLEARANCE_PX - 0.5);
  });

  it('keeps an active Ping at its map position before an ordinary overlapping heart', () => {
    const ordinary = { ...me, id: 'a-ordinary', isCurrentUser: false };
    const pinging = {
      ...me,
      id: 'z-pinging',
      isCurrentUser: false,
      activePing: { id: 'ping-1', expiresAt: '2026-08-11T19:00:00.000Z' },
    };
    const separated = separateOverlappingMarkers([ordinary, pinging], zoom);
    const placedPinging = separated.find((marker) => marker.id === pinging.id)!;
    const placedOrdinary = separated.find((marker) => marker.id === ordinary.id)!;

    expect(placedPinging.approximateLatitude).toBe(pinging.approximateLatitude);
    expect(placedPinging.approximateLongitude).toBe(pinging.approximateLongitude);
    expect(pixelDistance(placedOrdinary, pinging, zoom)).toBeGreaterThanOrEqual(MARKER_CLEARANCE_PX - 0.5);
  });

  it('never moves the current user pin', () => {
    const other = { ...me, id: 'other', isCurrentUser: false };
    const [mine] = separateOverlappingMarkers([me, other], zoom);

    expect(mine.approximateLatitude).toBe(me.approximateLatitude);
    expect(mine.approximateLongitude).toBe(me.approximateLongitude);
  });

  it('leaves pins that already clear the footprint untouched', () => {
    const far = { ...me, id: 'far', isCurrentUser: false, approximateLatitude: 40.7 };
    const [, untouched] = separateOverlappingMarkers([me, far], zoom);

    expect(untouched).toBe(far);
  });

  it('is stable across renders so pins do not jitter', () => {
    const other = { ...me, id: 'other', isCurrentUser: false };
    const first = separateOverlappingMarkers([me, other], zoom)[1];
    const second = separateOverlappingMarkers([me, other], zoom)[1];

    expect(second).toEqual(first);
  });
});
