import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { Bug, Crown, Eye, MapPin, SlidersHorizontal } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import CruushPlusWord from './CruushPlusWord';
import { CRUUSH_PLUS_CHANGED_EVENT } from '../lib/billingApi';
import { markDlModeDefaultNoticeSeen, setDlModeEnabled } from '../lib/dlMode';
import { claimBetaLaunchCruushPlus } from '../lib/rewardsApi';
import { markNoticeDismissed, resolveNoticeDismissal } from '../lib/userNoticesApi';

export const FIRST_RUN_TUTORIAL_KEY = 'cruush:first-run-tutorial-seen';

type TutorialStep = {
  id: string;
  icon: typeof Eye;
  title: ReactNode;
  body: ReactNode;
  // Runs the first time the step is shown. Used by the DL Mode step, which turns the
  // setting on as it explains it.
  onEnter?: () => void;
  // A selector for the control this step is about. The step lifts it out of the dimmed
  // backdrop and rings it, so "tap the bug icon" points at the actual bug icon instead of
  // describing where it is.
  spotlight?: string;
};

// Cuts a hole in the tutorial backdrop over the highlighted control and draws a ring
// around it. Re-measured on resize so it stays put when the keyboard or an orientation
// change moves the nav.
function Spotlight({ selector }: { selector: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const measure = () => {
      const target = document.querySelector(selector);
      setRect(target ? target.getBoundingClientRect() : null);
    };

    measure();
    const timer = window.setTimeout(measure, 120);
    window.addEventListener('resize', measure);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
  }, [selector]);

  if (!rect || rect.width === 0) {
    return null;
  }

  const padding = 8;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-[60] rounded-full border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.5),0_0_28px_rgba(255,0,114,0.65)]"
      data-testid="tutorial-spotlight"
      style={{
        left: rect.left - padding,
        top: rect.top - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      }}
    />
  );
}

const STEPS: TutorialStep[] = [
  {
    id: 'dl-mode',
    icon: Eye,
    title: 'DL Mode is on',
    body: 'NSFW photos stay behind gradients until you tap them. Turn it off with the eye in the top map menu whenever you want.',
    onEnter: () => {
      setDlModeEnabled(true);
      markDlModeDefaultNoticeSeen();
    },
  },
  {
    id: 'map-controls',
    icon: SlidersHorizontal,
    title: 'The map is the app',
    body: 'Pins are people nearby. Use the top menu to filter who you see, hide yourself, or zoom to your area.',
  },
  {
    id: 'feed',
    icon: MapPin,
    title: 'Say something to the block',
    body: 'A local post tells nearby people you are around and what you are up for. Posts expire on their own, so keep it short.',
  },
  {
    id: 'bug',
    icon: Bug,
    title: 'Something broken?',
    body: 'Tap the bug icon down there - it is ringed for you. It sends the page you are on and a screenshot when your browser allows it.',
    spotlight: '[data-testid="alpha-bug-button"]',
  },
];

type FirstRunTutorialProps = {
  // Rendered by the preview harness with this forced on, so the tutorial can be replayed
  // without an account.
  forceOpen?: boolean;
};

export default function FirstRunTutorial({ forceOpen = false }: FirstRunTutorialProps) {
  const location = useLocation();
  // Runs the first time a finished account lands on the map, not on whatever route the
  // app happened to restore.
  const onMap = forceOpen || location.pathname === '/' || location.pathname.startsWith('/map');
  const [open, setOpen] = useState(forceOpen);
  const [stepIndex, setStepIndex] = useState(0);
  const [noticeOffline, setNoticeOffline] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [enteredSteps, setEnteredSteps] = useState<string[]>([]);

  useEffect(() => {
    if (forceOpen || !onMap || typeof window === 'undefined') {
      return;
    }

    let isMounted = true;

    void resolveNoticeDismissal(FIRST_RUN_TUTORIAL_KEY).then((notice) => {
      if (!isMounted) {
        return;
      }

      setNoticeOffline(notice.offline);
      setOpen(!notice.dismissed);
    });

    return () => {
      isMounted = false;
    };
  }, [forceOpen, onMap]);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length;

  useEffect(() => {
    if (!open || !step || enteredSteps.includes(step.id)) {
      return;
    }

    setEnteredSteps((seen) => [...seen, step.id]);
    step.onEnter?.();
  }, [open, step, enteredSteps]);

  const finish = () => {
    setOpen(false);

    if (!forceOpen) {
      markNoticeDismissed(FIRST_RUN_TUTORIAL_KEY, { offline: noticeOffline });
    }
  };

  const claim = async () => {
    setClaiming(true);
    setClaimError('');

    try {
      const result = await claimBetaLaunchCruushPlus();
      window.dispatchEvent(new CustomEvent(CRUUSH_PLUS_CHANGED_EVENT, { detail: result }));
      setClaimed(true);
    } catch (error) {
      setClaimError(error instanceof Error ? error.message : 'Unable to activate cruush+.');
    } finally {
      setClaiming(false);
    }
  };

  if (!open) {
    return null;
  }

  const StepIcon = step?.icon ?? Crown;

  return (
    <Dialog open onOpenChange={() => {}}>
      {step?.spotlight ? <Spotlight selector={step.spotlight} /> : null}
      <DialogContent
        className={`max-w-sm rounded-lg border-white/10 bg-background ${
          step?.spotlight ? 'top-[38%]' : ''
        }`}
        data-testid="first-run-tutorial"
        dismissible={false}
      >
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.045]">
            <StepIcon className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>
            {isLastStep ? (
              claimed ? (
                <><CruushPlusWord className="inline" /> is on</>
              ) : (
                <>Your free week of <CruushPlusWord className="inline" /></>
              )
            ) : (
              step.title
            )}
          </DialogTitle>
          <DialogDescription>
            {isLastStep ? (
              claimed
                ? 'Seven days, on the house. That is everything - go find someone.'
                : 'Everyone gets one free seven-day trial on their first login. Take it now or skip and grab it later from Rewards.'
            ) : (
              step.body
            )}
          </DialogDescription>
        </DialogHeader>

        {claimError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {claimError}
          </div>
        ) : null}

        <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
          {[...STEPS, { id: 'plus' }].map((dot, index) => (
            <span
              key={dot.id}
              className={`h-1.5 rounded-full transition-all ${
                index === stepIndex ? 'w-5 bg-primary' : 'w-1.5 bg-white/25'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={finish} data-testid="skip-tutorial">
            {isLastStep && !claimed ? 'No thanks' : 'Skip'}
          </Button>

          {isLastStep ? (
            claimed ? (
              <Button onClick={finish} style={{ background: 'var(--cruush-gradient)' }}>
                Done
              </Button>
            ) : (
              <Button
                disabled={claiming}
                onClick={() => void claim()}
                style={{ background: 'var(--cruush-gradient)' }}
              >
                {claiming ? 'Activating...' : 'Activate'}
              </Button>
            )
          ) : (
            <Button
              onClick={() => setStepIndex((index) => index + 1)}
              style={{ background: 'var(--cruush-gradient)' }}
              data-testid="tutorial-next"
            >
              Next
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
