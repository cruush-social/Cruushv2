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

  it('shows v1.2 before the preserved v1.1 history', () => {
    render(
      <MemoryRouter>
        <Changelog />
      </MemoryRouter>,
    );

    expect(screen.getByText('v1.2')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'cruush v1.2',
      'cruush v1.1',
    ]);
    expect(screen.getByText(/Ping briefly marks your heart as active.*local feed.*saved post duration/i)).toBeInTheDocument();
    expect(screen.getByText(/interactive tutorial now covers installing cruush/i)).toBeInTheDocument();
    expect(screen.getByText(/map now stays inside the NYC beta area/i)).toBeInTheDocument();
    expect(screen.getByText(/shows a live countdown on disappearing messages you send/i)).toBeInTheDocument();
    expect(screen.getByText(/Quick-access photos upload more reliably/i)).toBeInTheDocument();
    expect(screen.getByText(/Ghost Mode remains available as a static privacy mode/i)).toBeInTheDocument();
    expect(screen.getByText(/winged-heart Profile icon stays white until selected/i)).toBeInTheDocument();
    expect(screen.getByText(/bright chartreuse border/i)).toBeInTheDocument();
    expect(screen.getByText(/Messages now default to Mutuals/i)).toBeInTheDocument();
  });

  it('places the alpha bug button in the changelog header slot', () => {
    render(
      <MemoryRouter>
        <Changelog />
        <AlphaBugButton enabled />
      </MemoryRouter>,
    );

    const slot = screen.getByTestId('changelog-bug-button-slot');
    const reportButton = screen.getByRole('button', { name: 'Report alpha bug' });

    expect(slot).toContainElement(reportButton);
    expect(reportButton).toHaveClass('size-8');
    expect(reportButton).not.toHaveClass('fixed', 'z-20');
  });
});
