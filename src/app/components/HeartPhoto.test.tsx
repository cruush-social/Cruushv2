import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HeartPhoto from './HeartPhoto';

describe('HeartPhoto', () => {
  it('renders without glow by default', () => {
    render(<HeartPhoto label="Default preview" />);

    expect(screen.getByRole('img', { name: 'Default preview' })).not.toHaveAttribute('style');
  });
});
