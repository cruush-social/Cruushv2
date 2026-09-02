import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  Clipboard,
  Gift,
  Share2,
  Sparkles,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import CruushPlusWord from './CruushPlusWord';
import LoadingCardSkeletons from './LoadingCardSkeletons';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import {
  getRewardSummary,
  getSideQuests,
  claimSideQuest,
  recordDailyRewardCheckIn,
  redeemCruushPlusPromoCode,
  updateRewardTimezone,
  type RewardSummary,
  type SideQuestKey,
  type SideQuestSummary,
} from '../lib/rewardsApi';
import { CRUUSH_PLUS_CHANGED_EVENT } from '../lib/billingApi';
import { CRUUSH_PLUS_FEATURES } from '../lib/cruushPlusFeatures';
import { showEarnedCruushPlusCard } from '../lib/earnedCruushPlusCard';

const BENEFITS_OPEN_STORAGE_KEY = 'cruush:rewards:benefits-open';

function readBenefitsOpenPreference() {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const storedPreference = window.localStorage.getItem(BENEFITS_OPEN_STORAGE_KEY);
    return storedPreference === null ? true : storedPreference === 'true';
  } catch {
    return true;
  }
}

function saveBenefitsOpenPreference(open: boolean) {
  try {
    window.localStorage.setItem(BENEFITS_OPEN_STORAGE_KEY, String(open));
  } catch {
    // Some privacy modes block local storage. The accordion still works for this visit.
  }
}

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
  const [sideQuests, setSideQuests] = useState<SideQuestSummary | null>(null);
  const [sideQuestError, setSideQuestError] = useState<string | null>(null);
  const [sideQuestLoading, setSideQuestLoading] = useState(false);
  const [claimingQuest, setClaimingQuest] = useState<SideQuestKey | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [promoSaving, setPromoSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [benefitsOpen, setBenefitsOpen] = useState(readBenefitsOpenPreference);
  const mountedRef = useRef(true);
  const questRequestRef = useRef(0);
  const questReadPendingRef = useRef(false);
  const claimPendingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      questRequestRef.current += 1;
      questReadPendingRef.current = false;
    };
  }, []);

  const loadSideQuestSummary = useCallback(async (quiet = false) => {
    if (!mountedRef.current || claimPendingRef.current || questReadPendingRef.current) return;
    const requestId = ++questRequestRef.current;
    questReadPendingRef.current = true;
    if (!quiet) {
      setSideQuestLoading(true);
      setSideQuestError(null);
    }

    try {
      const nextSideQuests = await getSideQuests();
      if (!mountedRef.current || requestId !== questRequestRef.current) return;
      setSideQuests(nextSideQuests);
      setSideQuestError(null);
    } catch {
      if (!mountedRef.current || requestId !== questRequestRef.current) return;
      // A background refresh must not erase the last usable quest list.
      if (!quiet) {
        setSideQuests(null);
        setSideQuestError('Side Quests are temporarily unavailable.');
      }
    } finally {
      if (mountedRef.current && requestId === questRequestRef.current) {
        questReadPendingRef.current = false;
        setSideQuestLoading(false);
      }
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      await updateRewardTimezone(timezone).catch(() => undefined);
      await recordDailyRewardCheckIn().catch(() => undefined);
      const [rewardSummary] = await Promise.all([
        getRewardSummary(),
        loadSideQuestSummary(),
      ]);
      setSummary(rewardSummary);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load rewards.');
    } finally {
      setLoading(false);
    }
  }, [loadSideQuestSummary]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const refreshVisibleQuests = () => {
      if (document.visibilityState === 'visible') void loadSideQuestSummary(true);
    };
    // Eligibility can change in another popup or tab, or at the member's local
    // day/week boundary. Only read while visible; never claim or check in here.
    const interval = window.setInterval(refreshVisibleQuests, 60_000);
    window.addEventListener('focus', refreshVisibleQuests);
    document.addEventListener('visibilitychange', refreshVisibleQuests);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshVisibleQuests);
      document.removeEventListener('visibilitychange', refreshVisibleQuests);
    };
  }, [loading, loadSideQuestSummary]);

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

  const handleBenefitsOpenChange = (value: string) => {
    const open = value === 'benefits';
    setBenefitsOpen(open);
    saveBenefitsOpenPreference(open);
  };

  const handleClaimSideQuest = async (questKey: SideQuestKey) => {
    if (claimPendingRef.current) return;
    claimPendingRef.current = true;
    // Invalidate a pending read before the mutation so its old claim flags
    // cannot replace the authoritative response returned by the claim.
    questRequestRef.current += 1;
    questReadPendingRef.current = false;
    setSideQuestLoading(false);
    setClaimingQuest(questKey);
    setError(null);
    let refreshAfterFailure = false;
    try {
      const nextSideQuests = await claimSideQuest(questKey);
      window.dispatchEvent(new CustomEvent(CRUUSH_PLUS_CHANGED_EVENT));
      if (!mountedRef.current) return;
      setSideQuests(nextSideQuests);
      setSideQuestError(null);
      toast.success('Side Quest claimed.');
      // The claim has succeeded. A history refresh failure must not present it
      // as a failed claim or prevent the newly earned entitlement from updating.
      const nextSummary = await getRewardSummary().catch(() => null);
      if (mountedRef.current && nextSummary) {
        setSummary(nextSummary);
        const grant = nextSummary.recentGrants.find(item => item.sideQuestKey === questKey && item.status === 'active');
        if (grant) showEarnedCruushPlusCard(grant);
      }
    } catch (claimError) {
      if (!mountedRef.current) return;
      setError(claimError instanceof Error ? claimError.message : 'Side Quest could not be claimed.');
      refreshAfterFailure = true;
    } finally {
      claimPendingRef.current = false;
      if (mountedRef.current) {
        setClaimingQuest(null);
        if (refreshAfterFailure) await loadSideQuestSummary();
      }
    }
  };

  const weeklyCruushPlusCapReached = sideQuests
    ? (sideQuests.cruushPlusClaimsThisWeek ?? 0) >= (sideQuests.cruushPlusWeeklyLimit ?? 2)
    : false;
  const openSideQuests = sideQuests?.quests
    .filter((quest) => !quest.claimed && (!weeklyCruushPlusCapReached || quest.rewardKind !== 'cruush_plus_day'))
    .slice(0, 4) ?? [];
  const completedSideQuests = sideQuests?.quests
    .filter((quest) => quest.claimed)
    .sort((left, right) => new Date(right.claimedAt ?? 0).getTime() - new Date(left.claimedAt ?? 0).getTime()) ?? [];
  const recentNonQuestGrants = summary?.recentGrants.filter((grant) => !grant.sideQuestKey) ?? [];

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
        <Card className="gap-0">
          <Accordion
            collapsible
            type="single"
            value={benefitsOpen ? 'benefits' : ''}
            onValueChange={handleBenefitsOpenChange}
          >
            <AccordionItem className="border-0" value="benefits">
              <AccordionTrigger
                aria-label={benefitsOpen ? 'Hide cruush+ benefits' : 'Show cruush+ benefits'}
                className="px-6 py-5 text-base hover:no-underline"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span>What <CruushPlusWord /> unlocks</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <ul aria-label="cruush+ features" className="grid grid-cols-2 gap-3">
                  {CRUUSH_PLUS_FEATURES.map((feature) => (
                    <li
                      className="rounded-xl border border-white/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_30px_rgba(255,0,114,0.18)]"
                      key={feature.title}
                      style={{
                        background: 'var(--cruush-gradient)',
                      }}
                    >
                      <p className="font-semibold text-white">{feature.title}</p>
                      <p className="mt-1 text-sm leading-5 text-white/85">{feature.description}</p>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>

        {!loading && summary ? (
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
            </CardContent>
          </Card>
        ) : null}

        <Button
          className="h-12 w-full rounded-full text-base font-semibold text-white"
          data-testid="rewards-get-cruush-plus"
          onClick={() => navigate('/store')}
          style={{ background: 'var(--cruush-logo)' }}
          type="button"
        >
          Get <CruushPlusWord />
        </Button>

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

            <Card data-testid="side-quests-card">
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle>Side Quests</CardTitle>
                {sideQuests ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-sm text-white">
                    <Zap className="h-4 w-4 text-primary" />{sideQuests.pingCredits} {sideQuests.pingCredits === 1 ? 'Pulse' : 'Pulses'}
                  </span>
                ) : null}
              </CardHeader>
              <CardContent>
                {sideQuests ? (
                  openSideQuests.length > 0 ? (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {openSideQuests.map((quest) => {
                      const dailyLimit = sideQuests.claimedToday && !quest.claimed;
                      const claimingUnavailable = !sideQuests.claimingAvailable;
                      return (
                        <li key={quest.key} className="rounded-xl border border-white/12 bg-black/30 p-4">
                          <p className="font-medium text-white">{quest.title}</p>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-sm text-primary">{quest.rewardKind === 'ping' ? `${quest.rewardAmount} ${quest.rewardAmount === 1 ? 'Pulse' : 'Pulses'}` : '1 day of cruush+'}</span>
                            <Button
                              size="sm"
                              variant={quest.claimed ? 'outline' : 'default'}
                              disabled={claimingUnavailable || !quest.completed || quest.claimed || dailyLimit || claimingQuest !== null}
                              onClick={() => void handleClaimSideQuest(quest.key)}
                            >
                              {quest.claimed
                                ? 'Claimed'
                                : !quest.completed
                                  ? 'Incomplete'
                                  : dailyLimit
                                    ? 'Tomorrow'
                                    : claimingUnavailable
                                      ? 'Unavailable'
                                      : claimingQuest === quest.key
                                        ? 'Claiming...'
                                        : 'Claim'}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  ) : sideQuests.quests.every((quest) => quest.claimed) ? (
                    <p className="text-sm text-muted-foreground">All Side Quests completed.</p>
                  ) : null
                ) : sideQuestError ? (
                  <>
                    <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                      {sideQuestError}
                    </div>
                    <Button
                      className="mt-3"
                      variant="outline"
                      disabled={sideQuestLoading}
                      onClick={() => void loadSideQuestSummary()}
                    >
                      {sideQuestLoading ? 'Trying again...' : 'Try again'}
                    </Button>
                  </>
                ) : (
                  <LoadingCardSkeletons count={1} label="Loading Side Quests" />
                )}
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
                {recentNonQuestGrants.length === 0 && completedSideQuests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Your first confirmed reward will appear here.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {recentNonQuestGrants.map((grant) => (
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
                    {completedSideQuests.map((quest) => (
                      <li key={`side-quest-${quest.key}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                        <div>
                          <p>Side Quest: {quest.title}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(quest.claimedAt) ?? 'Completed'}</p>
                        </div>
                        <span className="text-primary">
                          +{quest.rewardAmount} {quest.rewardKind === 'ping' ? (quest.rewardAmount === 1 ? 'Pulse' : 'Pulses') : 'cruush+ day'}
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
