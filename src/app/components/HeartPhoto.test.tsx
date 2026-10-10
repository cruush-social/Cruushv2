import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import HeartPhoto from './HeartPhoto';
import { HEART_PIN_THEMES } from '../lib/heartPin';
import { getProfileGradientStops } from '../lib/profileGradient';
import { ACCESSIBILITY_PREFERENCES_STORAGE_KEY } from '../lib/accessibilityPreferences';
import purgatoryHeartOverlay from '../assets/ui-icons/purgatory-heart-pin-overlay.svg';

describe('HeartPhoto', () => {
  afterEach(() => {
    window.localStorage.removeItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY);
  });

  it('renders without glow by default', () => {
    render(<HeartPhoto label="Default preview" masked />);

    expect(screen.getByRole('img', { name: 'Default preview' })).not.toHaveAttribute('style');
  });

  it('uses the same red gradient as nearby map hearts by default', () => {
    render(<HeartPhoto label="Incoming cruush preview" masked />);

    const stops = Array.from(screen.getByRole('img', { name: 'Incoming cruush preview' }).querySelectorAll('linearGradient[id^="heart-gradient"] stop'))
      .map((stop) => stop.getAttribute('stop-color'));

    expect(stops).toEqual(['#FF0072', '#DA045D', '#B40849']);
  });

  it('uses the blue current-user theme when requested', () => {
    render(<HeartPhoto label="Your map pin preview" masked theme="current" />);

    const heart = screen.getByRole('img', { name: 'Your map pin preview' });
    const stops = Array.from(heart.querySelectorAll('linearGradient[id^="heart-gradient"] stop'))
      .map((stop) => stop.getAttribute('stop-color'));

    expect(stops).toEqual(HEART_PIN_THEMES.current.stops);
    expect(heart.querySelector('path')).toHaveAttribute('stroke', HEART_PIN_THEMES.current.border);
  });

  it('keeps current-user no-photo hearts blue even with a user id', () => {
    render(<HeartPhoto label="Your feed pin preview" masked theme="current" userId="user-a" />);

    const heart = screen.getByRole('img', { name: 'Your feed pin preview' });
    const stops = Array.from(heart.querySelectorAll('linearGradient[id^="heart-gradient"] stop'))
      .map((stop) => stop.getAttribute('stop-color'));

    expect(stops).toEqual(HEART_PIN_THEMES.current.stops);
    expect(stops).not.toEqual(getProfileGradientStops('user-a'));
  });

  it('uses a deterministic randomized no-photo gradient when a user id is provided', () => {
    render(<HeartPhoto label="Gradient preview" masked userId="user-a" />);

    const stops = Array.from(screen.getByRole('img', { name: 'Gradient preview' }).querySelectorAll('linearGradient[id^="heart-gradient"] stop'))
      .map((stop) => stop.getAttribute('stop-color'));

    expect(stops).toEqual(getProfileGradientStops('user-a'));
    expect(stops).not.toEqual(['#FF0072', '#DA045D', '#B40849']);
  });

  it('does not resolve a masked photo URL', () => {
    render(<HeartPhoto label="Masked photo" masked photo="https://example.com/private.jpg" />);

    const heart = screen.getByRole('img', { name: 'Masked photo' });
    // The private photo must never reach the DOM. The DL Mode mark drawn in its
    // place is an <image> too, so the check is on the URL, not the element.
    expect(heart.innerHTML).not.toContain('private.jpg');
    expect([...heart.querySelectorAll('image')].map((node) => node.getAttribute('href') ?? ''))
      .not.toContain('https://example.com/private.jpg');
    expect(heart.querySelector('image[href*="dl-mode"]')).toBeInTheDocument();
  });

  it('places the approved external overlay only over a confirmed Purgatory subject', () => {
    const { rerender } = render(<HeartPhoto label="Unknown member" masked />);
    expect(screen.queryByTestId('purgatory-heart-overlay')).not.toBeInTheDocument();

    rerender(<HeartPhoto label="Sinner member" masked outOfSight={false} />);
    expect(screen.queryByTestId('purgatory-heart-overlay')).not.toBeInTheDocument();

    rerender(<HeartPhoto label="Purgatory member" masked outOfSight />);
    const overlay = screen.getByTestId('purgatory-heart-overlay');
    expect(overlay).toHaveClass('left-0', '-top-[12.5%]', 'h-[112.5%]', 'w-full', 'pointer-events-none');
    expect(overlay).toHaveAttribute('alt', '');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(overlay).toHaveAttribute('src', purgatoryHeartOverlay);
    rerender(<HeartPhoto label="Purgatory member" masked outOfSight borderTone="mile-high" />);
    expect(screen.queryByTestId('purgatory-heart-overlay')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Purgatory member' }).querySelector('[data-contrail-style]')).toBeInTheDocument();
  });

  it('uses the existing animated Mile High plane and contrail for a Mile High heart', () => {
    render(<HeartPhoto borderTone="mile-high" label="Travelling member" masked />);

    expect(screen.getByRole('img', { name: 'Travelling member' }).querySelector('[data-contrail-style]'))
      .toHaveAttribute('data-contrail-style', 'cluster');
  });

  it('keeps the Mile High plane and contrail static when reduce motion is enabled', () => {
    window.localStorage.setItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY, JSON.stringify({ reduceMotion: true }));

    render(<HeartPhoto borderTone="mile-high" label="Travelling member" masked />);

    expect(screen.getByRole('img', { name: 'Travelling member' }).querySelector('[data-contrail-style]'))
      .toHaveAttribute('data-contrail-style', 'reduced-motion');
  });
});
