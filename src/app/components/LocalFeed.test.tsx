import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LocalFeed from './LocalFeed';
import { HEART_PIN_THEMES } from '../lib/heartPin';
import type { FeedSettings } from '../lib/postApi';
import { setDlModeShowOnlyException } from '../lib/dlMode';

const {
  createFeedPost,
  deleteFeedPost,
  getFeedPosts,
  getFeedSettings,
  updateFeedSettings,
  getCurrentUserId,
  getMyProfile,
} = vi.hoisted(() => ({
  createFeedPost: vi.fn(),
  deleteFeedPost: vi.fn(),
  getFeedPosts: vi.fn(),
  getFeedSettings: vi.fn(),
  updateFeedSettings: vi.fn(),
  getCurrentUserId: vi.fn(),
  getMyProfile: vi.fn(),
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
  const open = screen.queryAllByRole('dialog');
  if (open.length === 0) {
    fireEvent.click(screen.getByRole('button', { name: 'Feed settings' }));
    await screen.findByRole('dialog');
  }

  const dialogs = screen.getAllByRole('dialog');
  return dialogs[dialogs.length - 1];
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
  const order = ['30m', '1h', '3h', '6h', '12h', '24h', '2d', '3d', '5d', '7d', 'Never'];
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

  it('loads more posts while scrolling and stops at 100 loaded posts', async () => {
    let nextPostIndex = 0;
    getFeedPosts.mockImplementation(async ({ limit = 30 }) => {
      const posts = Array.from({ length: limit }, (_, offset) => {
        const index = nextPostIndex + offset + 1;
        return {
          id: `scroll-post-${index}`,
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

    for (const expectedCalls of [2, 3, 4]) {
      fireEvent.scroll(scrollArea);
      await waitFor(() => expect(getFeedPosts).toHaveBeenCalledTimes(expectedCalls));
      await waitFor(() => expect(screen.queryByText('Loading more posts...')).not.toBeInTheDocument());
    }

    expect(getFeedPosts.mock.calls.map(([options]) => options.limit)).toEqual([30, 30, 30, 10]);
    expect(screen.getByText('scroll post 100')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^feed-post-scroll-post-/)).toHaveLength(100);

    fireEvent.scroll(scrollArea);
    await act(async () => Promise.resolve());
    expect(getFeedPosts).toHaveBeenCalledTimes(4);
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

    expect(await screen.findByRole('heading', { name: 'Feed' })).toBeInTheDocument();
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
      'pt-[calc(0.75rem+env(safe-area-inset-top))]',
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
    const collapse = screen.getByRole('button', { name: 'Collapse Feed input' });
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

    const photoButton = await screen.findByRole('button', { name: 'Add Feed photo' });
    expect(photoButton).toHaveTextContent('Photo 0/3');
    expect(photoButton.querySelector('img')).toBeNull();
    expect(screen.queryByText(/JPEG, PNG, HEIC\/HEIF, AVIF, WebP, TIFF, DNG, BMP or still GIF/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Choose Feed photo')).toHaveAttribute('type', 'file');
  });

  it('keeps the feed settings menu scrollable and tappable on mobile', async () => {
    getFeedPosts.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Feed settings' }));

    const dialog = await screen.findByRole('dialog', { name: 'Feed settings' });
    expect(dialog).toHaveClass(
      'max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top))]',
      'overflow-y-auto',
      'overscroll-contain',
      'pb-[calc(1.5rem+env(safe-area-inset-bottom))]',
    );
    // Anchored to the top rather than centred, so the close control lands on
    // the bug button's line instead of drifting with the dialog's height.
    expect(dialog).toHaveClass('top-[calc(0.75rem+env(safe-area-inset-top))]', 'translate-y-0');
    expect(within(dialog).getByRole('button', { name: /off/i })).toBeEnabled();
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
    const masked = screen.getByRole('img', { name: 'Feed photo 1 hidden by DL Mode' });
    // The placeholder carries the DL Mode mark, so pin the real invariant: the
    // explicit asset is never referenced from the DOM.
    expect(masked.innerHTML).not.toContain('explicit-photo');
    expect(screen.queryByRole('button', { name: 'Feed photo 1 hidden by DL Mode' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Feed photo 2' })).toBeEnabled();

    act(() => setDlModeShowOnlyException('mutual_crowds'));
    fireEvent.click(screen.getByRole('button', { name: 'Open Feed photo 1' }));
    expect(screen.getByRole('dialog', { name: 'Feed photo viewer' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Feed photo 1 by river' })).toBeInTheDocument();
    act(() => setDlModeShowOnlyException('none'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Feed photo viewer' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Open Feed photo 1' })).not.toBeInTheDocument();
  });

  it('renders three Feed photos in one row and opens the shared full photo viewer', async () => {
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
    expect(screen.getAllByRole('button', { name: /Open Feed photo/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Open Feed photo 3' }));

    expect(screen.getByRole('dialog', { name: 'Feed photo viewer' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Feed photo 3 by river' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report Feed photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Feed photo' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next Feed photo' }));
    expect(screen.getByRole('img', { name: 'Feed photo 1 by river' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Feed photo' }));
    expect(screen.queryByRole('dialog', { name: 'Feed photo viewer' })).not.toBeInTheDocument();
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

    expect(screen.getByRole('heading', { name: 'Feed' })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Delete feed post: mine to delete' }));

    await waitFor(() => expect(deleteFeedPost).toHaveBeenCalledWith('post-owned'));
    await waitFor(() => expect(screen.queryByText('mine to delete')).not.toBeInTheDocument());
    expect(screen.getByText('someone else post')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete feed post: someone else post' })).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'spam_scam' } });
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
    expect(screen.getByTestId('activity-vibes')).toHaveClass('flex-wrap', 'overflow-visible');
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
      crowdTargets: [],
      photoMediaIds: [],
      tags: [],
    }));
  });

  it('lets free members post to Cruushes', async () => {
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
    fireEvent.click(await within(composer).findByRole('button', { name: 'Cruushes' }));
    fireEvent.click(await within(composer).findByRole('button', { name: 'Post' }));

    await waitFor(() => expect(createFeedPost).toHaveBeenCalledWith({
      content: 'mutual post',
      expiresIn: 'never',
      audience: 'mutuals',
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

    const tagField = await within(composer).findByRole('textbox', { name: 'Add Feed tag' });
    fireEvent.change(tagField, { target: { value: '#updates' } });
    fireEvent.keyDown(tagField, { key: 'Enter' });

    const savedTag = within(composer).getByRole('button', { name: 'Remove #updates' });
    const tagHelp = within(composer).getByText('Up to 10 tags.');
    const expiry = within(composer).getByText('This post expires');

    expect(tagField.compareDocumentPosition(savedTag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(savedTag.compareDocumentPosition(tagHelp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tagHelp.compareDocumentPosition(expiry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens the cruush+ card for a free custom timer or specific Crowd', async () => {
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: false,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });
    getFeedPosts.mockResolvedValue([]);

    render(<MemoryRouter><LocalFeed /></MemoryRouter>);
    const composer = await screen.findByTestId('local-feed-composer');
    openComposer();

    // Both gates now sit on the post being written, not in settings.
    await waitFor(() => expect(within(composer).getByTestId('feed-expiry-slider')).toBeInTheDocument());
    setExpiry(composer, '1h');

    expect(await screen.findByTestId('cruush-plus-card')).toBeInTheDocument();
    expect(updateFeedSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    // 905b731 moved the audience picker into the composer beside the timer.
    fireEvent.click(await within(composer).findByRole('button', { name: 'Specific Crowd +' }));
    expect(await screen.findByTestId('cruush-plus-card')).toBeInTheDocument();
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

    // The audience and Crowd picker live in the composer.
    fireEvent.click(await screen.findByRole('button', { name: 'Specific Crowd +' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crowds' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Dyke', exact: true }));
    fireEvent.click(await screen.findByRole('option', { name: 'Gay', exact: true }));
    expect(screen.queryByRole('option', { name: 'T4T', exact: true })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Post' }));

    await waitFor(() => expect(createFeedPost).toHaveBeenCalledWith({
      content: 'hello crowd',
      expiresIn: 'never',
      audience: 'crowd',
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

    fireEvent.change(input, { target: { value: 'seven day post' } });
    setExpiry(composer, '7d');
    fireEvent.click(await within(composer).findByRole('button', { name: 'Post' }));

    await waitFor(() => expect(createFeedPost).toHaveBeenNthCalledWith(1, {
      content: 'seven day post',
      expiresIn: '7d',
      audience: 'public',
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
      crowdTargets: [],
      photoMediaIds: [],
      tags: [],
    }));
    expect(await screen.findByText('never post')).toBeInTheDocument();
  });

  it('starts every post at Never, whatever expiry a previous post used', async () => {
    getFeedPosts.mockResolvedValue([]);
    // A stored default from before expiry became per-post must not preselect
    // anything: the choice belongs to the post being written.
    getFeedSettings.mockResolvedValue({
      locationPinVisibility: 'mutuals',
      showDistanceLabels: true,
      postExpiryDefault: '24h',
    });

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    const composer = await screen.findByTestId('local-feed-composer');
    openComposer();

    await waitFor(() => expect(within(composer).getByTestId('feed-expiry-value')).toHaveTextContent('Never'));

    // Choosing a timer is no longer a saved setting.
    setExpiry(composer, '7d');
    expect(updateFeedSettings).not.toHaveBeenCalled();
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
