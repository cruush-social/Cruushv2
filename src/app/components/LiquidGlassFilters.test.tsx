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
    // Reference displacement image: black plate, red horizontal ramp, blue
    // vertical ramp differenced over it, blurred block-out rect on top.
    expect(decodedDockMap).toContain('fill="black"');
    expect(decodedDockMap).toContain('<linearGradient id="red" x1="100%" y1="0%" x2="0%" y2="0%">');
    expect(decodedDockMap).toContain('<linearGradient id="blue" x1="0%" y1="0%" x2="0%" y2="100%">');
    expect(decodedDockMap).toContain('fill="url(#red)"');
    expect(decodedDockMap).toContain('fill="url(#blue)" style="mix-blend-mode: difference"');
    expect(decodedDockMap).toContain('fill="hsl(0 0% 50% / 0.93)" style="filter:blur(11px)"');
    expect(decodedDockMap).not.toContain('rgb(128,128,128)');
    // Chromatic aberration offsets from the reference base config: r 0, g 10, b 20.
    expect(dockFilter?.querySelector(`#${LIQUID_GLASS_FILTER_IDS.dock}-redchannel`)).toHaveAttribute('scale', '-180');
    expect(dockFilter?.querySelector(`#${LIQUID_GLASS_FILTER_IDS.dock}-greenchannel`)).toHaveAttribute('scale', '-170');
    expect(dockFilter?.querySelector(`#${LIQUID_GLASS_FILTER_IDS.dock}-bluechannel`)).toHaveAttribute('scale', '-160');
    expect(dockFilter?.querySelector('feGaussianBlur')).toHaveAttribute('stdDeviation', '0.2');

    const bubbleFilter = document.getElementById(LIQUID_GLASS_FILTER_IDS.bubble);
    const bubbleMap = bubbleFilter?.querySelector('feImage')?.getAttribute('href') ?? '';
    const decodedBubbleMap = decodeURIComponent(bubbleMap.replace('data:image/svg+xml,', ''));

    expect(decodedBubbleMap).toContain('viewBox="0 0 72 72"');
    expect(decodedBubbleMap).toContain('rx="36"');
    expect(decodedBubbleMap).toContain('fill="black"');
    expect(bubbleFilter?.querySelector(`#${LIQUID_GLASS_FILTER_IDS.bubble}-redchannel`)).toHaveAttribute('scale', '-180');
    expect(bubbleFilter?.querySelector(`#${LIQUID_GLASS_FILTER_IDS.bubble}-greenchannel`)).toHaveAttribute('scale', '-170');
    expect(bubbleFilter?.querySelector(`#${LIQUID_GLASS_FILTER_IDS.bubble}-bluechannel`)).toHaveAttribute('scale', '-160');
    expect(bubbleFilter?.querySelector('feGaussianBlur')).toHaveAttribute('stdDeviation', '0');

    // Every surface blocks out to neutral grey. hsl(0 0% 50% / 0.93) over the
    // differenced ramps composites to rgb(127.5, 118.6, 127.5), so the centre
    // of the surface sits at zero displacement and only the rim refracts. A
    // lighter/more transparent block-out (the pen's `free` preset) leaves the
    // centre at rgb(146, 113, 146) and smears the whole element.
    const panelFilter = document.getElementById(LIQUID_GLASS_FILTER_IDS.panel);
    const panelMap = panelFilter?.querySelector('feImage')?.getAttribute('href') ?? '';
    const decodedPanelMap = decodeURIComponent(panelMap.replace('data:image/svg+xml,', ''));

    expect(decodedPanelMap).toContain('fill="hsl(0 0% 50% / 0.93)" style="filter:blur(11px)"');
    expect(panelFilter?.querySelector(`#${LIQUID_GLASS_FILTER_IDS.panel}-redchannel`)).toHaveAttribute('scale', '-180');

    Object.values(LIQUID_GLASS_FILTER_IDS).forEach((id) => {
      const map = document.getElementById(id)?.querySelector('feImage')?.getAttribute('href') ?? '';
      const decoded = decodeURIComponent(map.replace('data:image/svg+xml,', ''));

      expect(decoded).toContain('fill="hsl(0 0% 50% / 0.93)"');
    });
  });
});
