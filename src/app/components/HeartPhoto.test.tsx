import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HeartPhoto from './HeartPhoto';
import { getProfileGradientStops } from '../lib/profileGradient';

describe('HeartPhoto', () => {
  it('renders without glow by default', () => {
    render(<HeartPhoto label="Default preview" />);

    expect(screen.getByRole('img', { name: 'Default preview' })).not.toHaveAttribute('style');
  });

  it('uses the same red gradient as nearby map hearts by default', () => {
    render(<HeartPhoto label="Incoming cruush preview" />);

    const stops = Array.from(screen.getByRole('img', { name: 'Incoming cruush preview' }).querySelectorAll('stop'))
      .map((stop) => stop.getAttribute('stop-color'));

    expect(stops).toEqual(['#FF0072', '#DA045D', '#B40849']);
  });

  it('uses a deterministic randomized no-photo gradient when a user id is provided', () => {
    render(<HeartPhoto label="Gradient preview" userId="user-a" />);

    const stops = Array.from(screen.getByRole('img', { name: 'Gradient preview' }).querySelectorAll('stop'))
      .map((stop) => stop.getAttribute('stop-color'));

    expect(stops).toEqual(getProfileGradientStops('user-a'));
    expect(stops).not.toEqual(['#FF0072', '#DA045D', '#B40849']);
  });
});
