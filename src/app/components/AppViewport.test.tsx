import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
