import { act, fireEvent, within, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlaceDetail from './PlaceDetail';
import type { PlaceBoardMessage, PlaceDetailRecord } from '../lib/placesApi';

const {
  getMyBillingStatus, getMyProfile,
  checkIntoPlace,
  checkOutOfPlace,
  deletePlaceBoardMessage,
  getPlace,
  getPlaceBoard,
  getCurrentPosition,
  ratePlace,
  removePlaceRating,
} = vi.hoisted(() => ({
  getMyBillingStatus: vi.fn(), getMyProfile: vi.fn(),
  checkIntoPlace: vi.fn(),
  checkOutOfPlace: vi.fn(),
  deletePlaceBoardMessage: vi.fn(),
  getPlace: vi.fn(),
  getPlaceBoard: vi.fn(),
  getCurrentPosition: vi.fn(),
  ratePlace: vi.fn(),
  removePlaceRating: vi.fn(),
}));

vi.mock('../lib/billingApi', () => ({ CRUUSH_PLUS_CHANGED_EVENT: 'cruush-plus-changed', getMyBillingStatus }));
vi.mock('../lib/profileApi', () => ({ getMyProfile }));
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
    getMyBillingStatus.mockResolvedValue({ cruushPlus: false });
    getMyProfile.mockResolvedValue({ crowds: [] });
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

  it('uses the mobile text floor throughout the Spot details block', async () => {
    getPlace.mockResolvedValue({
      ...makePlace('spot-a', 'Spot A'),
      vibes: ['cruisy'],
      amenities: ['drinks'],
      accessInstructions: 'Use the side entrance.',
    });
    getPlaceBoard.mockResolvedValue([]);

    render(placeDetail('spot-a'));

    expect((await screen.findByText('Spot A address')).parentElement).toHaveClass('text-base');
    expect(screen.getByText('Cruisy', { selector: 'span' })).toHaveClass('text-base');
    expect(screen.getByText('Drinks', { selector: 'span' })).toHaveClass('text-base');
    expect(screen.getByRole('button', { name: 'Add spot details' })).toHaveClass('text-base');
    expect(screen.getByText('Access')).toHaveClass('text-base');
  });

  it('collapses only Pink Book vibes and amenities and preserves selections and the three-vibe limit', async () => {
    getPlace.mockResolvedValue(makePlace('spot-a', 'Spot A'));
    getPlaceBoard.mockResolvedValue([]);
    render(placeDetail('spot-a'));
    await screen.findByRole('textbox', { name: 'Pink Book post for check-in' });
    const vibes = screen.getByRole('button', { name: 'Spot vibes', exact: true });
    const amenities = screen.getByRole('button', { name: 'Amenities (optional)', exact: true });
    expect(vibes).toHaveAttribute('aria-expanded', 'false');
    expect(amenities).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Chill' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check-in visibility' })).toBeVisible();

    fireEvent.click(vibes);
    for (const name of ['Chill', 'Social', 'Flirty']) fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByRole('button', { name: 'Cruisy' })).toBeDisabled();
    fireEvent.click(amenities);
    fireEvent.click(screen.getByRole('button', { name: 'Restrooms', exact: true }));
    expect(vibes).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(vibes);
    fireEvent.click(amenities);
    fireEvent.click(vibes);
    fireEvent.click(amenities);
    expect(screen.getByRole('button', { name: 'Chill' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Restrooms', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cruisy' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Chill' }));
    expect(screen.getByRole('button', { name: 'Cruisy' })).toBeEnabled();
  });

  it('keeps check-in and posting controls visible without the accordion or a nested capsule', async () => {
    getPlace.mockResolvedValue(makePlace('spot-a', 'Spot A'));
    getPlaceBoard.mockResolvedValue([]);

    const firstView = render(placeDetail('spot-a'));
    await screen.findByRole('textbox', { name: 'Pink Book post for check-in' });
    const checkinContent = screen.getByRole('textbox', { name: 'Pink Book post for check-in' }).parentElement;
    expect(checkinContent).toHaveClass('p-3');
    expect(checkinContent).not.toHaveClass('rounded-lg', 'border', 'border-border', 'bg-card');
    firstView.unmount();

    getPlace.mockResolvedValue({
      ...makePlace('spot-a', 'Spot A'),
      viewerCheckin: {
        placeId: 'spot-a',
        visible: false,
        visibility: 'hidden',
        expiresAt: '2026-08-31T19:00:00.000Z',
      },
    });

    render(placeDetail('spot-a'));
    await screen.findByRole('textbox', { name: 'Write a Pink Book post' });
    const checkedInContent = screen.getByRole('textbox', { name: 'Write a Pink Book post' }).parentElement;
    expect(checkedInContent).toHaveClass('p-3');
    expect(checkedInContent).not.toHaveClass('rounded-lg', 'border', 'border-border', 'bg-card');
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

  it('keeps Hidden default and offers only eligible crowd choices to cruush+ members', async () => {
    getMyBillingStatus.mockResolvedValue({ cruushPlus: true });
    getMyProfile.mockResolvedValue({ crowds: ['Gay', 'T4T'], is_trans: false });
    getPlace.mockResolvedValue(makePlace('spot-a', 'Spot A'));
    getPlaceBoard.mockResolvedValue([]);
    checkIntoPlace.mockResolvedValue({});
    render(placeDetail('spot-a'));
    const picker = await screen.findByRole('button', { name: 'Check-in visibility' });
    expect(screen.getByText('Hidden', { exact: true })).toBeVisible();
    fireEvent.click(picker);
    expect(await screen.findByRole('option', { name: 'Gay', exact: true })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'T4T', exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cruushes', exact: true })).toBeVisible();
    fireEvent.click(screen.getByRole('option', { name: 'Gay', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Spot vibes', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Chill', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Check in', exact: true }));
    act(() => locationSuccess?.({ coords: { latitude: 40.7, longitude: -74, accuracy: 10 }, timestamp: Date.now() } as GeolocationPosition));
    await waitFor(() => expect(checkIntoPlace).toHaveBeenCalledWith('spot-a', expect.objectContaining({ visibility: 'crowd', crowdTargets: ['Gay'] })));
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
    await screen.findByRole('textbox', { name: 'Pink Book post for check-in' });
    fireEvent.click(screen.getByRole('button', { name: 'Spot vibes', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Chill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check-in visibility' }));
    fireEvent.click(screen.getByRole('option', { name: 'Only people checked in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check in', exact: true }));

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
    await screen.findByRole('textbox', { name: 'Pink Book post for check-in' });
    fireEvent.change(await screen.findByRole('textbox', { name: 'Pink Book post for check-in' }), {
      target: { value: 'Checking in' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Spot vibes', exact: true }));
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
