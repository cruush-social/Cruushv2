import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DebugCruushPlusToggle from './DebugCruushPlusToggle';
import { DEBUG_CRUUSH_PLUS_EVENT } from '../lib/debugApi';

const { getDebugCruushPlus, setDebugCruushPlus } = vi.hoisted(() => ({
  getDebugCruushPlus: vi.fn(),
  setDebugCruushPlus: vi.fn(),
}));

vi.mock('../lib/debugApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/debugApi')>('../lib/debugApi');

  return {
    ...actual,
    getDebugCruushPlus,
    setDebugCruushPlus,
  };
});

describe('DebugCruushPlusToggle', () => {
  beforeEach(() => {
    getDebugCruushPlus.mockReset();
    setDebugCruushPlus.mockReset();
    getDebugCruushPlus.mockResolvedValue({
      cruushPlus: false,
      expiresAt: null,
    });
    setDebugCruushPlus.mockResolvedValue({
      cruushPlus: true,
      expiresAt: null,
    });
    vi.stubEnv('DEV', true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('toggles cruush+ and announces the entitlement change', async () => {
    const eventHandler = vi.fn();
    window.addEventListener(DEBUG_CRUUSH_PLUS_EVENT, eventHandler);

    render(<DebugCruushPlusToggle />);

    const toggle = await screen.findByRole('button', { name: 'Debug cruush+ disabled' });
    expect(toggle).toHaveTextContent('DEV cruush+ OFF');
    expect(toggle).toHaveClass('fixed', 'hidden', 'bottom-6', 'left-6', 'z-[45]', 'sm:inline-flex');
    expect(toggle).not.toHaveClass('right-3');

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(setDebugCruushPlus).toHaveBeenCalledWith(true);
      expect(screen.getByRole('button', { name: 'Debug cruush+ enabled' })).toHaveTextContent('DEV cruush+ ON');
      expect(eventHandler).toHaveBeenCalledTimes(1);
    });

    window.removeEventListener(DEBUG_CRUUSH_PLUS_EVENT, eventHandler);
  });

  it('does not request the debug entitlement outside dev mode', () => {
    vi.stubEnv('DEV', false);

    const { container } = render(<DebugCruushPlusToggle />);

    expect(container).toBeEmptyDOMElement();
    expect(getDebugCruushPlus).not.toHaveBeenCalled();
  });
});
