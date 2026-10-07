import { useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { changeEmail } from '../lib/authApi';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { registerBugButtonSlot } from '../lib/bugButtonSlot';

export default function ChangeEmailSettings() {
  const navigate = useNavigate();
  const [emailPassword, setEmailPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [isChangingEmail, setIsChangingEmail] = useState(false);

  const handleChangeEmail = async (event: FormEvent) => {
    event.preventDefault();
    setEmailError(null);
    setEmailNotice(null);
    setIsChangingEmail(true);

    try {
      const result = await changeEmail({ currentPassword: emailPassword, newEmail });
      setEmailPassword('');
      setEmailNotice(`Confirm the link sent to ${result.pendingEmail}. Your address changes when you open it.`);
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'Failed to change email.');
    } finally {
      setIsChangingEmail(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/88 pb-4 pt-4 shadow-[0_20px_55px_rgba(0,0,0,0.34)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-2xl min-w-0 items-center gap-2 px-4">
          <div className="flex shrink-0 items-center justify-start">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="rounded-full border border-white/10 bg-background/55 text-white backdrop-blur-md hover:bg-white/10"
              aria-label="Back"
              title="Back"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl text-white sm:text-3xl">Change email</h1>
          </div>
          <div className="h-11 w-11 shrink-0" data-testid="change-email-settings-bug-button-slot" ref={registerBugButtonSlot} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4">
        <section className="space-y-4 rounded-2xl border border-white/10 bg-card/70 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.24)]">
          <p className="text-sm text-muted-foreground">Your address changes only after you confirm the link sent to the new one.</p>
          <form className="space-y-4" onSubmit={handleChangeEmail}>
            {emailError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {emailError}
              </div>
            ) : null}

            {emailNotice ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                {emailNotice}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="settings-new-email">New email</Label>
              <Input
                autoComplete="email"
                disabled={isChangingEmail}
                id="settings-new-email"
                onChange={(event) => setNewEmail(event.target.value)}
                required
                type="email"
                value={newEmail}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-email-password">Current password</Label>
              <Input
                autoComplete="current-password"
                disabled={isChangingEmail}
                id="settings-email-password"
                onChange={(event) => setEmailPassword(event.target.value)}
                required
                type="password"
                value={emailPassword}
              />
            </div>

            <Button
              className="text-white"
              disabled={isChangingEmail}
              style={{ background: 'var(--cruush-gradient)' }}
              type="submit"
            >
              {isChangingEmail ? 'Sending...' : 'Send confirmation'}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
