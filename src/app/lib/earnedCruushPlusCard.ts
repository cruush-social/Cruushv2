import type { RewardGrant } from './rewardsApi';

export const EARNED_CRUUSH_PLUS_CARD_EVENT = 'cruush:earned-plus-card';

export type EarnedCruushPlusCard = {
  id: string;
  amount: string;
  unit: string;
  format: 'default' | 'compact' | 'word';
};

export function cardForReward(grant: Pick<RewardGrant, 'id' | 'days'>): EarnedCruushPlusCard | null {
  if (!grant.id || !Number.isFinite(grant.days) || grant.days <= 0) return null;
  return {
    id: `grant:${grant.id}`,
    amount: String(grant.days),
    unit: grant.days === 1 ? 'day' : 'days',
    format: grant.days >= 10 ? 'compact' : 'default',
  };
}

// Presentation only. The caller must have a successful server grant response.
export function showEarnedCruushPlusCard(grant: Pick<RewardGrant, 'id' | 'days'>) {
  const card = cardForReward(grant);
  if (card) window.dispatchEvent(new CustomEvent(EARNED_CRUUSH_PLUS_CARD_EVENT, { detail: card }));
}
