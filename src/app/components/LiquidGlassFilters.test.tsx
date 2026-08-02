import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LiquidGlassFilters, { LIQUID_GLASS_FILTER_IDS } from './LiquidGlassFilters';

describe('LiquidGlassFilters', () => {
  it('defines CodePen-style displacement filters for liquid glass surfaces', () => {
    const { container } = render(<LiquidGlassFilters />);

    const svg = container.querySelector('svg');

    expect(svg).toHaveClass('cruush-liquid-glass-filters');
    Object.values(LIQUID_GLASS_FILTER_IDS).forEach((id) => {
      const filter = document.getElementById(id);

      expect(filter).toBeInTheDocument();
      expect(filter?.querySelector('feImage')).toHaveAttribute('href', expect.stringContaining('data:image/svg+xml,'));
      expect(filter?.querySelector(`#${id}-redchannel`)).toHaveAttribute('xChannelSelector', 'R');
      expect(filter?.querySelector(`#${id}-redchannel`)).toHaveAttribute('yChannelSelector', 'B');
      expect(filter?.querySelector('feBlend[mode="screen"]')).toBeInTheDocument();
      expect(filter?.querySelector('feGaussianBlur')).toBeInTheDocument();
    });
  });
});
