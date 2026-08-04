import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FirstFeedPostPrompt from './FirstFeedPostPrompt';

const userNoticesApi = vi.hoisted(() => ({
  dismissUserNotice: vi.fn(),
  getUserNoticeDismissal: vi.fn(),
}));

vi.mock('../lib/userNoticesApi', () => userNoticesApi);

function clearCookies() {
  document.cookie.split(';').forEach((cookie) => {
    const name = cookie.split('=')[0]?.trim();

    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  });
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function renderPrompt(userId = 'user-123') {
  return render(
    <MemoryRouter initialEntries={['/map']}>
      <Routes>
        <Route path="/map" element={<FirstFeedPostPrompt userId={userId} />} />
        <Route path="/feed" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FirstFeedPostPrompt', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearCookies();
    userNoticesApi.dismissUserNotice.mockReset();
    userNoticesApi.getUserNoticeDismissal.mockReset();
    userNoticesApi.dismissUserNotice.mockResolvedValue({ dismissed: true, dismissedAt: '2026-08-04T00:00:00.000Z' });
    userNoticesApi.getUserNoticeDismissal.mockResolvedValue({ dismissed: false, dismissedAt: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('encourages a first feed post after onboarding and routes to the feed', async () => {
    renderPrompt();

    expect(await screen.findByRole('heading', { name: 'Say something to the block' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Write a post' }));

    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/feed'));
  });

  it('marks the prompt seen so it only fires once per account', async () => {
    renderPrompt();

    await screen.findByRole('heading', { name: 'Say something to the block' });

    await waitFor(() => expect(userNoticesApi.dismissUserNotice)
      .toHaveBeenCalledWith('cruush:first-feed-post-prompt-seen:user-123'));
    expect(window.localStorage.getItem('cruush:first-feed-post-prompt-seen:user-123')).toBe('true');
  });

  it('stays closed when the account already dismissed the prompt', async () => {
    userNoticesApi.getUserNoticeDismissal.mockResolvedValue({
      dismissed: true,
      dismissedAt: '2026-08-01T00:00:00.000Z',
    });

    renderPrompt();

    await waitFor(() => expect(userNoticesApi.getUserNoticeDismissal).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Say something to the block' })).not.toBeInTheDocument();
  });
});
