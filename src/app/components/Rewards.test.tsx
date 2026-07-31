import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import Rewards from './Rewards';

const api = vi.hoisted(() => ({
  completeTwoFactorSetup: vi.fn(),
  disableTwoFactor: vi.fn(),
  getRewardSummary: vi.fn(),
  getTwoFactorStatus: vi.fn(),
  regenerateTwoFactorRecoveryCodes: vi.fn(),
  startTwoFactorSetup: vi.fn(),
  updateRewardTimezone: vi.fn(),
}));

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('../lib/rewardsApi', () => api);
vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: vi.fn(),
  },
}));

const summary = {
  streak: {
    current: 6,
    longest: 12,
    todayQualified: true,
    nextRecurringInDays: 1,
    nextLongBonusInDays: 2,
    nextLoginBonusAtDays: 8,
  },
  promotionalAccess: {
    active: true,
    activeUntil: '2026-07-30T12:00:00.000Z',
    bankedDays: 7,
    effectiveCruushPlus: true,
  },
  referrals: {
    pending: 2,
    qualified: 1,
    underReview: 0,
    code: 'abcdefghijklmnop',
    link: 'https://cruush.test/?ref=abcdefghijklmnop',
  },
  recentGrants: [],
  timezone: 'America/Chicago',
  rules: {
    recurringStreakDays: 7,
    recurringStreakRewardDays: 1,
    longStreakDays: 1,
    longStreakBonusDays: 1,
    referralRewardDays: 7,
    referralMinAccountAgeDays: 7,
    maxBankedPromotionalDays: 90,
  },
};

function renderRewards() {
  return render(
    <MemoryRouter initialEntries={['/rewards']}>
      <Rewards />
    </MemoryRouter>,
  );
}

describe('Rewards', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    toastSuccess.mockReset();
    api.updateRewardTimezone.mockResolvedValue({ timezone: 'America/Chicago' });
    api.getRewardSummary.mockResolvedValue(summary);
    api.getTwoFactorStatus.mockResolvedValue({
      enabled: false,
      enabledAt: null,
      recoveryCodesRemaining: 0,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders loading, success, and empty-history states safely', async () => {
    let resolveSummary: (value: typeof summary) => void = () => undefined;
    api.getRewardSummary.mockReturnValue(new Promise((resolve) => {
      resolveSummary = resolve;
    }));
    renderRewards();

    expect(screen.getByText('Loading your rewards…')).toBeInTheDocument();
    resolveSummary(summary);

    expect(await screen.findByText('6-day streak')).toBeInTheDocument();
    expect(screen.getByText('Opening the app or logging in alone does not count.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Next log in bonus')).toBeInTheDocument();
    expect(screen.getByText('8 active days')).toBeInTheDocument();
    expect(screen.queryByText('Real activity. Real referrals. No spam.')).not.toBeInTheDocument();
    expect(screen.getByText('Your first confirmed reward will appear here.')).toBeInTheDocument();
    expect(screen.getByDisplayValue(summary.referrals.link)).toHaveAttribute('readonly');
  });

  it('renders a recoverable error state', async () => {
    api.getRewardSummary.mockRejectedValue(new Error('Rewards are temporarily unavailable.'));
    renderRewards();

    expect(await screen.findByRole('alert')).toHaveTextContent('Rewards are temporarily unavailable.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('copies the referral link only after the backend summary confirms it', async () => {
    renderRewards();
    await screen.findByText('6-day streak');
    fireEvent.click(screen.getByRole('button', { name: 'Copy referral link' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(summary.referrals.link);
    });
    expect(toastSuccess).toHaveBeenCalledWith('Referral link copied.');
  });

  it('keeps 2FA off the rewards page', async () => {
    renderRewards();
    await screen.findByText('6-day streak');

    expect(screen.queryByText('Two-factor authentication')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set up authenticator app' })).not.toBeInTheDocument();
  });
});
