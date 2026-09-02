import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AlphaBugButton from './AlphaBugButton';
import Changelog from './Changelog';

const { dismissUserNotice, getUserNoticeDismissal } = vi.hoisted(() => ({
  dismissUserNotice: vi.fn(),
  getUserNoticeDismissal: vi.fn(),
}));

vi.mock('../lib/userNoticesApi', () => ({
  dismissUserNotice,
  getUserNoticeDismissal,
}));

describe('Changelog', () => {
  beforeEach(() => {
    dismissUserNotice.mockReset();
    getUserNoticeDismissal.mockReset();
    dismissUserNotice.mockResolvedValue({ dismissed: true, dismissedAt: '2026-08-09T12:00:00.000Z' });
    getUserNoticeDismissal.mockResolvedValue({ dismissed: true, dismissedAt: '2026-08-09T12:00:00.000Z' });
  });

  it('shows v1.6 before the preserved earlier history', () => {
    render(
      <MemoryRouter>
        <Changelog />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'cruush v1.6',
      'cruush v1.5',
      'cruush v1.4',
      'cruush v1.3',
      'cruush v1.2',
      'cruush v1.1',
    ]);
    const v15Section = screen.getByRole('heading', { level: 3, name: 'cruush v1.5' }).closest('section');
    expect(v15Section).not.toBeNull();
    expect(v15Section?.textContent ?? '').toMatch(/full 4:5 profile photos/i);
    expect(v15Section?.textContent ?? '').toMatch(/Seeking filters now stay selected/i);
    expect(v15Section?.textContent ?? '').toMatch(/relevant person’s map pin/i);
    const v13Section = screen.getByRole('heading', { level: 3, name: 'cruush v1.3' }).closest('section');
    expect(v13Section).not.toBeNull();
    expect(v13Section?.textContent ?? '').toMatch(/Ghost Mode has clearer controls and status feedback/i);
    expect(v13Section?.textContent ?? '').toMatch(/same detailed Seeking filters as the map/i);
    expect(v13Section?.textContent ?? '').toMatch(/free day of cruush\+ when they enable 2FA/i);
    expect(screen.getAllByText(/Dark Room adds a cruush\+ privacy control/i)).not.toHaveLength(0);
    expect(screen.queryByText(/Stealth Mode/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Ping briefly activates your map heart.*local feed.*saved post duration/i)).toBeInTheDocument();
    expect(screen.getByText(/interactive tutorial highlights the real Install, Notifications/i)).toBeInTheDocument();
    // v1.2 was deliberately written without any Ghost Mode mention. v1.4
    // announces the Ghost Mode updates, so scope the rule to the v1.2
    // section rather than the whole page.
    const v12Section = screen.getByRole('heading', { level: 3, name: 'cruush v1.2' }).closest('section');
    expect(v12Section).not.toBeNull();
    expect(v12Section?.textContent ?? '').not.toMatch(/Ghost Mode/i);
    expect(screen.getByText(/winged-heart Profile icon stays white until selected/i)).toBeInTheDocument();
    expect(screen.getByText(/flat chartreuse border treatment/i)).toBeInTheDocument();
    expect(screen.getByText(/Feed post duration is yours to choose, with Never as the default/i)).toBeInTheDocument();
    expect(screen.getByText(/Messages now default to Mutuals/i)).toBeInTheDocument();
  });

  it('keeps the fixed alpha bug button outside the changelog header slot', () => {
    render(
      <MemoryRouter>
        <Changelog />
        <AlphaBugButton enabled />
      </MemoryRouter>,
    );

    const slot = screen.getByTestId('changelog-bug-button-slot');
    const reportButton = screen.getByRole('button', { name: 'Report alpha bug' });

    expect(slot).not.toContainElement(reportButton);
    expect(reportButton).toHaveClass(
      'fixed',
      'right-[calc(0.75rem+env(safe-area-inset-right))]',
      'top-[calc(0.75rem+env(safe-area-inset-top))]',
      'z-[1500]',
    );
  });
});
