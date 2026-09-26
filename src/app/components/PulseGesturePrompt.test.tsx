import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetExclusivePopupsForTest, useExclusivePopup } from '../lib/popupQueue';
import PulseGesturePrompt, { PULSE_GESTURE_DELAY_MS, pulseGestureSeenKey } from './PulseGesturePrompt';

function ExistingIntro({ open }: { open: boolean }) {
  useExclusivePopup('dl-mode-default', open);
  return null;
}

function renderPrompt(existingIntro = false) {
  return render(
    <MemoryRouter initialEntries={['/map']}>
      <ExistingIntro open={existingIntro} />
      <PulseGesturePrompt pending userId="member-1" />
    </MemoryRouter>,
  );
}

describe('PulseGesturePrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetExclusivePopupsForTest();
    window.localStorage.removeItem(pulseGestureSeenKey('member-1'));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetExclusivePopupsForTest();
  });

  it('shows the Pulse gesture once, 30 seconds after the intro queue is idle', () => {
    const view = renderPrompt(true);

    act(() => vi.advanceTimersByTime(PULSE_GESTURE_DELAY_MS));
    expect(screen.queryByTestId('pulse-gesture-prompt')).not.toBeInTheDocument();

    view.rerender(
      <MemoryRouter initialEntries={['/map']}>
        <ExistingIntro open={false} />
        <PulseGesturePrompt pending userId="member-1" />
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(PULSE_GESTURE_DELAY_MS - 1));
    expect(screen.queryByTestId('pulse-gesture-prompt')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('pulse-gesture-prompt')).toHaveAttribute('data-dialog-framing', 'floating');
    expect(screen.getByText('Tap Map Controls, then Send a Pulse. Choose a radius and tap Send Pulse.')).toBeInTheDocument();
    expect(window.localStorage.getItem(pulseGestureSeenKey('member-1'))).toBe('true');
  });

  it('does not repeat after it has been seen', () => {
    window.localStorage.setItem(pulseGestureSeenKey('member-1'), 'true');
    renderPrompt();
    act(() => vi.advanceTimersByTime(PULSE_GESTURE_DELAY_MS));
    expect(screen.queryByTestId('pulse-gesture-prompt')).not.toBeInTheDocument();
  });
});
