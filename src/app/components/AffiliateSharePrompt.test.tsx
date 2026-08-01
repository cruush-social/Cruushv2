import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import AffiliateSharePrompt from './AffiliateSharePrompt';

const noticesApi = vi.hoisted(() => ({
  dismissUserNotice: vi.fn(),
  getUserNoticeDismissal: vi.fn(),
}));

const persistentNotice = vi.hoisted(() => ({
  hasPersistentNoticeFlag: vi.fn(),
  setPersistentNoticeFlag: vi.fn(),
}));

const rewardsApi = vi.hoisted(() => ({
  getRewardSummary: vi.fn(),
}));

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('../lib/userNoticesApi', () => noticesApi);
vi.mock('../lib/persistentNotice', () => persistentNotice);
vi.mock('../lib/rewardsApi', () => rewardsApi);
vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
  },
}));

const summary = {
  streak: {
    current: 0,
    longest: 0,
    todayQualified: false,
    nextRecurringInDays: 7,
    nextLongBonusInDays: 30,
    nextLoginBonusAtDays: 8,
  },
  promotionalAccess: {
    active: false,
    activeUntil: null,
    bankedDays: 0,
    effectiveCruushPlus: false,
  },
  referrals: {
    pending: 0,
    qualified: 0,
    underReview: 0,
    code: 'abcdefghijklmnop',
    link: 'https://cruush.test/?ref=abcdefghijklmnop',
  },
  recentGrants: [],
  timezone: 'America/New_York',
  rules: {
    recurringStreakDays: 7,
    recurringStreakRewardDays: 1,
    longStreakDays: 30,
    longStreakBonusDays: 7,
    referralRewardDays: 7,
    referralMinAccountAgeDays: 7,
    maxBankedPromotionalDays: 90,
  },
};

function renderPrompt() {
  return render(
    <MemoryRouter initialEntries={['/map']}>
      <Routes>
        <Route
          path="/map"
          element={(
            <>
              <AffiliateSharePrompt userId="user-1" />
              <div>Mock Map</div>
            </>
          )}
        />
        <Route path="/rewards" element={<div>Mock Rewards</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AffiliateSharePrompt', () => {
  beforeEach(() => {
    noticesApi.dismissUserNotice.mockReset();
    noticesApi.getUserNoticeDismissal.mockReset();
    persistentNotice.hasPersistentNoticeFlag.mockReset();
    persistentNotice.setPersistentNoticeFlag.mockReset();
    rewardsApi.getRewardSummary.mockReset();
    toastSuccess.mockReset();
    persistentNotice.hasPersistentNoticeFlag.mockReturnValue(false);
    noticesApi.getUserNoticeDismissal.mockResolvedValue({ dismissed: false, dismissedAt: null });
    noticesApi.dismissUserNotice.mockResolvedValue({ dismissed: true, dismissedAt: '2026-08-01T12:00:00.000Z' });
    rewardsApi.getRewardSummary.mockResolvedValue(summary);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('opens once for an onboarded user and persists the account notice', async () => {
    renderPrompt();

    expect(await screen.findByRole('dialog')).toHaveTextContent('Share your affiliate link');
    expect(screen.getByLabelText('Affiliate link')).toHaveValue(summary.referrals.link);
    expect(persistentNotice.setPersistentNoticeFlag).toHaveBeenCalledWith(
      'cruush:post-onboarding-affiliate-share-seen:user-1',
    );
    expect(noticesApi.dismissUserNotice).toHaveBeenCalledWith(
      'cruush:post-onboarding-affiliate-share-seen:user-1',
    );
  });

  it('does not fetch rewards or open when the notice was already dismissed', async () => {
    noticesApi.getUserNoticeDismissal.mockResolvedValue({ dismissed: true, dismissedAt: '2026-08-01T12:00:00.000Z' });

    renderPrompt();

    await waitFor(() => {
      expect(persistentNotice.setPersistentNoticeFlag).toHaveBeenCalledWith(
        'cruush:post-onboarding-affiliate-share-seen:user-1',
      );
    });
    expect(rewardsApi.getRewardSummary).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('copies the affiliate link and closes', async () => {
    renderPrompt();

    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(summary.referrals.link);
    });
    expect(toastSuccess).toHaveBeenCalledWith('Affiliate link copied.');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('opens rewards from the prompt', async () => {
    renderPrompt();

    fireEvent.click(await screen.findByRole('button', { name: 'Open rewards' }));

    expect(await screen.findByText('Mock Rewards')).toBeInTheDocument();
  });
});
