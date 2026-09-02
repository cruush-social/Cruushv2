import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { CRUUSH_PLUS_FEATURES } from '../lib/cruushPlusFeatures';
import Rewards from './Rewards';
import type { SideQuestKey, SideQuestSummary } from '../lib/rewardsApi';

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

function questSummary(): SideQuestSummary {
  const keys: SideQuestKey[] = ['view_profile', 'send_cruush', 'send_ping', 'post_feed', 'send_message'];
  return {
    pingCredits: 0,
    claimingAvailable: true,
    cruushPlusClaimsThisWeek: 0,
    cruushPlusWeeklyLimit: 2,
    claimedToday: false,
    quests: keys.map((key, index) => ({
      key,
      title: `Quest ${index + 1}`,
      rewardKind: 'ping',
      rewardAmount: 1,
      completed: true,
      claimed: false,
      claimedAt: null,
    })),
  };
}

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
    api.getSideQuests.mockResolvedValue({ ...questSummary(), quests: [] });
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
  });

  it('explains every user-accessible cruush+ feature', async () => {
    renderRewards();
    await screen.findByText('6-day streak');

    const benefitsToggle = screen.getByRole('button', { name: 'Hide cruush+ benefits' });
    expect(benefitsToggle).toHaveAttribute('aria-expanded', 'true');
    const featureList = screen.getByRole('list', { name: 'cruush+ features' });
    expect(featureList).toHaveClass('grid-cols-2');
    expect(within(featureList).getAllByRole('listitem')).toHaveLength(8);
    expect(CRUUSH_PLUS_FEATURES).toHaveLength(8);
    for (const feature of CRUUSH_PLUS_FEATURES) {
      expect(within(featureList).getByText(feature.title)).toBeInTheDocument();
      expect(within(featureList).getByText(feature.description)).toBeInTheDocument();
    }
    expect(within(featureList).queryByText(/\bPing\b|Voyeur|Create posts on the local feed/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide cruush+ benefits' }));
    expect(window.localStorage.getItem('cruush:rewards:benefits-open')).toBe('false');
    expect(screen.queryByRole('list', { name: 'cruush+ features' })).not.toBeInTheDocument();
  });

  it('renders a recoverable error state', async () => {
    api.getRewardSummary.mockRejectedValue(new Error('Rewards are temporarily unavailable.'));
    renderRewards();

    expect(await screen.findByRole('alert')).toHaveTextContent('Rewards are temporarily unavailable.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide cruush+ benefits' })).toBeInTheDocument();
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

  it('retains a successful claim when an older refresh returns afterwards', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const initial = questSummary();
    const claimed = {
      ...initial,
      pingCredits: 1,
      claimedToday: true,
      quests: initial.quests.map((quest, index) => index === 0
        ? { ...quest, claimed: true, claimedAt: '2026-08-30T12:00:00.000Z' }
        : quest),
    };
    api.getSideQuests.mockResolvedValue(initial);
    api.claimSideQuest.mockResolvedValue(claimed);
    renderRewards();
    const card = await screen.findByTestId('side-quests-card');
    await within(card).findByText('Quest 1');
    expect(within(card).getAllByRole('listitem')).toHaveLength(4);
    expect(within(card).queryByText('Quest 5')).not.toBeInTheDocument();

    let resolveStale!: (value: SideQuestSummary) => void;
    api.getSideQuests.mockImplementationOnce(() => new Promise((resolve) => {
      resolveStale = resolve;
    }));
    fireEvent.focus(window);
    await waitFor(() => expect(api.getSideQuests).toHaveBeenCalledTimes(2));
    fireEvent.click(within(card).getAllByRole('button', { name: 'Claim' })[0]);
    await screen.findByText('Side Quest: Quest 1');
    await act(async () => resolveStale(initial));

    expect(within(card).queryByText('Quest 1')).not.toBeInTheDocument();
    expect(within(card).getByText('Quest 5')).toBeInTheDocument();
    expect(within(card).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Side Quest: Quest 1')).toBeInTheDocument();
    expect(api.claimSideQuest).toHaveBeenCalledTimes(1);
  });

  it('refreshes availability on focus without creating another daily check-in', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const initial = { ...questSummary(), claimedToday: true };
    api.getSideQuests.mockResolvedValue(initial);
    renderRewards();
    const card = await screen.findByTestId('side-quests-card');
    expect((await within(card).findAllByRole('button', { name: 'Tomorrow' }))[0]).toBeDisabled();

    api.getSideQuests.mockResolvedValue({ ...initial, claimedToday: false });
    fireEvent.focus(window);
    expect((await within(card).findAllByRole('button', { name: 'Claim' }))[0]).toBeEnabled();
    expect(api.recordDailyRewardCheckIn).toHaveBeenCalledTimes(1);
    expect(api.claimSideQuest).not.toHaveBeenCalled();

    api.getSideQuests.mockRejectedValue(new Error('Offline'));
    fireEvent.focus(window);
    await waitFor(() => expect(api.getSideQuests).toHaveBeenCalledTimes(3));
    expect(within(card).getByText('Quest 1')).toBeInTheDocument();
    expect(within(card).queryByRole('alert')).not.toBeInTheDocument();
  });
});
