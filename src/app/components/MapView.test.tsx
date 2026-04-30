import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapView from './MapView';

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

  it('initializes MapLibre and wires map and marker interactions', () => {
    const onMapClick = vi.fn();
    const onMapReady = vi.fn();
    const onPinClick = vi.fn();

    render(
      <MapView
        onMapClick={onMapClick}
        onMapReady={onMapReady}
        onPinClick={onPinClick}
        userLocation={{ lat: 40.73, lng: -73.99 }}
        users={[
          {
            id: 'me',
            name: 'You',
            lat: 40.73,
            lng: -73.99,
          },
          {
            id: 'user-1',
            name: 'Jordan',
            lat: 40.72,
            lng: -74.01,
          },
        ]}
      />
    );

    expect(MockMap.calls).toHaveLength(1);
    expect(onMapReady).toHaveBeenCalledWith(mapInstances[0]);

    mapInstances[0].trigger('click');
    expect(onMapClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open Jordan on map' }));
    expect(onPinClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }));
    expect(screen.queryByRole('button', { name: 'Open You on map' })).not.toBeInTheDocument();
  });
});
