import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  Clipboard,
  Gift,
  Share2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import CruushPlusWord from './CruushPlusWord';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import {
  getRewardSummary,
  recordDailyRewardCheckIn,
  redeemCruushPlusPromoCode,
  updateRewardTimezone,
  type RewardSummary,
} from '../lib/rewardsApi';
import { CRUUSH_PLUS_CHANGED_EVENT } from '../lib/billingApi';

const CRUUSH_PLUS_FEATURES = [
  {
    title: 'Full activity',
    description: 'See your full incoming cruush and profile-view lists.',
  },
  {
    title: 'More Pings',
    description: 'Send up to 3 Pings every 24 hours, with 4 hours between sends.',
  },
  {
    title: 'Post nearby',
    description: 'Create posts on the local feed. Free users can still read nearby posts.',
  },
  {
    title: 'Cruise carousel',
    description: 'Spin through nearby profiles and browse again.',
  },
  {
    title: 'All seeking filters',
    description: 'Use more than 3 seeking filter categories at once.',
  },
  {
    title: 'More visibility controls',
    description: 'Use more than 3 hidden filters at once.',
  },
  {
    title: 'Stealth Mode',
    description: 'Browse the map without appearing on it.',
  },
] as const;

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

export default function Rewards() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<RewardSummary | null>(null);
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
      setSummary(await getRewardSummary());
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

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Rewards & <CruushPlusWord /></h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              What <CruushPlusWord /> unlocks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul aria-label="cruush+ features" className="grid gap-3 sm:grid-cols-2">
              {CRUUSH_PLUS_FEATURES.map((feature) => (
                <li className="rounded-xl border border-border bg-muted/30 p-3" key={feature.title}>
                  <p className="font-medium">{feature.title}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{feature.description}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading your rewards…
          </div>
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

            <Card>
              <CardHeader>
                <CardTitle><CruushPlusWord /> time</CardTitle>
                <CardDescription>Earn cruush+ through check-ins, referrals, and promotional grants.</CardDescription>
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
                {summary.recentGrants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Your first confirmed reward will appear here.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {summary.recentGrants.map((grant) => (
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
