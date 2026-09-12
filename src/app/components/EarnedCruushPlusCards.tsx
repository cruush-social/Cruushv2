import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import CruushPlusScratchCard from './CruushPlusScratchCard';
import { getRewardGrant } from '../lib/rewardsApi';
import { getCheckoutSession } from '../lib/billingApi';
import { cardForReward, EARNED_CRUUSH_PLUS_CARD_EVENT, type EarnedCruushPlusCard } from '../lib/earnedCruushPlusCard';
import { hasPersistentNoticeFlag, setPersistentNoticeFlag } from '../lib/persistentNotice';
import { acquireOneTimeDialog, onOneTimeDialogReleased, releaseOneTimeDialog } from '../lib/oneTimeDialogQueue';

export default function EarnedCruushPlusCards({ userId }: {
  userId: string;
}) {
  const location = useLocation();
  const [queue, setQueue] = useState<EarnedCruushPlusCard[]>([]);
  const [open, setOpen] = useState(false);
  const activeCard = queue[0];
  const dialogKey = `earned-plus:${userId}`;
  const enqueue = useCallback((card: EarnedCruushPlusCard, replay = false) => {
    if (!replay && hasPersistentNoticeFlag(`cruush:plus-card:${userId}:${card.id}`)) return;
    setQueue(current => current.some(item => item.id === card.id) ? current : [...current, card]);
  }, [userId]);

  useEffect(() => {
    const receive = (event: Event) => {
      const card = (event as CustomEvent<EarnedCruushPlusCard>).detail;
      if (card?.id && card.amount) enqueue(card);
    };
    window.addEventListener(EARNED_CRUUSH_PLUS_CARD_EVENT, receive);
    return () => window.removeEventListener(EARNED_CRUUSH_PLUS_CARD_EVENT, receive);
  }, [enqueue]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const grantId = params.get('rewardGrant');
    const checkoutSessionId = params.get('checkoutSession');
    let active = true;
    if (grantId) {
      // The URL selects a grant, never supplies its value or grants access.
      void getRewardGrant(grantId).then(grant => {
        const card = grant.id === grantId && grant.status === 'active' ? cardForReward(grant) : null;
        if (active && card) enqueue(card, true);
      }).catch(() => {});
    } else if (checkoutSessionId) {
      void getCheckoutSession(checkoutSessionId).then(checkout => {
        if (!active || checkout.userId !== userId || checkout.status !== 'completed') return;
        const plan = checkout.plan;
        // Match the confirmed plan's unit; a calendar month is not a fixed 30-day grant.
        const days = plan.durationDays;
        const months = plan.durationMonths;
        const duration = days ?? months;
        if (!plan.isLifetime && (duration == null || !Number.isFinite(duration) || duration <= 0)) return;
        const annual = days == null && months === 12;
        const amount = plan.isLifetime ? 'Lifetime' : annual ? '1' : String(duration);
        enqueue({
          id: `purchase:${checkout.id}`, amount,
          unit: plan.isLifetime ? '' : days != null
            ? days === 1 ? 'day' : 'days'
            : annual ? 'year' : months === 1 ? 'month' : 'months',
          format: plan.isLifetime ? 'word' : amount.length > 1 ? 'compact' : 'default',
        });
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [enqueue, location.key, location.search, userId]);

  useEffect(() => {
    if (!activeCard) return;
    let active = true;
    const openWhenAvailable = () => {
      if (active && acquireOneTimeDialog(dialogKey)) setOpen(true);
    };
    const unsubscribe = onOneTimeDialogReleased(openWhenAvailable);
    openWhenAvailable();
    return () => {
      active = false;
      unsubscribe();
      releaseOneTimeDialog(dialogKey);
    };
  }, [activeCard?.id, dialogKey]);

  if (!open || !activeCard) return null;
  return <CruushPlusScratchCard key={activeCard.id} card={activeCard} onClose={accepted => {
    if (accepted) setPersistentNoticeFlag(`cruush:plus-card:${userId}:${activeCard.id}`);
    setOpen(false);
    setQueue(current => current.slice(1));
  }} />;
}
