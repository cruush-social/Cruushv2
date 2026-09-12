import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import HeartPhoto from './HeartPhoto';
import DlModePhotoPlaceholder from './DlModePhotoPlaceholder';

it('omits the label only from heart previews while retaining the white translucent DL icon', () => {
  render(<HeartPhoto label="Censored photo" masked photo="/explicit.jpg" fallback={<span>Camera fallback</span>} />);
  const cover = screen.getByTestId('dl-mode-photo-placeholder');
  expect(cover).toHaveClass('opacity-75');
  expect(cover.querySelector('[data-testid="dl-mode-mark"]')).toHaveAttribute('data-tone', 'white');
  expect(cover.querySelector('text')).toBeNull();
  expect(cover).toHaveAttribute('viewBox', '20 0 40 52');
  const viewport = cover.parentElement;
  expect(Number(viewport?.getAttribute('x')) + Number(viewport?.getAttribute('width')) / 2).toBe(32);
  expect(Number(viewport?.getAttribute('y')) + Number(viewport?.getAttribute('height')) / 2).toBe(32);
  expect(screen.queryByText('Camera fallback')).not.toBeInTheDocument();
  expect(document.querySelector('image[href="/explicit.jpg"]')).toBeNull();
});

it('keeps DL MODE ON beneath the icon on non-heart covers', () => {
  render(<DlModePhotoPlaceholder />);
  expect(screen.getByTestId('dl-mode-photo-placeholder').querySelector('text')).toHaveTextContent('DL MODE ON');
});
