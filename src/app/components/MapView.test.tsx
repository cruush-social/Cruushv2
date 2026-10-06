import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapView, {
  MAP_BROWSE_MASK_LAYER_ID,
  MAP_BROWSE_MASK_SOURCE_ID,
  MAP_PIN_UNIT_SCALE,
  MAP_SERVICE_MASK_LAYER_ID,
  MAP_SERVICE_MASK_SOURCE_ID,
  MAP_TILE_LABEL_SCALE,
  MAX_DISCOVERY_ZOOM,
  MIN_DISCOVERY_ZOOM,
  MapMarkerPin,
  PULSE_EKG_PIN_PATH,
  applyPlaceMarkerClusters,
  createCruushVectorStyle,
  createMapMarkerBadge,
  getMapStyle,
  ghostLeashCameraPadding,
  separateOverlappingMarkers,
} from './MapView';
import {
  MAP_SERVICE_CENTER,
  MAP_SERVICE_MAX_BOUNDS,
  MAP_SERVICE_OUTSIDE_MASK,
  createMapOutsideRadiusMask,
} from '../lib/mapServiceArea';
import { DARK_ROOM_EYE_PATH, DARK_ROOM_KEYHOLE_PATH } from './DarkRoomMark';
import type { MapMarker } from '../lib/mapMarkers';

const { MockMap, MockMarker, mapInstances, markerInstances } = vi.hoisted(() => {
  const mapInstances: MockMapInstance[] = [];
  const markerInstances: MockMarkerInstance[] = [];

  class MockMapInstance {
    static calls: unknown[] = [];
    container: HTMLElement;
    style: unknown;
    handlers = new Map<string, Array<(event?: unknown) => void>>();
    zoomIn = vi.fn();
    zoomOut = vi.fn();
    setCenter = vi.fn();
    setZoom = vi.fn();
    setMaxBounds = vi.fn();
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
    getContainer = vi.fn(() => this.container);
    remove = vi.fn();

    constructor(options: { container: HTMLElement; style?: unknown }) {
      this.container = options.container;
      this.style = options.style ?? {};
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

    mapInstances[0].getZoom.mockReturnValue(MIN_DISCOVERY_ZOOM);
    act(() => mapInstances[0].trigger('zoomend'));
    expect(mapInstances[0].setMaxBounds).not.toHaveBeenCalledWith(null);

    mapInstances[0].trigger('click');
    expect(onMapClick).toHaveBeenCalledTimes(1);

    act(() => { mapInstances[0].getZoom.mockReturnValue(16); mapInstances[0].trigger('zoomend'); });
    fireEvent.click(await screen.findByRole('button', { name: 'Open Jordan on map' }));
    expect(onPinClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }));
    expect(markerInstances[1].element).toHaveAttribute('data-map-marker-pin', 'true');
    mapInstances[0].trigger('click', { originalEvent: { target: markerInstances[1].element } });
    expect(onMapClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Open You on map' })).not.toBeInTheDocument();
    // Your own pin opens your own details, never another person's profile.
    expect(screen.getByRole('button', { name: 'Show your pin details' })).toBeInTheDocument();
    expect(screen.queryByText('YOU')).not.toBeInTheDocument();
    expect(screen.queryByText('Now')).not.toBeInTheDocument();
    expect(screen.queryByText('2m ago')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('bottom')).not.toBeInTheDocument();
    expect(screen.getByLabelText('position: bottom')).toBeInTheDocument();
    expect(screen.getByLabelText('position: top')).toBeInTheDocument();
    expect(screen.getByTestId('marker-position-badge-me')).toHaveClass(
      'top-[70%]',
      '-translate-y-1/2',
    );
    expect(screen.getByTestId('marker-position-badge-me')).toHaveStyle({
      width: '29.75px',
      height: '29.75px',
      right: '-5.25px',
    });
    expect(screen.getByTestId('marker-position-badge-me')).toHaveStyle({ color: '#004BFF' });
    expect(screen.getByTestId('marker-position-badge-user-1')).toHaveStyle({ color: '#FF0072' });
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
    expect(screen.getByTestId('marker-heart-layer-user-1')).toHaveClass('origin-bottom');
    expect(screen.getByTestId('marker-pin-unit-user-1')).toHaveClass('origin-bottom', 'scale-100');
    expect(MAP_PIN_UNIT_SCALE).toBe(1);
    // Tall enough to hold the ghost exit animation without clipping it.
    expect(markerInstances[0].element).toHaveClass('h-[128px]', 'w-[103px]');
    expect(markerInstances[0].element.className).not.toContain('drop-shadow');
    expect(markerInstances[1].element.className).not.toContain('drop-shadow');
    expect(screen.getByTestId('marker-heart-me').querySelector('filter')).toBeNull();
    expect(screen.getByTestId('marker-heart-user-1').querySelector('filter')).toBeNull();
  });

  it('never adds a people heatmap source or layer', async () => {
    const markers = [
      { id: 'recent-1', displayName: 'Recent 1', approximateLatitude: 40.711, approximateLongitude: -74.011, lastActiveLabel: 'Now' },
      { id: 'recent-2', displayName: 'Recent 2', approximateLatitude: 40.712, approximateLongitude: -74.012, lastActiveLabel: '4h ago' },
      { id: 'recent-3', displayName: 'Recent 3', approximateLatitude: 40.713, approximateLongitude: -74.013, lastActiveLabel: '7d ago' },
    ];
    render(
      <MapView
        markers={markers}
        onPinClick={vi.fn()}
      />
    );

    await waitFor(() => expect(MockMap.calls).toHaveLength(1));
    act(() => mapInstances[0].trigger('load'));

    expect(mapInstances[0].getSource('cruush-user-heatmap')).toBeUndefined();
    expect(mapInstances[0].getLayer('cruush-user-heatmap-layer')).toBeUndefined();
  });

  it('uses the Dark Room palette and shows the owner photo through the keyhole', () => {
    render(
      <MapMarkerPin
        marker={{
          id: 'dark-room-owner',
          displayName: 'You',
          approximateLatitude: 40.73,
          approximateLongitude: -73.99,
          isCurrentUser: true,
          ownerStealthActive: true,
          photo: 'https://example.com/dark-room-owner.jpg',
        }}
      />,
    );

    const heart = screen.getByTestId('marker-heart-dark-room-owner');
    expect(Array.from(heart.querySelectorAll('linearGradient:first-of-type stop')).map((stop) => stop.getAttribute('stop-color'))).toEqual([
      '#2B0057',
      '#6F00FF',
      '#B86CFF',
    ]);
    expect(screen.getByTestId('marker-ghost-border-dark-room-owner')).toHaveAttribute('stroke', 'url(#marker-fill-dark-room-owner)');
    expect(screen.getByTestId('marker-dark-room-photo-dark-room-owner')).toHaveAttribute('href', 'https://example.com/dark-room-owner.jpg');
    expect(screen.getByTestId('marker-dark-room-photo-dark-room-owner')).toHaveAttribute(
      'clip-path',
      'url(#marker-dark-room-eye-clip-dark-room-owner)',
    );
    const darkRoomMark = screen.getByTestId('marker-dark-room-keyhole-dark-room-owner');
    expect(darkRoomMark.querySelectorAll('path')).toHaveLength(2);
    expect(darkRoomMark.querySelector('[data-dark-room-part="keyhole"]')).toHaveAttribute('d', DARK_ROOM_KEYHOLE_PATH);
    expect(darkRoomMark.querySelector('[data-dark-room-part="keyhole"]')).toHaveAttribute('fill', '#000000');
    expect(darkRoomMark.querySelector('[data-dark-room-part="eye"]')).toHaveAttribute(
      'fill',
      'url(#marker-dark-room-mark-gradient-dark-room-owner)',
    );
    expect(heart.querySelector(`#marker-dark-room-eye-clip-dark-room-owner path`)).toHaveAttribute('d', DARK_ROOM_EYE_PATH);
    expect(screen.getByTestId('marker-dark-room-photo-dark-room-owner')).toHaveAttribute('data-dark-room-part', 'eye');
  });

  it('matches the Dark Room icon gradient on the keyhole eye when no photo is available', () => {
    render(
      <MapMarkerPin
        marker={{
          id: 'dark-room-owner-without-photo',
          displayName: 'You',
          approximateLatitude: 40.73,
          approximateLongitude: -73.99,
          isCurrentUser: true,
          ownerStealthActive: true,
        }}
      />,
    );

    const heart = screen.getByTestId('marker-heart-dark-room-owner-without-photo');
    const markGradient = heart.querySelector('#marker-dark-room-mark-gradient-dark-room-owner-without-photo');
    expect(Array.from(markGradient?.querySelectorAll('stop') ?? []).map((stop) => stop.getAttribute('stop-color'))).toEqual([
      '#2B0057',
      '#6F00FF',
      '#B86CFF',
    ]);
    expect(markGradient).toHaveAttribute('x1', '42');
    expect(markGradient).toHaveAttribute('x2', '214');
    expect(markGradient).toHaveAttribute('y1', '4');
    expect(markGradient).toHaveAttribute('y2', '226');
    expect(heart.querySelector('[data-dark-room-part="eye"]')).toHaveAttribute(
      'fill',
      'url(#marker-dark-room-mark-gradient-dark-room-owner-without-photo)',
    );
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

  it('draws the Mile High Club contrail and plane on an active travel pin', async () => {
    render(
      <MapMarkerPin
        marker={{
          id: 'traveller',
          displayName: 'Atlas',
          approximateLatitude: 40.733572,
          approximateLongitude: -74.002742,
          travelling: true,
          travelLabel: 'In from Chicago',
          signal: 'In from Chicago',
          photo: 'https://example.com/atlas.jpg',
          roleBadge: {
            kind: 'role',
            label: 'Switch',
            iconName: 'switch',
          },
          badge: createMapMarkerBadge(['Top'], []),
        }}
      />
    );

    const mileHighUnit = await screen.findByTestId('marker-mile-high-traveller');
    expect(mileHighUnit).toHaveAttribute('data-contrail-style', 'cluster');
    expect(mileHighUnit.querySelectorAll('[data-mile-high-band]')).toHaveLength(18);
    expect(mileHighUnit.querySelectorAll('[data-mile-high-ink="light-blue"]')).toHaveLength(18);
    expect(mileHighUnit.querySelectorAll('[data-mile-high-ink="white"]')).toHaveLength(18);
    expect(mileHighUnit.querySelectorAll('[data-mile-high-ink="brand"]')).toHaveLength(0);
    expect(mileHighUnit.querySelectorAll('[data-mile-high-ink="ghost"]')).toHaveLength(0);
    expect(mileHighUnit.querySelector('[data-mile-high-band="0"]')).toHaveAttribute('data-mile-high-phase', 'light-blue');
    expect(mileHighUnit.querySelector('[data-mile-high-band="4"]')).toHaveAttribute('data-mile-high-phase', 'light-blue');
    expect(mileHighUnit.querySelector('[data-mile-high-band="5"]')).toHaveAttribute('data-mile-high-phase', 'blend');
    expect(mileHighUnit.querySelector('[data-mile-high-band="7"]')).toHaveAttribute('data-mile-high-phase', 'blend');
    expect(mileHighUnit.querySelector('[data-mile-high-band="8"]')).toHaveAttribute('data-mile-high-phase', 'white-poof');
    expect(mileHighUnit.querySelector('[data-mile-high-band="17"]')).toHaveAttribute('data-mile-high-phase', 'white-poof');
    expect(screen.getByTestId('marker-mile-high-engine-trail-traveller')).toHaveAttribute('stroke-width', '3.2');
    expect(screen.getByTestId('marker-mile-high-engine-trail-traveller')).toHaveAttribute('stroke', 'rgb(218 243 255)');
    expect(screen.getByTestId('marker-mile-high-plane-traveller').querySelectorAll('path')).toHaveLength(3);
    expect(screen.getByTestId('marker-mile-high-plane-traveller').querySelector('path')).toHaveAttribute('fill', '#ffffff');
    expect(screen.getByTestId('marker-role-badge-traveller').querySelector('svg')).toHaveAttribute('stroke', '#77B9DA');
    expect(screen.getByTestId('marker-position-badge-traveller').querySelector('svg')).toHaveAttribute('stroke', '#77B9DA');
    expect(screen.getByTestId('marker-signal-badge-traveller').getAttribute('style')).toContain('#77B9DA');
    // The heart border stays visible while MHC is active and resolves to the same
    // sky tone as the badge borders.
    const travellerHeartBorder = screen.getByTestId('marker-heart-traveller')
      .querySelector('[data-testid="marker-ghost-border-traveller"]');
    expect(travellerHeartBorder).toHaveAttribute('stroke-opacity', '1');
    expect(travellerHeartBorder).toHaveAttribute('stroke', '#77B9DA');
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
        'fill-color': '#06101F',
        'fill-opacity': 0.9,
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

  it('keeps a pinch on the map surface from zooming the page', async () => {
    render(<MapView onPinClick={vi.fn()} markers={[]} />);

    const surface = screen.getByTestId('maplibre-map').parentElement as HTMLElement;
    const pageZoomGesture = new Event('gesturestart', { bubbles: true, cancelable: true });
    surface.dispatchEvent(pageZoomGesture);
    expect(pageZoomGesture.defaultPrevented).toBe(true);

    const twoFingerMove = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(twoFingerMove, 'touches', { value: [{}, {}] });
    surface.dispatchEvent(twoFingerMove);
    expect(twoFingerMove.defaultPrevented).toBe(true);

    const oneFingerMove = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(oneFingerMove, 'touches', { value: [{}] });
    surface.dispatchEvent(oneFingerMove);
    expect(oneFingerMove.defaultPrevented).toBe(false);
  });

  it('adds Mile High Club fog outside the fifty-mile browse origin', async () => {
    const browseArea = {
      center: {
        approximateLatitude: 40.5,
        approximateLongitude: -73.5,
      },
      radiusMiles: 50,
    };

    render(<MapView browseArea={browseArea} onPinClick={vi.fn()} markers={[]} />);

    await waitFor(() => expect(mapInstances[0]).toBeDefined());
    act(() => {
      mapInstances[0].trigger('style.load');
      mapInstances[0].trigger('load');
    });

    await waitFor(() => {
      expect(mapInstances[0].addSource).toHaveBeenCalledWith(MAP_BROWSE_MASK_SOURCE_ID, {
        type: 'geojson',
        data: createMapOutsideRadiusMask({ latitude: 40.5, longitude: -73.5 }, 50),
      });
    });
    expect(mapInstances[0].addLayer).toHaveBeenCalledWith({
      id: MAP_BROWSE_MASK_LAYER_ID,
      type: 'fill',
      source: MAP_BROWSE_MASK_SOURCE_ID,
      paint: {
        'fill-antialias': false,
        'fill-color': '#06152B',
        'fill-opacity': 0.88,
      },
    });
    expect(mapInstances[0].moveLayer).toHaveBeenCalledWith(MAP_BROWSE_MASK_LAYER_ID);
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

  it('connects both Ghost badge frames to the heart flash color without changing their base color', () => {
    render(<MapMarkerPin marker={{
      id: 'ghost-badges', displayName: 'River', displayMode: 'GHOST',
      approximateLatitude: 40.72, approximateLongitude: -74.01,
      roleBadge: { kind: 'role', iconName: 'switch', label: 'Switch' },
      badge: createMapMarkerBadge(['Versatile']),
    }} />);
    for (const side of ['role', 'position']) {
      expect(screen.getByTestId(`marker-${side}-badge-ghost-badges`).querySelector('svg[stroke]'))
        .toHaveAttribute('stroke', 'var(--cruush-ghost-flash-border-color, #FF0072)');
    }
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
    expect(screen.queryByTestId('owner-ghost-rotation-countdown')).not.toBeInTheDocument();
    expect(marker).toHaveAttribute('data-marker-theme', 'nearby');
    expect(marker.querySelector('path[fill]')).toHaveAttribute('fill', 'url(#marker-fill-ghost-static)');
    expect(marker.querySelector('path[stroke]')).toHaveAttribute('stroke', '#FF0072');
    expect(marker.querySelector('path[fill="#FF0072"]')).toBeNull();
    expect(marker.querySelector('path[style*="transform"]')).toBeNull();
  });

  it('shows the ghost mark on the owner decoy and on nobody else', async () => {
    const { unmount } = render(
      <MapView
        markers={[{
          id: 'ghost-other',
          displayName: 'River',
          approximateLatitude: 40.72,
          approximateLongitude: -74.01,
          displayMode: 'GHOST',
        }]}
      />,
    );

    // Outside the last-minute rotation animation, a ghosted profile must look
    // like any other profile to everyone but its owner.
    await screen.findByTestId('marker-heart-ghost-other');
    expect(screen.queryByTestId('marker-ghost-decoy-mark-ghost-other')).not.toBeInTheDocument();
    unmount();

    render(
      <MapView
        markers={[{
          id: 'ghost-owner',
          displayName: 'Me',
          approximateLatitude: 40.72,
          approximateLongitude: -74.01,
          displayMode: 'GHOST',
          isCurrentUser: true,
        }]}
      />,
    );

    await screen.findByTestId('marker-heart-ghost-owner');
    // The decoy is the Pepper's ghost from the rotation animation: the
    // apparition behind the electric-blue border, with no mark drawn over it.
    expect(screen.queryByTestId('marker-ghost-decoy-mark-ghost-owner')).not.toBeInTheDocument();
    expect(screen.getByTestId('marker-ghost-border-ghost-owner')).toHaveAttribute('stroke', '#0BA8FF');
  });

  it('uses the approved deadline-driven Ghost animation when a pin mounts inside the last minute', () => {
    render(
      <MapMarkerPin
        marker={{
          id: 'ghost-load-window',
          displayName: 'River',
          approximateLatitude: 40.72,
          approximateLongitude: -74.01,
          displayMode: 'GHOST',
          animationHint: 'FADE_LAST_MINUTE',
          ghostRotationExpiresAtMs: Date.now() + 30_000,
        }}
      />,
    );

    expect(screen.getByTestId('marker-ghost-pulse-ghost-load-window')).toBeInTheDocument();
    expect(screen.queryByTestId('marker-ghost-fly-icon-ghost-load-window')).not.toBeInTheDocument();
    expect(screen.queryByTestId('marker-ghost-puff-ghost-load-window')).not.toBeInTheDocument();
  });

  it('animates a Ghost pin that first appears within the first refetch of its last minute', () => {
    // Other viewers only receive the deadline once the last minute has begun,
    // and that remounts the pin a few seconds in. That copy must still animate.
    render(
      <MapMarkerPin
        marker={{
          id: 'ghost-fresh-window',
          displayName: 'River',
          approximateLatitude: 40.72,
          approximateLongitude: -74.01,
          displayMode: 'GHOST',
          animationHint: 'FADE_LAST_MINUTE',
          ghostRotationExpiresAtMs: Date.now() + 52_000,
        }}
      />,
    );

    expect(screen.getByTestId('marker-ghost-pulse-ghost-fresh-window')).toBeInTheDocument();
  });

  it('still animates a Ghost rotation window entered after the pin mounts', () => {
    const ghostRotationExpiresAtMs = Date.now() + 30_000;
    const marker = {
      id: 'ghost-later-window',
      displayName: 'River',
      approximateLatitude: 40.72,
      approximateLongitude: -74.01,
      displayMode: 'GHOST' as const,
      animationHint: 'NONE' as const,
      ghostRotationExpiresAtMs,
    };
    const { rerender } = render(<MapMarkerPin marker={marker} />);

    rerender(
      <MapMarkerPin
        marker={{
          ...marker,
          animationHint: 'FADE_LAST_MINUTE',
        }}
      />,
    );

    expect(screen.getByTestId('marker-ghost-pulse-ghost-later-window')).toBeInTheDocument();
  });

  it('plays the deployed Ghost exit for an owner MHC decoy while leaving its plane static', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T12:00:00Z'));
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
    const marker = {
      id: 'owner-mhc-rotation', displayName: 'Your Ghost pin', isCurrentUser: true,
      travelling: true, displayMode: 'GHOST' as const, animationHint: 'NONE' as const,
      approximateLatitude: 40.72, approximateLongitude: -74.01,
      ghostRotationExpiresAtMs: Date.now() + 5_000,
    };
    const { rerender } = render(<MapMarkerPin marker={marker} />);
    rerender(<MapMarkerPin marker={{ ...marker, animationHint: 'FADE_LAST_MINUTE' }} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(16); });
    const pulse = screen.getByTestId('marker-ghost-pulse-owner-mhc-rotation');
    expect(pulse.style.transform).toBe('');
    expect(screen.getByTestId('marker-mile-high-owner-mhc-rotation')).toHaveAttribute('data-contrail-style', 'reduced-motion');
    const plane = screen.getByTestId('marker-mile-high-plane-owner-mhc-rotation');
    const initialPlane = plane.outerHTML;
    await act(async () => { await vi.advanceTimersByTimeAsync(3_100); });
    const flyIcon = screen.getByTestId('marker-ghost-fly-icon-owner-mhc-rotation');
    expect(flyIcon.tagName).toBe('IMG');
    expect(flyIcon).toHaveClass('w-[4.39875rem]');
    expect(flyIcon).toHaveAttribute('src', expect.stringContaining('cruush%20Ghost%20Mode%20icon'));
    expect(screen.getByTestId('marker-ghost-puff-owner-mhc-rotation')).toBeInTheDocument();
    expect(pulse).toHaveAttribute('data-ghost-rotation-exit', 'true');
    expect(plane.outerHTML).toBe(initialPlane);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(pulse).toHaveAttribute('data-ghost-rotation-exit', 'true');
    expect(pulse.style.transform).toBe('');
  });

  it('does not reveal an expired other-member decoy while its replacement is loading', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T06:00:00Z'));
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const marker = {
      id: 'ghost-replacement', displayName: 'River', displayMode: 'GHOST' as const,
      animationHint: 'FADE_LAST_MINUTE' as const,
      approximateLatitude: 40.72, approximateLongitude: -74.01,
      ghostRotationExpiresAtMs: Date.now() + 5_000,
    };
    const { rerender } = render(<MapMarkerPin marker={marker} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_500); });
    expect(screen.getByTestId('marker-ghost-pulse-ghost-replacement')).toHaveAttribute('data-ghost-rotation-exit', 'true');
    rerender(<MapMarkerPin marker={{ ...marker, approximateLatitude: 40.73, ghostRotationExpiresAtMs: Date.now() + 900_000 }} />);
    expect(screen.getByTestId('marker-ghost-pulse-ghost-replacement')).toHaveAttribute('data-ghost-rotation-exit', 'false');
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
    expect(mapInstances[0].fitBounds).toHaveBeenCalledWith(
      [[-74.004, 40.714], [-74.001, 40.72]],
      {
        padding: { top: 180, right: 220, bottom: 190, left: 88 },
        maxZoom: 14,
        duration: 500,
      },
    );
  });

  it('reserves wider right-side map chrome space on narrow screens', () => {
    expect(ghostLeashCameraPadding(412)).toEqual({ top: 180, right: 220, bottom: 190, left: 88 });
    expect(ghostLeashCameraPadding(1280)).toEqual({ top: 120, right: 160, bottom: 140, left: 120 });
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

    await waitFor(() => expect(mapInstances).toHaveLength(1));
    act(() => { mapInstances[0].getZoom.mockReturnValue(16); mapInstances[0].trigger('zoomend'); });
    expect(await screen.findByTestId('marker-photo-fill-me')).toHaveAttribute('href', 'https://example.com/me.jpg');
    expect(screen.getByTestId('marker-heart-me')).toHaveAttribute('data-has-photo', 'true');
    expect(screen.getByTestId('marker-heart-me')).toHaveAttribute('data-marker-theme', 'current');
    expect(screen.getByTestId('marker-heart-me').querySelector('path[stroke]')).toHaveAttribute('stroke', '#004BFF');
    expect(screen.queryByTestId('marker-current-fallback-me')).not.toBeInTheDocument();
    expect(screen.getByTestId('marker-photo-fill-user-photo')).toHaveAttribute('href', 'https://example.com/kai.jpg');
    expect(screen.getByTestId('marker-heart-user-photo')).toHaveAttribute('data-has-photo', 'true');
    expect(screen.getByTestId('marker-heart-user-photo')).toHaveAttribute('data-marker-theme', 'nearby');
    expect(screen.queryByLabelText('versatile')).not.toBeInTheDocument();
    expect(screen.getByLabelText('position: versatile')).toBeInTheDocument();
    expect(screen.queryByText('12m ago')).not.toBeInTheDocument();
  });

  it('keeps another expired Ghost pin hidden until its fresh position arrives without hiding the owner', () => {
    vi.useFakeTimers();
    const deadline = Date.now() + 1_000;
    const marker = { id: 'other-ghost', displayName: 'River', displayMode: 'GHOST' as const, approximateLatitude: 40.72, approximateLongitude: -74.01, ghostRotationExpiresAtMs: deadline };
    const { rerender } = render(<MapMarkerPin marker={marker} />);
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId('marker-pin-unit-other-ghost')).toHaveStyle({ visibility: 'hidden' });
    rerender(<MapMarkerPin marker={{ ...marker, approximateLatitude: 40.725, ghostRotationExpiresAtMs: deadline + 60_000 }} />);
    expect(screen.getByTestId('marker-pin-unit-other-ghost')).not.toHaveStyle({ visibility: 'hidden' });
    rerender(<MapMarkerPin marker={{ ...marker, isCurrentUser: true }} />);
    expect(screen.getByTestId('marker-pin-unit-other-ghost')).not.toHaveStyle({ visibility: 'hidden' });
    vi.useRealTimers();
  });

  it('retries a failed map photo once, then uses the existing gradient and accepts a changed photo', async () => {
    const marker = { id: 'failed-photo', displayName: 'River', approximateLatitude: 40.72, approximateLongitude: -74.01, photo: 'https://example.com/broken.jpg', photoExplicit: false };
    const { rerender } = render(<MapView onPinClick={vi.fn()} markers={[marker]} />);
    fireEvent.error(await screen.findByTestId('marker-photo-fill-failed-photo'));
    expect(screen.getByTestId('marker-photo-fill-failed-photo')).toHaveAttribute('href', 'https://example.com/broken.jpg?cruushPhotoRetry=1');
    expect(screen.getByTestId('marker-heart-failed-photo')).toHaveAttribute('data-has-photo', 'true');
    fireEvent.error(screen.getByTestId('marker-photo-fill-failed-photo'));
    expect(screen.queryByTestId('marker-photo-fill-failed-photo')).not.toBeInTheDocument();
    expect(screen.getByTestId('marker-heart-failed-photo')).toHaveAttribute('data-has-photo', 'false');
    expect(screen.getByTestId('marker-heart-failed-photo').querySelector('path[fill="url(#marker-fill-failed-photo)"]')).not.toBeNull();
    rerender(<MapView onPinClick={vi.fn()} markers={[{ ...marker, photo: 'https://example.com/replacement.jpg' }]} />);
    expect(await screen.findByTestId('marker-photo-fill-failed-photo')).toHaveAttribute('href', 'https://example.com/replacement.jpg');
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
    expect(screen.getByTestId('marker-position-badge-ghost-photo')).toHaveStyle({ color: '#FF0072' });
    // The capsule border tracks the unit's own border colour.
    expect(screen.getByTestId('marker-signal-badge-ghost-photo').getAttribute('style')).toContain('#FF0072');
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
    expect(screen.getByTestId('marker-position-badge-me')).toHaveStyle({ color: '#0BA8FF' });
    expect(screen.getByTestId('marker-signal-badge-me').getAttribute('style')).toContain('#0BA8FF');
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
    // Tall enough to hold the ghost exit animation without clipping it.
    expect(markerInstances[0].element).toHaveClass('h-[128px]', 'w-[103px]');
    expect(screen.getByTestId('marker-position-badge-user-mutual')).toHaveStyle({ color: '#6F00FF' });
    expect(screen.getByLabelText('position: bottom')).toBeInTheDocument();
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
            signal: 'Around tonight',
          },
        ]}
      />
    );

    expect(await screen.findByRole('button', { name: 'Open Noor on map' })).toBeInTheDocument();
    expect(markerInstances[0].element.className).not.toContain('hover:scale');
    expect(markerInstances[0].element.className).not.toContain('hover:drop-shadow');
    expect(markerInstances[0].element.className).not.toContain('transition-[filter]');
    markerInstances[0].element.style.zIndex = '37';

    const markerButton = screen.getByRole('button', { name: 'Open Noor on map' });
    const pointerEnter = new Event('pointerenter', { bubbles: true });
    Object.defineProperty(pointerEnter, 'pointerType', { value: 'mouse' });
    fireEvent(markerButton, pointerEnter);

    expect(markerButton).toHaveAttribute('aria-pressed', 'true');
    expect(markerInstances[0].element.style.zIndex).toBe('110');
    expect(screen.getByTestId('marker-heart-layer-user-hover')).toHaveClass('scale-[1.38]');
    expect(screen.getByTestId('marker-signal-stack-user-hover')).toHaveClass('opacity-100');

    const pointerLeave = new Event('pointerleave', { bubbles: true });
    Object.defineProperty(pointerLeave, 'pointerType', { value: 'mouse' });
    fireEvent(markerButton, pointerLeave);

    expect(markerButton).toHaveAttribute('aria-pressed', 'false');
    expect(markerInstances[0].element.style.zIndex).toBe('37');
    expect(screen.getByTestId('marker-heart-layer-user-hover')).not.toHaveClass('scale-[1.38]');
    expect(screen.getByTestId('marker-signal-stack-user-hover')).toHaveClass('opacity-0');
  });

  it('raises a hovered pin unit even when it has no signal text', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'user-hover-no-signal',
            displayName: 'Noor',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            lastActiveLabel: '8m ago',
          },
        ]}
      />
    );

    const markerButton = await screen.findByRole('button', { name: 'Open Noor on map' });
    markerInstances[0].element.style.zIndex = '37';

    fireEvent.pointerEnter(markerButton, { pointerType: 'mouse' });

    expect(markerInstances[0].element.style.zIndex).toBe('110');
    expect(screen.getByTestId('marker-heart-layer-user-hover-no-signal')).toHaveClass('scale-[1.38]');

    fireEvent.pointerLeave(markerButton, { pointerType: 'mouse' });

    expect(markerInstances[0].element.style.zIndex).toBe('37');
  });

  it('shows only the most recently hovered pin unit', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'user-first-hover',
            displayName: 'Noor',
            approximateLatitude: 40.72,
            approximateLongitude: -74.01,
            signal: 'First signal',
          },
          {
            id: 'user-latest-hover',
            displayName: 'Ira',
            approximateLatitude: 40.75,
            approximateLongitude: -74.04,
            signal: 'Latest signal',
          },
        ]}
      />
    );

    const firstPin = await screen.findByRole('button', { name: 'Open Noor on map' });
    const latestPin = screen.getByRole('button', { name: 'Open Ira on map' });

    fireEvent.pointerEnter(firstPin, { pointerType: 'mouse' });
    expect(screen.getByTestId('marker-heart-layer-user-first-hover')).toHaveClass('scale-[1.38]');
    expect(screen.getByTestId('marker-signal-stack-user-first-hover')).toHaveClass('opacity-100');

    fireEvent.pointerEnter(latestPin, { pointerType: 'mouse' });
    expect(screen.getByTestId('marker-heart-layer-user-first-hover')).not.toHaveClass('scale-[1.38]');
    expect(screen.getByTestId('marker-signal-stack-user-first-hover')).toHaveClass('opacity-0');
    expect(screen.getByTestId('marker-heart-layer-user-latest-hover')).toHaveClass('scale-[1.38]');
    expect(screen.getByTestId('marker-signal-stack-user-latest-hover')).toHaveClass('opacity-100');
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
    expect(screen.getByTestId('marker-heart-layer-user-touch-preview')).not.toHaveClass('scale-[1.38]');
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

    act(() => vi.advanceTimersByTime(299));
    expect(markerButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('marker-signal-stack-user-touch-hold')).toHaveClass('opacity-0');

    act(() => vi.advanceTimersByTime(1));

    expect(markerButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('marker-heart-layer-user-touch-hold')).toHaveClass('scale-[1.38]');
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
    expect(screen.getByTestId('marker-heart-layer-user-touch-hold')).not.toHaveClass('scale-[1.38]');
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
    act(() => vi.advanceTimersByTime(300));

    const currentButton = screen.getByRole('button', { name: 'Open Ari on map' });
    expect(currentButton).toBe(originalButton);
    expect(currentButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('marker-heart-layer-user-touch-rerender')).toHaveClass('scale-[1.38]');
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
    act(() => vi.advanceTimersByTime(300));

    expect(markerButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('marker-heart-layer-user-touch-pan')).not.toHaveClass('scale-[1.38]');
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
    expect(signalStack).toHaveClass('opacity-0');
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
    const pinUnit = screen.getByTestId('marker-pin-unit-user-pinging');
    const signalBadge = screen.getByTestId('marker-signal-badge-user-pinging');
    const positionBadge = screen.getByTestId('marker-position-badge-user-pinging');
    expect(signalStack).toHaveClass('opacity-100');
    expect(signalStack).not.toHaveClass('opacity-0');
    expect(screen.queryByTestId('marker-post-preview-user-pinging')).not.toBeInTheDocument();
    expect(heart).toHaveClass('z-10');
    expect(heart).not.toHaveClass('cruush-map-ping-heart');
    expect(heartLayer).toHaveClass('cruush-map-ping-heart');
    expect(heartLayer).not.toHaveClass('group-hover:scale-[1.38]', 'group-focus-within:scale-[1.38]');
    expect(pinUnit).toHaveClass('scale-100');
    expect(heart.querySelector('path[stroke="#C8FF31"]')).not.toBeNull();
    expect(signalBadge.getAttribute('style')).toContain('#C8FF31');
    expect(signalBadge).not.toHaveClass('shadow-[0_12px_30px_rgba(0,0,0,0.45)]');
    expect(positionBadge).toHaveStyle({ color: '#C8FF31' });
    expect(heartLayer).toContainElement(positionBadge);
    expect(heartLayer).toContainElement(signalStack);
    expect(markerInstances[0].element).toHaveAttribute('data-active-ping', 'true');
    expect(screen.queryByTestId('marker-ping-rings-user-pinging')).not.toBeInTheDocument();
    const unchangedFill = heart.querySelector('path[fill="url(#marker-fill-user-pinging)"]');
    expect(unchangedFill).toHaveAttribute('fill-opacity', '1');
    expect(heart.querySelector('path[fill="#C8FF31"]')).toBeNull();
    const pinEkg = screen.getByTestId('pulse-ekg-pin');
    expect(pinEkg.tagName.toLowerCase()).toBe('g');
    expect(pinEkg).toHaveAttribute('clip-path', 'url(#marker-photo-clip-user-pinging)');
    expect(PULSE_EKG_PIN_PATH).toMatch(/^M8 32/);
    expect(PULSE_EKG_PIN_PATH).toMatch(/h18$/);
    expect(pinEkg.querySelectorAll(`path[d="${PULSE_EKG_PIN_PATH}"]`)).toHaveLength(2);
    expect(pinEkg.querySelectorAll('path[fill]')).toHaveLength(0);
  });

  it('retains the approved vector map on tile failure and recovers without a CARTO fallback', async () => {
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

    expect(MockMap.calls).toHaveLength(1);
    expect(mapInstances[0].remove).not.toHaveBeenCalled();
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
    expect(screen.getByText(/Map tiles could not load/i)).toBeInTheDocument();

    act(() => {
      mapInstances[0].trigger('load');
    });

    await waitFor(() => expect(screen.queryByText(/Loading NYC map/i)).not.toBeInTheDocument());
    expect(screen.queryByText(/Map tiles could not load/i)).not.toBeInTheDocument();
  });

  it('keeps the approved vector source during a slow load instead of starting a CARTO fallback', async () => {
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

    expect(MockMap.calls).toHaveLength(1);
    expect(mapInstances[0].remove).not.toHaveBeenCalled();
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

    act(() => {
      mapInstances[0].trigger('load');
    });

    expect(screen.queryByText(/Loading NYC map/i)).not.toBeInTheDocument();
  });

  it('does not hide a vector tile failure merely because an empty canvas rendered', async () => {
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
      vi.advanceTimersByTime(500);
      mapInstances[0].trigger('error', { error: new Error('tilejson failed') });
      vi.advanceTimersByTime(4000);
    });

    expect(MockMap.calls).toHaveLength(1);
    expect(screen.getByText(/Map tiles could not load/i)).toBeInTheDocument();

    act(() => {
      mapInstances[0].trigger('render');
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByText(/Map tiles could not load/i)).toBeInTheDocument();

    act(() => {
      mapInstances[0].trigger('load');
    });

    expect(screen.queryByText(/Loading NYC map/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Map tiles could not load/i)).not.toBeInTheDocument();
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

  it('keeps the owner and owner Ghost decoy out of clusters through zoom and same-building spiderfy', async () => {
    const onPinClick = vi.fn();
    const owner: MapMarker = {
      id: 'me', displayName: 'You',
      approximateLatitude: 40.7128, approximateLongitude: -73.99,
    };
    const decoy: MapMarker = {
      id: 'me-ghost-decoy', displayName: 'Your Ghost pin', isCurrentUser: true,
      displayMode: 'GHOST', ghostRotationExpiresAtMs: Date.now() + 60_000,
      approximateLatitude: 40.7148, approximateLongitude: -73.99,
    };
    const nearby: MapMarker = {
      id: 'nearby', displayName: 'Nearby', approximateLatitude: owner.approximateLatitude + 0.0008,
      approximateLongitude: owner.approximateLongitude,
    };
    const neighbor: MapMarker = { ...nearby, id: 'neighbor', displayName: 'Neighbor' };
    render(<MapView onPinClick={onPinClick} markers={[owner, decoy, nearby, neighbor]} />);
    await waitFor(() => expect(mapInstances).toHaveLength(1));
    for (const zoom of [10, 12, 16, 20, 12]) {
      act(() => {
        mapInstances[0].getZoom.mockReturnValue(zoom);
        mapInstances[0].trigger('zoomend');
      });
      await screen.findByRole('button', { name: 'Open 2 nearby people sharing this map spot' });
      expect(screen.getByRole('button', { name: 'Show your pin details' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show your Ghost Mode decoy details' })).toBeInTheDocument();
      const visible = markerInstances.filter((marker) => marker.element.isConnected);
      expect(visible).toHaveLength(3);
      const clusterMarker = visible.find((candidate) => candidate.element.querySelector('[data-testid^="people-cluster-marker-"]'));
      for (const original of [owner, decoy]) {
        const marker = visible.find((candidate) => candidate.element.querySelector(`[data-testid="marker-pin-unit-${original.id}"]`));
        expect(marker?.coordinates).toEqual([original.approximateLongitude, original.approximateLatitude]);
        expect(marker?.offset).toBeNull();
        expect(Number(marker?.element.style.zIndex)).toBeGreaterThan(Number(clusterMarker?.element.style.zIndex));
      }
    }

    const cluster = await screen.findByRole('button', { name: 'Open 2 nearby people sharing this map spot' });
    const collapsed = markerInstances.filter((marker) => marker.element.isConnected);
    expect(collapsed).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Open Nearby on map' })).not.toBeInTheDocument();

    fireEvent.click(cluster);
    const nearbyButton = await screen.findByRole('button', { name: 'Open Nearby on map' });
    const expanded = markerInstances.filter((marker) => marker.element.isConnected);
    expect(expanded).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Open 2 nearby people sharing this map spot' })).toBeInTheDocument();
    for (const original of [owner, decoy, nearby, neighbor]) {
      const marker = expanded.find((candidate) => candidate.element.querySelector(`[data-testid="marker-pin-unit-${original.id}"]`));
      expect(marker?.coordinates).toEqual([original.approximateLongitude, original.approximateLatitude]);
      if (original === owner || original === decoy) expect(marker?.offset).toBeNull();
      else expect(Math.hypot(...(marker?.offset ?? [0, 0]))).toBeGreaterThan(0);
    }
    expect(mapInstances[0].fitBounds).not.toHaveBeenCalled();
    expect(mapInstances[0].setZoom).not.toHaveBeenCalled();
    expect(onPinClick).not.toHaveBeenCalled();
    fireEvent.click(nearbyButton);
    expect(onPinClick).toHaveBeenCalledWith(expect.objectContaining(nearby));
  });

  it('removes an expired other Ghost from a people cluster at its visibility deadline', async () => {
    vi.useFakeTimers();
    try {
      const deadline = Date.now() + 1_000;
      await act(async () => {
        render(<MapView onPinClick={vi.fn()} markers={[
          { id: 'me', displayName: 'You', isCurrentUser: true, approximateLatitude: 40.7128, approximateLongitude: -73.99 },
          { id: 'other-person', displayName: 'Nearby', approximateLatitude: 40.7128, approximateLongitude: -73.99 },
          { id: 'other-ghost', displayName: 'River', displayMode: 'GHOST', ghostRotationExpiresAtMs: deadline, approximateLatitude: 40.7128, approximateLongitude: -73.99 },
        ]} />);
      });
      expect(screen.getByRole('button', { name: 'Open 2 nearby people sharing this map spot' })).toBeInTheDocument();
      await act(async () => { vi.advanceTimersByTime(1_000); });
      expect(screen.queryByRole('button', { name: 'Open 2 nearby people sharing this map spot' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show your pin details' })).toBeInTheDocument();
      expect(screen.getByTestId('marker-pin-unit-other-ghost')).toHaveStyle({ visibility: 'hidden' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps unclustered people at their anchors through zoom and metadata changes', async () => {
    const markers: MapMarker[] = [
      { id: 'me', displayName: 'You', isCurrentUser: true, approximateLatitude: 40.7128, approximateLongitude: -73.99 },
      { id: 'far-person', displayName: 'Far person', approximateLatitude: 40.73, approximateLongitude: -73.96 },
    ];
    const view = render(<MapView onPinClick={vi.fn()} markers={markers} />);
    await screen.findByRole('button', { name: 'Open Far person on map' });
    for (const zoom of [16, 18.9, 20, 18.9, 16]) {
      act(() => {
        mapInstances[0].getZoom.mockReturnValue(zoom);
        mapInstances[0].trigger('zoomend');
      });
      await waitFor(() => {
        const visible = markerInstances.filter((marker) => marker.element.isConnected);
        expect(visible).toHaveLength(2);
        for (const original of markers) {
          const marker = visible.find((candidate) => candidate.element.querySelector(`[data-testid="marker-pin-unit-${original.id}"]`));
          expect(marker?.coordinates).toEqual([original.approximateLongitude, original.approximateLatitude]);
          expect(marker?.offset).toBeNull();
        }
      });
    }
    view.rerender(<MapView onPinClick={vi.fn()} markers={markers.map((marker) => ({ ...marker, displayName: `${marker.displayName} refreshed` }))} />);
    await screen.findByRole('button', { name: 'Open Far person refreshed on map' });
    expect(markerInstances.filter((marker) => marker.element.isConnected).every((marker) => marker.offset === null)).toBe(true);
  });

  // 0da9639 and 7811c70 made a shared building the only thing that forms a
  // people cluster: anyone further apart than SAME_BUILDING_PROXIMITY_METERS
  // (0.1 mile) keeps their own pin at every zoom, so the old "zoom into N
  // nearby people" cluster no longer exists for ordinary nearby members.
  it('keeps ordinary nearby people on their own pins while preserving the owner', async () => {
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
            privacyRadiusMeters: 10,
          },
          {
            id: 'user-b',
            displayName: 'B',
            approximateLatitude: 40.716,
            approximateLongitude: -73.9902,
            privacyRadiusMeters: 10,
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

    // A and B sit ~355m apart, wider than a shared building, so they stay apart.
    expect(await screen.findByRole('button', { name: 'Open A on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open B on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open C on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show your pin details' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nearby people/ })).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid^="people-cluster-marker-"]')).toBeNull();
    expect(onPinClick).not.toHaveBeenCalled();
    expect(mapInstances[0].fitBounds).not.toHaveBeenCalled();
    expect(mapInstances[0].setCenter).not.toHaveBeenCalled();
  });

  it('keeps people wider than a shared building apart at every zoom', async () => {
    const latitude = 40.7128;
    const longitude = -74.006;
    render(<MapView onPinClick={vi.fn()} markers={[
      { id: 'edge-a', displayName: 'Edge A', approximateLatitude: latitude, approximateLongitude: longitude,
        badge: { kind: 'position', label: 'top', iconName: 'top' } },
      { id: 'edge-b', displayName: 'Edge B', approximateLatitude: latitude,
        approximateLongitude: longitude + 180 / (111195.0802 * Math.cos(latitude * Math.PI / 180)),
        roleBadge: { kind: 'role', label: 'switch', iconName: 'switch' } },
    ]} />);
    // 180m apart is just past the 0.1-mile shared-building limit.
    expect(await screen.findByRole('button', { name: 'Open Edge A on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Edge B on map' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nearby people/ })).not.toBeInTheDocument();
    act(() => {
      mapInstances[0].getZoom.mockReturnValue(15);
      mapInstances[0].trigger('zoomend');
    });
    expect(await screen.findByRole('button', { name: 'Open Edge A on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Edge B on map' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nearby people/ })).not.toBeInTheDocument();
    expect(mapInstances[0].fitBounds).not.toHaveBeenCalled();
    expect(mapInstances[0].setCenter).not.toHaveBeenCalled();
  });

  it('separates ordinary nearby people at every zoom while same-building clusters remain available to spiderfy', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          { id: 'person-a', displayName: 'Person A', approximateLatitude: 40.7128, approximateLongitude: -73.99, privacyRadiusMeters: 10 },
          { id: 'person-b', displayName: 'Person B', approximateLatitude: 40.7158, approximateLongitude: -73.99, privacyRadiusMeters: 10 },
          { id: 'same-a', displayName: 'Same A', approximateLatitude: 40.72, approximateLongitude: -73.98, privacyRadiusMeters: 10 },
          { id: 'same-b', displayName: 'Same B', approximateLatitude: 40.72005, approximateLongitude: -73.98, privacyRadiusMeters: 10 },
        ]}
      />,
    );

    // The 333m pair never merges; the 5.5m pair is one shared building.
    expect(await screen.findByRole('button', { name: 'Open Person A on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Person B on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open 2 nearby people sharing this map spot' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Same A on map' })).not.toBeInTheDocument();
    act(() => {
      mapInstances[0].getZoom.mockReturnValue(14.5);
      mapInstances[0].trigger('zoomend');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open Person A on map' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open Person B on map' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open 2 nearby people sharing this map spot' })).toBeInTheDocument();
    });
  });

  it('shows ordinary profiles 130px apart at every zoom without moving their anchors', async () => {
    const longitude = -73.99;
    const otherLongitude = longitude + 130 * 360 / (512 * 2 ** 14);
    render(<MapView onPinClick={vi.fn()} markers={[
      { id: 'person-a', displayName: 'Person A', approximateLatitude: 40.7128, approximateLongitude: longitude, privacyRadiusMeters: 10 },
      { id: 'person-b', displayName: 'Person B', approximateLatitude: 40.7128, approximateLongitude: otherLongitude, privacyRadiusMeters: 10 },
    ]} />);
    // 130px at zoom 14 is ~430m of real ground, past the shared-building limit,
    // so the pair is separate before the zoom change as well as after it.
    await screen.findByRole('button', { name: 'Open Person A on map' });
    expect(screen.queryByRole('button', { name: /nearby people/ })).not.toBeInTheDocument();
    act(() => {
      mapInstances[0].getZoom.mockReturnValue(14);
      mapInstances[0].trigger('zoomend');
    });
    await screen.findByRole('button', { name: 'Open Person A on map' });
    expect(screen.getByRole('button', { name: 'Open Person B on map' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nearby people/ })).not.toBeInTheDocument();
    const visible = markerInstances.filter((marker) => marker.element.isConnected);
    expect(visible).toHaveLength(2);
    expect(visible.map((marker) => marker.coordinates))
      .toEqual(expect.arrayContaining([[longitude, 40.7128], [otherLongitude, 40.7128]]));
  });

  it('does not merge individual people again while zooming in', async () => {
    render(<MapView onPinClick={vi.fn()} markers={[
      { id: 'a', displayName: 'A', approximateLatitude: 40.7128, approximateLongitude: -73.99, privacyRadiusMeters: 250 },
      { id: 'b', displayName: 'B', approximateLatitude: 40.7128, approximateLongitude: -73.98442100524902, privacyRadiusMeters: 250 },
      { id: 'c', displayName: 'C', approximateLatitude: 40.70759510165198, approximateLongitude: -73.9872105026245, privacyRadiusMeters: 250 },
    ]} />);
    await waitFor(() => expect(mapInstances).toHaveLength(1));
    for (const zoom of [14, 14.04, 14.5, 14.6, 15]) {
      act(() => {
        mapInstances[0].getZoom.mockReturnValue(zoom);
        mapInstances[0].trigger('zoomend');
      });
      for (const name of ['A', 'B', 'C']) await screen.findByRole('button', { name: `Open ${name} on map` });
      expect(screen.queryByRole('button', { name: /Open 2 nearby people sharing/ })).not.toBeInTheDocument();
    }
  });

  it('keeps a people cluster mounted when input order and unrelated clusters change', async () => {
    const onPinClick = vi.fn();
    const markers: MapMarker[] = [
      { id: 'user-a', displayName: 'A', approximateLatitude: 40.7128, approximateLongitude: -73.99 },
      { id: 'user-b', displayName: 'B', approximateLatitude: 40.713, approximateLongitude: -73.9902 },
    ];
    const view = render(<MapView onPinClick={onPinClick} markers={markers} />);
    const cluster = await screen.findByRole('button', { name: 'Open 2 nearby people sharing this map spot' });
    const artworkId = cluster.querySelector('[data-testid]')!.getAttribute('data-testid')!;

    view.rerender(<MapView onPinClick={onPinClick} markers={[
      { id: '0-far-a', displayName: 'Far A', approximateLatitude: 40.76, approximateLongitude: -73.95 },
      { id: '0-far-b', displayName: 'Far B', approximateLatitude: 40.7602, approximateLongitude: -73.9502 },
      ...[...markers].reverse(),
    ]} />);

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Open 2 nearby people sharing this map spot' })).toHaveLength(2));
    expect(screen.getByTestId(artworkId).closest('button')).toBe(cluster);
  });

  it('preserves active Ping artwork after opening a same-building people cluster', async () => {
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
            approximateLatitude: 40.7128,
            approximateLongitude: -73.99,
          },
          {
            id: 'user-b',
            displayName: 'B',
            approximateLatitude: 40.7128,
            approximateLongitude: -73.99,
          },
        ]}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open 3 nearby people sharing this map spot' }));
    expect(await screen.findByRole('button', { name: 'Open Pinging on map' })).toBeInTheDocument();

    const pingMarker = markerInstances.find((instance: any) => instance.element.dataset.activePing === 'true');
    const clusterMarker = markerInstances.find((instance: any) => instance.element.isConnected && instance.element.dataset.activePing === 'false');
    expect(pingMarker?.element.style.zIndex).not.toBe('');
    expect(Number(pingMarker?.element.style.zIndex)).toBeGreaterThan(Number(clusterMarker?.element.style.zIndex || 0));
    expect(screen.getByTestId('pulse-ekg-pin')).toHaveAttribute('clip-path', 'url(#marker-photo-clip-user-pinging)');
  });

  it('keeps a focused person selectable through the same-building people cluster', async () => {
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
            approximateLatitude: 40.7128,
            approximateLongitude: -73.99,
          },
        ]}
      />
    );

    await waitFor(() => expect(mapInstances).toHaveLength(1));
    act(() => { mapInstances[0].getZoom.mockReturnValue(16); mapInstances[0].trigger('zoomend'); });
    fireEvent.click(await screen.findByRole('button', { name: 'Open 2 nearby people sharing this map spot' }));
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
    expect(MAP_TILE_LABEL_SCALE).toBe(1.25);
    expect(layerById.get('minor-road-labels')?.layout['text-size']).toEqual(['interpolate', ['linear'], ['zoom'], 12, 11.25, 16, 15]);
    expect(layerById.get('secondary-road-labels')?.layout['text-size']).toEqual(['interpolate', ['linear'], ['zoom'], 12, 13.75, 16, 17.5]);
    expect(layerById.get('primary-road-labels')?.layout['text-size']).toEqual(['interpolate', ['linear'], ['zoom'], 10, 15, 16, 18.75]);
    expect(layerById.get('prominent-road-labels')?.layout['text-size']).toEqual(['interpolate', ['linear'], ['zoom'], 9, 16.25, 16, 20]);
    expect(layerById.get('place-labels')?.layout['text-size']).toEqual(['interpolate', ['linear'], ['zoom'], 8, 16.25, 12, 21.25]);
  });

  it('creates valid MapLibre style JSON for the default vector map', () => {
    expect(validateStyleMin(getMapStyle() as any)).toEqual([]);
  });

  it('ignores external style overrides so the cruush theme remains authoritative', () => {
    vi.stubEnv('VITE_MAP_STYLE_URL', 'https://example.com/custom-style.json');
    vi.stubEnv('VITE_MAP_TILE_URL', 'https://tiles.example.com/{z}/{x}/{y}.png');

    const style = getMapStyle() as any;

    expect(style.sources.openmaptiles.url).toBe('https://tiles.openfreemap.org/planet');
    expect(style.layers.some((layer: any) => layer.id === 'major-roads')).toBe(true);
  });

  it('rejects CARTO even when configured as the vector source', () => {
    vi.stubEnv('VITE_MAP_VECTOR_TILEJSON_URL', 'https://a.basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json');

    expect(() => getMapStyle()).toThrow('CARTO map sources are not allowed');
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

  it('ignores retired raster flags and keeps the approved vector theme', () => {
    vi.stubEnv('VITE_MAP_USE_RASTER_TILES', 'true');
    vi.stubEnv('VITE_MAP_TILE_URL', 'https://tiles.example.com/{z}/{x}/{y}.png');
    vi.stubEnv('VITE_MAP_ATTRIBUTION', '&copy; Example Tiles');

    const style = getMapStyle() as any;

    expect(style.sources.openmaptiles).toEqual({
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
    });
    expect(style.sources.osmRasterTiles).toBeUndefined();
    expect(style.layers.some((layer: any) => layer.type === 'raster')).toBe(false);
    expect(style.layers.some((layer: any) => layer.id === 'major-roads')).toBe(true);
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

describe('spiderfy clusters', () => {
  it('keeps wider people apart even when disclosed privacy areas overlap', async () => {
    render(
      <MapView
        onPinClick={vi.fn()}
        markers={[
          {
            id: 'a', displayName: 'A', approximateLatitude: 40.7128, approximateLongitude: -73.99,
            privacyRadiusMeters: 250,
          },
          {
            id: 'b', displayName: 'B', approximateLatitude: 40.7159, approximateLongitude: -73.99,
            privacyRadiusMeters: 250,
          },
        ]}
      />,
    );

    // Both disclose a 250m privacy radius, so their circles overlap, but they
    // are ~344m apart: only real shared-building proximity forms a cluster.
    expect(await screen.findByRole('button', { name: 'Open A on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open B on map' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nearby people/ })).not.toBeInTheDocument();
    expect(mapInstances[0].fitBounds).not.toHaveBeenCalled();
  });

  it('opens a same-building people fan on hover and pins it open with a click', async () => {
    const onPinClick = vi.fn();
    render(
      <MapView
        onPinClick={onPinClick}
        markers={[
          { id: 'a', displayName: 'A', approximateLatitude: 40.7128, approximateLongitude: -73.99 },
          { id: 'b', displayName: 'B', approximateLatitude: 40.7136, approximateLongitude: -73.99 },
        ]}
      />
    );

    const cluster = await screen.findByRole('button', { name: 'Open 2 nearby people sharing this map spot' });
    fireEvent.pointerEnter(cluster, { pointerType: 'mouse' });
    expect(await screen.findByRole('button', { name: 'Open A on map' })).toBeInTheDocument();
    const expandedMarkers = markerInstances.filter((instance: any) => instance.element.isConnected);
    const createdMarkerCount = markerInstances.length;

    expect(cluster.isConnected).toBe(true);
    fireEvent.click(cluster);
    await act(async () => Promise.resolve());
    expect(markerInstances).toHaveLength(createdMarkerCount);
    expect(expandedMarkers.every((instance: any) => instance.element.isConnected)).toBe(true);
    fireEvent.pointerEnter(cluster, { pointerType: 'mouse' });
    const pinnedMember = await screen.findByRole('button', { name: 'Open B on map' });
    fireEvent.pointerLeave(pinnedMember, { pointerType: 'mouse', relatedTarget: document.body });

    expect(screen.getByRole('button', { name: 'Open A on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open B on map' })).toBeInTheDocument();
    expect(onPinClick).not.toHaveBeenCalled();
  });

  it('opens a same-building people fan on a mobile long press and keeps it open after a tap', async () => {
    const onPinClick = vi.fn();
    render(
      <MapView
        onPinClick={onPinClick}
        markers={[
          { id: 'a', displayName: 'A', approximateLatitude: 40.7128, approximateLongitude: -73.99 },
          { id: 'b', displayName: 'B', approximateLatitude: 40.7136, approximateLongitude: -73.99 },
        ]}
      />,
    );

    const cluster = await screen.findByRole('button', { name: 'Open 2 nearby people sharing this map spot' });
    const pointerDown = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(pointerDown, 'pointerType', { value: 'touch' });
    fireEvent(cluster, pointerDown);
    await new Promise((resolve) => window.setTimeout(resolve, 320));

    const member = await screen.findByRole('button', { name: 'Open A on map' });
    fireEvent.pointerUp(cluster, { pointerType: 'touch' });
    const memberPointerDown = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(memberPointerDown, 'pointerType', { value: 'touch' });
    await act(async () => {
      fireEvent(member, memberPointerDown);
      fireEvent.pointerUp(member, { pointerType: 'touch' });
      fireEvent.click(member, { detail: 1 });
      await Promise.resolve();
    });
    fireEvent.pointerLeave(member, { pointerType: 'mouse', relatedTarget: document.body });

    expect(screen.getByRole('button', { name: 'Open A on map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open B on map' })).toBeInTheDocument();
    expect(onPinClick).not.toHaveBeenCalled();
  });

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

    const offsets = markerInstances.filter((m: any) => m.element.isConnected).map((m: any) => m.offset).filter(Boolean);
    expect(offsets).toHaveLength(3);
    // Every member gets a distinct offset so none of them stack.
    expect(new Set(offsets.map((o: number[]) => o.join(','))).size).toBe(3);
    // Keep the fan compact: each heart stays within one heart-width of the
    // shared coordinate instead of using the older extra-wide clearance.
    expect(Math.max(...offsets.map((offset: number[]) => Math.hypot(...offset)))).toBeLessThanOrEqual(95);
  });

  it('uses the earlier Spot cluster marker while keeping Spot numbers for checked-in users', async () => {
    const { unmount } = render(
      <MapMarkerPin
        marker={{
          id: 'place-checkins',
          kind: 'place',
          displayName: 'Checked-in Spot',
          approximateLatitude: 40.7,
          approximateLongitude: -74,
          place: { id: 'checked-in', facilityType: 'bar', activeCheckins: 4 },
        }}
      />,
    );

    expect(screen.getByTestId('spot-checkin-count')).toHaveTextContent('4');
    expect(screen.queryByTestId('spot-cluster-count')).not.toBeInTheDocument();
    unmount();

    const onPinClick = vi.fn();
    render(
      <MapView
        onPinClick={onPinClick}
        markers={[
          {
            id: 'person-a',
            kind: 'person',
            displayName: 'Person A',
            approximateLatitude: 40.7128,
            approximateLongitude: -73.99,
          },
          {
            id: 'place-a',
            kind: 'place',
            displayName: 'Spot A',
            approximateLatitude: 40.7128,
            approximateLongitude: -73.99,
            place: { id: 'a', facilityType: 'bar', activeCheckins: 4 },
          },
          {
            id: 'place-b',
            kind: 'place',
            displayName: 'Spot B',
            approximateLatitude: 40.7128,
            approximateLongitude: -73.99,
            place: { id: 'b', facilityType: 'clinic', activeCheckins: 0 },
          },
        ]}
      />
    );

    expect(await screen.findByRole('button', { name: 'Open Person A on map' })).toBeInTheDocument();
    const cluster = screen.getByRole('button', { name: 'Open 2 spots on map' });
    expect(screen.getByTestId(/^venue-cluster-marker-places-/)).toHaveTextContent('2');
    expect(screen.queryByTestId('spot-cluster-count')).not.toBeInTheDocument();
    const map = mapInstances.at(-1)!;
    map.getZoom.mockReturnValue(12);

    await act(async () => {
      fireEvent.click(cluster);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(map.setZoom).toHaveBeenCalledWith(15.5);
    expect(screen.queryByRole('button', { name: 'Open Spot A Pink Book' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Spot B Pink Book' })).not.toBeInTheDocument();
    expect(onPinClick).not.toHaveBeenCalled();

    map.getZoom.mockReturnValue(15.5);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open 2 spots on map' }));
      await Promise.resolve();
    });
    expect(onPinClick).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'place',
      place: expect.objectContaining({ id: 'a' }),
    }));
  });
});

describe('stable Spot clusters', () => {
  const markerAtOffset = (id: string, offsetX: number, zoom: number): MapMarker => ({
    id,
    kind: 'place',
    displayName: id,
    approximateLatitude: 40.68,
    approximateLongitude: -73.95 + offsetX / (512 * 2 ** zoom) * 360,
  });
  const normalized = (markers: MapMarker[]) => [...markers].sort((a, b) => a.id.localeCompare(b.id));

  it('keeps fixed Spot membership and coordinates through tiny zoom changes and reordered results', () => {
    const zoom = 14.01;
    const markers = Array.from({ length: 7 }, (_, index) => markerAtOffset(`spot-${index}`, index * 63, zoom));
    const before = normalized(applyPlaceMarkerClusters(markers, zoom));
    const after = normalized(applyPlaceMarkerClusters([...markers].reverse(), zoom + 0.0001));

    expect(before.filter((marker) => marker.cluster)).toHaveLength(3);
    expect(after).toEqual(before);
    expect(normalized(applyPlaceMarkerClusters(markers, zoom))).toEqual(before);
    expect(before.flatMap((marker) => marker.cluster?.memberIds ?? [marker.id]).sort())
      .toEqual(markers.map((marker) => marker.id));
    const centers = before.map((marker) => marker.approximateLongitude / 360 * (512 * 2 ** zoom)).sort((a, b) => a - b);
    expect(centers.every((x, index) => index === 0 || x - centers[index - 1] >= 62)).toBe(true);
  });

  it('keeps dense Spot groups nested and clear across meaningful zoom changes', () => {
    const referenceZoom = 14.6;
    const world = 512 * 2 ** referenceZoom;
    const baseX = (-73.95 + 180) / 360 * world;
    const baseY = (0.5 - Math.log((1 + Math.sin(40.68 * Math.PI / 180))
      / (1 - Math.sin(40.68 * Math.PI / 180))) / (4 * Math.PI)) * world;
    let state = 3;
    const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
    const markers: MapMarker[] = Array.from({ length: 300 }, (_, index) => ({
      id: `spot-${String(index).padStart(3, '0')}`,
      kind: 'place',
      displayName: `Spot ${index}`,
      approximateLongitude: (baseX + random() * 720) / world * 360 - 180,
      approximateLatitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * (baseY + random() * 480) / world))) * 180 / Math.PI,
    }));
    const members = (marker: MapMarker) => marker.cluster?.memberIds ?? [marker.id];
    const project = (marker: MapMarker, zoom: number) => {
      const size = 512 * 2 ** zoom;
      const sin = Math.sin(marker.approximateLatitude * Math.PI / 180);
      return [(marker.approximateLongitude + 180) / 360 * size,
        (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size];
    };
    let previous = applyPlaceMarkerClusters(markers, 14.4);
    for (const zoom of [14.5, 14.6, 14.61, 14.8, 15, 15.2]) {
      const next = applyPlaceMarkerClusters(markers, zoom);
      for (const marker of next) {
        expect(previous.some((parent) => members(marker).every((id) => members(parent).includes(id)))).toBe(true);
      }
      const centers = next.map((marker) => project(marker, zoom));
      centers.forEach((center, index) => centers.slice(index + 1).forEach((other) => {
        expect(Math.hypot(center[0] - other[0], center[1] - other[1])).toBeGreaterThanOrEqual(62);
      }));
      expect(next.flatMap(members).sort()).toEqual(markers.map((marker) => marker.id).sort());
      previous = next;
    }
    const initial = normalized(applyPlaceMarkerClusters(markers, 14.6));
    expect(normalized(applyPlaceMarkerClusters(markers, 14.61))).toEqual(initial);
    expect(normalized(applyPlaceMarkerClusters([...markers].reverse(), 14.6))).toEqual(initial);
    const byId = new Map(markers.map((marker) => [marker.id, marker]));
    initial.forEach((marker) => {
      const center = project(marker, 14.6);
      members(marker).forEach((id) => {
        const point = project(byId.get(id)!, 14.6);
        expect(Math.hypot(point[0] - center[0], point[1] - center[1])).toBeLessThan(100);
      });
    });
  });

  it('preserves Spot radius thresholds and maximum zoom without Spot spiderfy', () => {
    const radiusPair = [markerAtOffset('a', 0, 14.5), markerAtOffset('b', 80, 14.5)];
    expect(applyPlaceMarkerClusters(radiusPair, 14.49)).toHaveLength(1);
    expect(applyPlaceMarkerClusters(radiusPair, 14.5)).toEqual(radiusPair);

    const maxZoomPair = [markerAtOffset('a', 0, 15.5), markerAtOffset('b', 65, 15.5)];
    expect(applyPlaceMarkerClusters(maxZoomPair, 15.49)).toHaveLength(1);
    expect(applyPlaceMarkerClusters(maxZoomPair, 15.5)).toEqual(maxZoomPair);

    const sameCoordinate = [markerAtOffset('a', 0, 16), markerAtOffset('b', 0, 16)];
    expect(applyPlaceMarkerClusters(sameCoordinate, 16)[0].cluster)
      .toMatchObject({ action: 'zoom', memberIds: ['a', 'b'], count: 2 });
  });
});

describe('separateOverlappingMarkers', () => {
  const zoom = 14;
  const me = {
    id: 'me',
    displayName: 'Julien',
    approximateLatitude: 40.6782,
    approximateLongitude: -73.9442,
    isCurrentUser: true,
  } as any;

  it('keeps every member at the same coordinates across zoom levels', () => {
    const other = { ...me, id: 'other', displayName: 'Someone', isCurrentUser: false };
    const far = { ...me, id: 'far', isCurrentUser: false, approximateLatitude: 40.7 };
    const markers = [me, other, far];
    const zoomedOut = separateOverlappingMarkers(markers, 10);
    const zoomedIn = separateOverlappingMarkers(markers, 18);

    expect(zoomedOut).toBe(markers);
    expect(zoomedIn).toBe(markers);
    expect(zoomedOut.map(({ approximateLatitude, approximateLongitude }) => [approximateLatitude, approximateLongitude]))
      .toEqual(zoomedIn.map(({ approximateLatitude, approximateLongitude }) => [approximateLatitude, approximateLongitude]));
  });
});


describe('people cluster maximum spread', () => {
  // Every pair in a group has to be inside the 0.1-mile limit. A wider pair no
  // longer downgrades the group to a zoom cluster: it simply does not join it.
  it.each([
    { offsets: [0, 160], clustered: ['Spread 0', 'Spread 1'], separate: [] as string[] },
    { offsets: [0, 162], clustered: [] as string[], separate: ['Spread 0', 'Spread 1'] },
    { offsets: [0, -100, 100], clustered: ['Spread 0', 'Spread 1'], separate: ['Spread 2'] },
  ])('uses the 0.1-mile maximum pair distance for $offsets', async ({ offsets, clustered, separate }) => {
    render(<MapView onPinClick={vi.fn()} markers={offsets.map((meters, index) => ({
      id: `spread-${index}`,
      displayName: `Spread ${index}`,
      approximateLatitude: 40.7128 + meters / 111_195.0802,
      approximateLongitude: -73.99,
      privacyRadiusMeters: 500,
    }))} />);

    for (const name of separate) {
      expect(await screen.findByRole('button', { name: `Open ${name} on map` })).toBeInTheDocument();
    }

    if (clustered.length > 0) {
      expect(await screen.findByRole('button', {
        name: `Open ${clustered.length} nearby people sharing this map spot`,
      })).toBeInTheDocument();
      for (const name of clustered) {
        expect(screen.queryByRole('button', { name: `Open ${name} on map` })).not.toBeInTheDocument();
      }
    } else {
      expect(screen.queryByRole('button', { name: /nearby people/ })).not.toBeInTheDocument();
    }
  });
});
