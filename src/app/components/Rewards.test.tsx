import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { CRUUSH_PLUS_FEATURES } from '../lib/cruushPlusFeatures';
import Rewards from './Rewards';
import { getMyBillingStatus } from '../lib/billingApi';

const api = vi.hoisted(() => ({
  completeTwoFactorSetup: vi.fn(),
  disableTwoFactor: vi.fn(),
  getRewardSummary: vi.fn(),
  getSideQuests: vi.fn(),
  claimSideQuest: vi.fn(),
  redeemCruushPlusPromoCode: vi.fn(),
  getTwoFactorStatus: vi.fn(),
  recordDailyRewardCheckIn: vi.fn(),
  regenerateTwoFactorRecoveryCodes: vi.fn(),
  startTwoFactorSetup: vi.fn(),
  updateRewardTimezone: vi.fn(),
}));

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('../lib/rewardsApi', () => api);
vi.mock('../lib/billingApi', async () => ({
  ...(await vi.importActual<typeof import('../lib/billingApi')>('../lib/billingApi')),
  getMyBillingStatus: vi.fn(),
}));
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
    nextLongBonusInDays: 1,
    nextLoginBonusAtDays: 7,
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
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    window.localStorage.clear();
    Object.values(api).forEach((mock) => mock.mockReset());
    toastSuccess.mockReset();
    api.updateRewardTimezone.mockResolvedValue({ timezone: 'America/Chicago' });
    api.recordDailyRewardCheckIn.mockResolvedValue({ credited: true, grants: [] });
    api.getRewardSummary.mockResolvedValue(summary);
    vi.mocked(getMyBillingStatus).mockResolvedValue({
      cruushPlus: true,
      expiresAt: '2099-07-30T12:00:00.000Z',
      badges: [],
      processor: 'fake',
      testCheckout: true,
    });
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

    expect(screen.getByRole('status', { name: 'Loading your rewards' })).toBeInTheDocument();
    resolveSummary(summary);

    expect(await screen.findByText('6-day streak')).toBeInTheDocument();
    const sectionHeading = screen.getByRole('heading', { name: 'cruush+ & Rewards' });
    expect(sectionHeading.querySelector('.cruush-logo-font')).toHaveTextContent('cruush+');
    expect(screen.getByText('Check in once a day.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Next check-in reward')).toBeInTheDocument();
    expect(screen.getByText('1 day each time')).toBeInTheDocument();
    expect(screen.getByText(
      'Every 7 consecutive check-in days earns 1 day of cruush+.',
      { exact: false },
    )).toBeInTheDocument();
    expect(screen.getByText('Multiple visits on the same day count once.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Miss a day and your streak restarts.', { exact: false })).toBeInTheDocument();
    expect(api.recordDailyRewardCheckIn).toHaveBeenCalledTimes(1);
    expect(api.recordDailyRewardCheckIn.mock.invocationCallOrder[0]).toBeLessThan(
      api.getRewardSummary.mock.invocationCallOrder[0],
    );
    expect(screen.queryByText(/the next reward takes eight days/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Real activity. Real referrals. No spam.')).not.toBeInTheDocument();
    expect(screen.getByText('Your first confirmed reward will appear here.')).toBeInTheDocument();
    expect(screen.getByDisplayValue(summary.referrals.link)).toHaveAttribute('readonly');
    expect(screen.getByText(/You receive 7/)).toHaveTextContent(
      'You receive 7 cruush+ days once they verify 2FA.',
    );
    expect(screen.queryByText(/days old/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/complete their profile/i)).not.toBeInTheDocument();

    const mainChildren = Array.from(screen.getByRole('main').children);
    const getCruushPlus = screen.getByRole('button', { name: 'Get cruush+' });
    const referralCard = screen.getByRole('heading', { name: 'Invite people you trust' }).closest('[data-slot="card"]');
    const timeCapsuleCard = screen.getByRole('heading', { name: /time capsule/i }).closest('[data-slot="card"]');
    expect(within(timeCapsuleCard as HTMLElement).getByRole('timer', { name: 'cruush+ time remaining' })).toHaveTextContent(/^\d+:\d{2}:\d{2}:\d{2}$/);
    expect(mainChildren.indexOf(timeCapsuleCard as Element)).toBe(mainChildren.indexOf(getCruushPlus) + 1);
    expect(mainChildren.indexOf(timeCapsuleCard as Element)).toBeLessThan(mainChildren.indexOf(referralCard as Element));
  });

  it('explains every user-accessible cruush+ feature', async () => {
    renderRewards();
    await screen.findByText('6-day streak');

    const benefitsToggle = screen.getByRole('button', { name: 'Show cruush+ benefits' });
    expect(benefitsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'cruush+ features' })).not.toBeInTheDocument();

    fireEvent.click(benefitsToggle);
    expect(window.localStorage.getItem('cruush:rewards:benefits-open')).toBe('true');
    const featureList = screen.getByRole('list', { name: 'cruush+ features' });
    expect(within(featureList).getAllByRole('listitem')).toHaveLength(CRUUSH_PLUS_FEATURES.length);
    for (const feature of CRUUSH_PLUS_FEATURES) {
      expect(within(featureList).getByText(feature.title)).toBeInTheDocument();
      expect(within(featureList).getByText(feature.description)).toBeInTheDocument();
    }
    expect(within(featureList).queryByText(/\bPing\b|Voyeur|Create posts on the local Confessional/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide cruush+ benefits' }));
    expect(window.localStorage.getItem('cruush:rewards:benefits-open')).toBe('false');
    expect(screen.queryByRole('list', { name: 'cruush+ features' })).not.toBeInTheDocument();
  });

  it('renders a recoverable error state', async () => {
    api.getRewardSummary.mockRejectedValue(new Error('Rewards are temporarily unavailable.'));
    renderRewards();

    expect(await screen.findByRole('alert')).toHaveTextContent('Rewards are temporarily unavailable.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show cruush+ benefits' })).toBeInTheDocument();
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

  it('removes Side Quests and their requests while preserving earned reward history', async () => {
    api.getRewardSummary.mockResolvedValue({
      ...summary,
      recentGrants: [{ id: 'earned-quest', source: 'side_quest', sideQuestKey: 'view_profile',
        days: 1, status: 'active', createdAt: '2026-08-30T12:00:00.000Z' }],
    });
    renderRewards();
    await screen.findByText('6-day streak');
    expect(screen.queryByText(/Side Quest/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('side-quests-card')).not.toBeInTheDocument();
    expect(screen.getByText('Promotional grant')).toBeInTheDocument();
    expect(screen.getByText('+1 day')).toBeInTheDocument();
    fireEvent.focus(window);
    fireEvent(document, new Event('visibilitychange'));
    expect(api.getSideQuests).not.toHaveBeenCalled();
    expect(api.claimSideQuest).not.toHaveBeenCalled();
    expect(api.recordDailyRewardCheckIn).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue(summary.referrals.link)).toBeInTheDocument();
  });
});
