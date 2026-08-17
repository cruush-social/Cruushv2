import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LocalFeed from './LocalFeed';
import { HEART_PIN_THEMES } from '../lib/heartPin';
import type { FeedSettings } from '../lib/postApi';

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

  it('keeps the feed top visible below mobile webview chrome', async () => {
    getFeedPosts.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Local Feed' })).toBeInTheDocument();
    expect(screen.getByTestId('local-feed-screen')).toHaveClass(
      'flex',
      'h-[100dvh]',
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
      'pt-[calc(1rem+env(safe-area-inset-top))]',
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
      'pb-[calc(9rem+env(safe-area-inset-bottom))]',
    );
    const postsScroll = screen.getByTestId('local-feed-posts-scroll');
    expect(postsScroll.style.touchAction).toBe('pan-y');
    expect(postsScroll.style.getPropertyValue('-webkit-overflow-scrolling')).toBe('touch');
  });

  it('focuses the composer when onboarding sends the user to write a post', async () => {
    getFeedPosts.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/feed?compose=1']}>
        <LocalFeed />
      </MemoryRouter>,
    );

    const composer = await screen.findByTestId('local-feed-composer');
    const input = within(composer).getByPlaceholderText('Share something with nearby people...');

    await waitFor(() => expect(input).toHaveFocus());
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
      'max-h-[calc(100dvh-2rem)]',
      'overflow-y-auto',
      'overscroll-contain',
      'pb-[calc(1.5rem+env(safe-area-inset-bottom))]',
    );
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

    const maskedPhoto = screen.getByLabelText('river preview');
    const visiblePhoto = screen.getByLabelText('sky preview');

    expect(maskedPhoto.querySelector('image')).toBeNull();
    expect(visiblePhoto.querySelector('image')).not.toBeNull();
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
    expect(screen.getByLabelText('river preview').querySelector('image')).not.toBeNull();
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

    expect(screen.getByRole('heading', { name: 'Local Feed' })).toBeInTheDocument();
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
      reason: 'spam_scam',
      details: undefined,
    }));
    expect(toastSuccess).toHaveBeenCalledWith('Report submitted.');
    expect(screen.getByText('suspicious link in this post')).toBeInTheDocument();
  });

  it('renders feed profile previews without showing author pronouns', async () => {
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
      },
    }]);

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    const preview = await screen.findByRole('img', { name: 'River preview' });
    expect(preview.parentElement).toHaveClass('w-20');
    expect(screen.getByTestId('feed-post-author-post-other')).toHaveClass('min-w-0', 'flex-1', 'truncate');
    expect(screen.getByTestId('feed-post-meta-post-other')).toHaveClass('flex-wrap');
    expect(screen.queryByText('he/him')).not.toBeInTheDocument();
  });

  it('blocks another feed author and removes all of their posts locally', async () => {
    getFeedPosts.mockResolvedValue([{
      id: 'post-owned',
      content: 'mine to keep',
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
      id: 'post-river-1',
      content: 'river first post',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      user: {
        id: 'user-2',
        name: 'River',
        pronouns: 'he/him',
        photo: null,
      },
    }, {
      id: 'post-river-2',
      content: 'river second post',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      user: {
        id: 'user-2',
        name: 'River',
        pronouns: 'he/him',
        photo: null,
      },
    }, {
      id: 'post-sam',
      content: 'sam stays visible',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      user: {
        id: 'user-3',
        name: 'Sam',
        pronouns: 'they/them',
        photo: null,
      },
    }]);

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    expect(await screen.findByText('river first post')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Block River' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Block' }));

    await waitFor(() => expect(blockUser).toHaveBeenCalledWith('user-2'));
    await waitFor(() => expect(screen.queryByText('river first post')).not.toBeInTheDocument());
    expect(screen.queryByText('river second post')).not.toBeInTheDocument();
    expect(screen.getByText('mine to keep')).toBeInTheDocument();
    expect(screen.getByText('sam stays visible')).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith('River blocked.');
    expect(screen.queryByRole('button', { name: 'Block me' })).not.toBeInTheDocument();
  });

  it('locks local feed posting for free users and routes them to rewards', async () => {
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: false,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });
    getFeedPosts.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Routes>
          <Route path="/feed" element={<><LocalFeed /><LocationProbe /></>} />
          <Route path="/rewards" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const notice = await screen.findByTestId('local-feed-cruush-plus-notice');
    expect(notice).toHaveTextContent('Post on the local feed with cruush+.');
    expect(within(notice).getAllByText('cruush+')).toHaveLength(2);
    for (const cruushPlusText of within(notice).getAllByText('cruush+')) {
      expect(cruushPlusText).toHaveClass('cruush-logo-font');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Get cruush+' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/rewards');
    expect(createFeedPost).not.toHaveBeenCalled();
  });

  it('posts to no crowds or multiple allowed crowds selected from the composer', async () => {
    getFeedPosts.mockResolvedValue([]);
    createFeedPost.mockResolvedValue({
      id: 'post-crowd',
      content: 'hello crowd',
      expiresIn: '6h',
      expiresAt: '2026-04-28T18:00:00.000Z',
      createdAt: '2026-04-28T12:00:00.000Z',
      distance: 'Nearby',
      crowdTargets: ['Dyke', 'Gay'],
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

    fireEvent.change(await screen.findByPlaceholderText('Share something with nearby people...'), {
      target: { value: 'hello crowd' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dyke' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gay' }));
    expect(screen.queryByRole('button', { name: 'T4T' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(createFeedPost).toHaveBeenCalledWith({
      content: 'hello crowd',
      expiresIn: 'never',
      crowdTargets: ['Dyke', 'Gay'],
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
    const input = within(composer).getByPlaceholderText('Share something with nearby people...');
    await waitFor(() => expect(within(composer).getByRole('button', { name: '7d' })).toBeEnabled());

    fireEvent.change(input, { target: { value: 'seven day post' } });
    fireEvent.click(within(composer).getByRole('button', { name: '7d' }));
    fireEvent.click(within(composer).getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(createFeedPost).toHaveBeenNthCalledWith(1, {
      content: 'seven day post',
      expiresIn: '7d',
      crowdTargets: [],
    }));

    fireEvent.change(input, { target: { value: 'never post' } });
    fireEvent.click(within(composer).getByRole('button', { name: 'Never' }));
    fireEvent.click(within(composer).getByRole('button', { name: 'Post' }));

    await waitFor(() => expect(createFeedPost).toHaveBeenNthCalledWith(2, {
      content: 'never post',
      expiresIn: 'never',
      crowdTargets: [],
    }));
    expect(await screen.findByText('never post')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Never')).toHaveLength(2));
  });

  it('loads and saves the feed expiry choice used by future Pings', async () => {
    getFeedPosts.mockResolvedValue([]);
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
    await waitFor(() => expect(within(composer).getByRole('button', { name: '24h' })).toHaveClass('bg-primary'));

    fireEvent.click(within(composer).getByRole('button', { name: '7d' }));

    await waitFor(() => expect(updateFeedSettings).toHaveBeenCalledWith({
      locationPinVisibility: 'mutuals',
      showDistanceLabels: true,
      postExpiryDefault: '7d',
    }));
    expect(within(composer).getByRole('button', { name: '7d' })).toHaveClass('bg-primary');
  });

  it('serializes rapid feed expiry saves so the last selection wins', async () => {
    getFeedPosts.mockResolvedValue([]);
    getFeedSettings.mockResolvedValue({
      locationPinVisibility: 'mutuals',
      showDistanceLabels: true,
      postExpiryDefault: '24h',
    });
    let resolveFirst!: (settings: FeedSettings) => void;
    let resolveSecond!: (settings: FeedSettings) => void;
    updateFeedSettings
      .mockImplementationOnce(() => new Promise<FeedSettings>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockImplementationOnce(() => new Promise<FeedSettings>((resolve) => {
        resolveSecond = resolve;
      }));

    render(
      <MemoryRouter>
        <LocalFeed />
      </MemoryRouter>,
    );

    const composer = await screen.findByTestId('local-feed-composer');
    const sixHourButton = within(composer).getByRole('button', { name: '6h' });
    const sevenDayButton = within(composer).getByRole('button', { name: '7d' });
    await waitFor(() => expect(sixHourButton).toBeEnabled());

    fireEvent.click(sixHourButton);
    fireEvent.click(sevenDayButton);

    await waitFor(() => expect(updateFeedSettings).toHaveBeenCalledTimes(1));
    expect(updateFeedSettings).toHaveBeenNthCalledWith(1, {
      locationPinVisibility: 'mutuals',
      showDistanceLabels: true,
      postExpiryDefault: '6h',
    });
    expect(sevenDayButton).toHaveClass('bg-primary');

    resolveFirst({
      locationPinVisibility: 'mutuals',
      showDistanceLabels: true,
      postExpiryDefault: '6h',
    });

    await waitFor(() => expect(updateFeedSettings).toHaveBeenCalledTimes(2));
    expect(updateFeedSettings).toHaveBeenNthCalledWith(2, {
      locationPinVisibility: 'mutuals',
      showDistanceLabels: true,
      postExpiryDefault: '7d',
    });
    expect(sevenDayButton).toHaveClass('bg-primary');

    resolveSecond({
      locationPinVisibility: 'mutuals',
      showDistanceLabels: true,
      postExpiryDefault: '7d',
    });

    await waitFor(() => expect(sevenDayButton).toHaveClass('bg-primary'));
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
