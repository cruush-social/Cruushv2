import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_BREAKPOINT, useIsMobile } from './use-mobile';

function Probe() {
  return <output data-testid="is-mobile">{String(useIsMobile())}</output>;
}

function CustomBreakpointProbe() {
  return <output data-testid="is-constrained">{String(useIsMobile(1536, 800))}</output>;
}

describe('useIsMobile', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
  });

  it('treats the sub-lg viewport used by the in-app browser as mobile', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });

    render(<Probe />);

    expect(screen.getByTestId('is-mobile')).toHaveTextContent('true');
  });

  it('switches to desktop at the lg breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: MOBILE_BREAKPOINT });

    render(<Probe />);

    expect(screen.getByTestId('is-mobile')).toHaveTextContent('false');
  });

  it('supports a route-specific accessibility breakpoint without changing the global breakpoint', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1100 });

    render(<CustomBreakpointProbe />);

    expect(screen.getByTestId('is-constrained')).toHaveTextContent('true');
  });

  it('uses full-page treatment when the viewport is too short for a side panel', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });

    render(<CustomBreakpointProbe />);

    expect(screen.getByTestId('is-constrained')).toHaveTextContent('true');
  });
});
