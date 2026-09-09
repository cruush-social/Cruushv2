import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import HeartPhoto from './HeartPhoto';

it('keeps the white translucent DL cover and its label together without a competing fallback', () => {
  render(<HeartPhoto label="Censored photo" masked photo="/explicit.jpg" fallback={<span>Camera fallback</span>} />);
  const cover = screen.getByTestId('dl-mode-photo-placeholder');
  expect(cover).toHaveClass('opacity-75');
  expect(cover.querySelector('[data-testid="dl-mode-mark"]')).toHaveAttribute('data-tone', 'white');
  expect(cover.querySelector('text')).toHaveTextContent('DL MODE ON');
  expect(Number(cover.querySelector('text')?.getAttribute('y'))).toBeGreaterThan(52);
  expect(screen.queryByText('Camera fallback')).not.toBeInTheDocument();
  expect(document.querySelector('image[href="/explicit.jpg"]')).toBeNull();
});
