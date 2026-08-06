import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import ProfileOnboarding from './ProfileOnboarding';
import { FIRST_RUN_TUTORIAL_KEY } from './FirstRunTutorial';
import { resetPreviewableNotices } from '../lib/onboardingPreview';

// Replays the first run against the real app. Deliberately renders no screens of its own:
// it clears the seen-flag and sends you to the map, so what you review is the actual map,
// feed and rewards pages with the tutorial over them. A mock-up here would only ever show
// what someone imagined the app looked like.
export default function OnboardingPreview() {
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);

  const replayTutorial = async () => {
    setResetting(true);
    setError('');

    try {
      await resetPreviewableNotices([FIRST_RUN_TUTORIAL_KEY]);
      navigate('/map');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Could not reset the tutorial.');
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
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl">Replay the first run</h2>
          <p className="text-xs text-muted-foreground">Runs against the real app, not a mock-up</p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 p-6">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </div>
        ) : null}

        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <p>First-run tutorial</p>
            <p className="text-sm text-muted-foreground">
              Marks the tutorial unseen and drops you on the map, where it starts by itself. Every
              step is the real screen it is about.
            </p>
          </div>
          <Button
            disabled={resetting}
            onClick={() => void replayTutorial()}
            style={{ background: 'var(--cruush-gradient)' }}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {resetting ? 'Starting...' : 'Replay tutorial'}
          </Button>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <p>Profile onboarding</p>
            <p className="text-sm text-muted-foreground">
              The full rite list including the code of conduct, Signal broadcast, 2FA and affiliate
              share. Finishing returns you here instead of writing a session.
            </p>
          </div>
          <Button variant="outline" onClick={() => setShowOnboarding(true)}>
            Start onboarding
          </Button>
        </div>
      </div>
    </div>
  );
}
