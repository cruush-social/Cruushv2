import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HeartPhoto from './HeartPhoto';

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
});
