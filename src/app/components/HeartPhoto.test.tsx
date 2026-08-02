import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HeartPhoto from './HeartPhoto';
import { HEART_PIN_PHOTO_PATH } from '../lib/heartPin';

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

  it('uses the blue current-user theme when requested', () => {
    render(<HeartPhoto label="Your map pin preview" theme="current" />);

    const heart = screen.getByRole('img', { name: 'Your map pin preview' });
    const stops = Array.from(heart.querySelectorAll('stop'))
      .map((stop) => stop.getAttribute('stop-color'));

    expect(stops).toEqual(['#00B8FF', '#0A7DF4', '#3236D4']);
    expect(heart.querySelector('path')).toHaveAttribute('stroke', '#0BA8FF');
  });

  it('keeps current-user no-photo hearts blue even with a user id', () => {
    render(<HeartPhoto label="Your feed pin preview" theme="current" userId="user-a" />);

    const heart = screen.getByRole('img', { name: 'Your feed pin preview' });
    const stops = Array.from(heart.querySelectorAll('stop'))
      .map((stop) => stop.getAttribute('stop-color'));

    expect(stops).toEqual(['#00B8FF', '#0A7DF4', '#3236D4']);
  });

  it('keeps themed preview colors when a user id is provided', () => {
    render(<HeartPhoto label="Gradient preview" userId="user-a" />);

    const stops = Array.from(screen.getByRole('img', { name: 'Gradient preview' }).querySelectorAll('stop'))
      .map((stop) => stop.getAttribute('stop-color'));

    expect(stops).toEqual(['#FF0072', '#DA045D', '#B40849']);
  });

  it('keeps masked mutual photo previews purple', () => {
    render(<HeartPhoto label="Masked mutual preview" masked photo="https://example.com/photo.jpg" theme="mutual" userId="user-a" />);

    const heart = screen.getByRole('img', { name: 'Masked mutual preview' });
    const stops = Array.from(heart.querySelectorAll('stop'))
      .map((stop) => stop.getAttribute('stop-color'));

    expect(stops).toEqual(['#A64DFF', '#6f00ff', '#3B00A8']);
    expect(heart.querySelector('image')).not.toBeInTheDocument();
    expect(heart.querySelector('.cruush-heart-glass-theme-border')).toHaveAttribute('stroke', '#6f00ff');
  });

  it('clips photos inside the glass heart border', () => {
    render(<HeartPhoto label="Photo preview" photo="https://example.com/photo.jpg" />);

    const heart = screen.getByRole('img', { name: 'Photo preview' });
    const photo = heart.querySelector('image');

    expect(heart.querySelector('clipPath path')).toHaveAttribute('d', HEART_PIN_PHOTO_PATH);
    expect(photo).toHaveAttribute('href', 'https://example.com/photo.jpg');
    expect(photo?.getAttribute('clip-path')).toContain('heart-photo-clip-');
    expect(heart.querySelector('.cruush-heart-glass-theme-border')).toHaveAttribute('stroke', '#FF0072');
    expect(heart.querySelector('.cruush-heart-glass-rim')).toBeInTheDocument();
  });
});
