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
    nextLongBonusInDays: 24,
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
    longStreakDays: 30,
    longStreakBonusDays: 3,
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

  it('supports setup confirmation and one-time recovery-code display', async () => {
    api.startTwoFactorSetup.mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      otpauthUri: 'otpauth://totp/Cruush:test',
      qrCodeDataUrl: 'data:image/png;base64,AAAA',
    });
    api.completeTwoFactorSetup.mockResolvedValue({
      enabled: true,
      recoveryCodes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'],
    });
    api.getTwoFactorStatus
      .mockResolvedValueOnce({ enabled: false, enabledAt: null, recoveryCodesRemaining: 0 })
      .mockResolvedValueOnce({ enabled: true, enabledAt: '2026-07-27T12:00:00.000Z', recoveryCodesRemaining: 10 });
    renderRewards();
    await screen.findByText('6-day streak');

    expect(screen.getByText('Use the same password you use to sign in. This is not a separate 2FA password.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('cruush login password'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set up authenticator app' }));
    expect(await screen.findByAltText('cruush authenticator setup QR code')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('6-digit authenticator code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and enable 2FA' }));
    expect(await screen.findByText('Save these one-use recovery codes now.')).toBeInTheDocument();
    expect(screen.getByText('AAAAA-BBBBB')).toBeInTheDocument();
  });
});
