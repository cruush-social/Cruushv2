import { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';

export const MAP_CONTROLS_TUTORIAL_STORAGE_KEY = 'cruush:tutorial-v2-seen';
export const MAP_CONTROLS_TUTORIAL_COMPLETED_EVENT = 'cruush:map-controls-tutorial-completed';

export function notifyMapControlsTutorialCompleted() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(MAP_CONTROLS_TUTORIAL_COMPLETED_EVENT));
  }
}

export type MapControlsTutorialStepId = 'seeking' | 'visibility' | 'dl-mode' | 'zoom';

type TutorialStep = {
  id: MapControlsTutorialStepId;
  title: string;
  description: string;
  actionLabel: string;
};

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'seeking',
    title: 'Seeking',
    description: 'Seeking filters the people you see on the map. Try it when you want to narrow the map by what you are looking for.',
    actionLabel: 'Open Seeking',
  },
  {
    id: 'visibility',
    title: 'Visibility',
    description: 'Visibility controls who can see you. Your choices affect your map presence, and you can change them whenever you want.',
    actionLabel: 'Open Visibility',
  },
  {
    id: 'dl-mode',
    title: 'DL Mode',
    description: 'DL Mode is on by default. It replaces explicit or NSFW photos with gradients; non-explicit photos stay visible. Use the highlighted eye to turn it on or off.',
    actionLabel: 'Toggle DL Mode',
  },
  {
    id: 'zoom',
    title: 'Zoom',
    description: 'Use these controls to zoom in for a closer look or zoom out to see more of the map. The highlighted controls are the real controls.',
    actionLabel: 'Zoom in',
  },
];

type MapControlsTutorialProps = {
  open: boolean;
  onComplete: () => void;
  onActivateStep: (step: MapControlsTutorialStepId) => void;
};

type TargetRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

function readTargetRect(targetId: MapControlsTutorialStepId): TargetRect | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const target = document.querySelector(`[data-tutorial-target="${targetId}"]`);
  const rect = target?.getBoundingClientRect();

  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
}

function sameTargetRect(first: TargetRect | null, second: TargetRect | null) {
  if (first === second) {
    return true;
  }

  if (!first || !second) {
    return false;
  }

  return first.bottom === second.bottom
    && first.height === second.height
    && first.left === second.left
    && first.right === second.right
    && first.top === second.top
    && first.width === second.width;
}

export default function MapControlsTutorial({ open, onComplete, onActivateStep }: MapControlsTutorialProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const step = TUTORIAL_STEPS[stepIndex];
  const isLastStep = stepIndex === TUTORIAL_STEPS.length - 1;

  useEffect(() => {
    if (!open) {
      return;
    }

    const measure = () => {
      const nextRect = readTargetRect(step.id);
      setTargetRect((currentRect) => sameTargetRect(currentRect, nextRect) ? currentRect : nextRect);
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, step.id]);

  const cardStyle = useMemo(() => {
    if (!targetRect || typeof window === 'undefined') {
      return { left: '50%', transform: 'translate(-50%, -50%)', top: '50%' };
    }

    const targetIsAboveCenter = targetRect.top + targetRect.height / 2 < window.innerHeight / 2;
    return targetIsAboveCenter
      ? { left: '50%', transform: 'translateX(-50%)', bottom: 'calc(6.25rem + env(safe-area-inset-bottom))' }
      : { left: '50%', transform: 'translateX(-50%)', top: '1.5rem' };
  }, [targetRect]);

  if (!open) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]" data-testid="map-controls-tutorial">
      {targetRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.58),0_0_26px_rgba(255,0,114,0.7)]"
          data-testid="tutorial-spotlight"
          style={{
            left: targetRect.left - 8,
            top: targetRect.top - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            borderRadius: '0.75rem',
          }}
        />
      ) : null}

      <section
        aria-label="Map controls tutorial"
        aria-live="polite"
        className="pointer-events-auto fixed w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-background/95 p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl"
        data-testid="map-controls-tutorial-card"
        role="dialog"
        style={cardStyle}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/55">
            Map tutorial · Step {stepIndex + 1} of {TUTORIAL_STEPS.length}
          </p>
          <button
            type="button"
            className="text-xs text-white/60 underline-offset-4 hover:text-white hover:underline"
            data-testid="skip-map-controls-tutorial"
            onClick={onComplete}
          >
            Skip
          </button>
        </div>
        <h2 className="text-xl font-medium">{step.title}</h2>
        <p className="mt-2 text-sm leading-6 text-white/70">{step.description}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-lg border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.1]"
            data-testid="tutorial-try-step"
            onClick={() => onActivateStep(step.id)}
          >
            {step.actionLabel}
          </Button>
          <div className="flex gap-2">
            {stepIndex > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="rounded-lg text-white/70 hover:text-white"
                data-testid="tutorial-back"
                onClick={() => setStepIndex((currentIndex) => currentIndex - 1)}
              >
                Back
              </Button>
            ) : null}
            <Button
              type="button"
              className="rounded-lg text-white"
              data-testid="tutorial-next"
              onClick={() => {
                if (isLastStep) {
                  onComplete();
                  return;
                }
                setStepIndex((currentIndex) => currentIndex + 1);
              }}
              style={{ background: 'var(--cruush-gradient)' }}
            >
              {isLastStep ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
