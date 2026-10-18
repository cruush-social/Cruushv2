import { resetAccountPreferences } from '../lib/accountPreferences';
import { DEFAULT_FILTER_STATE } from './MapFiltersSurface';
import { refreshContentVisibility } from '../lib/contentVisibilityRevision';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LocalFeed from './LocalFeed';
import { HEART_PIN_THEMES } from '../lib/heartPin';
import type { FeedSettings } from '../lib/postApi';
import { setDlModeShowOnlyException } from '../lib/dlMode';

const { serviceArea } = vi.hoisted(() => ({ serviceArea: { outsideServiceArea: false, profilePinsAllowed: true } }));
vi.mock('./MapServiceAreaContext', () => ({ useMapServiceArea: () => serviceArea }));

const {
  createFeedPost,
  deleteFeedPost,
  getFeedPosts,
  getFeedSettings,
  updateFeedSettings,
  getCurrentUserId,
  getMyProfile,
  getProfileById,
} = vi.hoisted(() => ({
  createFeedPost: vi.fn(),
  deleteFeedPost: vi.fn(),
  getFeedPosts: vi.fn(),
  getFeedSettings: vi.fn(),
  updateFeedSettings: vi.fn(),
  getCurrentUserId: vi.fn(),
  getMyProfile: vi.fn(),
  getProfileById: vi.fn(),
}));

const { getMyBillingStatus } = vi.hoisted(() => ({
  getMyBillingStatus: vi.fn(),
}));

const { blockUser } = vi.hoisted(() => ({
  blockUser: vi.fn(),
}));

const { createReport } = vi.hoisted(() => ({
  createReport: vi.fn(),
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

vi.mock('../lib/postApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/postApi')>('../lib/postApi');

  return {
    ...actual,
    createFeedPost,
    deleteFeedPost,
    getFeedPosts,
    getFeedSettings,
    updateFeedSettings,
  };
});

vi.mock('../lib/sessionUser', () => ({
  getCurrentUserId,
}));

vi.mock('../lib/billingApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/billingApi')>('../lib/billingApi');

  return {
    ...actual,
    CRUUSH_PLUS_CHANGED_EVENT: 'cruush-plus:changed',
    getMyBillingStatus,
  };
});

vi.mock('../lib/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi');
  return {
    ...actual,
    getMyProfile,
    getProfileById,
  };
});

vi.mock('../lib/blockApi', () => ({
  blockUser,
}));

vi.mock('../lib/reportApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/reportApi')>('../lib/reportApi');
  return { ...actual, createReport };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}


async function openFeedSettings() {
  if (!screen.queryByTestId('feed-settings-page')) {
    fireEvent.click(screen.getByRole('button', { name: 'Confessional settings' }));
    await screen.findByTestId('feed-settings-page');
  }

  return screen.getByTestId('feed-settings-page');
}

function openComposer() {
  const trigger = screen.queryByTestId('local-feed-composer-open');
  if (trigger) {
    fireEvent.click(trigger);
  }
}

function expirySection(dialog: HTMLElement) {
  // Expiry is a per-post choice in the composer now, not one setting applied
  // to everything you write.
  const heading = within(dialog).getByText('This post expires');
  return heading.parentElement as HTMLElement;
}

/** The expiry control is a slider over an ordered scale, not a row of pills. */
function setExpiry(composer: HTMLElement, label: string) {
  const slider = within(composer).getByTestId('feed-expiry-slider').querySelector('[role="slider"]') as HTMLElement;
  slider.focus();
  const order = ['30m', '1h', '3h', '6h', '12h', '24h', '2d', '3d', '5d', ...Array.from({ length: 24 }, (_, index) => `${index + 7}d`), 'Never'];
  const target = order.indexOf(label);
  const current = order.indexOf(within(composer).getByTestId('feed-expiry-value').textContent ?? 'Never');
  const key = target > current ? 'ArrowRight' : 'ArrowLeft';
  for (let step = 0; step < Math.abs(target - current); step += 1) {
    fireEvent.keyDown(slider, { key });
  }
}

describe('LocalFeed', () => {
  beforeEach(() => {
    createFeedPost.mockReset();
    serviceArea.outsideServiceArea = false;
    serviceArea.profilePinsAllowed = true;
    deleteFeedPost.mockReset();
    getFeedPosts.mockReset();
    getFeedSettings.mockReset();
    updateFeedSettings.mockReset();
    getCurrentUserId.mockReset();
    getMyBillingStatus.mockReset();
    blockUser.mockReset();
    createReport.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    window.localStorage.removeItem('cruush:dl-mode-enabled');
    window.localStorage.removeItem('cruush:dl-mode-show-only-exception');
    getCurrentUserId.mockResolvedValue('user-1');
    getFeedSettings.mockResolvedValue({
      locationPinVisibility: 'mutuals',
      showDistanceLabels: true,
      postExpiryDefault: 'never',
      feedWindow: '7d', // Existing saved preference, independent of the new default.
    });
    updateFeedSettings.mockImplementation(async (settings) => settings);
    getMyProfile.mockResolvedValue({
      id: 'user-1',
      display_name: 'me',
      is_trans: false,
      crowds: ['Dyke', 'Gay'],
    });
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: true,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });
    blockUser.mockResolvedValue({
      userId: 'user-2',
      blocked: true,
    });
    createReport.mockResolvedValue({
      id: 'report-1',
      status: 'open',
      createdAt: '2026-07-11T12:00:00.000Z',
    });
  });

  it('continues scrolling beyond 100 posts until the matching results are exhausted', async () => {
    let nextPostIndex = 0;
    getFeedPosts.mockImplementation(async ({ limit = 30 }) => {
      const posts = Array.from({ length: Math.min(limit, 125 - nextPostIndex) }, (_, offset) => {
        const index = nextPostIndex + offset + 1;
        return {
          id: `scroll-post-${index}`,
          paginationCursor: `cursor-${index}`,
          content: `scroll post ${index}`,
          expiresIn: 'never' as const,
          expiresAt: null,
          createdAt: new Date(Date.UTC(2026, 3, 28, 12, 0, 0) - index * 60_000).toISOString(),
          distance: 'Nearby',
          user: {
            id: `scroll-user-${index}`,
            name: `person ${index}`,
            pronouns: 'they/them',
            photo: null,
            photoExplicit: false,
          },
        };
      });
      nextPostIndex += posts.length;
      return posts;
    });

    render(<MemoryRouter><LocalFeed /></MemoryRouter>);

    const scrollArea = await screen.findByTestId('local-feed-posts-scroll');
    await waitFor(() => expect(getFeedPosts).toHaveBeenCalledTimes(1));
    expect(getFeedPosts).toHaveBeenLastCalledWith(expect.objectContaining({ before: undefined, limit: 30 }));

    Object.defineProperties(scrollArea, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 590 },
    });

    for (const expectedCalls of [2, 3, 4, 5]) {
      fireEvent.scroll(scrollArea);
      await waitFor(() => expect(getFeedPosts).toHaveBeenCalledTimes(expectedCalls));
      await waitFor(() => expect(screen.queryByText('Loading more posts...')).not.toBeInTheDocument());
    }

    expect(getFeedPosts.mock.calls.map(([options]) => options.limit)).toEqual([30, 30, 30, 30, 30]);
    expect(getFeedPosts.mock.calls.map(([options]) => options.cursor)).toEqual([undefined, 'cursor-30', 'cursor-60', 'cursor-90', 'cursor-120']);
    expect(screen.getByText('scroll post 125')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^feed-post-scroll-post-/)).toHaveLength(125);

    fireEvent.scroll(scrollArea);
    await act(async () => Promise.resolve());
    expect(getFeedPosts).toHaveBeenCalledTimes(5);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the feed top visible below mobile webview chrome', async () => {
    getFeedPosts.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Confessional' })).toBeInTheDocument();
    expect(screen.getByTestId('local-feed-screen')).toHaveClass(
      'flex',
      'bottom-[var(--cruush-nav-clearance,6rem)]',
      'flex-col',
      'overflow-x-clip',
      'overflow-y-hidden',
      'pt-[env(safe-area-inset-top)]',
    );
    expect(screen.getByTestId('local-feed-header')).toHaveClass(
      'sticky',
      'top-0',
      'z-40',
      'shrink-0',
      'py-4',
    );
    expect(screen.getByTestId('local-feed-content')).toHaveClass(
      'min-h-0',
      'flex-1',
      'flex-col',
      'overflow-hidden',
    );
    expect(screen.getByTestId('local-feed-composer')).toHaveClass('shrink-0');
    expect(screen.getByTestId('local-feed-posts-scroll')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-y-auto',
      'overscroll-contain',
      'pb-4',
    );
    const postsScroll = screen.getByTestId('local-feed-posts-scroll');
    expect(postsScroll.style.touchAction).toBe('pan-y');
    expect(postsScroll.style.getPropertyValue('-webkit-overflow-scrolling')).toBe('touch');
  });

  it('observes the older-post sentinel within the Feed scroll panel', async () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const observerCalls: IntersectionObserverInit[] = [];
    class MockIntersectionObserver {
      constructor(_callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observerCalls.push(options ?? {});
      }

      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    getFeedPosts.mockResolvedValue(Array.from({ length: 30 }, (_, index) => ({
      id: `post-${index}`,
      content: `post ${index}`,
      expiresIn: 'never',
      expiresAt: null,
      createdAt: new Date(2026, 3, 28, 12, 0, 0 - index).toISOString(),
      distance: 'Nearby',
      user: { id: `user-${index}`, name: `User ${index}`, pronouns: '', photo: null },
    })));

    render(<MemoryRouter><LocalFeed /></MemoryRouter>);

    const postsScroll = await screen.findByTestId('local-feed-posts-scroll');
    await waitFor(() => expect(observerCalls).toHaveLength(1));
    expect(observerCalls[0]).toEqual({
      root: postsScroll,
      rootMargin: '280px',
    });
    expect(observe).toHaveBeenCalledWith(document.querySelector('[aria-live="polite"]'));
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('focuses the composer when onboarding sends the user to write a post', async () => {
    getFeedPosts.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/feed?compose=1']}>
        <LocalFeed />
      </MemoryRouter>,
    );

    const composer = await screen.findByTestId('local-feed-composer');
    openComposer();
    const input = within(composer).getByPlaceholderText('Share something with nearby people...');

    await waitFor(() => expect(input).toHaveFocus());
  });

  it('collapses from the top without losing its draft and returns focus to the opener', async () => {
    getFeedPosts.mockResolvedValue([]);
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    await screen.findByTestId('local-feed-composer-open');
    openComposer();
    const input = screen.getByPlaceholderText('Share something with nearby people...');
    fireEvent.change(input, { target: { value: 'Keep this draft' } });
    const collapse = screen.getByRole('button', { name: 'Collapse Confessional input' });
    expect(document.getElementById(collapse.getAttribute('aria-controls')!)).toContainElement(input);
    fireEvent.click(collapse);
    expect(input.parentElement).toHaveClass('hidden');
    await waitFor(() => expect(screen.getByTestId('local-feed-composer-open')).toHaveFocus());
    openComposer();
    expect(input.parentElement).not.toHaveClass('hidden');
    expect(input).toHaveValue('Keep this draft');
    expect(createFeedPost).not.toHaveBeenCalled();
  });

  it('keeps Feed photo upload while removing its camera icon and format helper line', async () => {
    getFeedPosts.mockResolvedValue([]);
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    await screen.findByTestId('local-feed-composer-open');
    openComposer();

    const photoButton = await screen.findByRole('button', { name: 'Add Confessional photo' });
    expect(photoButton).toHaveTextContent('Photo 0/3');
    expect(photoButton.querySelector('img')).toBeNull();
    expect(screen.queryByText(/JPEG, PNG, HEIC\/HEIF, AVIF, WebP, TIFF, DNG, BMP or still GIF/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Choose Confessional photo')).toHaveAttribute('type', 'file');
  });

  it('keeps the feed settings menu scrollable and tappable on mobile', async () => {
    getFeedPosts.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confessional settings' }));

    const settingsPage = await screen.findByTestId('feed-settings-page');
    expect(settingsPage).toHaveClass('overflow-y-auto', 'overscroll-contain');
    expect(within(settingsPage).getByRole('button', { name: /off/i })).toBeEnabled();
  });

  it('mutes the Feed location controls outside the service area and restores them with access', async () => {
    serviceArea.outsideServiceArea = true;
    serviceArea.profilePinsAllowed = false;
    getFeedPosts.mockResolvedValue([]);
    const view = () => <MemoryRouter><LocalFeed /></MemoryRouter>;
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Confessional settings' }));
    const page = await screen.findByTestId('feed-settings-page');
    const section = within(page).getByText('Who can open my map location from Confessional posts').closest('section')!;
    expect(section).toHaveAttribute('aria-disabled', 'true');
    expect(section).toHaveClass('grayscale', 'opacity-40');
    expect(within(section).getByRole('button', { name: /off/i })).toBeDisabled();
    serviceArea.outsideServiceArea = false;
    rerender(view());
    expect(within(section).getByRole('button', { name: /off/i })).toBeDisabled();
    serviceArea.profilePinsAllowed = true;
    rerender(view());
    await waitFor(() => expect(within(section).getByRole('button', { name: /off/i })).toBeEnabled());
    expect(section).not.toHaveClass('grayscale');
  });

  it('keeps Feed location controls disabled until service-area access resolves', async () => {
    serviceArea.profilePinsAllowed = false;
    getFeedPosts.mockResolvedValue([]);
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Confessional settings' }));
    const page = await screen.findByTestId('feed-settings-page');
    const section = within(page).getByText('Who can open my map location from Confessional posts').closest('section')!;
    expect(section).toHaveAttribute('aria-disabled', 'true');
    expect(section).toHaveClass('grayscale', 'opacity-40');
    expect(within(section).getByRole('button', { name: /off/i })).toBeDisabled();
  });

  it('uses 30 days when settings have no saved window and preserves saved choices', async () => {
    getFeedPosts.mockResolvedValue([]);
    getFeedSettings.mockResolvedValue({ locationPinVisibility: 'mutuals', showDistanceLabels: true, postExpiryDefault: 'never' });
    const first = render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    await waitFor(() => expect(getFeedPosts).toHaveBeenLastCalledWith(expect.objectContaining({ within: '30d' })));
    first.unmount();
    getFeedSettings.mockResolvedValue({ locationPinVisibility: 'mutuals', showDistanceLabels: true, postExpiryDefault: 'never', feedWindow: '24h' });
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    await waitFor(() => expect(getFeedPosts).toHaveBeenLastCalledWith(expect.objectContaining({ within: '24h' })));
  });

  it('preserves a saved Never filter without changing post expiry', async () => {
    getFeedPosts.mockResolvedValue([]);
    getFeedSettings.mockResolvedValue({ locationPinVisibility: 'mutuals', showDistanceLabels: true, postExpiryDefault: 'never', feedWindow: 'never' });
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    await waitFor(() => expect(getFeedPosts).toHaveBeenLastCalledWith(expect.objectContaining({ within: 'never' })));
    fireEvent.click(screen.getByRole('button', { name: 'Confessional settings' }));
    const page = await screen.findByTestId('feed-settings-page');
    expect(within(page).getByRole('slider', { name: 'Posted within' })).toHaveAttribute('aria-valuenow', '28');
    expect(within(page).getAllByText('Never').length).toBeGreaterThan(0);
  });

  it('defaults and resets Feed distance to Global while allowing a finite distance', async () => {
    getFeedPosts.mockResolvedValue([]);
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    await waitFor(() => expect(getFeedPosts).toHaveBeenLastCalledWith(expect.objectContaining({ distanceMiles: 'global' })));
    fireEvent.click(screen.getByRole('button', { name: 'Confessional seeking' }));
    expect(screen.getByText('Global')).toBeInTheDocument();
    const distance = screen.getByRole('slider', { name: 'Distance' });
    expect(distance).toHaveAttribute('aria-valuenow', '101');
    fireEvent.keyDown(distance, { key: 'ArrowLeft' });
    expect(screen.getByText('Up to 100 miles')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(getFeedPosts).toHaveBeenLastCalledWith(expect.objectContaining({ distanceMiles: 100 })));
    fireEvent.click(screen.getByRole('button', { name: 'Confessional seeking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Global')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(getFeedPosts).toHaveBeenLastCalledWith(expect.objectContaining({ distanceMiles: 'global' })));
  });

  it.each([false, true])('hydrates an open filter without erasing an edited draft (%s)', async (edited) => {
    localStorage.setItem('cruush_user', JSON.stringify({ id: 'preference-preview' }));
    resetAccountPreferences();
    let resolvePreferences!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
      if (String(url).endsWith('/api/users/me/preferences') && options?.method !== 'PUT') return new Promise<Response>(resolve => { resolvePreferences = resolve; });
      return Promise.resolve(new Response(JSON.stringify({ data: { saved: true } })));
    }));
    try {
      render(<MemoryRouter><LocalFeed /></MemoryRouter>);
      fireEvent.click(screen.getByRole('button', { name: 'Confessional seeking' }));
      if (edited) fireEvent.change(screen.getByPlaceholderText('Search #tags'), { target: { value: '#draft' } });
      await act(async () => resolvePreferences(new Response(JSON.stringify({ data: {
        'feed.seeking': { ...DEFAULT_FILTER_STATE, distance: 101, searchQuery: '#saved' },
      } }))));
      expect(screen.getByPlaceholderText('Search #tags')).toHaveValue(edited ? '#draft' : '#saved');
      fireEvent.click(screen.getByRole('button', { name: 'Apply', exact: true }));
      await waitFor(() => expect(getFeedPosts.mock.calls.at(-1)[0].seeking.searchQuery).toBe(edited ? '#draft' : '#saved'));
    } finally {
      localStorage.removeItem('cruush_user'); resetAccountPreferences(); vi.unstubAllGlobals();
    }
  });

  it('filters Feed posts against active Mile High Club members', async () => {
    getFeedPosts.mockResolvedValue([]);
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Confessional seeking' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Intimacy' }));
    const exclude = screen.getByRole('switch', { name: 'Hide posts from Mile High Club members' });
    fireEvent.click(exclude);
    expect(exclude).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Mile High Club members only' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(getFeedPosts).toHaveBeenLastCalledWith(expect.objectContaining({
      seeking: expect.objectContaining({ excludeMileHighClub: true, mileHighClub: false }),
    })));
  });

  it('applies mutually exclusive Purgatory author filters and clears them', async () => {
    getFeedPosts.mockResolvedValue([]);
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Confessional seeking' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Intimacy' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Purgatory members only' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Hide posts from Purgatory members' }));
    expect(screen.getByRole('switch', { name: 'Purgatory members only' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(getFeedPosts).toHaveBeenLastCalledWith(expect.objectContaining({
      seeking: expect.objectContaining({ excludePurgatoryMembers: true }),
    })));
    expect(getFeedPosts.mock.calls.at(-1)[0].seeking.purgatoryMembers).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Confessional seeking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(getFeedPosts.mock.calls.at(-1)[0].seeking.excludePurgatoryMembers).toBeUndefined());
  });

  it('keeps own-post Purgatory visibility in Feed settings and saves its independent preference', async () => {
    getFeedPosts.mockResolvedValue([]);
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Confessional settings' }));
    const page = await screen.findByTestId('feed-settings-page');
    const control = within(page).getByRole('switch', { name: 'Hide my Confessional posts from Purgatory members' });
    await waitFor(() => expect(control).toBeEnabled());
    expect(control).not.toBeChecked();
    fireEvent.click(control);
    await waitFor(() => expect(updateFeedSettings).toHaveBeenCalledWith(expect.objectContaining({
      hideFromPurgatory: true, locationPinVisibility: 'mutuals',
    })));
    await waitFor(() => expect(control).toBeChecked());
    expect(within(page).queryByRole('switch', { name: 'Purgatory members only' })).not.toBeInTheDocument();
  });

  it('offers Never for all-time Posted within and sends it to the Feed API', async () => {
    getFeedPosts.mockResolvedValue([]);
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Confessional settings' }));
    const settingsPage = await screen.findByTestId('feed-settings-page');
    const postedWithinSlider = within(settingsPage).getByRole('slider', { name: 'Posted within' });

    fireEvent.keyDown(postedWithinSlider, { key: 'End' });

    await waitFor(() => expect(updateFeedSettings).toHaveBeenCalledWith(expect.objectContaining({
      feedWindow: 'never',
    })));
    await waitFor(() => expect(getFeedPosts).toHaveBeenLastCalledWith(expect.objectContaining({
      within: 'never',
    })));
    expect(postedWithinSlider).toHaveAttribute('aria-valuenow', '28');
    expect(within(settingsPage).getAllByText('Never').length).toBeGreaterThan(0);
  });

  it('offers 8d through 30d in Posted within and sends the selected window to the Feed API', async () => {
    getFeedPosts.mockResolvedValue([]);
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Confessional settings' }));
    const slider = within(await screen.findByTestId('feed-settings-page')).getByRole('slider', { name: 'Posted within' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    await waitFor(() => expect(updateFeedSettings).toHaveBeenCalledWith(expect.objectContaining({ feedWindow: '8d' })));
    await waitFor(() => expect(getFeedPosts).toHaveBeenLastCalledWith(expect.objectContaining({ within: '8d' })));

    fireEvent.keyDown(slider, { key: 'End' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    await waitFor(() => expect(updateFeedSettings).toHaveBeenCalledWith(expect.objectContaining({ feedWindow: '30d' })));
  });

  it('preserves two loaded pages while removing banned-author posts after a visibility refresh', async () => {
    const posts = Array.from({ length: 60 }, (_, index) => ({
      id: `visible-${index}`, content: `visible post ${index}`, paginationCursor: `cursor-${index}`,
      expiresIn: 'never', expiresAt: null, createdAt: new Date(1760000000000 - index * 60000).toISOString(),
      distance: 'Nearby', user: { id: `member-${index}`, name: `member ${index}`, pronouns: '', photo: null },
    }));
    let banned = false;
    getFeedPosts.mockImplementation(async ({ cursor, limit = 30 }) => {
      const start = cursor ? Number(cursor.replace('cursor-', '')) + 1 : 0;
      return posts.filter((post, index) => index >= start && (!banned || index !== 5)).slice(0, limit);
    });
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    expect(await screen.findByText('visible post 29')).toBeInTheDocument();
    const scrollArea = screen.getByTestId('local-feed-posts-scroll');
    Object.defineProperties(scrollArea, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 590 },
    });
    fireEvent.scroll(scrollArea);
    expect(await screen.findByText('visible post 59')).toBeInTheDocument();
    banned = true;
    await act(async () => refreshContentVisibility());
    await waitFor(() => expect(screen.queryByText('visible post 5')).not.toBeInTheDocument());
    expect(screen.getByText('visible post 59')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^feed-post-visible-/)).toHaveLength(59);
    expect(screen.getByTestId('local-feed-posts-scroll')).toBe(scrollArea);
    expect(scrollArea.scrollTop).toBe(590);
  });

  it('evicts loaded banned content on a visibility change while retaining the composer draft', async () => {
    getFeedPosts.mockResolvedValueOnce([{
      id: 'removed-author-post', content: 'Post before author ban', expiresIn: 'never',
      expiresAt: null, createdAt: '2026-10-08T16:00:00.000Z', distance: 'Nearby',
      user: { id: 'user-2', name: 'river', pronouns: 'they/them', photo: null },
    }]).mockResolvedValue([]);
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    expect(await screen.findByText('Post before author ban')).toBeInTheDocument();
    openComposer();
    const input = screen.getByPlaceholderText('Share something with nearby people...');
    fireEvent.change(input, { target: { value: 'Unsent draft' } });
    act(() => refreshContentVisibility());
    await waitFor(() => expect(screen.queryByText('Post before author ban')).not.toBeInTheDocument());
    expect(input).toHaveValue('Unsent draft');
    expect(input).toBeInTheDocument();
  });

  it('does not race initial profile/settings with a default visibility-refresh query', async () => {
    let resolveProfile!: (profile: any) => void;
    getMyProfile.mockReturnValue(new Promise(resolve => { resolveProfile = resolve; }));
    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    act(() => refreshContentVisibility());
    expect(getFeedPosts).not.toHaveBeenCalled();
    await act(async () => { resolveProfile({ crowds: [], location: null }); });
    await waitFor(() => expect(getFeedPosts).toHaveBeenCalledTimes(1));
    act(() => refreshContentVisibility());
    await waitFor(() => expect(getFeedPosts).toHaveBeenCalledTimes(2));
  });

  it('keeps the newest Feed request when an older response arrives late', async () => {
    let resolveInitialRequest: ((posts: any[]) => void) | undefined;
    const initialRequest = new Promise<any[]>((resolve) => {
      resolveInitialRequest = resolve;
    });
    getFeedPosts
      .mockImplementationOnce(() => initialRequest)
      .mockResolvedValueOnce([{
        id: 'latest-window-post',
        content: 'newest feed response',
        expiresIn: 'never',
        expiresAt: null,
        createdAt: '2026-10-08T16:00:00.000Z',
        distance: 'Nearby',
        user: { id: 'user-2', name: 'river', pronouns: 'they/them', photo: null },
      }]);

    render(<MemoryRouter><LocalFeed /></MemoryRouter>);

    await waitFor(() => expect(getFeedPosts).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Confessional settings' }));
    const settingsPage = await screen.findByTestId('feed-settings-page');
    fireEvent.keyDown(within(settingsPage).getByRole('slider', { name: 'Posted within' }), { key: 'End' });

    await waitFor(() => expect(getFeedPosts).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('newest feed response')).toBeInTheDocument();

    await act(async () => {
      resolveInitialRequest?.([{
        id: 'stale-window-post',
        content: 'stale feed response',
        expiresIn: 'never',
        expiresAt: null,
        createdAt: '2026-10-08T15:00:00.000Z',
        distance: 'Nearby',
        user: { id: 'user-3', name: 'cleo', pronouns: 'she/her', photo: null },
      }]);
    });

    await waitFor(() => expect(screen.queryByText('stale feed response')).not.toBeInTheDocument());
    expect(screen.getByText('newest feed response')).toBeInTheDocument();
  });

  it('keeps the rendered Feed in place while a replacement request is pending', async () => {
    let resolveReplacementRequest: ((posts: any[]) => void) | undefined;
    const replacementRequest = new Promise<any[]>((resolve) => {
      resolveReplacementRequest = resolve;
    });
    const initialPost = {
      id: 'existing-post',
      content: 'existing feed post',
      expiresIn: 'never',
      expiresAt: null,
      createdAt: '2026-10-08T16:00:00.000Z',
      distance: 'Nearby',
      user: { id: 'user-2', name: 'river', pronouns: 'they/them', photo: null },
    };
    getFeedPosts
      .mockResolvedValueOnce([initialPost])
      .mockImplementationOnce(() => replacementRequest);

    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    expect(await screen.findByText('existing feed post')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confessional settings' }));
    const settingsPage = await screen.findByTestId('feed-settings-page');
    fireEvent.keyDown(within(settingsPage).getByRole('slider', { name: 'Posted within' }), { key: 'End' });

    await waitFor(() => expect(getFeedPosts).toHaveBeenCalledTimes(2));
    expect(screen.getByText('existing feed post')).toBeInTheDocument();
    expect(screen.queryByText('Loading nearby posts')).not.toBeInTheDocument();

    await act(async () => {
      resolveReplacementRequest?.([]);
    });

    await waitFor(() => expect(screen.queryByText('existing feed post')).not.toBeInTheDocument());
  });

  it('masks explicit author photos in the feed while DL Mode is on', async () => {
    window.localStorage.setItem('cruush:dl-mode-enabled', 'true');
    getFeedPosts.mockResolvedValue([{
      id: 'post-explicit',
      content: 'explicit author post',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      user: {
        id: 'user-2',
        name: 'river',
        pronouns: 'he/him',
        photo: '/media/river.jpg',
        photoExplicit: true,
      },
    }, {
      id: 'post-safe',
      content: 'safe author post',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      user: {
        id: 'user-3',
        name: 'sky',
        pronouns: 'she/her',
        photo: '/media/sky.jpg',
        photoExplicit: false,
      },
    }]);

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    expect(await screen.findByText('explicit author post')).toBeInTheDocument();

    const maskedPhoto = screen.getAllByLabelText('river preview').at(-1)!;
    const visiblePhoto = screen.getAllByLabelText('sky preview').at(-1)!;

    // A masked heart still draws the DL Mode mark, so the invariant worth
    // pinning is that the private photo never reaches the DOM.
    expect(maskedPhoto.innerHTML).not.toContain('river.jpg');
    expect(visiblePhoto.innerHTML).toContain('sky.jpg');
  });

  it('shows explicit author photos in the feed once DL Mode is off', async () => {
    window.localStorage.setItem('cruush:dl-mode-enabled', 'false');
    getFeedPosts.mockResolvedValue([{
      id: 'post-explicit',
      content: 'explicit author post',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      user: {
        id: 'user-2',
        name: 'river',
        pronouns: 'he/him',
        photo: '/media/river.jpg',
        photoExplicit: true,
      },
    }]);

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    expect(await screen.findByText('explicit author post')).toBeInTheDocument();
    expect(screen.getAllByLabelText('river preview').at(-1)?.querySelector('image')).not.toBeNull();
  });

  it('masks explicit Feed attachments by default and updates the viewer when a shared-Crowd exception changes', async () => {
    window.localStorage.setItem('cruush:dl-mode-enabled', 'true');
    getFeedPosts.mockResolvedValue([{
      id: 'post-with-photos',
      content: 'two photos',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      audience: 'public',
      photos: [{
        id: 'explicit-photo',
        url: '/api/media/assets/explicit-photo/display',
        thumbnailUrl: '/api/media/assets/explicit-photo/thumbnail',
        explicit: true,
      }, {
        id: 'safe-photo',
        url: '/api/media/assets/safe-photo/display',
        thumbnailUrl: '/api/media/assets/safe-photo/thumbnail',
        explicit: false,
      }],
      user: {
        id: 'user-2',
        name: 'river',
        pronouns: 'they/them',
        photo: null,
        photoExplicit: false,
        sharesCrowd: true,
      },
    }]);

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    expect(await screen.findByText('two photos')).toBeInTheDocument();
    const masked = screen.getByRole('img', { name: 'Confessional photo 1 hidden by DL Mode' });
    // The placeholder carries the DL Mode mark, so pin the real invariant: the
    // explicit asset is never referenced from the DOM.
    expect(masked.innerHTML).not.toContain('explicit-photo');
    expect(screen.queryByRole('button', { name: 'Confessional photo 1 hidden by DL Mode' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Confessional photo 2' })).toBeEnabled();

    act(() => setDlModeShowOnlyException('mutual_crowds'));
    fireEvent.click(screen.getByRole('button', { name: 'Open Confessional photo 1' }));
    expect(screen.getByRole('dialog', { name: 'Confessional photo viewer' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Confessional photo 1 by river' })).toBeInTheDocument();
    act(() => setDlModeShowOnlyException('none'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confessional photo viewer' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Open Confessional photo 1' })).not.toBeInTheDocument();
  });

  it('renders three Feed photos in one row and opens the shared full photo viewer', async () => {
    getProfileById.mockResolvedValue({ id: 'user-2' });
    getFeedPosts.mockResolvedValue([{
      id: 'post-with-three-photos',
      content: 'three photos',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      audience: 'public',
      photos: [1, 2, 3].map((index) => ({
        id: `photo-${index}`,
        url: `/api/media/assets/photo-${index}/display`,
        thumbnailUrl: `/api/media/assets/photo-${index}/thumbnail`,
        explicit: false,
      })),
      user: {
        id: 'user-2',
        name: 'river',
        pronouns: 'they/them',
        photo: null,
        photoExplicit: false,
      },
    }]);

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    expect(await screen.findByText('three photos')).toBeInTheDocument();
    expect(screen.getByTestId('feed-photo-preview-three')).toHaveClass('flex', 'items-center');
    expect(screen.getAllByRole('button', { name: /Open Confessional photo/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Open Confessional photo 3' }));

    expect(screen.getByRole('dialog', { name: 'Confessional photo viewer' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Confessional photo 3 by river' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report Confessional photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Confessional photo' })).toBeInTheDocument();

    await act(async () => refreshContentVisibility());
    await waitFor(() => expect(getProfileById).toHaveBeenCalledWith('user-2'));
    expect(screen.getByRole('dialog', { name: 'Confessional photo viewer' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Confessional photo 3 by river' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next Confessional photo' }));
    expect(screen.getByRole('img', { name: 'Confessional photo 1 by river' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Confessional photo' }));
    expect(screen.queryByRole('dialog', { name: 'Confessional photo viewer' })).not.toBeInTheDocument();
  });

  it('lets users delete their own feed posts without showing delete for other posts', async () => {
    getFeedPosts.mockResolvedValue([{
      id: 'post-owned',
      content: 'mine to delete',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      user: {
        id: 'user-1',
        name: 'me',
        pronouns: 'they/them',
        photo: null,
      },
    }, {
      id: 'post-other',
      content: 'someone else post',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      user: {
        id: 'user-2',
        name: 'river',
        pronouns: 'he/him',
        photo: null,
      },
    }]);
    deleteFeedPost.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Confessional' })).toBeInTheDocument();
    expect(screen.queryByText('Nearby posts expire after 24h')).not.toBeInTheDocument();
    expect(await screen.findByText('mine to delete')).toBeInTheDocument();
    expect(screen.getByText('someone else post')).toBeInTheDocument();
    await waitFor(() => {
      const ownPreview = screen.getByRole('img', { name: 'me preview' });
      const stops = Array.from(ownPreview.querySelectorAll('stop'))
        .map((stop) => stop.getAttribute('stop-color'));

      expect(stops).toEqual(HEART_PIN_THEMES.current.stops);
      expect(ownPreview.querySelector('path')).toHaveAttribute('stroke', HEART_PIN_THEMES.current.border);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Confessional post: mine to delete' }));

    await waitFor(() => expect(deleteFeedPost).toHaveBeenCalledWith('post-owned'));
    await waitFor(() => expect(screen.queryByText('mine to delete')).not.toBeInTheDocument());
    expect(screen.getByText('someone else post')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Confessional post: someone else post' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Block me' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Report post by me' })).not.toBeInTheDocument();
  });

  it('reports another user post without hiding it', async () => {
    getFeedPosts.mockResolvedValue([{
      id: 'post-other',
      content: 'suspicious link in this post',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      user: {
        id: 'user-2',
        name: 'River',
        pronouns: 'he/him',
        photo: null,
        attendingLaunchParty: true,
      },
    }]);

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Report post by River' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Reason' }));
    const reason = await screen.findByRole('option', { name: 'Spam or scam' });
    fireEvent.pointerDown(reason, { button: 0, pointerType: 'touch' });
    fireEvent.pointerUp(reason, { button: 0, pointerType: 'touch' });
    fireEvent.click(reason);
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(createReport).toHaveBeenCalledWith({
      targetType: 'post',
      targetId: 'post-other',
      targetUserId: 'user-2',
      reason: 'spam_scam',
      details: undefined,
    }));
    expect(toastSuccess).toHaveBeenCalledWith('Report submitted.');
    expect(screen.getByText('suspicious link in this post')).toBeInTheDocument();
  });

  it('renders feed profile previews with compact author metadata', async () => {
    getFeedPosts.mockResolvedValue([{
      id: 'post-other',
      content: 'hello nearby',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      user: {
        id: 'user-2',
        name: 'River',
        pronouns: 'he/him',
        photo: null,
        vibes: ['Chill', 'Geek', 'Service'],
      },
    }]);

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    const preview = await screen.findByRole('img', { name: 'River preview' });
    expect(preview.parentElement).toHaveClass('w-full');
    // The rail holds only the avatar; the vibes sit in the card body instead.
    expect(screen.getByTestId('feed-post-profile-stack-post-other')).toHaveClass('-mt-1', 'w-20');
    expect(screen.getByTestId('feed-post-author-post-other')).toHaveClass('text-left');
    expect(screen.getByTestId('feed-post-author-post-other')).not.toHaveClass('max-w-[32%]');
    expect(screen.getByTestId('feed-post-meta-post-other')).toHaveClass('flex', 'h-11', 'flex-col');
    expect(screen.getByText('he/him')).toBeInTheDocument();
    expect(screen.getByTestId('activity-vibes')).toHaveClass('flex-nowrap', 'w-max');
    expect(screen.getByText('Service')).toHaveClass('flex-shrink-0', 'truncate');

    // Report sits on the action row between the date and the other buttons.
    // Blocking is not offered per post: it lives on the profile.
    const report = screen.getByRole('button', { name: 'Report post by River' });
    const meta = screen.getByTestId('feed-post-meta-post-other');
    expect(meta.compareDocumentPosition(report) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Block River' })).not.toBeInTheDocument();
  });

  it('lets free members post to the local feed without cruush+', async () => {
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: false,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });
    getFeedPosts.mockResolvedValue([]);
    createFeedPost.mockResolvedValue({
      id: 'free-post-1',
      content: 'first post as a free member',
      expiresIn: 'never',
      expiresAt: null,
      createdAt: new Date().toISOString(),
      distance: 'Nearby',
      user: { id: 'me', name: 'Me', pronouns: '', photo: null, photoExplicit: false },
    });

    render(<MemoryRouter initialEntries={['/feed']}><LocalFeed /></MemoryRouter>);

    const composer = await screen.findByPlaceholderText('Share something with nearby people...');
    expect(composer).not.toBeDisabled();
    expect(screen.queryByTestId('local-feed-cruush-plus-notice')).not.toBeInTheDocument();

    fireEvent.change(composer, { target: { value: 'first post as a free member' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(createFeedPost).toHaveBeenCalledWith({
      content: 'first post as a free member',
      expiresIn: 'never',
      audience: 'public',
      showDistance: true,
      crowdTargets: [],
      photoMediaIds: [],
      tags: [],
    }));
  });

  it('lets free members post to cruushes', async () => {
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: false,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });
    getFeedPosts.mockResolvedValue([]);
    createFeedPost.mockResolvedValue({
      id: 'mutual-post-1',
      content: 'mutual post',
      audience: 'mutuals',
      expiresIn: 'never',
      expiresAt: null,
      createdAt: new Date().toISOString(),
      distance: 'Nearby',
      user: { id: 'me', name: 'Me', pronouns: '', photo: null },
    });

    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    const composer = await screen.findByTestId('local-feed-composer');
    openComposer();
    fireEvent.change(within(composer).getByPlaceholderText('Share something with nearby people...'), {
      target: { value: 'mutual post' },
    });
    // 905b731 moved "Who can see this post" out of Feed settings and into the
    // composer, where the per-post state already lived.
    fireEvent.click(within(composer).getByRole('button', { name: 'Toggle post audience' }));
    fireEvent.click(await within(composer).findByRole('button', { name: 'Who can see this post' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Cruushes', exact: true }));
    fireEvent.click(await within(composer).findByRole('button', { name: 'Post' }));

    await waitFor(() => expect(createFeedPost).toHaveBeenCalledWith({
      content: 'mutual post',
      expiresIn: 'never',
      audience: 'mutuals',
      showDistance: true,
      crowdTargets: [],
      photoMediaIds: [],
      tags: [],
    }));
  });

  it('keeps Feed tag help and saved tags directly below the tag field', async () => {
    getFeedPosts.mockResolvedValue([]);

    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    const composer = await screen.findByTestId('local-feed-composer');
    openComposer();

    const tagField = await within(composer).findByRole('textbox', { name: 'Add Confessional tag' });
    fireEvent.change(tagField, { target: { value: '#updates' } });
    fireEvent.keyDown(tagField, { key: 'Enter' });

    const savedTag = within(composer).getByRole('button', { name: 'Remove #updates' });
    const tagHelp = within(composer).getByText('Up to 10 tags.');
    const expiry = within(composer).getByText('This post expires');

    expect(tagField.compareDocumentPosition(savedTag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(savedTag.compareDocumentPosition(tagHelp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tagHelp.compareDocumentPosition(expiry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sends free members to Checkout when they pick Crowd mode', async () => {
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: false,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });
    getFeedPosts.mockResolvedValue([]);

    render(<MemoryRouter initialEntries={['/feed']}><LocalFeed /><LocationProbe /></MemoryRouter>);
    const composer = await screen.findByTestId('local-feed-composer');
    openComposer();

    fireEvent.click(within(composer).getByRole('button', { name: 'Toggle post audience' }));
    fireEvent.click(await within(composer).findByRole('button', { name: 'Who can see this post' }));
    expect(screen.queryByRole('option', { name: 'Dyke', exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Crowd mode', exact: true }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/store');
  });

  it('lets Feed+ post to every selected allowed Crowd', async () => {
    getFeedPosts.mockResolvedValue([]);
    createFeedPost.mockResolvedValue({
      id: 'post-crowd',
      content: 'hello crowd',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      audience: 'crowd',
      crowdTargets: ['Gay'],
      photoMediaIds: [],
      tags: [],
      user: {
        id: 'user-1',
        name: 'me',
        pronouns: 'they/them',
        photo: null,
      },
    });

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    await screen.findByTestId('local-feed-composer');
    openComposer();
    fireEvent.change(screen.getByPlaceholderText('Share something with nearby people...'), {
      target: { value: 'hello crowd' },
    });

    // cruush+ members pick each eligible Crowd directly in the audience picker.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle post audience' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Who can see this post' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Dyke', exact: true }));
    fireEvent.click(await screen.findByRole('option', { name: 'Gay', exact: true }));
    expect(screen.queryByRole('option', { name: 'T4T', exact: true })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Post' }));

    await waitFor(() => expect(createFeedPost).toHaveBeenCalledWith({
      content: 'hello crowd',
      expiresIn: 'never',
      audience: 'crowd',
      showDistance: true,
      crowdTargets: ['Dyke', 'Gay'],
      photoMediaIds: [],
      tags: [],
    }));
  });

  it('lets feed posts use seven-day or never expiry from the composer', async () => {
    getFeedPosts.mockResolvedValue([]);
    createFeedPost
      .mockResolvedValueOnce({
        id: 'post-seven-days',
        content: 'seven day post',
        expiresIn: '7d',
        expiresAt: '2026-05-05T12:00:00.000Z',
        createdAt: '2026-04-28T12:00:00.000Z',
        distance: 'Nearby',
        user: {
          id: 'user-1',
          name: 'me',
          pronouns: 'they/them',
          photo: null,
        },
      })
      .mockResolvedValueOnce({
        id: 'post-never',
        content: 'never post',
        expiresIn: 'never',
        expiresAt: null,
        createdAt: '2026-04-28T12:01:00.000Z',
        distance: 'Nearby',
        user: {
          id: 'user-1',
          name: 'me',
          pronouns: 'they/them',
          photo: null,
        },
      });

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    const composer = await screen.findByTestId('local-feed-composer');
    openComposer();
    const input = within(composer).getByPlaceholderText('Share something with nearby people...');
    await waitFor(() => expect(within(composer).getByTestId('feed-expiry-slider')).toBeInTheDocument());
    await within(composer).findByRole('button', { name: 'Add Confessional photo' });

    fireEvent.change(input, { target: { value: 'seven day post' } });
    setExpiry(composer, '7d');
    fireEvent.click(await within(composer).findByRole('button', { name: 'Post' }));

    await waitFor(() => expect(createFeedPost).toHaveBeenNthCalledWith(1, {
      content: 'seven day post',
      expiresIn: '7d',
      audience: 'public',
      showDistance: true,
      crowdTargets: [],
      photoMediaIds: [],
      tags: [],
    }));

    // The choice belongs to the post that was just sent, so the next one starts
    // at Never again rather than inheriting 7d.
    fireEvent.change(input, { target: { value: 'never post' } });
    fireEvent.click(await within(composer).findByRole('button', { name: 'Post' }));

    await waitFor(() => expect(createFeedPost).toHaveBeenNthCalledWith(2, {
      content: 'never post',
      expiresIn: 'never',
      audience: 'public',
      showDistance: true,
      crowdTargets: [],
      photoMediaIds: [],
      tags: [],
    }));
    expect(await screen.findByText('never post')).toBeInTheDocument();
  });

  it('starts every basic post at Never and routes expiry changes to cruush+', async () => {
    getFeedPosts.mockResolvedValue([]);
    getMyBillingStatus.mockResolvedValue({ cruushPlus: false, expiresAt: null, badges: [], processor: 'fake', testCheckout: true });
    // A stored default from before expiry became per-post must not preselect
    // anything: the choice belongs to the post being written.
    getFeedSettings.mockResolvedValue({
      locationPinVisibility: 'mutuals',
      showDistanceLabels: true,
      postExpiryDefault: '24h',
    });

    render(
      <MemoryRouter initialEntries={['/feed']}>
        <LocalFeed />
        <LocationProbe />
      </MemoryRouter>,
    );

    const composer = await screen.findByTestId('local-feed-composer');
    openComposer();

    await waitFor(() => expect(within(composer).getByTestId('feed-expiry-value')).toHaveTextContent('Never'));

    // Basic members are offered the upgrade instead of changing this draft.
    fireEvent.keyDown(within(composer).getByRole('slider', { name: 'This post expires' }), { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.getByTestId('location-probe')).not.toHaveTextContent('/feed'));
    expect(updateFeedSettings).not.toHaveBeenCalled();
  });

  it('lets cruush+ members choose an expiry without leaving the composer', async () => {
    getFeedPosts.mockResolvedValue([]);
    render(<MemoryRouter initialEntries={['/feed']}><LocalFeed /><LocationProbe /></MemoryRouter>);
    const composer = await screen.findByTestId('local-feed-composer');
    openComposer();
    await within(composer).findByRole('button', { name: 'Add Confessional photo' });
    await waitFor(() => expect(within(composer).getByTestId('feed-expiry-value')).toHaveTextContent('Never'));

    setExpiry(composer, '7d');

    expect(within(composer).getByTestId('feed-expiry-value')).toHaveTextContent('7d');
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/feed');
    expect(updateFeedSettings).not.toHaveBeenCalled();
  });

  it('does not treat an unresolved billing lookup as a basic expiry upgrade', async () => {
    getFeedPosts.mockResolvedValue([]);
    let resolveBilling: ((status: { cruushPlus: boolean; expiresAt: null; badges: never[]; processor: string; testCheckout: boolean }) => void) | undefined;
    getMyBillingStatus.mockImplementation(() => new Promise((resolve) => { resolveBilling = resolve; }));

    render(<MemoryRouter initialEntries={['/feed']}><LocalFeed /><LocationProbe /></MemoryRouter>);
    const composer = await screen.findByTestId('local-feed-composer');
    openComposer();
    const slider = within(composer).getByRole('slider', { name: 'This post expires' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/feed');
    expect(within(composer).getByTestId('feed-expiry-value')).toHaveTextContent('Never');

    await act(async () => resolveBilling?.({ cruushPlus: true, expiresAt: null, badges: [], processor: 'fake', testCheckout: true }));
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/feed');
    expect(within(composer).getByTestId('feed-expiry-value')).toHaveTextContent('30d');
  });

  it('shows the party hat beside party member names without a venue tag', async () => {
    getFeedPosts.mockResolvedValue([{
      id: 'post-party',
      content: 'see you inside',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      partyStatus: {
        eventSlug: 'the-chocolate-factory-launch',
        label: 'at The Chocolate Factory',
      },
      user: {
        id: 'user-2',
        name: 'River',
        pronouns: 'he/him',
        photo: null,
        attendingLaunchParty: true,
      },
    }]);

    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Routes>
          <Route path="/feed" element={<><LocalFeed /><LocationProbe /></>} />
          <Route path="/map" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const launchPartyButton = await screen.findByRole('button', { name: 'Center map on launch party' });
    const nameRow = screen.getByText('River').closest('div');

    expect(nameRow).toContainElement(launchPartyButton);
    expect(screen.queryByText('at The Chocolate Factory')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Center map on The Chocolate Factory' })).not.toBeInTheDocument();

    fireEvent.click(launchPartyButton);

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map');
  });
});
