import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AlphaBugButton, { ALPHA_BUG_TIP_STORAGE_KEY } from './AlphaBugButton';
import { registerBugButtonSlot } from '../lib/bugButtonSlot';
import { clearPersistentNoticeFlag } from '../lib/persistentNotice';

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
  afterEach(() => {
    registerBugButtonSlot(null);
  });

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
    expect(reportButton).toHaveClass('left-4', 'top-[calc(4rem+env(safe-area-inset-top))]');
    expect(reportButton).toHaveClass('z-20');
    expect(reportButton).not.toHaveClass('right-4', 'top-[calc(0.75rem+env(safe-area-inset-top))]');

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
      'left-4',
      'bottom-[calc(19rem+env(safe-area-inset-bottom))]',
      'z-20',
    );
  });

  it('uses a registered slot instead of floating over page controls', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    registerBugButtonSlot(slot);

    renderAlphaBugButton();

    const reportButton = screen.getByRole('button', { name: 'Report alpha bug' });
    expect(slot).toContainElement(reportButton);
    expect(reportButton).toHaveClass('size-8', 'sm:size-9');
    expect(reportButton.querySelector('svg')).toHaveClass('h-5', 'w-5');
    expect(reportButton).not.toHaveClass('fixed', 'z-20');
  });

  it('uses the larger control only when the map top bar requests it', () => {
    const slot = document.createElement('div');
    slot.dataset.bugButtonSize = 'large';
    document.body.appendChild(slot);
    registerBugButtonSlot(slot);

    renderAlphaBugButton();

    const reportButton = screen.getByRole('button', { name: 'Report alpha bug' });
    expect(slot).toContainElement(reportButton);
    expect(reportButton).toHaveClass('size-9', 'sm:size-10', 'lg:size-11');
    expect(reportButton.querySelector('svg')).toHaveClass(
      'h-[1.375rem]',
      'w-[1.375rem]',
      'sm:h-6',
      'sm:w-6',
      'lg:h-7',
      'lg:w-7',
    );
    expect(reportButton).not.toHaveClass('fixed', 'z-20');
  });

  it('moves the first-run map tip below the map controls and Ping button', async () => {
    clearPersistentNoticeFlag(ALPHA_BUG_TIP_STORAGE_KEY);
    getUserNoticeDismissal.mockResolvedValueOnce({ dismissed: false, dismissedAt: null });

    renderAlphaBugButton();

    const tipCopy = await screen.findByText('Alpha test: tap the bug icon to report anything broken.');
    const tip = tipCopy.closest('div');
    expect(tip).toHaveClass(
      'top-[calc(19.5rem+env(safe-area-inset-top))]',
      'sm:top-[calc(9.25rem+env(safe-area-inset-top))]',
    );
  });

  it('moves the first-run Activity tip above the bottom navigation', async () => {
    clearPersistentNoticeFlag(ALPHA_BUG_TIP_STORAGE_KEY);
    getUserNoticeDismissal.mockResolvedValueOnce({ dismissed: false, dismissedAt: null });

    window.history.replaceState({}, '', '/cruush');
    renderAlphaBugButton(true, '/cruush');

    const tipCopy = await screen.findByText('Alpha test: tap the bug icon to report anything broken.');
    const tip = tipCopy.closest('div');
    expect(tip).toHaveClass('bottom-[calc(5.5rem+env(safe-area-inset-bottom))]');
    expect(tip).not.toHaveClass('top-[calc(7.25rem+env(safe-area-inset-top))]');
  });

  it('shows an actionable error code when sending fails', async () => {
    createSupportRequest.mockRejectedValueOnce(new Error('Support service unavailable.'));
    renderAlphaBugButton();

    fireEvent.click(screen.getByRole('button', { name: 'Report alpha bug' }));
    fireEvent.change(screen.getByLabelText('What broke?'), {
      target: { value: 'The feed menu covers the bug report button.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send bug report' }));

    const reportError = await screen.findByTestId('bug-report-error');
    expect(reportError).toHaveTextContent('Error code: BUG_REPORT_SUBMIT_FAILED');
  });
});
