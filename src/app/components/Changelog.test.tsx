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
      'cruush v1.7',
      'cruush v1.6',
      'cruush v1.5',
      'cruush v1.4',
      'cruush v1.2',
      'cruush v1.1',
    ]);
    const v15Section = screen.getByRole('heading', { level: 3, name: 'cruush v1.5' }).closest('section');
    expect(v15Section).not.toBeNull();
    expect(v15Section?.textContent ?? '').toMatch(/full 4:5 profile photos/i);
    expect(v15Section?.textContent ?? '').toMatch(/Seeking filters now stay selected/i);
    expect(v15Section?.textContent ?? '').toMatch(/relevant person’s map pin/i);
    const v14Section = screen.getByRole('heading', { level: 3, name: 'cruush v1.4' }).closest('section');
    expect(v14Section).not.toBeNull();
    expect(v14Section?.textContent ?? '').toMatch(/Ghost Mode has clearer controls and status feedback/i);
    expect(v14Section?.textContent ?? '').toMatch(/same detailed Seeking filters as the map/i);
    expect(v14Section?.textContent ?? '').toMatch(/free day of cruush\+ when they enable 2FA/i);
    expect(screen.getByText(/Pulse briefly activates your map heart.*local feed.*saved post duration/i)).toBeInTheDocument();
    expect(screen.getByText(/tutorial points at the real buttons without covering them/i)).toBeInTheDocument();
    // v1.2 was deliberately written without any Ghost Mode mention. v1.4
    // announces the Ghost Mode updates, so scope the rule to the v1.2
    // section rather than the whole page.
    const v12Section = screen.getByRole('heading', { level: 3, name: 'cruush v1.2' }).closest('section');
    expect(v12Section).not.toBeNull();
    expect(v12Section?.textContent ?? '').not.toMatch(/Ghost Mode/i);
    expect(screen.getByText(/winged-heart Profile icon stays white until selected/i)).toBeInTheDocument();
    expect(screen.getByText(/Popup notifications now have a green border/i)).toBeInTheDocument();
    expect(screen.getByText(/Feed post duration is yours to choose, with Never as the default/i)).toBeInTheDocument();
    expect(screen.getByText(/Messages now default to Mutuals/i)).toBeInTheDocument();
  });

  it('docks the alpha bug button into the changelog header slot', () => {
    // Design rule: back button, title, header actions and the bug button all
    // share one line, so a registered slot takes the button.
    render(
      <MemoryRouter>
        <Changelog />
        <AlphaBugButton enabled />
      </MemoryRouter>,
    );

    const slot = screen.getByTestId('changelog-bug-button-slot');
    const reportButton = screen.getByRole('button', { name: 'Report alpha bug' });

    expect(slot).toContainElement(reportButton);
    expect(reportButton).not.toHaveClass('fixed');
  });
});
