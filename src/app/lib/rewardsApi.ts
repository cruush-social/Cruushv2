import { requestApi } from './apiClient';

export type RewardGrant = {
  id: string;
  source: 'activity_recurring' | 'activity_long_bonus' | 'referral' | 'admin';
  days: number;
  status: 'active' | 'reversed';
  createdAt: string;
};

export type RewardSummary = {
  streak: {
    current: number;
    longest: number;
    todayQualified: boolean;
    nextRecurringInDays: number;
    nextLongBonusInDays: number;
    nextLoginBonusAtDays: number;
  };
  promotionalAccess: {
    active: boolean;
    activeUntil: string | null;
    bankedDays: number;
    effectiveCruushPlus: boolean;
  };
  referrals: {
    pending: number;
    qualified: number;
    underReview: number;
    code: string;
    link: string;
  };
  recentGrants: RewardGrant[];
  timezone: string;
  rules: {
    recurringStreakDays: number;
    recurringStreakRewardDays: number;
    longStreakDays: number;
    longStreakBonusDays: number;
    referralRewardDays: number;
    referralMinAccountAgeDays: number;
    maxBankedPromotionalDays: number;
    automaticPromotionalRewardsEnabled: boolean;
  };
};

export type PromotionalClaim = {
  claimed: boolean;
  alreadyRedeemed?: boolean;
  label: string;
  activeUntil: string | null;
  grant: RewardGrant | null;
};

export type TwoFactorStatus = {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
};

export type TwoFactorSetup = {
  secret: string;
  otpauthUri: string;
  qrCodeDataUrl: string;
};

export function getRewardSummary() {
  return requestApi<RewardSummary>('/api/rewards/summary');
}

export function updateRewardTimezone(timezone: string) {
  return requestApi<{ timezone: string }>('/api/rewards/timezone', {
    method: 'PUT',
    body: JSON.stringify({ timezone }),
  });
}

export function claimBetaLaunchCruushPlus() {
  return requestApi<PromotionalClaim>('/api/rewards/beta-launch/claim', {
    method: 'POST',
  });
}

export function redeemCruushPlusPromoCode(code: string) {
  return requestApi<PromotionalClaim>('/api/rewards/promo-codes/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function getTwoFactorStatus() {
  return requestApi<TwoFactorStatus>('/api/auth/2fa');
}

export function startTwoFactorSetup(password: string) {
  return requestApi<TwoFactorSetup>('/api/auth/2fa/setup', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function completeTwoFactorSetup(token: string) {
  return requestApi<{ enabled: true; recoveryCodes: string[] }>('/api/auth/2fa/setup/complete', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function regenerateTwoFactorRecoveryCodes(password: string, token: string) {
  return requestApi<{ recoveryCodes: string[] }>('/api/auth/2fa/recovery-codes', {
    method: 'POST',
    body: JSON.stringify({ password, token }),
  });
}

export function disableTwoFactor(password: string, token: string) {
  return requestApi<{ disabled: true }>('/api/auth/2fa', {
    method: 'DELETE',
    body: JSON.stringify({ password, token }),
  });
}
