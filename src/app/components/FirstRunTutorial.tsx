import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Bug, Eye, Ghost, Gift, MapPin, Search, Users } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import CruushPlusWord from './CruushPlusWord';
import { FEED_POST_CREATED_EVENT } from './LocalFeed';
import { markNoticeDismissed, resolveNoticeDismissal } from '../lib/userNoticesApi';

export const FIRST_RUN_TUTORIAL_KEY = 'cruush:first-run-tutorial-seen';

type TutorialStep = {
  id: string;
  icon: typeof Eye;
  title: ReactNode;
  body: ReactNode;
  // Where the step is about. The tutorial takes the user there before explaining it,
  // rather than describing a screen they are not looking at.
  route?: string;
  // The control the step is about. Lifted out of the dimmed backdrop and ringed.
  spotlight?: string;
  // Where the card sits, so it never covers the thing it is pointing at.
  place?: 'top' | 'bottom';
  // The step is not finished until the user does something real.
  requires?: 'feed-post';
};

const STEPS: TutorialStep[] = [
  {
    id: 'rewards',
    icon: Gift,
    route: '/rewards',
    place: 'bottom',
    spotlight: '[aria-label="Referral link"]',
    title: <>Your link earns you <CruushPlusWord className="inline" /></>,
    body: 'You shared this link at the end of signup. Every person who joins on it and sticks around earns you free cruush+ days, and you collect more just for logging in. Nothing to activate - it is already running.',
  },
  {
    id: 'visibility',
    icon: Users,
    route: '/map',
    spotlight: '[data-testid="map-visibility-button"]',
    place: 'bottom',
    title: 'Who can see you',
      body: 'You picked your crowds at signup. Tap VISIBILITY to choose which of them can actually see your pin, and to set distance or age limits. Change it whenever you want.',
  },
  {
    id: 'seeking',
    icon: Search,
    route: '/map',
    spotlight: '[data-testid="map-seeking-button"]',
    place: 'bottom',
    title: 'Who you see',
    body: 'SEEKING is the other direction: tap it to filter the pins on your map down to what you are actually after. It changes your map, not your profile.',
  },
  {
    id: 'ghost',
    icon: Ghost,
    route: '/map',
    spotlight: '[aria-label="Ghost Mode Settings"]',
    place: 'bottom',
    title: 'Ghost Mode',
    body: 'Ghost Mode takes you off the map without logging out. You keep browsing and messaging; nobody sees where you are. Set a radius so your pin is fuzzy rather than exact.',
  },
  {
    id: 'dl-mode',
    icon: Eye,
    route: '/map',
    spotlight: '[data-testid="map-dl-mode-toggle"]',
    place: 'bottom',
    title: 'DL Mode',
    body: 'This eye is DL Mode, and it starts on. NSFW photos stay behind gradients until you tap them. Tap the eye any time to turn it off.',
  },
  {
    id: 'feed',
    icon: MapPin,
    route: '/feed',
    spotlight: '[data-testid="local-feed-composer"]',
    place: 'top',
    requires: 'feed-post',
    title: 'Say something to the block',
    body: 'Write your first post now - it tells nearby people you are around and what you are up for. Pick how long it lasts and hit Post. It expires on its own, so keep it short.',
  },
  {
    id: 'bug',
    icon: Bug,
    route: '/map',
    spotlight: '[data-testid="alpha-bug-button"]',
    place: 'top',
    title: 'Something broken?',
    body: 'Tap the bug icon down there - it is ringed for you. It sends the page you are on and a screenshot when your browser allows it.',
  },
];

// Rings the control a step is about and dims everything else. Re-measured on a short
// delay because sheets slide in over ~500ms and are portaled outside the map shell.
function Spotlight({ selector }: { selector: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    let frame = 0;
    const deadline = Date.now() + 2500;

    const measure = () => {
      const target = document.querySelector(selector);
      const next = target ? target.getBoundingClientRect() : null;
      setRect(next && next.width > 0 ? next : null);

      if ((!next || next.width === 0) && Date.now() < deadline) {
        frame = window.setTimeout(measure, 120);
      }
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      window.clearTimeout(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [selector]);

  if (!rect) {
    return null;
  }

  const padding = 8;
  const radius = rect.width > 96 || rect.height > 96 ? 16 : 9999;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-[60] border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.55),0_0_28px_rgba(255,0,114,0.65)]"
      data-testid="tutorial-spotlight"
      style={{
        left: rect.left - padding,
        top: rect.top - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
        borderRadius: radius,
      }}
    />
  );
}

type FirstRunTutorialProps = {
  // The preview harness forces it open so the run can be replayed without an account.
  forceOpen?: boolean;
};

export default function FirstRunTutorial({ forceOpen = false }: FirstRunTutorialProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(forceOpen);
  const [stepIndex, setStepIndex] = useState(0);
  const [noticeOffline, setNoticeOffline] = useState(false);
  const [postedToFeed, setPostedToFeed] = useState(false);

  const step = STEPS[stepIndex];
  const onMap = forceOpen || location.pathname === '/' || location.pathname.startsWith('/map');

  useEffect(() => {
    if (forceOpen || !onMap || typeof window === 'undefined') {
      return;
    }

    let isMounted = true;

    void resolveNoticeDismissal(FIRST_RUN_TUTORIAL_KEY).then((notice) => {
      if (isMounted) {
        setNoticeOffline(notice.offline);
        setOpen(!notice.dismissed);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [forceOpen, onMap]);

  // Take the user to the step's screen, then open whatever panel it lives in.
  // Take the user to the screen the step is about, rather than describing one they are
  // not looking at.
  useEffect(() => {
    if (open && step?.route && location.pathname !== step.route) {
      navigate(step.route);
    }
  }, [open, step, location.pathname, navigate]);

  useEffect(() => {
    if (step?.requires !== 'feed-post' || typeof window === 'undefined') {
      return;
    }

    const onPosted = () => setPostedToFeed(true);
    window.addEventListener(FEED_POST_CREATED_EVENT, onPosted);

    return () => window.removeEventListener(FEED_POST_CREATED_EVENT, onPosted);
  }, [step]);

  const finish = useCallback(() => {
    setOpen(false);

    if (!forceOpen) {
      markNoticeDismissed(FIRST_RUN_TUTORIAL_KEY, { offline: noticeOffline });
    }
  }, [forceOpen, noticeOffline]);

  if (!open || !step) {
    return null;
  }

  const StepIcon = step.icon;
  const isLastStep = stepIndex === STEPS.length - 1;
  const waitingForPost = step.requires === 'feed-post' && !postedToFeed;

  return (
    <>
      {step.spotlight ? <Spotlight selector={step.spotlight} /> : null}
      <Dialog open onOpenChange={() => {}}>
        <DialogContent
          className={`max-w-sm rounded-lg border-white/10 bg-background ${
            step.place === 'top' ? 'top-[26%]' : step.place === 'bottom' ? 'bottom-6 top-auto translate-y-0' : ''
          }`}
          data-testid="first-run-tutorial"
          dismissible={false}
        >
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.045]">
              <StepIcon className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>{step.title}</DialogTitle>
            <DialogDescription>{step.body}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
            {STEPS.map((dot, index) => (
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
              Skip
            </Button>

            {isLastStep ? (
              <Button onClick={finish} style={{ background: 'var(--cruush-gradient)' }} data-testid="tutorial-done">
                Done
              </Button>
            ) : (
              <Button
                disabled={waitingForPost}
                onClick={() => setStepIndex((index) => index + 1)}
                style={{ background: 'var(--cruush-gradient)' }}
                data-testid="tutorial-next"
              >
                {waitingForPost ? 'Post to continue' : 'Next'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
