import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui/button';

export const MAP_CONTROLS_TUTORIAL_STORAGE_KEY = 'cruush:tutorial-v4-seen';
export const MAP_CONTROLS_TUTORIAL_PROGRESS_KEY = 'cruush:tutorial-v4-progress';
export const MAP_CONTROLS_TUTORIAL_COMPLETED_EVENT = 'cruush:map-controls-tutorial-completed';

export function notifyMapControlsTutorialCompleted() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(MAP_CONTROLS_TUTORIAL_COMPLETED_EVENT));
  }
}

export type MapControlsTutorialStepId = 'install' | 'notifications' | 'seeking' | 'visibility' | 'crowds' | 'ghost' | 'dl-mode' | 'ping' | 'profile-pin' | 'zoom' | 'feed';

type TutorialStep = {
  id: MapControlsTutorialStepId;
  title: string;
  description: string;
  actionLabel?: string;
  optional?: boolean;
};

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'install',
    title: 'Install cruush',
    description: 'Add cruush to your Home Screen for quicker access. You can install now or skip this step and do it later.',
    actionLabel: 'Install cruush',
    optional: true,
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Turn on notifications for messages and other app activity. You can skip this step and enable them later in Settings.',
    actionLabel: 'Turn on notifications',
    optional: true,
  },
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
    id: 'crowds',
    title: 'Crowd Mode',
    description: 'Crowd Mode is part of Visibility. Choose active crowds when you want only people in those crowds to see you.',
    actionLabel: 'Open Crowd Mode',
  },
  {
    id: 'ghost',
    title: 'Ghost Mode',
    description: 'Ghost Mode shifts your public map location to protect your privacy. Open its settings to choose how your presence appears.',
    actionLabel: 'Open Ghost Mode',
  },
  {
    id: 'dl-mode',
    title: 'DL Mode',
    description: 'DL Mode is on by default. It replaces explicit or NSFW photos with gradients; non-explicit photos stay visible. Use the highlighted mask to turn it on or off.',
    actionLabel: 'Toggle DL Mode',
  },
  {
    id: 'ping',
    title: 'Ping',
    description: 'Ping is directly below Visibility. It briefly marks your heart as active on the map and shares your signal as a normal feed post.',
    actionLabel: 'Open Ping',
  },
  {
    id: 'profile-pin',
    title: 'Profile pins',
    description: 'Tap a profile pin briefly to open its profile. Press and hold on touch to make the pin and its details bigger. On desktop, hover a pin to reveal its details.',
  },
  {
    id: 'zoom',
    title: 'Zoom',
    description: 'Use the highlighted controls to zoom the map in or out.',
    actionLabel: 'Zoom in',
  },
  {
    id: 'feed',
    title: 'Feed',
    description: 'With cruush+, use Feed to share a post with people nearby. Start with a short signal, question, or invitation.',
    actionLabel: 'Open Feed',
  },
];

export function getStoredMapControlsTutorialStep(): MapControlsTutorialStepId | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const savedStep = window.localStorage.getItem(MAP_CONTROLS_TUTORIAL_PROGRESS_KEY);
  return TUTORIAL_STEPS.some((step) => step.id === savedStep)
    ? savedStep as MapControlsTutorialStepId
    : null;
}

function readTutorialProgressIndex() {
  const savedStep = getStoredMapControlsTutorialStep();
  const savedIndex = TUTORIAL_STEPS.findIndex((step) => step.id === savedStep);
  return savedIndex >= 0 ? savedIndex : 0;
}

type MapControlsTutorialProps = {
  open: boolean;
  onComplete: () => void;
  onActivateStep: (step: MapControlsTutorialStepId) => void | Promise<void>;
  onStepChange?: (step: MapControlsTutorialStepId) => void;
};

export type TutorialPlacementRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

export type TutorialPlacementInput = {
  viewportWidth: number;
  viewportHeight: number;
  bottomBoundary: number;
  cardWidth: number;
  cardHeight: number;
  targetRect?: TutorialPlacementRect | null;
  edgePadding?: number;
  targetGap?: number;
};

export type TutorialCardPlacement = {
  left: number;
  top: number;
  maxHeight: number;
};

type TutorialMeasurements = {
  viewportWidth: number;
  viewportHeight: number;
  bottomBoundary: number;
  cardWidth: number;
  cardHeight: number;
};

const DEFAULT_VIEWPORT_WIDTH_PX = 375;
const DEFAULT_VIEWPORT_HEIGHT_PX = 812;
const DEFAULT_CARD_WIDTH_PX = 352;
const DEFAULT_CARD_HEIGHT_PX = 280;
const DEFAULT_BOTTOM_NAV_CLEARANCE_PX = 100;
const DEFAULT_EDGE_PADDING_PX = 16;
const DEFAULT_TARGET_GAP_PX = 16;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function placementRect(placement: TutorialCardPlacement, width: number, height: number) {
  return {
    left: placement.left,
    right: placement.left + width,
    top: placement.top,
    bottom: placement.top + height,
  };
}

function overlapArea(
  first: { bottom: number; left: number; right: number; top: number },
  second: { bottom: number; left: number; right: number; top: number },
) {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  return width * height;
}

export function calculateTutorialCardPlacement({
  viewportWidth,
  viewportHeight,
  bottomBoundary,
  cardWidth,
  cardHeight,
  targetRect = null,
  edgePadding = DEFAULT_EDGE_PADDING_PX,
  targetGap = DEFAULT_TARGET_GAP_PX,
}: TutorialPlacementInput): TutorialCardPlacement {
  const safeViewportWidth = Math.max(0, viewportWidth);
  const safeViewportHeight = Math.max(0, viewportHeight);
  const safeBottomBoundary = clamp(bottomBoundary, 0, safeViewportHeight);
  const maxHeight = Math.max(0, safeBottomBoundary - edgePadding * 2);
  const resolvedCardWidth = Math.min(Math.max(0, cardWidth), Math.max(0, safeViewportWidth - edgePadding * 2));
  const resolvedCardHeight = Math.min(Math.max(0, cardHeight), maxHeight);
  const minimumLeft = edgePadding;
  const maximumLeft = Math.max(minimumLeft, safeViewportWidth - edgePadding - resolvedCardWidth);
  const minimumTop = edgePadding;
  const maximumTop = Math.max(minimumTop, safeBottomBoundary - edgePadding - resolvedCardHeight);
  const centeredLeft = clamp((safeViewportWidth - resolvedCardWidth) / 2, minimumLeft, maximumLeft);
  const centeredTop = clamp(
    (safeBottomBoundary - resolvedCardHeight) / 2,
    minimumTop,
    maximumTop,
  );
  const makePlacement = (left: number, top: number): TutorialCardPlacement => ({
    left: clamp(left, minimumLeft, maximumLeft),
    top: clamp(top, minimumTop, maximumTop),
    maxHeight: Math.max(
      0,
      Math.min(
        maxHeight,
        safeBottomBoundary - edgePadding - clamp(top, minimumTop, maximumTop),
      ),
    ),
  });
  const bottomPlacement = makePlacement(centeredLeft, maximumTop);

  if (!targetRect) {
    return bottomPlacement;
  }

  const expandedTarget = {
    left: targetRect.left - targetGap,
    right: targetRect.right + targetGap,
    top: targetRect.top - targetGap,
    bottom: targetRect.bottom + targetGap,
  };
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const candidates = [
    bottomPlacement,
    makePlacement(centeredLeft, minimumTop),
    makePlacement(centeredLeft, targetRect.top - targetGap - resolvedCardHeight),
    makePlacement(centeredLeft, targetRect.bottom + targetGap),
    makePlacement(targetRect.right + targetGap, targetCenterY - resolvedCardHeight / 2),
    makePlacement(targetRect.left - targetGap - resolvedCardWidth, targetCenterY - resolvedCardHeight / 2),
    makePlacement(targetCenterX - resolvedCardWidth / 2, centeredTop),
    makePlacement(minimumLeft, minimumTop),
    makePlacement(maximumLeft, minimumTop),
    makePlacement(minimumLeft, maximumTop),
    makePlacement(maximumLeft, maximumTop),
  ];
  const nonOverlappingPlacement = candidates.find((candidate) => (
    overlapArea(placementRect(candidate, resolvedCardWidth, resolvedCardHeight), expandedTarget) === 0
  ));

  if (nonOverlappingPlacement) {
    return nonOverlappingPlacement;
  }

  const aboveMaxHeight = clamp(targetRect.top - targetGap - minimumTop, 0, maxHeight);
  const belowTop = targetRect.bottom + targetGap;
  const belowMaxHeight = clamp(safeBottomBoundary - edgePadding - belowTop, 0, maxHeight);
  const constrainedVerticalPlacements = [
    {
      availableHeight: aboveMaxHeight,
      placement: {
        left: centeredLeft,
        maxHeight: aboveMaxHeight,
        top: targetRect.top - targetGap - Math.min(resolvedCardHeight, aboveMaxHeight),
      },
    },
    {
      availableHeight: belowMaxHeight,
      placement: {
        left: centeredLeft,
        maxHeight: belowMaxHeight,
        top: belowTop,
      },
    },
  ].sort((first, second) => second.availableHeight - first.availableHeight);
  const constrainedPlacement = constrainedVerticalPlacements.find(({ availableHeight }) => availableHeight > 0);

  if (constrainedPlacement) {
    return constrainedPlacement.placement;
  }

  return candidates.reduce((best, candidate) => {
    const bestOverlap = overlapArea(placementRect(best, resolvedCardWidth, resolvedCardHeight), expandedTarget);
    const candidateOverlap = overlapArea(placementRect(candidate, resolvedCardWidth, resolvedCardHeight), expandedTarget);
    return candidateOverlap < bestOverlap ? candidate : best;
  }, bottomPlacement);
}

function readTargetElements(targetId: MapControlsTutorialStepId): HTMLElement[] {
  if (typeof document === 'undefined') {
    return [];
  }

  const directTargets = Array.from(document.querySelectorAll<HTMLElement>(`[data-tutorial-target="${targetId}"]`));

  if (targetId === 'crowds' && directTargets.length === 0) {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-tutorial-target="visibility"]'));
  }

  if (targetId === 'profile-pin') {
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = readBottomBoundary(window.innerHeight) / 2;
    const profilePin = Array.from(document.querySelectorAll<HTMLElement>('[data-map-marker-pin="true"][data-map-marker-kind="person"]'))
      .map((target) => ({ target, rect: target.getBoundingClientRect() }))
      .filter(({ rect }) => (
        rect.bottom > 0
        && rect.right > 0
        && rect.top < window.innerHeight
        && rect.left < window.innerWidth
      ))
      .sort((first, second) => {
        const firstDistance = Math.hypot(
          first.rect.left + first.rect.width / 2 - viewportCenterX,
          first.rect.top + first.rect.height / 2 - viewportCenterY,
        );
        const secondDistance = Math.hypot(
          second.rect.left + second.rect.width / 2 - viewportCenterX,
          second.rect.top + second.rect.height / 2 - viewportCenterY,
        );
        return firstDistance - secondDistance;
      })
      .map(({ target }) => target)
      .find((target) => {
        const rect = target.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

    return profilePin ? [profilePin] : directTargets;
  }

  return directTargets;
}

function readTargetRects(targetId: MapControlsTutorialStepId): TutorialPlacementRect[] {
  return readTargetElements(targetId)
    .map((target) => target.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    }));
}

function sameTargetRect(first: TutorialPlacementRect, second: TutorialPlacementRect) {
  if (first === second) {
    return true;
  }

  return first.bottom === second.bottom
    && first.height === second.height
    && first.left === second.left
    && first.right === second.right
    && first.top === second.top
    && first.width === second.width;
}

function sameTargetRects(first: TutorialPlacementRect[], second: TutorialPlacementRect[]) {
  return first.length === second.length
    && first.every((rect, index) => sameTargetRect(rect, second[index]));
}

function mergeTargetRects(rects: TutorialPlacementRect[]): TutorialPlacementRect | null {
  if (rects.length === 0) {
    return null;
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
}

function sameMeasurements(first: TutorialMeasurements | null, second: TutorialMeasurements) {
  return first?.viewportWidth === second.viewportWidth
    && first.viewportHeight === second.viewportHeight
    && first.bottomBoundary === second.bottomBoundary
    && first.cardWidth === second.cardWidth
    && first.cardHeight === second.cardHeight;
}

function readBottomBoundary(viewportHeight: number) {
  if (typeof document !== 'undefined') {
    const bottomNavRect = document.querySelector('[data-testid="bottom-nav-pill"]')?.getBoundingClientRect();

    if (bottomNavRect && bottomNavRect.top > 0 && bottomNavRect.top <= viewportHeight) {
      return bottomNavRect.top;
    }
  }

  return Math.max(0, viewportHeight - DEFAULT_BOTTOM_NAV_CLEARANCE_PX);
}

export default function MapControlsTutorial({ open, onComplete, onActivateStep, onStepChange }: MapControlsTutorialProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [stepIndex, setStepIndex] = useState(readTutorialProgressIndex);
  const [targetRects, setTargetRects] = useState<TutorialPlacementRect[]>([]);
  const [measurements, setMeasurements] = useState<TutorialMeasurements | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionCompleted, setActionCompleted] = useState(false);
  const step = TUTORIAL_STEPS[stepIndex];
  const isLastStep = stepIndex === TUTORIAL_STEPS.length - 1;
  const targetBounds = useMemo(() => mergeTargetRects(targetRects), [targetRects]);

  useEffect(() => {
    if (open) {
      window.localStorage.setItem(MAP_CONTROLS_TUTORIAL_PROGRESS_KEY, step.id);
    }
  }, [open, step.id]);

  useEffect(() => {
    setActionPending(false);
    setActionError('');
    setActionCompleted(false);
  }, [step.id]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let animationFrame = 0;
    let measureUntil = 0;
    const measure = () => {
      const viewportWidth = window.innerWidth || DEFAULT_VIEWPORT_WIDTH_PX;
      const viewportHeight = window.innerHeight || DEFAULT_VIEWPORT_HEIGHT_PX;
      const cardElement = cardRef.current;
      const cardRect = cardElement?.getBoundingClientRect();
      const nextRects = readTargetRects(step.id);
      const nextMeasurements: TutorialMeasurements = {
        viewportWidth,
        viewportHeight,
        bottomBoundary: readBottomBoundary(viewportHeight),
        cardWidth: cardRect && cardRect.width > 0
          ? cardRect.width
          : Math.min(DEFAULT_CARD_WIDTH_PX, Math.max(0, viewportWidth - DEFAULT_EDGE_PADDING_PX * 2)),
        cardHeight: cardRect && cardRect.height > 0
          ? Math.max(cardRect.height, cardElement?.scrollHeight ?? 0)
          : DEFAULT_CARD_HEIGHT_PX,
      };

      setTargetRects((currentRects) => sameTargetRects(currentRects, nextRects) ? currentRects : nextRects);
      setMeasurements((currentMeasurements) => (
        sameMeasurements(currentMeasurements, nextMeasurements) ? currentMeasurements : nextMeasurements
      ));
    };
    const measureDuringMotion = () => {
      animationFrame = 0;
      measure();
      if (window.performance.now() < measureUntil) {
        animationFrame = window.requestAnimationFrame(measureDuringMotion);
      }
    };
    const scheduleMeasurementBurst = () => {
      measureUntil = Math.max(measureUntil, window.performance.now() + 700);
      if (animationFrame === 0) {
        animationFrame = window.requestAnimationFrame(measureDuringMotion);
      }
    };

    measure();
    scheduleMeasurementBurst();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(scheduleMeasurementBurst);
    const targets = readTargetElements(step.id);
    const bottomNav = document.querySelector('[data-testid="bottom-nav-pill"]');

    if (cardRef.current) {
      resizeObserver?.observe(cardRef.current);
    }
    targets.forEach((target) => resizeObserver?.observe(target));
    if (bottomNav) {
      resizeObserver?.observe(bottomNav);
    }
    mutationObserver?.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [open, step.id]);

  const cardStyle = useMemo(() => {
    const viewportWidth = measurements?.viewportWidth ?? DEFAULT_VIEWPORT_WIDTH_PX;
    const viewportHeight = measurements?.viewportHeight ?? DEFAULT_VIEWPORT_HEIGHT_PX;
    const placement = calculateTutorialCardPlacement({
      viewportWidth,
      viewportHeight,
      bottomBoundary: measurements?.bottomBoundary
        ?? Math.max(0, viewportHeight - DEFAULT_BOTTOM_NAV_CLEARANCE_PX),
      cardWidth: measurements?.cardWidth
        ?? Math.min(DEFAULT_CARD_WIDTH_PX, Math.max(0, viewportWidth - DEFAULT_EDGE_PADDING_PX * 2)),
      cardHeight: measurements?.cardHeight ?? DEFAULT_CARD_HEIGHT_PX,
      targetRect: targetBounds,
    });

    return {
      left: placement.left,
      maxHeight: placement.maxHeight,
      top: placement.top,
    };
  }, [measurements, targetBounds]);

  const completeTutorial = () => {
    window.localStorage.removeItem(MAP_CONTROLS_TUTORIAL_PROGRESS_KEY);
    onComplete();
  };

  const moveToStep = (nextIndex: number) => {
    const nextStep = TUTORIAL_STEPS[nextIndex];

    if (!nextStep) {
      completeTutorial();
      return;
    }

    window.localStorage.setItem(MAP_CONTROLS_TUTORIAL_PROGRESS_KEY, nextStep.id);
    setStepIndex(nextIndex);
    onStepChange?.(nextStep.id);
  };

  const advanceStep = () => {
    moveToStep(stepIndex + 1);
  };

  const activateCurrentStep = async () => {
    setActionPending(true);
    setActionError('');

    try {
      await onActivateStep(step.id);
      setActionCompleted(true);
      if (step.optional && step.id !== 'install') {
        advanceStep();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'This action could not be completed. You can try again or skip this step.');
    } finally {
      setActionPending(false);
    }
  };

  if (!open) {
    return null;
  }

  return createPortal((
    <div className="pointer-events-none fixed inset-0 z-[100]" data-testid="map-controls-tutorial">
      {targetRects.length > 0 ? (
        <svg
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 h-full w-full"
          data-tutorial-step={step.id}
          data-testid="tutorial-spotlight"
        >
          <defs>
            <mask id="cruush-map-tutorial-spotlight-mask" maskUnits="userSpaceOnUse">
              <rect fill="white" height="100%" width="100%" />
              {targetRects.map((rect, index) => (
                <rect
                  key={`${step.id}-hole-${index}`}
                  fill="black"
                  height={rect.height + 16}
                  rx="12"
                  width={rect.width + 16}
                  x={rect.left - 8}
                  y={rect.top - 8}
                />
              ))}
            </mask>
          </defs>
          <rect
            fill="rgba(0,0,0,0.58)"
            height="100%"
            mask="url(#cruush-map-tutorial-spotlight-mask)"
            width="100%"
          />
          {targetRects.map((rect, index) => (
            <rect
              key={`${step.id}-ring-${index}`}
              className="fill-none stroke-primary"
              data-testid="tutorial-spotlight-ring"
              height={rect.height + 16}
              rx="12"
              strokeWidth="2"
              width={rect.width + 16}
              x={rect.left - 8}
              y={rect.top - 8}
            />
          ))}
        </svg>
      ) : null}

      <section
        ref={cardRef}
        aria-label="Map controls tutorial"
        aria-live="polite"
        className="scrollbar-hide pointer-events-auto fixed w-[min(22rem,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-background/95 p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl"
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
            onClick={completeTutorial}
          >
            Skip tutorial
          </button>
        </div>
        <h2 className="text-xl font-medium">{step.title}</h2>
        <p className="mt-2 text-sm leading-6 text-white/70">{step.description}</p>
        {actionError ? (
          <p className="mt-3 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive" role="alert">
            {actionError}
          </p>
        ) : null}
        <div className={`mt-4 flex flex-wrap items-center gap-2 ${step.actionLabel ? 'justify-between' : 'justify-end'}`}>
          {step.actionLabel ? (
            <Button
              type="button"
              className="rounded-lg border border-white/25 text-white ring-2 ring-primary/60 ring-offset-2 ring-offset-background"
              data-tutorial-action={step.id}
              data-testid="tutorial-try-step"
              disabled={actionPending}
              onClick={() => void activateCurrentStep()}
              style={{ background: 'var(--cruush-gradient)' }}
            >
              {actionPending ? 'Working...' : step.actionLabel}
            </Button>
          ) : null}
          <div className="flex gap-2">
            {stepIndex > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="rounded-lg text-white/70 hover:text-white"
                data-testid="tutorial-back"
                onClick={() => moveToStep(stepIndex - 1)}
              >
                Back
              </Button>
            ) : null}
            {step.optional ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-lg border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.1]"
                data-testid="tutorial-skip-step"
                onClick={advanceStep}
              >
                {step.id === 'install' && actionCompleted ? 'Next' : 'Skip step'}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="rounded-lg border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.1]"
                data-testid="tutorial-next"
                onClick={advanceStep}
              >
                {isLastStep ? 'Done' : 'Next'}
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  ), document.body);
}
