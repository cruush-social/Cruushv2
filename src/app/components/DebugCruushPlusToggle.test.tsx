import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  });

  it('toggles cruush+ and announces the entitlement change', async () => {
    const eventHandler = vi.fn();
    window.addEventListener(DEBUG_CRUUSH_PLUS_EVENT, eventHandler);

    render(<DebugCruushPlusToggle />);

    const toggle = await screen.findByRole('button', { name: 'Debug cruush+ disabled' });
    expect(toggle).toHaveTextContent('DEV cruush+ OFF');
    expect(toggle).toHaveClass('fixed', 'left-1/2', 'top-3', '-translate-x-1/2');
    expect(toggle).not.toHaveClass('right-3');

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(setDebugCruushPlus).toHaveBeenCalledWith(true);
      expect(screen.getByRole('button', { name: 'Debug cruush+ enabled' })).toHaveTextContent('DEV cruush+ ON');
      expect(eventHandler).toHaveBeenCalledTimes(1);
    });

    window.removeEventListener(DEBUG_CRUUSH_PLUS_EVENT, eventHandler);
  });
});
