import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FirstFeedPostPrompt from './FirstFeedPostPrompt';

const userNoticesApi = vi.hoisted(() => ({
  dismissUserNotice: vi.fn(),
  getUserNoticeDismissal: vi.fn(),
}));

// resolveNoticeDismissal/markNoticeDismissed keep their real behaviour, layered over the
// two mocked calls, so these tests still drive the notices API directly.
vi.mock('../lib/userNoticesApi', async () => {
  const { hasPersistentNoticeFlag, setPersistentNoticeFlag } = await import('../lib/persistentNotice');

  return {
    ...userNoticesApi,
    resolveNoticeDismissal: async (key: string) => {
      if (hasPersistentNoticeFlag(key)) {
        return { dismissed: true, offline: false };
      }

      try {
        const notice = await userNoticesApi.getUserNoticeDismissal(key);

        if (notice.dismissed) {
          setPersistentNoticeFlag(key);
        }

        return { dismissed: notice.dismissed, offline: false };
      } catch {
        return { dismissed: false, offline: true };
      }
    },
    markNoticeDismissed: (key: string, options: { offline?: boolean } = {}) => {
      setPersistentNoticeFlag(key);

      if (!options.offline) {
        void userNoticesApi.dismissUserNotice(key).catch(() => {});
      }
    },
  };
});

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

// Regression: the lookup ended in `.catch(() => setOpen(false))`, so any error from the
// notices API silently suppressed the prompt instead of failing that one request.
describe('FirstFeedPostPrompt when the notices API is down', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearCookies();
    userNoticesApi.dismissUserNotice.mockReset();
    userNoticesApi.getUserNoticeDismissal.mockReset();
    userNoticesApi.getUserNoticeDismissal.mockRejectedValue(new Error('notices API down'));
  });

  afterEach(() => {
    cleanup();
  });

  it('still shows a prompt this device has never seen', async () => {
    renderPrompt();

    expect(await screen.findByRole('heading', { name: 'Say something to the block' })).toBeInTheDocument();
    // The device flag keeps it one-time; no server write is attempted while it is down.
    expect(window.localStorage.getItem('cruush:first-feed-post-prompt-seen:user-123')).toBe('true');
    expect(userNoticesApi.dismissUserNotice).not.toHaveBeenCalled();
  });

  it('stays closed when this device already saw it', async () => {
    window.localStorage.setItem('cruush:first-feed-post-prompt-seen:user-123', 'true');

    renderPrompt();

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Say something to the block' })).not.toBeInTheDocument());
    expect(userNoticesApi.getUserNoticeDismissal).not.toHaveBeenCalled();
  });
});
