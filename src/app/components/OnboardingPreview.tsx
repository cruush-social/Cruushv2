import { useState } from 'react';
import { useNavigate } from 'react-router';
import { RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import ProfileOnboarding from './ProfileOnboarding';
import AppPageHeader from './AppPageHeader';
import { previewableNotices, resetPreviewableNotices } from '../lib/onboardingPreview';
import { getStoredUserId } from '../lib/sessionUser';

// DEV ONLY: a harness for reviewing onboarding and the one-time explainer
// dialogs without deleting the account they are attached to.
export default function OnboardingPreview() {
  const navigate = useNavigate();
  const previewEnabled = import.meta.env.DEV;
  const [userId] = useState<string | null>(() => getStoredUserId());
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

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
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
        <div className="z-20 flex shrink-0 items-center gap-3 border-b border-border bg-card/90 p-3 backdrop-blur-sm">
          <Button variant="ghost" size="sm" onClick={() => setShowOnboarding(false)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Exit preview
          </Button>
          <p className="text-xs uppercase tracking-[0.16em] text-white/48">Onboarding preview</p>
        </div>
        <div className="min-h-0 flex-1">
          <ProfileOnboarding
            onComplete={() => setShowOnboarding(false)}
            needsCodeOfConduct
            codeOfConductVersion="preview"
            constrainedViewport
            previewMode
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppPageHeader
        title="Onboarding preview"
        onBack={() => navigate(-1)}
        bugButtonTestId="onboarding-preview-bug-button-slot"
      >
        <p className="text-xs text-muted-foreground">Dev-only harness for onboarding and explainer dialogs</p>
      </AppPageHeader>

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
              Steps through the full rite list including the optional invite code, 2FA, affiliate share, and final code of conduct.
              No email or account is needed. Photos, invite codes, 2FA, profile details, and completion stay inside this preview and are not saved.
            </p>
          </div>
          <Button onClick={() => setShowOnboarding(true)} style={{ background: 'var(--cruush-gradient)' }}>
            Start onboarding preview
          </Button>
        </div>

        {userId ? <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
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
        </div> : null}
      </div>
    </div>
  );
}
