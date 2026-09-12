import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import DesktopDockPanel from './DesktopDockPanel';

const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

describe('DesktopDockPanel', () => {
  beforeEach(() => {
    window.localStorage.removeItem('cruush.desktopDock.left');
    window.localStorage.removeItem('cruush.desktopDock.right');
  });

  afterEach(() => {
    setViewport(originalInnerWidth, originalInnerHeight);
  });

  it('keeps the right panel below Map Controls while the left panel stays below top chrome', () => {
    setViewport(1280, 800);

    const { unmount } = render(
      <DesktopDockPanel slot="right" ariaLabel="Right panel">
        <p>Right content</p>
      </DesktopDockPanel>,
    );

    expect(screen.getByLabelText('Right panel')).toHaveStyle({ top: '136px', height: '518px' });

    unmount();

    render(
      <DesktopDockPanel slot="left" ariaLabel="Left panel">
        <p>Left content</p>
      </DesktopDockPanel>,
    );

    expect(screen.getByLabelText('Left panel')).toHaveStyle({ top: '90px', height: '564px' });
  });

  it('lets a profile preview extend 34px lower while keeping a 112px bottom-control clearance', () => {
    setViewport(1280, 800);

    render(
      <DesktopDockPanel slot="left" ariaLabel="Profile preview" bottomClearance={112}>
        <p>Profile content</p>
      </DesktopDockPanel>,
    );

    expect(screen.getByLabelText('Profile preview')).toHaveStyle({ top: '90px', height: '598px' });
  });

  it('preserves the Map Controls clearance on a narrow desktop viewport', () => {
    setViewport(800, 900);

    render(
      <DesktopDockPanel slot="right" ariaLabel="Right panel">
        <p>Right content</p>
      </DesktopDockPanel>,
    );

    const panel = screen.getByLabelText('Right panel');
    expect(panel).toHaveStyle({ left: '400px', top: '132px', width: '390px', height: '630px' });
  });

  it('recalculates the default bottom clearance when resizing across the desktop breakpoint', () => {
    setViewport(800, 900);

    render(
      <DesktopDockPanel slot="right" ariaLabel="Responsive panel">
        <p>Right content</p>
      </DesktopDockPanel>,
    );

    setViewport(1280, 900);
    act(() => window.dispatchEvent(new Event('resize')));

    expect(screen.getByLabelText('Responsive panel')).toHaveStyle({ top: '136px', height: '618px' });
  });
});
