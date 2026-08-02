import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HeartPin from './HeartPin';
import { HEART_PIN_PHOTO_PATH } from '../lib/heartPin';

describe('HeartPin', () => {
  it('clips profile photos inside the shared glass heart border', () => {
    const { container } = render(<HeartPin user={{ id: 'user-photo', photo: 'https://example.com/photo.jpg' }} />);
    const heart = container.querySelector('svg');
    const photo = heart?.querySelector('image');

    expect(heart).toHaveClass('cruush-heart-glass-svg');
    expect(heart?.querySelector('clipPath path')).toHaveAttribute('d', HEART_PIN_PHOTO_PATH);
    expect(photo).toHaveAttribute('href', 'https://example.com/photo.jpg');
    expect(photo?.getAttribute('clip-path')).toContain('heart-pin-photo-clip-');
    expect(heart?.querySelector('.cruush-heart-glass-rim')).toBeInTheDocument();
  });
});
