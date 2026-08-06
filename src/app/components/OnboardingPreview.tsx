import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Download, MapPin } from 'lucide-react';
import { Button } from './ui/button';
import ProfileOnboarding from './ProfileOnboarding';
import { FIRST_RUN_TUTORIAL_KEY } from './FirstRunTutorial';
import { clearPersistentNoticeFlag } from '../lib/persistentNotice';

const AlphaBugButton = lazy(() => import('./AlphaBugButton'));
const BottomNav = lazy(() => import('./BottomNav'));
const FirstRunTutorial = lazy(() => import('./FirstRunTutorial'));
const MobileInstallPrompt = lazy(() => import('./MobileInstallPrompt'));

type PopupId = 'tutorial' | 'install';

type PreviewPopup = {
  id: PopupId;
  label: string;
  description: string;
  icon: typeof MapPin;
  // Device flags to clear so the popup fires again on every replay. There is no session
  // here, so the notices API lookup fails and each popup treats itself as never seen.
  keys: string[];
};

const POPUPS: PreviewPopup[] = [
  {
    id: 'tutorial',
    label: 'First-run tutorial',
    description: 'The steps a new account sees the first time it reaches the map.',
    icon: MapPin,
    keys: [FIRST_RUN_TUTORIAL_KEY],
  },
  {
    id: 'install',
    label: 'Install cruush',
    description: 'Offers Add to Home Screen. Normally mobile only.',
    icon: Download,
    keys: [],
  },
];

// A stand-in page so each popup can be judged against real content: does it dim the
// screen, does it hold focus, is anything still reachable behind it.
function FakeAppScreen() {
  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border px-4 py-3">
        <h1 className="text-xl">Local Feed</h1>
      </header>
      <div className="space-y-3 p-4">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="rounded-xl border border-border p-4">
            <p className="text-sm">Someone nearby posted something.</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline">Reply</Button>
              <Button size="sm" variant="outline">Delete</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OnboardingPreview() {
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activePopup, setActivePopup] = useState<PopupId | null>(null);
  const [replayNonce, setReplayNonce] = useState(0);

  // The install prompt only shows itself on a phone or when the app asks for it.
  useEffect(() => {
    if (activePopup !== 'install' || typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem('cruush-install-prompt-dismissed');
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('cruush:install-requested'));
    }, 60);

    return () => window.clearTimeout(timer);
  }, [activePopup, replayNonce]);

  const play = (popup: PreviewPopup) => {
    popup.keys.forEach(clearPersistentNoticeFlag);
    setActivePopup(null);
    setReplayNonce((nonce) => nonce + 1);
    window.setTimeout(() => setActivePopup(popup.id), 0);
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

  if (activePopup) {
    return (
      <div className="relative">
        <FakeAppScreen />
        <div className="fixed left-3 top-3 z-[60]">
          <Button size="sm" variant="outline" onClick={() => setActivePopup(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to list
          </Button>
        </div>
        <Suspense fallback={null}>
          <BottomNav />
          <AlphaBugButton enabled />
          {activePopup === 'tutorial' ? <FirstRunTutorial forceOpen key={replayNonce} /> : null}
          {activePopup === 'install' ? <MobileInstallPrompt key={replayNonce} /> : null}
        </Suspense>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl">Onboarding preview</h2>
          <p className="text-xs text-muted-foreground">
            Every first-run popup, playable without signing in
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <p>Run onboarding</p>
            <p className="text-sm text-muted-foreground">
              The full rite list including the code of conduct, Signal broadcast, 2FA and affiliate
              share. Finishing returns you here instead of writing a session.
            </p>
          </div>
          <Button onClick={() => setShowOnboarding(true)} style={{ background: 'var(--cruush-gradient)' }}>
            Start onboarding preview
          </Button>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <p>Popups</p>
            <p className="text-sm text-muted-foreground">
              Each one plays over a stand-in feed so you can see it dim the screen and hold it until
              you answer. Replay as many times as you like.
            </p>
          </div>

          <div className="space-y-2">
            {POPUPS.map((popup) => (
              <div
                key={popup.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.025] p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <popup.icon className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate">{popup.label}</p>
                    <p className="text-sm text-muted-foreground">{popup.description}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => play(popup)}>
                  Play
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
