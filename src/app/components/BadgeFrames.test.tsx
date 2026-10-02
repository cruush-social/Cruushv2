import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BadgeHoverLabel } from './BadgeFrames';

describe('BadgeHoverLabel', () => {
  it('centers both desktop side labels while preserving touch reveal alignment', () => {
    render(<>
      <BadgeHoverLabel align="start" revealed>Left badge</BadgeHoverLabel>
      <BadgeHoverLabel align="end" revealed>Right badge</BadgeHoverLabel>
    </>);
    for (const name of ['Left badge', 'Right badge']) {
      expect(screen.getByText(name)).toHaveClass(
        '[@media(hover:hover)]:left-1/2',
        '[@media(hover:hover)]:-translate-x-1/2',
        '[@media(hover:none)]:left-1/2',
        '[@media(hover:none)]:-translate-x-1/2',
      );
    }
    expect(screen.getByText('Right badge')).toHaveClass('[@media(hover:hover)]:right-auto');
  });

  it('can reduce only horizontal padding for map labels', () => {
    render(<>
      <BadgeHoverLabel>Shared label</BadgeHoverLabel>
      <BadgeHoverLabel compactHorizontalPadding>Map label</BadgeHoverLabel>
    </>);

    expect(screen.getByText('Shared label')).toHaveClass('px-2', 'py-1');
    expect(screen.getByText('Map label')).toHaveClass('px-1', 'py-1');
  });
});
