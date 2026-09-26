import { act, fireEvent, within, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlaceDetail from './PlaceDetail';
import type { PlaceBoardMessage, PlaceDetailRecord } from '../lib/placesApi';

const {
  checkIntoPlace,
  checkOutOfPlace,
  deletePlaceBoardMessage,
  getPlace,
  getPlaceBoard,
  getCurrentPosition,
  ratePlace,
  removePlaceRating,
} = vi.hoisted(() => ({
  checkIntoPlace: vi.fn(),
  checkOutOfPlace: vi.fn(),
  deletePlaceBoardMessage: vi.fn(),
  getPlace: vi.fn(),
  getPlaceBoard: vi.fn(),
  getCurrentPosition: vi.fn(),
  ratePlace: vi.fn(),
  removePlaceRating: vi.fn(),
}));

vi.mock('../lib/placesApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/placesApi')>('../lib/placesApi');

  return {
    ...actual,
    checkIntoPlace,
    checkOutOfPlace,
    deletePlaceBoardMessage,
    getPlace,
    getPlaceBoard,
    ratePlace,
    removePlaceRating,
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function makePlace(id: string, name: string): PlaceDetailRecord {
  return {
    id,
    slug: id,
    name,
    description: `${name} description`,
    latitude: 40.7,
    longitude: -74,
    address: `${name} address`,
    facilityType: 'bar',
    status: 'published',
    sourceKind: 'official',
    sourceUrl: null,
    sourceAttribution: null,
    verifiedAt: null,
    createdAt: '2026-08-31T12:00:00.000Z',
    tags: [],
    distanceMiles: 1,
    activeCheckins: 0,
    recentActivityAt: null,
    ratingAverage: null,
    ratingCount: 0,
    viewerRating: null,
    suggestionCount: 0,
    autoShortlistedAt: null,
    popularTimes: [],
    visiblePeople: [],
    ratingBreakdown: [],
    viewerCheckin: null,
  };
}

function makeBoardMessage(id: string, content: string): PlaceBoardMessage {
  return {
    id,
    content,
    createdAt: '2026-08-31T12:00:00.000Z',
    expiresAt: null,
    canDelete: false,
    user: {
      id: `user-${id}`,
      name: `User ${id}`,
      pronouns: 'they/them',
      photo: null,
      vibes: [],
      mutual: false,
    },
  };
}

function placeDetail(placeId: string) {
  return (
    <MemoryRouter>
      <PlaceDetail embedded placeIdOverride={placeId} />
    </MemoryRouter>
  );
}

describe('PlaceDetail request isolation', () => {
  let locationSuccess: PositionCallback | undefined;

  beforeEach(() => {
    checkIntoPlace.mockReset();
    checkOutOfPlace.mockReset();
    deletePlaceBoardMessage.mockReset();
    getPlace.mockReset();
    getPlaceBoard.mockReset();
    getCurrentPosition.mockReset();
    ratePlace.mockReset();
    removePlaceRating.mockReset();
    locationSuccess = undefined;
    getCurrentPosition.mockImplementation((success: PositionCallback) => {
      locationSuccess = success;
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });
  });

  it('ignores a previous Spot response after another Spot is selected', async () => {
    const oldPlace = deferred<PlaceDetailRecord>();
    const oldBoard = deferred<PlaceBoardMessage[]>();
    getPlace.mockImplementation((placeId: string) => placeId === 'spot-a'
      ? oldPlace.promise
      : Promise.resolve(makePlace('spot-b', 'Spot B')));
    getPlaceBoard.mockImplementation((placeId: string) => placeId === 'spot-a'
      ? oldBoard.promise
      : Promise.resolve([]));

    const view = render(placeDetail('spot-a'));
    await waitFor(() => expect(getPlace).toHaveBeenCalledWith('spot-a'));

    view.rerender(placeDetail('spot-b'));
    expect(await screen.findByRole('heading', { name: 'Spot B' })).toBeInTheDocument();

    await act(async () => {
      oldPlace.resolve(makePlace('spot-a', 'Spot A'));
      oldBoard.resolve([]);
      await oldPlace.promise;
      await oldBoard.promise;
    });

    expect(screen.getByRole('heading', { name: 'Spot B' })).toBeInTheDocument();
    expect(screen.queryByText('Spot A')).not.toBeInTheDocument();
  });

  it('puts an embedded Spot close control after its dedicated bug-button slot', async () => {
    const onClose = vi.fn();
    getPlace.mockResolvedValue(makePlace('spot-a', 'Spot A'));
    getPlaceBoard.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <PlaceDetail embedded placeIdOverride="spot-a" onClose={onClose} />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Spot A' });
    const close = screen.getByRole('button', { name: 'Close Spot' });
    const header = close.parentElement;
    expect(header?.querySelector('[data-testid="spot-detail-bug-button-slot"]')?.nextElementSibling).toBe(close);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows Popular times under the Here now and rating capsules, before the Pink Book', async () => {
    getPlace.mockResolvedValue(makePlace('spot-a', 'Spot A'));
    getPlaceBoard.mockResolvedValue([]);

    render(placeDetail('spot-a'));

    expect(await screen.findByRole('heading', { name: 'Spot A' })).toBeInTheDocument();
    expect(screen.getByText('Popular times').closest('details')).toHaveClass('order-6');
    expect(screen.getByRole('tab', { name: 'Pink Book' }).closest('[data-slot="tabs"]')).toHaveClass('order-7');
  });

  it('does not append an old Spot board page after switching Spots', async () => {
    const oldNextPage = deferred<PlaceBoardMessage[]>();
    const firstPage = Array.from({ length: 30 }, (_, index) => makeBoardMessage(`a-${index}`, `Spot A post ${index}`));
    getPlace.mockImplementation((placeId: string) => Promise.resolve(
      placeId === 'spot-a' ? makePlace('spot-a', 'Spot A') : makePlace('spot-b', 'Spot B'),
    ));
    getPlaceBoard.mockImplementation((placeId: string, options: { offset?: number }) => {
      if (placeId === 'spot-a' && options.offset === 0) return Promise.resolve(firstPage);
      if (placeId === 'spot-a') return oldNextPage.promise;
      return Promise.resolve([makeBoardMessage('b-0', 'Spot B post')]);
    });

    const view = render(placeDetail('spot-a'));
    fireEvent.click(await screen.findByRole('button', { name: 'Load more posts' }));
    await waitFor(() => expect(getPlaceBoard).toHaveBeenCalledWith('spot-a', { limit: 30, offset: 30 }));

    view.rerender(placeDetail('spot-b'));
    expect(await screen.findByText('Spot B post')).toBeInTheDocument();

    await act(async () => {
      oldNextPage.resolve([makeBoardMessage('a-30', 'Late Spot A post')]);
      await oldNextPage.promise;
    });

    expect(screen.getByText('Spot B post')).toBeInTheDocument();
    expect(screen.queryByText('Late Spot A post')).not.toBeInTheDocument();
  });

  it('offers public, checked-in-only, and hidden check-in visibility', async () => {
    getPlace.mockResolvedValue(makePlace('spot-a', 'Spot A'));
    getPlaceBoard.mockResolvedValue([]);
    checkIntoPlace.mockResolvedValue({
      placeId: 'spot-a',
      boardPostId: null,
      visible: true,
      visibility: 'checked_in',
      expiresAt: '2026-08-31T19:00:00.000Z',
    });

    render(placeDetail('spot-a'));
    fireEvent.click(await screen.findByRole('button', { name: 'Check in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chill' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Only people checked in' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Check-in visibility' }).parentElement!.parentElement!).getByRole('button', { name: 'Check in' }));

    act(() => {
      locationSuccess?.({
        coords: {
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          latitude: 40.7,
          longitude: -74,
          speed: null,
        },
        timestamp: Date.now(),
      });
    });

    await waitFor(() => expect(checkIntoPlace).toHaveBeenCalledWith('spot-a', expect.objectContaining({
      visible: true,
      visibility: 'checked_in',
    })));
  });

  it('does not post a check-in for the old Spot when location returns after switching', async () => {
    getPlace.mockImplementation((placeId: string) => Promise.resolve(
      placeId === 'spot-a' ? makePlace('spot-a', 'Spot A') : makePlace('spot-b', 'Spot B'),
    ));
    getPlaceBoard.mockResolvedValue([]);

    const view = render(placeDetail('spot-a'));
    fireEvent.click(await screen.findByRole('button', { name: 'Check in' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Pink Book post for check-in' }), {
      target: { value: 'Checking in' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Chill' }));
    fireEvent.click(within(screen.getByRole('textbox', { name: 'Pink Book post for check-in' }).parentElement!).getByRole('button', { name: 'Check in' }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    view.rerender(placeDetail('spot-b'));
    expect(await screen.findByRole('heading', { name: 'Spot B' })).toBeInTheDocument();

    act(() => {
      locationSuccess?.({
        coords: {
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          latitude: 40.7,
          longitude: -74,
          speed: null,
        },
        timestamp: Date.now(),
      });
    });

    expect(checkIntoPlace).not.toHaveBeenCalled();
  });
});
