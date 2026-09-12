import type { RewardGrant } from './rewardsApi';

export const EARNED_CRUUSH_PLUS_CARD_EVENT = 'cruush:earned-plus-card';

export type EarnedCruushPlusCard = {
  id: string;
  amount: string;
  unit: string;
  format: 'default' | 'compact' | 'word';
  /** A Ping card must not carry cruush+ branding or the cruush+ benefit list. */
  kind?: 'plus' | 'ping';
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

// Most Side Quests pay in Pings, which carry no cruush+ days, so the scratch
// card never appeared for them and claiming looked like nothing happened.
export function cardForPings(claimId: string, pings: number): EarnedCruushPlusCard | null {
  if (!claimId || !Number.isFinite(pings) || pings <= 0) return null;
  return {
    id: `pings:${claimId}`,
    amount: String(pings),
    unit: pings === 1 ? 'Pulse' : 'Pulses',
    format: pings >= 10 ? 'compact' : 'default',
    kind: 'ping',
  };
}

// Presentation only. The caller must have a successful server claim response.
export function showEarnedPingsCard(claimId: string, pings: number) {
  const card = cardForPings(claimId, pings);
  if (card) window.dispatchEvent(new CustomEvent(EARNED_CRUUSH_PLUS_CARD_EVENT, { detail: card }));
}
