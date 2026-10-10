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
  const viewport = cover.querySelector('[data-testid="dl-mode-mark"]');
  expect(Number(viewport?.getAttribute('x')) + Number(viewport?.getAttribute('width')) / 2).toBe(32);
  expect(Number(viewport?.getAttribute('y')) + Number(viewport?.getAttribute('height')) / 2).toBe(32);
  expect(screen.queryByText('Camera fallback')).not.toBeInTheDocument();
  expect(document.querySelector('image[href="/explicit.jpg"]')).toBeNull();
});

it('keeps DL MODE ON beneath the icon when the viewer setting masks the photo', () => {
  render(<DlModePhotoPlaceholder />);
  expect(screen.getByTestId('dl-mode-photo-placeholder').querySelector('text')).toHaveTextContent('DL MODE ON');
});

it('omits DL Mode text in compact Recently Active previews', () => {
  render(<DlModePhotoPlaceholder showLabel={false} splitCruushesOnly />);
  const cover = screen.getByTestId('dl-mode-photo-placeholder');
  expect(cover).toHaveAttribute('aria-label', 'DL MODE ON');
  expect(cover.querySelector('text')).toBeNull();
});

it('keeps an owner restriction label distinct from the viewer DL Mode label', () => {
  render(<DlModePhotoPlaceholder restriction="mutual_cruushes" />);
  expect(screen.getByTestId('dl-mode-photo-placeholder')).toHaveAttribute('aria-label', 'MUTUAL CRUUSHES ONLY');
  expect(screen.getByTestId('dl-mode-photo-placeholder').querySelector('text')).toHaveTextContent('MUTUAL CRUUSHES ONLY');
});
