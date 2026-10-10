import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Gift } from 'lucide-react';
import { getRewardSummary } from '../lib/rewardsApi';
import { useExclusivePopup } from '../lib/popupQueue';
import FirstEntryPromptSurface from './FirstEntryPromptSurface';
import { Button } from './ui/button';

export function affiliateReminderKey(userId: string) {
  return `cruush:affiliate-login-day:v1:${userId}`;
}

export function affiliateReminderDay(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export default function AffiliateLoginReminder({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const dismissButton = useRef<HTMLButtonElement>(null);
  const [rewardDays, setRewardDays] = useState<number | null>(null);
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const showing = useExclusivePopup('affiliate-login', eligible && !dismissed && rewardDays !== null);

  useEffect(() => {
    let active = true;
    setEligible(false);
    setDismissed(false);
    setRewardDays(null);
    try {
      if (localStorage.getItem(affiliateReminderKey(userId)) === affiliateReminderDay()) return;
    } catch {
      // Without persistence, avoid repeatedly prompting on every app reload.
      return;
    }
    void getRewardSummary().then(summary => {
      if (!active || !summary.referrals.link || !(summary.rules.referralRewardDays > 0)) return;
      setRewardDays(summary.rules.referralRewardDays);
      setEligible(true);
    }).catch(() => {});
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!showing) return;
    try {
      localStorage.setItem(affiliateReminderKey(userId), affiliateReminderDay());
    } catch { /* Keep the current prompt dismissible if storage becomes unavailable. */ }
  }, [showing, userId]);

  const dismiss = () => setDismissed(true);
  return <FirstEntryPromptSurface
    open={showing}
    initialFocusRef={dismissButton}
    onDismiss={dismiss}
    testId="affiliate-login-reminder"
    title="Affiliate program"
    description={`You receive ${rewardDays ?? ''} cruush+ days once they verify 2FA.`}
    icon={<Gift aria-hidden="true" className="h-10 w-10 text-white" />}
    primary={<Button type="button" className="min-h-11 rounded-full text-white" style={{ background: 'var(--cruush-gradient)' }} onClick={() => { dismiss(); navigate('/rewards'); }}>View rewards</Button>}
    secondary={<Button asChild variant="outline" className="min-h-11 rounded-full"><button ref={dismissButton} type="button" onClick={dismiss}>Not now</button></Button>}
  />;
}
