import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_BREAKPOINT, useIsMobile } from './use-mobile';

function Probe() {
  return <output data-testid="is-mobile">{String(useIsMobile())}</output>;
}

describe('useIsMobile', () => {
  beforeEach(() => {
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
});
