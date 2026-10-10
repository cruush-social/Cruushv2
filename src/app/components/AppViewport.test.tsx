import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import AppViewport from './AppViewport';

Element.prototype.scrollTo ??= function scrollTo() {};

function dispatchMultiTouch(target: HTMLElement, touchCount: number) {
  const event = new Event('touchmove', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: Array.from({ length: touchCount }, () => ({})) });
  target.dispatchEvent(event);
  return event;
}

describe('AppViewport', () => {
  afterEach(() => {
    delete document.documentElement.dataset.cruushDmKeyboardOpen;
    vi.unstubAllGlobals();
  });

  it('keeps the DM frame at the visible top during iOS keyboard panning and restores it on close', () => {
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 812 });
    vi.stubGlobal('visualViewport', viewport);
    render(<MemoryRouter><AppViewport><div /></AppViewport></MemoryRouter>);
    const frame = screen.getByTestId('app-viewport');
    expect(frame.style.top).toBe('');
    act(() => {
      document.documentElement.dataset.cruushDmKeyboardOpen = 'true';
      viewport.offsetTop = 190;
      viewport.height = 409;
      window.dispatchEvent(new Event('cruush:dm-keyboard-changed'));
    });
    expect(frame.style.top).toBe('190px');
    expect(frame.style.height).toBe('409px');
    expect(frame.style.bottom).toBe('auto');
    expect(frame.style.transform).toBe('');
    act(() => {
      viewport.offsetTop = 403;
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(frame.style.top).toBe('403px');
    act(() => {
      delete document.documentElement.dataset.cruushDmKeyboardOpen;
      window.dispatchEvent(new Event('cruush:dm-keyboard-changed'));
    });
    expect(frame.style.top).toBe('');
    expect(frame.style.height).toBe('');
    expect(frame.style.bottom).toBe('');
  });

  it('does not reframe other surfaces or desktop focus when the visual viewport changes', () => {
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 812 });
    vi.stubGlobal('visualViewport', viewport);
    render(<MemoryRouter><AppViewport><div /></AppViewport></MemoryRouter>);
    act(() => {
      viewport.offsetTop = 403;
      viewport.height = 409;
      viewport.dispatchEvent(new Event('resize'));
    });
    const frame = screen.getByTestId('app-viewport');
    expect(frame.style.top).toBe('');
    expect(frame.style.height).toBe('');
  });

  it('blocks browser page zoom gestures outside the map surface', () => {
    render(
      <MemoryRouter initialEntries={['/profile/example']}>
        <AppViewport>
          <div data-testid="profile-surface" />
        </AppViewport>
      </MemoryRouter>,
    );

    const profile = screen.getByTestId('profile-surface');
    const gesture = new Event('gesturestart', { bubbles: true, cancelable: true });
    profile.dispatchEvent(gesture);

    expect(gesture.defaultPrevented).toBe(true);
    expect(dispatchMultiTouch(profile, 2).defaultPrevented).toBe(true);
    expect(dispatchMultiTouch(profile, 1).defaultPrevented).toBe(false);
    expect(screen.getByTestId('app-viewport').style.touchAction).toBe('pan-x pan-y');
  });

  it('leaves map gestures available to MapLibre', () => {
    render(
      <MemoryRouter initialEntries={['/map']}>
        <AppViewport>
          <div data-map-gesture-surface data-testid="map-surface" />
        </AppViewport>
      </MemoryRouter>,
    );

    const map = screen.getByTestId('map-surface');
    const gesture = new Event('gesturestart', { bubbles: true, cancelable: true });
    map.dispatchEvent(gesture);

    expect(gesture.defaultPrevented).toBe(false);
    expect(dispatchMultiTouch(map, 2).defaultPrevented).toBe(false);
  });
});
