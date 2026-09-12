import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapControlsTutorial, {
  calculateTutorialCardPlacement,
  type MapControlsTutorialStepId,
  type TutorialPlacementRect,
} from './MapControlsTutorial';

const TARGET_STEP_IDS: MapControlsTutorialStepId[] = [
  'notifications',
  'map-controls',
  'seeking',
  'visibility',
  'cruush-plus',
  'mile-high-club',
  'places',
  'crowds',
  'ghost',
  'dl-mode',
  'ping',
  'profile-pin',
  'zoom',
  'carousel',
  'profile-edit',
  'feed',
];

function makeRect({ bottom, left, right, top }: Pick<TutorialPlacementRect, 'bottom' | 'left' | 'right' | 'top'>) {
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
}

function rectsOverlap(
  first: { bottom: number; left: number; right: number; top: number },
  second: { bottom: number; left: number; right: number; top: number },
) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

function appendTutorialTarget(id: MapControlsTutorialStepId, rect: TutorialPlacementRect) {
  const target = document.createElement('button');
  target.dataset.tutorialTarget = id;
  target.getBoundingClientRect = () => ({
    ...rect,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  } as DOMRect);
  document.body.appendChild(target);
}

function expectHighlightedAction(id: MapControlsTutorialStepId, name: string) {
  const action = screen.getByRole('button', { name });

  expect(action).toHaveAttribute('data-tutorial-action', id);
  expect(action.style.background).toBe('var(--cruush-gradient)');
  expect(action.className).not.toContain('shadow-[0_0_20px');
  return action;
}

describe('calculateTutorialCardPlacement', () => {
  it('steps aside while another dialog is open and returns when it closes', async () => {
    // Sheets and dialogs live in different stacking contexts, so the card
    // cannot sit under all of them by z-index. It hides while one is open.
    render(<MapControlsTutorial open onActivateStep={() => undefined} onComplete={() => undefined} />);
    const overlay = await screen.findByTestId('map-controls-tutorial');
    expect(overlay).not.toHaveAttribute('hidden');

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    await waitFor(() => expect(overlay).toHaveAttribute('hidden'));

    dialog.remove();
    await waitFor(() => expect(overlay).not.toHaveAttribute('hidden'));
  });

  it('keeps the card inside the viewport and above the bottom navigation boundary', () => {
    const placement = calculateTutorialCardPlacement({
      viewportWidth: 375,
      viewportHeight: 812,
      bottomBoundary: 700,
      cardWidth: 343,
      cardHeight: 240,
    });

    expect(placement).toMatchObject({ left: 16, top: 444 });
    expect(placement.left).toBeGreaterThanOrEqual(16);
    expect(placement.left + 343).toBeLessThanOrEqual(375 - 16);
    expect(placement.top).toBeGreaterThanOrEqual(16);
    expect(placement.top + 240).toBeLessThanOrEqual(700 - 16);
  });

  it('caps a growing card at the navigation boundary before its next measurement', () => {
    const placement = calculateTutorialCardPlacement({
      viewportWidth: 375,
      viewportHeight: 812,
      bottomBoundary: 700,
      cardWidth: 343,
      cardHeight: 240,
    });

    expect(placement.top).toBe(444);
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(700 - 16);
    expect(Math.min(280, placement.maxHeight)).toBe(240);
  });

  it('moves above a highlighted target that would overlap the bottom placement', () => {
    const targetRect = makeRect({ bottom: 510, left: 110, right: 265, top: 450 });
    const placement = calculateTutorialCardPlacement({
      viewportWidth: 375,
      viewportHeight: 812,
      bottomBoundary: 700,
      cardWidth: 343,
      cardHeight: 240,
      targetRect,
    });
    const cardRect = makeRect({
      bottom: placement.top + 240,
      left: placement.left,
      right: placement.left + 343,
      top: placement.top,
    });
    const highlightedTarget = makeRect({
      bottom: targetRect.bottom + 8,
      left: targetRect.left - 8,
      right: targetRect.right + 8,
      top: targetRect.top - 8,
    });

    expect(placement.top).toBe(16);
    expect(rectsOverlap(cardRect, highlightedTarget)).toBe(false);
    expect(cardRect.bottom).toBeLessThanOrEqual(700 - 16);
  });

  it('moves beside a tall highlighted target when neither vertical side fits', () => {
    const targetRect = makeRect({ bottom: 720, left: 400, right: 880, top: 0 });
    const placement = calculateTutorialCardPlacement({
      viewportWidth: 1280,
      viewportHeight: 800,
      bottomBoundary: 720,
      cardWidth: 352,
      cardHeight: 300,
      targetRect,
    });
    const cardRect = makeRect({
      bottom: placement.top + 300,
      left: placement.left,
      right: placement.left + 352,
      top: placement.top,
    });
    const highlightedTarget = makeRect({
      bottom: targetRect.bottom + 8,
      left: targetRect.left - 8,
      right: targetRect.right + 8,
      top: targetRect.top - 8,
    });

    expect(placement.left).toBeGreaterThanOrEqual(targetRect.right + 16);
    expect(rectsOverlap(cardRect, highlightedTarget)).toBe(false);
    expect(cardRect.right).toBeLessThanOrEqual(1280 - 16);
    expect(cardRect.bottom).toBeLessThanOrEqual(720 - 16);
  });

  it('constrains card height when a mobile target leaves no full-height placement', () => {
    const targetRect = makeRect({ bottom: 520, left: 0, right: 375, top: 180 });
    const placement = calculateTutorialCardPlacement({
      viewportWidth: 375,
      viewportHeight: 812,
      bottomBoundary: 700,
      cardWidth: 343,
      cardHeight: 280,
      targetRect,
    });
    const renderedCardHeight = Math.min(280, placement.maxHeight);
    const cardRect = makeRect({
      bottom: placement.top + renderedCardHeight,
      left: placement.left,
      right: placement.left + 343,
      top: placement.top,
    });
    const highlightedTarget = makeRect({
      bottom: targetRect.bottom + 8,
      left: targetRect.left - 8,
      right: targetRect.right + 8,
      top: targetRect.top - 8,
    });

    expect(placement).toMatchObject({ maxHeight: 148, top: 16 });
    expect(rectsOverlap(cardRect, highlightedTarget)).toBe(false);
    expect(cardRect.bottom).toBeLessThanOrEqual(700 - 16);
  });
});

describe('MapControlsTutorial', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = '';
    TARGET_STEP_IDS.forEach((id, index) => {
      appendTutorialTarget(id, makeRect({
        bottom: 70 + index * 40,
        left: 260,
        right: 350,
        top: 38 + index * 40,
      }));
    });
  });

  it('highlights every action and advances through install, notifications, and map controls', async () => {
    const onComplete = vi.fn();
    const onActivateStep = vi.fn();

    render(<MapControlsTutorial open onActivateStep={onActivateStep} onComplete={onComplete} />);

    expect(screen.getByLabelText('Tutorial progress')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Install cruush' })).toBeInTheDocument();
    fireEvent.click(expectHighlightedAction('install', 'Install cruush'));
    expect(onActivateStep).toHaveBeenLastCalledWith('install');
    expect(await screen.findByRole('heading', { name: 'Install cruush' })).toBeInTheDocument();
    expect(screen.getByTestId('tutorial-skip-step')).toHaveTextContent('Next');
    fireEvent.click(screen.getByTestId('tutorial-skip-step'));

    expect(await screen.findByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByTestId('tutorial-spotlight')).toHaveAttribute('data-tutorial-step', 'notifications');
    fireEvent.click(expectHighlightedAction('notifications', 'Turn on notifications'));
    expect(onActivateStep).toHaveBeenLastCalledWith('notifications');

    expect(await screen.findByRole('heading', { name: 'Map Controls' })).toBeInTheDocument();
    fireEvent.click(expectHighlightedAction('map-controls', 'Open Map Controls'));
    expect(onActivateStep).toHaveBeenLastCalledWith('map-controls');
    fireEvent.click(screen.getByTestId('tutorial-next'));

    expect(await screen.findByRole('heading', { name: 'Seeking' })).toBeInTheDocument();
    expect(screen.getByTestId('tutorial-spotlight')).toHaveAttribute('data-tutorial-step', 'seeking');
    expect(screen.getByTestId('tutorial-spotlight').className).not.toContain('rgba(255,0,114');
    fireEvent.click(expectHighlightedAction('seeking', 'Open Seeking'));
    expect(onActivateStep).toHaveBeenLastCalledWith('seeking');
    expect(screen.getByRole('heading', { name: 'Seeking' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Visibility' })).toBeInTheDocument();
    expectHighlightedAction('visibility', 'Open Visibility');

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'cruush+' })).toBeInTheDocument();
    expectHighlightedAction('cruush-plus', 'Open cruush+');

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Mile High Club' })).toBeInTheDocument();
    expectHighlightedAction('mile-high-club', 'Open Mile High Club');

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Spots' })).toBeInTheDocument();
    expectHighlightedAction('places', 'Open Spots');

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Crowd Mode' })).toBeInTheDocument();
    expectHighlightedAction('crowds', 'Open Crowd Mode');

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Ghost Mode' })).toBeInTheDocument();
    expectHighlightedAction('ghost', 'Open Ghost Mode');

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'DL Mode' })).toBeInTheDocument();
    expectHighlightedAction('dl-mode', 'Toggle DL Mode');

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Pulse' })).toBeInTheDocument();
    expect(screen.getByText(/Pulse makes your heart beat for 30 minutes/i)).toBeInTheDocument();
    fireEvent.click(expectHighlightedAction('ping', 'Open Pulse'));
    expect(onActivateStep).toHaveBeenLastCalledWith('ping');
    expect(screen.getByTestId('tutorial-spotlight')).toHaveAttribute('data-tutorial-step', 'ping');

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Profile pins' })).toBeInTheDocument();
    expect(screen.getByText(/tap a profile pin briefly to open its profile/i)).toBeInTheDocument();
    expect(screen.getByTestId('tutorial-spotlight')).toHaveAttribute('data-tutorial-step', 'profile-pin');
    expect(screen.queryByTestId('tutorial-try-step')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Zoom' })).toBeInTheDocument();
    expect(screen.getByText('Use the highlighted controls to zoom the map in or out.')).toBeInTheDocument();
    expectHighlightedAction('zoom', 'Zoom in');
    fireEvent.click(screen.getByTestId('tutorial-next'));

    expect(screen.getByRole('heading', { name: 'Cruise Carousel' })).toBeInTheDocument();
    expect(screen.getByText(/spin the Cruise Carousel to discover someone nearby/i)).toBeInTheDocument();
    fireEvent.click(expectHighlightedAction('carousel', 'Open Cruise Carousel'));
    expect(onActivateStep).toHaveBeenLastCalledWith('carousel');
    fireEvent.click(screen.getByTestId('tutorial-next'));

    expect(screen.getByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
    expectHighlightedAction('profile-edit', 'Open Edit Profile');
    fireEvent.click(screen.getByTestId('tutorial-next'));

    expect(screen.getByRole('heading', { name: 'Feed' })).toBeInTheDocument();
    expect(screen.getByText(/search the Feed by tag/i)).toBeInTheDocument();
    expectHighlightedAction('feed', 'Open Feed');
    fireEvent.click(screen.getByTestId('tutorial-next'));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed notification action visible so it can be retried or skipped', async () => {
    const onActivateStep = vi.fn((step: MapControlsTutorialStepId) => {
      if (step === 'notifications') {
        return Promise.reject(new Error('Notifications are blocked for cruush in this browser.'));
      }
      return undefined;
    });

    render(<MapControlsTutorial open onActivateStep={onActivateStep} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tutorial-skip-step'));
    fireEvent.click(screen.getByTestId('tutorial-try-step'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Notifications are blocked for cruush in this browser.');
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByTestId('tutorial-skip-step')).toBeEnabled();
    await waitFor(() => expect(screen.getByTestId('tutorial-try-step')).toBeEnabled());
  });

  it('lets install and notification steps be skipped independently', () => {
    const onActivateStep = vi.fn();

    render(<MapControlsTutorial open onActivateStep={onActivateStep} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId('tutorial-skip-step'));
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-skip-step'));
    expect(screen.getByRole('heading', { name: 'Map Controls' })).toBeInTheDocument();
    expect(screen.queryByTestId('tutorial-skip-step')).not.toBeInTheDocument();
    expect(onActivateStep).not.toHaveBeenCalled();
  });

  it('spotlights a real install surface that appears after the tutorial action', async () => {
    const installRect = makeRect({ bottom: 690, left: 24, right: 351, top: 470 });
    const onActivateStep = vi.fn((step: MapControlsTutorialStepId) => {
      if (step === 'install') {
        appendTutorialTarget('install', installRect);
      }
    });

    render(<MapControlsTutorial open onActivateStep={onActivateStep} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tutorial-try-step'));

    await waitFor(() => {
      expect(screen.getByTestId('tutorial-spotlight')).toHaveAttribute('data-tutorial-step', 'install');
    });
    expect(screen.getByRole('heading', { name: 'Install cruush' })).toBeInTheDocument();
    expect(screen.getByTestId('tutorial-skip-step')).toHaveTextContent('Next');
  });

  it('can skip the whole tutorial without requiring a control action', () => {
    const onComplete = vi.fn();
    const onActivateStep = vi.fn();

    render(<MapControlsTutorial open onActivateStep={onActivateStep} onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId('skip-map-controls-tutorial'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onActivateStep).not.toHaveBeenCalled();
  });

  it('dismisses Skip tutorial and Done from a mobile touch', () => {
    const skipComplete = vi.fn();
    const { unmount } = render(<MapControlsTutorial open onActivateStep={vi.fn()} onComplete={skipComplete} />);

    const skipTouch = createEvent.pointerUp(screen.getByTestId('skip-map-controls-tutorial'));
    Object.defineProperty(skipTouch, 'pointerType', { value: 'touch' });
    fireEvent(screen.getByTestId('skip-map-controls-tutorial'), skipTouch);
    expect(skipComplete).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId('map-controls-tutorial')).not.toBeInTheDocument();
    unmount();

    const doneComplete = vi.fn();
    render(<MapControlsTutorial open onActivateStep={vi.fn()} onComplete={doneComplete} />);
    for (let index = 0; index < TARGET_STEP_IDS.length; index += 1) {
      fireEvent.click(screen.queryByTestId('tutorial-skip-step') ?? screen.getByTestId('tutorial-next'));
    }

    const doneTouch = createEvent.pointerUp(screen.getByTestId('tutorial-next'));
    Object.defineProperty(doneTouch, 'pointerType', { value: 'touch' });
    fireEvent(screen.getByTestId('tutorial-next'), doneTouch);
    expect(doneComplete).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('map-controls-tutorial')).not.toBeInTheDocument();
  });

  it('resumes routed Ghost and Feed steps after the tutorial remounts', async () => {
    const onActivateStep = vi.fn();
    const firstRender = render(
      <MapControlsTutorial open onActivateStep={onActivateStep} onComplete={vi.fn()} />,
    );

    fireEvent.click(screen.getByTestId('tutorial-skip-step'));
    fireEvent.click(screen.getByTestId('tutorial-skip-step'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Ghost Mode' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-try-step'));
    await waitFor(() => expect(onActivateStep).toHaveBeenLastCalledWith('ghost'));
    firstRender.unmount();

    const secondRender = render(
      <MapControlsTutorial open onActivateStep={onActivateStep} onComplete={vi.fn()} />,
    );
    expect(screen.getByRole('heading', { name: 'Ghost Mode' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Feed' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-try-step'));
    await waitFor(() => expect(onActivateStep).toHaveBeenLastCalledWith('feed'));
    secondRender.unmount();

    render(<MapControlsTutorial open onActivateStep={onActivateStep} onComplete={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Feed' })).toBeInTheDocument();
    expect(window.localStorage.getItem('cruush:tutorial-v5-progress')).toBe('feed');
  });
});
