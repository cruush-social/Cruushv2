import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AlphaBugButton from './AlphaBugButton';

const { createSupportRequest } = vi.hoisted(() => ({
  createSupportRequest: vi.fn(),
}));

const { dismissUserNotice, getUserNoticeDismissal } = vi.hoisted(() => ({
  dismissUserNotice: vi.fn(),
  getUserNoticeDismissal: vi.fn(),
}));

vi.mock('../lib/supportApi', () => ({
  createSupportRequest,
}));

vi.mock('../lib/userNoticesApi', () => ({
  dismissUserNotice,
  getUserNoticeDismissal,
}));

function renderAlphaBugButton(enabled = true, initialEntry = '/map?layer=nearby') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AlphaBugButton enabled={enabled} />
    </MemoryRouter>
  );
}

describe('AlphaBugButton', () => {
  beforeEach(() => {
    createSupportRequest.mockReset();
    dismissUserNotice.mockReset();
    getUserNoticeDismissal.mockReset();
    createSupportRequest.mockResolvedValue({
      id: 'support-1',
      status: 'open',
      aiTriageStatus: 'pending',
      createdAt: '2026-07-28T12:00:00.000Z',
    });
    dismissUserNotice.mockResolvedValue({ dismissed: true, dismissedAt: '2026-07-31T12:00:00.000Z' });
    getUserNoticeDismissal.mockResolvedValue({ dismissed: true, dismissedAt: '2026-07-31T12:00:00.000Z' });
    window.history.replaceState({}, '', '/map?layer=nearby');
  });

  it('stays hidden when alpha reporting is not enabled', () => {
    renderAlphaBugButton(false);

    expect(screen.queryByRole('button', { name: 'Report alpha bug' })).not.toBeInTheDocument();
  });

  it('submits a fast bug report with page context', async () => {
    renderAlphaBugButton();

    const reportButton = screen.getByRole('button', { name: 'Report alpha bug' });
    expect(reportButton).toHaveClass('right-4', 'bottom-[calc(6.75rem+env(safe-area-inset-bottom))]');
    expect(reportButton).toHaveClass('z-30');
    expect(reportButton).not.toHaveClass('left-[calc(50%-5.5rem)]', 'top-[calc(5.85rem+env(safe-area-inset-top))]');

    fireEvent.click(reportButton);
    expect(screen.getByText('/map?layer=nearby')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('What broke?'), {
      target: { value: 'Map pins disappeared after I changed filters.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send bug report' }));

    await waitFor(() => expect(createSupportRequest).toHaveBeenCalledWith({
      category: 'bug',
      subject: 'Alpha bug: /map?layer=nearby',
      message: 'Map pins disappeared after I changed filters.',
      source: 'unknown',
      pageUrl: '/map?layer=nearby',
    }));
    expect(await screen.findByText('Bug report sent')).toBeInTheDocument();
    expect(screen.getByText('This report includes the current page and attaches a screenshot when your browser allows it.')).toBeInTheDocument();
  });

  it('floats above the fixed chat composer on chat routes', () => {
    window.history.replaceState({}, '', '/chat/group/group-1');
    renderAlphaBugButton(true, '/chat/group/group-1');

    expect(screen.getByRole('button', { name: 'Report alpha bug' })).toHaveClass(
      'right-4',
      'bottom-[calc(19rem+env(safe-area-inset-bottom))]',
      'z-30',
    );
  });
});
