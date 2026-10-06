import { requestApi } from './apiClient';

export type RewardGrant = {
  id: string;
  source: 'activity_recurring' | 'activity_long_bonus' | 'referral' | 'admin';
  days: number;
  status: 'active' | 'reversed';
  createdAt: string;
  sideQuestKey: SideQuestKey | null;
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
  };
};

export type PromotionalClaim = {
  claimed: boolean;
  alreadyRedeemed?: boolean;
  label: string;
  activeUntil: string | null;
  grant: RewardGrant | null;
};

export type WelcomeDayStatus = {
  available: boolean;
  claimed: boolean;
  activeUntil: string | null;
};

export type DailyRewardCheckIn = {
  credited: boolean;
  activityDate: string;
  timezone: string;
  currentStreak: number;
  grants: RewardGrant[];
};

export type SideQuestKey = 'complete_tutorial' | 'upload_first_photo' | 'complete_profile' | 'upload_four_photos' | 'view_profile' | 'send_cruush' | 'send_ping' | 'first_mutual_cruush' | 'send_message' | 'send_three_messages' | 'post_feed' | 'post_three_feed' | 'check_in_spot' | 'post_spot_board' | 'rate_spot' | 'save_visibility_set' | 'join_club' | 'send_club_message';

export type SideQuestSummary = {
  pingCredits: number;
  claimingAvailable: boolean;
  cruushPlusClaimsThisWeek: number;
  cruushPlusWeeklyLimit: number;
  claimedToday: boolean;
  quests: Array<{
    key: SideQuestKey;
    title: string;
    rewardKind: 'ping' | 'cruush_plus_day';
    rewardAmount: number;
    completed: boolean;
    claimed: boolean;
    claimedAt: string | null;
  }>;
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

export function getRewardGrant(grantId: string) {
  return requestApi<RewardGrant>(`/api/rewards/grants/${encodeURIComponent(grantId)}`);
}

export function getWelcomeDayStatus() {
  return requestApi<WelcomeDayStatus>('/api/rewards/welcome-day');
}

export function claimWelcomeDay() {
  return requestApi<WelcomeDayStatus & { grant: RewardGrant | null }>('/api/rewards/welcome-day/claim', {
    method: 'POST',
  });
}

export function updateRewardTimezone(timezone: string) {
  return requestApi<{ timezone: string }>('/api/rewards/timezone', {
    method: 'PUT',
    body: JSON.stringify({ timezone }),
  });
}

export function recordDailyRewardCheckIn() {
  return requestApi<DailyRewardCheckIn>('/api/rewards/check-in', {
    method: 'POST',
  });
}

export function getSideQuests() {
  return requestApi<SideQuestSummary>('/api/rewards/side-quests');
}

export function recordTutorialCompletion() {
  return requestApi<{ completed: true }>('/api/rewards/tutorial-completion', {
    method: 'POST',
  });
}

export function claimSideQuest(questKey: SideQuestKey) {
  return requestApi<SideQuestSummary>(`/api/rewards/side-quests/${questKey}/claim`, {
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
  return requestApi<{ enabled: true; recoveryCodes: string[]; promotionalDaysGranted: number }>('/api/auth/2fa/setup/complete', {
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
