import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapControlsTutorial from './MapControlsTutorial';

describe('MapControlsTutorial', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('spotlights the real control and advances through the interactive steps', () => {
    const onComplete = vi.fn();
    const onActivateStep = vi.fn();
    const target = document.createElement('button');
    target.dataset.tutorialTarget = 'seeking';
    target.getBoundingClientRect = () => ({
      bottom: 70,
      height: 32,
      left: 260,
      right: 350,
      top: 38,
      width: 90,
      x: 260,
      y: 38,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(target);

    render(<MapControlsTutorial open onActivateStep={onActivateStep} onComplete={onComplete} />);

    expect(screen.getByRole('heading', { name: 'Seeking' })).toBeInTheDocument();
    expect(screen.getByTestId('tutorial-spotlight')).toHaveStyle({ left: '252px', top: '30px' });

    fireEvent.click(screen.getByTestId('tutorial-try-step'));
    expect(onActivateStep).toHaveBeenCalledWith('seeking');

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Visibility' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'DL Mode' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-try-step'));
    expect(onActivateStep).toHaveBeenLastCalledWith('dl-mode');
    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('heading', { name: 'Zoom' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('can be skipped without requiring a control action', () => {
    const onComplete = vi.fn();

    render(<MapControlsTutorial open onActivateStep={vi.fn()} onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId('skip-map-controls-tutorial'));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
