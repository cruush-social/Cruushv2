import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import ProfileOnboarding from './ProfileOnboarding';
import { previewableNotices, resetPreviewableNotices } from '../lib/onboardingPreview';
import { getCurrentUserId } from '../lib/sessionUser';

// DEV ONLY: a harness for reviewing onboarding and the one-time explainer
// dialogs without deleting the account they are attached to.
export default function OnboardingPreview() {
  const navigate = useNavigate();
  const previewEnabled = import.meta.env.DEV;
  const [userId, setUserId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!previewEnabled) {
      return undefined;
    }

    let active = true;

    void getCurrentUserId()
      .then((id) => {
        if (active) {
          setUserId(id ?? '');
        }
      })
      .catch(() => {
        if (active) {
          setUserId('');
        }
      });

    return () => {
      active = false;
    };
  }, [previewEnabled]);

  if (!previewEnabled) {
    return null;
  }

  const notices = previewableNotices(userId ?? '');

  const handleReset = async (noticeKeys: string[], label: string) => {
    setResetting(true);
    setStatus(null);

    try {
      await resetPreviewableNotices(noticeKeys);
      setStatus(`${label} reset. Reload the app to see it again.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Reset failed.');
    } finally {
      setResetting(false);
    }
  };

  if (showOnboarding) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card/90 p-3 backdrop-blur-sm">
          <Button variant="ghost" size="sm" onClick={() => setShowOnboarding(false)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Exit preview
          </Button>
          <p className="text-xs uppercase tracking-[0.16em] text-white/48">Onboarding preview</p>
        </div>
        <ProfileOnboarding
          onComplete={() => setShowOnboarding(false)}
          needsCodeOfConduct
          codeOfConductVersion="preview"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl">Onboarding preview</h2>
          <p className="text-xs text-muted-foreground">Dev-only harness for onboarding and explainer dialogs</p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 p-6">
        {status ? (
          <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary" role="status">
            {status}
          </div>
        ) : null}

        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <p>Run onboarding</p>
            <p className="text-sm text-muted-foreground">
              Steps through the full rite list including the code of conduct, Signal broadcast, 2FA, and affiliate share.
              Finishing returns you here instead of writing a new session.
            </p>
          </div>
          <Button onClick={() => setShowOnboarding(true)} style={{ background: 'var(--cruush-gradient)' }}>
            Start onboarding preview
          </Button>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p>Explainer dialogs</p>
              <p className="text-sm text-muted-foreground">Reset a dialog, then reload the app to see it fire again.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={resetting}
              onClick={() => void handleReset(notices.map((notice) => notice.key), 'All dialogs')}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset all
            </Button>
          </div>

          <div className="space-y-2">
            {notices.map((notice) => (
              <div
                key={notice.key}
                className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.025] p-3"
              >
                <div className="min-w-0">
                  <p className="truncate">{notice.label}</p>
                  <p className="text-sm text-muted-foreground">{notice.description}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={resetting}
                  onClick={() => void handleReset([notice.key], notice.label)}
                >
                  Reset
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
