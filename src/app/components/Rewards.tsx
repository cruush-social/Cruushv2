import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  Check,
  Clipboard,
  Gift,
  KeyRound,
  RefreshCw,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import CruushPlusWord from './CruushPlusWord';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import {
  completeTwoFactorSetup,
  disableTwoFactor,
  getRewardSummary,
  redeemCruushPlusPromoCode,
  getTwoFactorStatus,
  regenerateTwoFactorRecoveryCodes,
  startTwoFactorSetup,
  updateRewardTimezone,
  type RewardSummary,
  type TwoFactorSetup,
  type TwoFactorStatus,
} from '../lib/rewardsApi';
import { CRUUSH_PLUS_CHANGED_EVENT } from '../lib/billingApi';

function sourceLabel(source: RewardSummary['recentGrants'][number]['source']) {
  switch (source) {
    case 'activity_recurring':
      return '7-day streak';
    case 'activity_long_bonus':
      return 'Long-streak bonus';
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
  const [twoFactor, setTwoFactor] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promoSaving, setPromoSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      await updateRewardTimezone(timezone).catch(() => undefined);
      const [nextSummary, nextTwoFactor] = await Promise.all([
        getRewardSummary(),
        getTwoFactorStatus(),
      ]);
      setSummary(nextSummary);
      setTwoFactor(nextTwoFactor);
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

  const handleStartSetup = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      setSetup(await startTwoFactorSetup(password));
      setPassword('');
      toast.success('Scan the code, then confirm with your authenticator.');
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Unable to start 2FA setup.');
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteSetup = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const result = await completeTwoFactorSetup(token);
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      setToken('');
      setTwoFactor(await getTwoFactorStatus());
      toast.success('Two-factor authentication enabled.');
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Unable to confirm 2FA.');
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const result = await regenerateTwoFactorRecoveryCodes(password, token);
      setRecoveryCodes(result.recoveryCodes);
      setPassword('');
      setToken('');
      setTwoFactor(await getTwoFactorStatus());
      toast.success('Recovery codes regenerated. Previous codes no longer work.');
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : 'Unable to regenerate codes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    setSaving(true);
    setError(null);

    try {
      await disableTwoFactor(password, token);
      setPassword('');
      setToken('');
      setRecoveryCodes([]);
      setTwoFactor(await getTwoFactorStatus());
      toast.success('Two-factor authentication disabled.');
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : 'Unable to disable 2FA.');
    } finally {
      setSaving(false);
    }
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
            <p className="text-xs text-muted-foreground">Real activity. Real referrals. No spam.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 p-4">
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
                    ? 'Today counts. Come back tomorrow to keep it going.'
                    : 'Complete one meaningful action today to continue your streak.'}
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
                    <p className="text-muted-foreground">Next reward</p>
                    <p className="mt-1 font-medium">{summary.streak.nextRecurringInDays} active days</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-muted-foreground">Next long bonus</p>
                    <p className="mt-1 font-medium">{summary.streak.nextLongBonusInDays} active days</p>
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  A cruush, legitimate message, reply, or other eligible social action counts once per
                  calendar day. Opening the app or logging in alone does not count.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle><CruushPlusWord /> time</CardTitle>
                <CardDescription>Promotional access stays separate from paid subscriptions.</CardDescription>
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
                <CardTitle>Invite people you trust</CardTitle>
                <CardDescription>
                  You receive {summary.rules.referralRewardDays} <CruushPlusWord /> days after they secure their
                  account with 2FA, complete their profile, and reach{' '}
                  {summary.rules.referralMinAccountAgeDays} days old.
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
                        title: 'Join me on Cruush',
                        text: 'Join me on Cruush and secure your account with 2FA.',
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
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Two-factor authentication
                </CardTitle>
                <CardDescription>
                  Protect your account and make referred accounts eligible to qualify.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {twoFactor?.enabled ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-emerald-400">
                      <Check className="h-4 w-4" />
                      Enabled · {twoFactor.recoveryCodesRemaining} recovery codes remaining
                    </div>
                    <form className="space-y-3" onSubmit={handleRegenerate}>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        placeholder="Current password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                      />
                      <Input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="Authenticator code"
                        value={token}
                        onChange={(event) => setToken(event.target.value)}
                        required
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" variant="outline" disabled={saving}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Regenerate recovery codes
                        </Button>
                        <Button type="button" variant="destructive" disabled={saving} onClick={handleDisable}>
                          Disable 2FA
                        </Button>
                      </div>
                    </form>
                  </>
                ) : setup ? (
                  <form className="space-y-4" onSubmit={handleCompleteSetup}>
                    <div className="mx-auto w-fit rounded-lg bg-white p-3">
                      <img src={setup.qrCodeDataUrl} alt="cruush authenticator setup QR code" className="h-56 w-56" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Can’t scan? Enter this key once:</p>
                      <button
                        type="button"
                        className="mt-1 break-all font-mono text-sm text-primary"
                        onClick={() => void copy(setup.secret, 'Setup key')}
                      >
                        {setup.secret}
                      </button>
                    </div>
                    <Input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6-digit authenticator code"
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      required
                    />
                    <Button type="submit" disabled={saving}>Confirm and enable 2FA</Button>
                  </form>
                ) : (
                  <form className="space-y-3" onSubmit={handleStartSetup}>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      placeholder="Current password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                    <Button type="submit" disabled={saving}>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Set up authenticator app
                    </Button>
                  </form>
                )}

                {recoveryCodes.length > 0 ? (
                  <div role="status" className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
                    <p className="font-medium">Save these one-use recovery codes now.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      They will not be displayed again. Store them somewhere private.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
                      {recoveryCodes.map((code) => <span key={code}>{code}</span>)}
                    </div>
                    <Button
                      className="mt-3"
                      variant="outline"
                      onClick={() => void copy(recoveryCodes.join('\n'), 'Recovery codes')}
                    >
                      Copy recovery codes
                    </Button>
                  </div>
                ) : null}
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
