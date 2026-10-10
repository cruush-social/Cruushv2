import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  Clipboard,
  Gift,
  Share2,
  Zap,
} from 'lucide-react';
import { toast } from '../lib/toast';
import { Button } from './ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import CruushPlusWord from './CruushPlusWord';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import AppPageHeader from './AppPageHeader';
import {
  getRewardSummary,
  recordDailyRewardCheckIn,
  redeemCruushPlusPromoCode,
  updateRewardTimezone,
  type RewardSummary,
} from '../lib/rewardsApi';
import { CRUUSH_PLUS_CHANGED_EVENT, getMyBillingStatus, type BillingStatus } from '../lib/billingApi';
import { showEarnedCruushPlusCard } from '../lib/earnedCruushPlusCard';
import { buildCruushPlusStorePath } from '../lib/cruushPlusConversion';
import { trackCruushPlusConversion } from '../lib/posthog';
import CruushPlusSectionControls from './CruushPlusSectionControls';
import CruushPlusSectionTitle from './CruushPlusSectionTitle';

function sourceLabel(source: RewardSummary['recentGrants'][number]['source']) {
  switch (source) {
    case 'activity_recurring':
      return '7-day check-in reward';
    case 'activity_long_bonus':
      return 'Log-in bonus';
    case 'referral':
      return 'Qualified referral';
    default:
      return 'Promotional grant';
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRemainingTime(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default function Rewards() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<RewardSummary | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [promoCode, setPromoCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [promoSaving, setPromoSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      await updateRewardTimezone(timezone).catch(() => undefined);
      await recordDailyRewardCheckIn().catch(() => undefined);
      const [rewardSummary, nextBillingStatus] = await Promise.all([
        getRewardSummary(),
        getMyBillingStatus().catch(() => null),
      ]);
      setSummary(rewardSummary);
      setBillingStatus(nextBillingStatus);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load rewards.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied.`);
  };

  const handleRedeemPromoCode = async (event: FormEvent) => {
    event.preventDefault();
    setPromoSaving(true);
    setError(null);

    try {
      const claim = await redeemCruushPlusPromoCode(promoCode);
      if (claim.claimed && claim.grant) showEarnedCruushPlusCard(claim.grant);
      setPromoCode('');
      await load();
      window.dispatchEvent(new CustomEvent(CRUUSH_PLUS_CHANGED_EVENT, { detail: claim }));
      toast.success('cruush+ code applied.');
    } catch (promoError) {
      setError(promoError instanceof Error ? promoError.message : 'Unable to apply cruush+ code.');
    } finally {
      setPromoSaving(false);
    }
  };

  const recentGrants = summary?.recentGrants ?? [];
  const lifetimeAccess = billingStatus?.cruushPlus === true && billingStatus.expiresAt === null;
  const activeUntil = billingStatus?.cruushPlus === true
    ? billingStatus.expiresAt
    : summary?.promotionalAccess.effectiveCruushPlus
      ? summary.promotionalAccess.activeUntil
      : null;
  const hasActiveAccess = lifetimeAccess || Boolean(activeUntil && Date.parse(activeUntil) > clockMs);
  const remainingTime = activeUntil ? Date.parse(activeUntil) - clockMs : 0;

  useEffect(() => {
    if (!activeUntil || lifetimeAccess) return;
    const interval = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeUntil, lifetimeAccess]);
  const cruushPlusTimeCapsule = !loading && summary ? (
    <Card>
      <CardHeader>
        <CardTitle><CruushPlusWord /> time capsule</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-muted-foreground">Active through</p>
          <p className="mt-1 font-medium">
            {formatDate(summary.promotionalAccess.activeUntil) ?? 'No active promo'}
          </p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-muted-foreground">Banked</p>
          <p className="mt-1 font-medium">{summary.promotionalAccess.bankedDays} days</p>
        </div>
        <div className="col-span-2 rounded-lg bg-muted/40 p-3">
          <p className="text-muted-foreground">Active cruush+ time</p>
          <p className="mt-1 font-medium" role="timer" aria-label="cruush+ time remaining">
            {lifetimeAccess ? 'Lifetime Access' : hasActiveAccess ? formatRemainingTime(remainingTime) : 'No active cruush+'}
          </p>
        </div>
      </CardContent>
    </Card>
  ) : null;

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppPageHeader
        title={<CruushPlusSectionTitle />}
        onBack={() => navigate(-1)}
        bugButtonTestId="rewards-bug-button-slot"
      />

      <main className="mx-auto max-w-2xl space-y-5 p-4">
        <CruushPlusSectionControls active="rewards" />
        <Button
          className="h-12 w-full rounded-full text-base font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--cruush-logo)' }}
          onClick={() => {
            trackCruushPlusConversion('cruush_plus_upgrade_clicked', {
              surface: 'rewards',
              benefit: 'overview',
            });
            navigate(buildCruushPlusStorePath('rewards', 'overview'));
          }}
        >Get <CruushPlusWord /></Button>

        {cruushPlusTimeCapsule}

        {!loading && summary ? (
          <Card>
            <CardHeader>
              <CardTitle>Invite people you trust</CardTitle>
              <CardDescription>
                You receive {summary.rules.referralRewardDays} <CruushPlusWord /> days once they verify 2FA.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input aria-label="Referral link" value={summary.referrals.link} readOnly />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copy referral link"
                  onClick={() => void copy(summary.referrals.link, 'Referral link')}
                >
                  <Clipboard className="h-4 w-4" />
                </Button>
                {'share' in navigator ? (
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Share referral link"
                    onClick={() => void navigator.share({
                      title: 'Join me on cruush',
                      text: 'Join me on cruush.',
                      url: summary.referrals.link,
                    })}
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              {summary.referrals.qrCodeDataUrl ? (
                <Card className="gap-0">
                  <Accordion collapsible type="single">
                    <AccordionItem className="border-0" value="referral-qr-code">
                      <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
                        QR code
                      </AccordionTrigger>
                      <AccordionContent className="px-3 pb-3">
                        <img
                          src={summary.referrals.qrCodeDataUrl}
                          alt="Affiliate link QR code"
                          className="mx-auto h-40 w-40"
                        />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </Card>
              ) : null}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-muted-foreground">Pending</p>
                  <p className="mt-1 text-lg font-semibold">{summary.referrals.pending}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-muted-foreground">Successful</p>
                  <p className="mt-1 text-lg font-semibold">{summary.referrals.qualified}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <LoadingCardSkeletons count={2} label="Loading your rewards" />
        ) : null}

        {error ? (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <p>{error}</p>
            <Button className="mt-3" variant="outline" onClick={() => void load()}>Try again</Button>
          </div>
        ) : null}

        {!loading && summary ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-primary" />
                  {summary.streak.current}-day streak
                </CardTitle>
                <CardDescription>
                  {summary.streak.todayQualified
                    ? 'Today’s check-in counts. Come back tomorrow to keep it going.'
                    : 'Open cruush today to continue your check-in streak.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress
                  value={((summary.rules.recurringStreakDays - summary.streak.nextRecurringInDays) /
                    summary.rules.recurringStreakDays) * 100}
                  aria-label="Progress to next streak reward"
                />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-muted-foreground">Next check-in reward</p>
                    <p className="mt-1 font-medium">{summary.streak.nextRecurringInDays} consecutive days</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-muted-foreground">Reward amount</p>
                    <p className="mt-1 font-medium">
                      {summary.rules.recurringStreakRewardDays}{' '}
                      {summary.rules.recurringStreakRewardDays === 1 ? 'day' : 'days'} each time
                    </p>
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Check in once a day. Every 7 consecutive check-in days earns 1 day of cruush+.
                  Multiple visits on the same day count once. Miss a day and your streak restarts.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Have a code?</CardTitle>
                <CardDescription>Enter a cruush+ code from a launch, waitlist, or support grant.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="flex gap-2" onSubmit={handleRedeemPromoCode}>
                  <Input
                    aria-label="cruush+ code"
                    autoCapitalize="characters"
                    autoComplete="off"
                    placeholder="cruush+ code"
                    value={promoCode}
                    onChange={(event) => setPromoCode(event.target.value)}
                    required
                  />
                  <Button type="submit" disabled={promoSaving || !promoCode.trim()}>
                    {promoSaving ? 'Applying...' : 'Apply'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent rewards</CardTitle>
              </CardHeader>
              <CardContent>
                {recentGrants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Your first confirmed reward will appear here.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {recentGrants.map((grant) => (
                      <li key={grant.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                        <div>
                          <p>{sourceLabel(grant.source)}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(grant.createdAt)}</p>
                        </div>
                        <span className={grant.status === 'reversed' ? 'text-muted-foreground line-through' : 'text-primary'}>
                          +{grant.days} {grant.days === 1 ? 'day' : 'days'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </main>
    </div>
  );
}
