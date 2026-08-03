import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LiquidGlassFilters, { LIQUID_GLASS_FILTER_IDS } from './LiquidGlassFilters';

describe('LiquidGlassFilters', () => {
  it('defines Apple-style lens displacement filters for liquid glass surfaces', () => {
    const { container } = render(<LiquidGlassFilters />);

    const svg = container.querySelector('svg');

    expect(svg).toHaveClass('cruush-liquid-glass-filters');
    Object.values(LIQUID_GLASS_FILTER_IDS).forEach((id) => {
      const filter = document.getElementById(id);

      expect(filter).toBeInTheDocument();
      expect(filter?.querySelector('feImage')).toHaveAttribute('href', expect.stringContaining('data:image/svg+xml,'));
      expect(filter?.querySelector('feImage')).toHaveAttribute('preserveAspectRatio', 'none');
      expect(filter?.querySelector(`#${id}-redchannel`)).toHaveAttribute('xChannelSelector', 'R');
      expect(filter?.querySelector(`#${id}-redchannel`)).toHaveAttribute('yChannelSelector', 'B');
      expect(filter?.querySelector('feBlend[mode="screen"]')).toBeInTheDocument();
      expect(filter?.querySelector('feGaussianBlur')).toBeInTheDocument();
    });

    const dockFilter = document.getElementById(LIQUID_GLASS_FILTER_IDS.dock);
    const dockMap = dockFilter?.querySelector('feImage')?.getAttribute('href') ?? '';
    const decodedDockMap = decodeURIComponent(dockMap.replace('data:image/svg+xml,', ''));

    expect(decodedDockMap).toContain('viewBox="0 0 368 80"');
    expect(decodedDockMap).toContain('rx="40"');
    expect(decodedDockMap).toContain('fill="rgb(128,128,128)"');
    expect(decodedDockMap).toContain('id="softLens"');
    expect(decodedDockMap).toContain('stroke-opacity="0.3"');
    expect(dockFilter?.querySelector(`#${LIQUID_GLASS_FILTER_IDS.dock}-redchannel`)).toHaveAttribute('scale', '-120');
    expect(dockFilter?.querySelector(`#${LIQUID_GLASS_FILTER_IDS.dock}-greenchannel`)).toHaveAttribute('scale', '-110');
    expect(dockFilter?.querySelector(`#${LIQUID_GLASS_FILTER_IDS.dock}-bluechannel`)).toHaveAttribute('scale', '-100');
    expect(dockFilter?.querySelector('feGaussianBlur')).toHaveAttribute('stdDeviation', '0.12');

    const bubbleFilter = document.getElementById(LIQUID_GLASS_FILTER_IDS.bubble);
    const bubbleMap = bubbleFilter?.querySelector('feImage')?.getAttribute('href') ?? '';
    const decodedBubbleMap = decodeURIComponent(bubbleMap.replace('data:image/svg+xml,', ''));

    expect(decodedBubbleMap).toContain('viewBox="0 0 72 72"');
    expect(decodedBubbleMap).toContain('rx="36"');
    expect(decodedBubbleMap).toContain('fill="rgb(128,128,128)"');
    expect(bubbleFilter?.querySelector(`#${LIQUID_GLASS_FILTER_IDS.bubble}-redchannel`)).toHaveAttribute('scale', '-95');
    expect(bubbleFilter?.querySelector(`#${LIQUID_GLASS_FILTER_IDS.bubble}-greenchannel`)).toHaveAttribute('scale', '-85');
    expect(bubbleFilter?.querySelector(`#${LIQUID_GLASS_FILTER_IDS.bubble}-bluechannel`)).toHaveAttribute('scale', '-81');
    expect(bubbleFilter?.querySelector('feGaussianBlur')).toHaveAttribute('stdDeviation', '0.08');
  });
});
