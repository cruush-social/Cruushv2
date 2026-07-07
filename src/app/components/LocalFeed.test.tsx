import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LocalFeed from './LocalFeed';

const { createFeedPost, deleteFeedPost, getFeedPosts, getCurrentUserId } = vi.hoisted(() => ({
  createFeedPost: vi.fn(),
  deleteFeedPost: vi.fn(),
  getFeedPosts: vi.fn(),
  getCurrentUserId: vi.fn(),
}));

const { getMyBillingStatus } = vi.hoisted(() => ({
  getMyBillingStatus: vi.fn(),
}));

vi.mock('../lib/postApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/postApi')>('../lib/postApi');

  return {
    ...actual,
    createFeedPost,
    deleteFeedPost,
    getFeedPosts,
  };
});

vi.mock('../lib/sessionUser', () => ({
  getCurrentUserId,
}));

vi.mock('../lib/billingApi', () => ({
  getMyBillingStatus,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

describe('LocalFeed', () => {
  beforeEach(() => {
    createFeedPost.mockReset();
    deleteFeedPost.mockReset();
    getFeedPosts.mockReset();
    getCurrentUserId.mockReset();
    getMyBillingStatus.mockReset();
    getCurrentUserId.mockResolvedValue('user-1');
    getMyBillingStatus.mockResolvedValue({
      cruushPlus: true,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });
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

    expect(await screen.findByText('mine to delete')).toBeInTheDocument();
    expect(screen.getByText('someone else post')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete feed post: mine to delete' }));

    await waitFor(() => expect(deleteFeedPost).toHaveBeenCalledWith('post-owned'));
    await waitFor(() => expect(screen.queryByText('mine to delete')).not.toBeInTheDocument());
    expect(screen.getByText('someone else post')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete feed post: someone else post' })).not.toBeInTheDocument();
  });

  it('locks local feed posting for free users and routes them to cruush+', async () => {
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
          <Route path="/upgrade" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Post on the local feed with cruush+.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Get cruush+' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/upgrade');
    expect(createFeedPost).not.toHaveBeenCalled();
  });
});
