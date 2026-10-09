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

  it('lets panels move through map-chrome space while preserving a map-edge gap', () => {
    setViewport(1280, 800);

    const { unmount } = render(
      <DesktopDockPanel slot="right" ariaLabel="Right panel">
        <p>Right content</p>
      </DesktopDockPanel>,
    );

    expect(screen.getByLabelText('Right panel')).toHaveStyle({ top: '10px', height: '780px' });

    unmount();

    render(
      <DesktopDockPanel slot="left" ariaLabel="Left panel">
        <p>Left content</p>
      </DesktopDockPanel>,
    );

    expect(screen.getByLabelText('Left panel')).toHaveStyle({ top: '10px', height: '780px' });
  });

  it('keeps an explicit bottom clearance while allowing a profile preview to move upward', () => {
    setViewport(1280, 800);

    render(
      <DesktopDockPanel slot="left" ariaLabel="Profile preview" bottomClearance={112}>
        <p>Profile content</p>
      </DesktopDockPanel>,
    );

    expect(screen.getByLabelText('Profile preview')).toHaveStyle({ top: '10px', height: '678px' });
  });

  it('uses the same top edge gap on a narrow desktop viewport', () => {
    setViewport(800, 900);

    render(
      <DesktopDockPanel slot="right" ariaLabel="Right panel">
        <p>Right content</p>
      </DesktopDockPanel>,
    );

    const panel = screen.getByLabelText('Right panel');
    expect(panel).toHaveStyle({ left: '400px', top: '10px', width: '390px', height: '880px' });
  });

  it('retains the edge gap when resizing across the desktop breakpoint', () => {
    setViewport(800, 900);

    render(
      <DesktopDockPanel slot="right" ariaLabel="Responsive panel">
        <p>Right content</p>
      </DesktopDockPanel>,
    );

    setViewport(1280, 900);
    act(() => window.dispatchEvent(new Event('resize')));

    expect(screen.getByLabelText('Responsive panel')).toHaveStyle({ top: '10px', height: '880px' });
  });

  it('keeps modal popups beneath persistent map controls', () => {
    setViewport(1280, 800);

    render(
      <DesktopDockPanel slot="right" ariaLabel="Spot popup" layer="modal">
        <p>Spot content</p>
      </DesktopDockPanel>,
    );

    expect(Number(screen.getByLabelText('Spot popup').style.zIndex)).toBeLessThan(900);
  });
});
