import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Clipboard, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  completeTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateTwoFactorRecoveryCodes,
  startTwoFactorSetup,
  type TwoFactorSetup,
  type TwoFactorStatus,
} from '../lib/rewardsApi';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';

export default function TwoFactorSettings() {
  const navigate = useNavigate();
  const [twoFactor, setTwoFactor] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setTwoFactor(await getTwoFactorStatus());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load 2FA settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}.`);
    }
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

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Two-factor authentication</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 p-4">
        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading 2FA settings...
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <p>{error}</p>
            <Button className="mt-3" variant="outline" onClick={() => void load()}>Try again</Button>
          </div>
        ) : null}

        {!loading ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Authenticator app
              </CardTitle>
              <CardDescription>
                Protect your account and make referred accounts eligible to qualify.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {twoFactor?.enabled ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-[#03ecfc]">
                    <Check className="h-4 w-4" />
                    Enabled - {twoFactor.recoveryCodesRemaining} recovery codes remaining
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
                    <p className="text-xs text-muted-foreground">Can't scan? Enter this key once:</p>
                    <button
                      type="button"
                      aria-label="Copy setup key"
                      className="mt-1 flex w-full items-start justify-between gap-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-left text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => void copy(setup.secret, 'Setup key')}
                    >
                      <span className="min-w-0 break-all font-mono text-sm">{setup.secret}</span>
                      <Clipboard className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
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
                    aria-describedby="two-factor-password-help"
                    aria-label="cruush login password"
                    placeholder="cruush login password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <p id="two-factor-password-help" className="text-xs leading-5 text-muted-foreground">
                    Use the same password you use to sign in. This is not a separate 2FA password.
                  </p>
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
                    <Clipboard className="mr-2 h-4 w-4" />
                    Copy recovery codes
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
