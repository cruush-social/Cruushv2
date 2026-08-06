import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AlphaBugButton from './AlphaBugButton';
import { registerBugButtonSlot } from '../lib/bugButtonSlot';

const { createSupportRequest } = vi.hoisted(() => ({
  createSupportRequest: vi.fn(),
}));

const { dismissUserNotice, getUserNoticeDismissal, markNoticeDismissed, resolveNoticeDismissal } = vi.hoisted(() => ({
  dismissUserNotice: vi.fn(),
  getUserNoticeDismissal: vi.fn(),
  markNoticeDismissed: vi.fn(),
  resolveNoticeDismissal: vi.fn(),
}));

vi.mock('../lib/supportApi', () => ({
  createSupportRequest,
}));

vi.mock('../lib/userNoticesApi', () => ({
  dismissUserNotice,
  getUserNoticeDismissal,
  markNoticeDismissed,
  resolveNoticeDismissal,
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
    markNoticeDismissed.mockReset();
    resolveNoticeDismissal.mockReset();
    resolveNoticeDismissal.mockResolvedValue({ dismissed: true, offline: false });
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
    // No nav is rendered here, so this is the signed-out fallback: the empty top-right
    // corner. Everywhere the nav exists the button docks into it instead.
    expect(reportButton).toHaveClass('right-4', 'top-[calc(0.75rem+env(safe-area-inset-top))]');
    expect(reportButton).toHaveClass('fixed');
    expect(reportButton).not.toHaveClass('left-4');

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

  // Regression: placement used to be computed per route, which is how it ended up over
  // the chat composer, the feed post controls and the profile photo tiles. There is now
  // one placement - docked in the nav - and one corner fallback for routes without a nav.
  it('uses one placement on every route instead of per-route offsets', () => {
    window.history.replaceState({}, '', '/chat/group/group-1');
    const { unmount } = renderAlphaBugButton(true, '/chat/group/group-1');
    const chatClassName = screen.getByRole('button', { name: 'Report alpha bug' }).className;
    unmount();

    window.history.replaceState({}, '', '/map?layer=nearby');
    renderAlphaBugButton(true, '/map?layer=nearby');

    expect(screen.getByRole('button', { name: 'Report alpha bug' }).className).toBe(chatClassName);
    expect(chatClassName).not.toContain('19rem');
    expect(chatClassName).not.toContain('6.75rem');
  });

  it('docks into a registered slot instead of floating over page content', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    registerBugButtonSlot(slot);

    renderAlphaBugButton();

    const reportButton = screen.getByRole('button', { name: 'Report alpha bug' });
    expect(slot).toContainElement(reportButton);
    expect(reportButton).toHaveClass('h-11', 'w-11', 'shrink-0', 'rounded-full');
    expect(reportButton).not.toHaveClass('fixed', 'z-20');
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

// Regression: the coach mark used to mark itself seen the moment it rendered, and it
// rendered on the verify-email and reset-password screens too - so a user could burn
// their one showing on a screen they barely looked at, before reaching the app.
describe('AlphaBugButton coach mark', () => {
  const TIP_TEXT = 'Alpha test: tap the bug icon to report anything broken.';

  function dock() {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    registerBugButtonSlot(slot);
    return slot;
  }

  beforeEach(() => {
    registerBugButtonSlot(null);
    createSupportRequest.mockReset();
    markNoticeDismissed.mockReset();
    resolveNoticeDismissal.mockReset();
    resolveNoticeDismissal.mockResolvedValue({ dismissed: false, offline: false });
  });

  afterEach(() => {
    registerBugButtonSlot(null);
  });

  it('does not show or spend itself on screens without the nav dock', async () => {
    renderAlphaBugButton();

    await waitFor(() => expect(screen.getByTestId('alpha-bug-button')).toBeInTheDocument());
    expect(screen.queryByText(TIP_TEXT)).not.toBeInTheDocument();
    expect(resolveNoticeDismissal).not.toHaveBeenCalled();
    expect(markNoticeDismissed).not.toHaveBeenCalled();
  });

  it('shows once docked without marking itself seen', async () => {
    dock();
    renderAlphaBugButton();

    expect(await screen.findByText(TIP_TEXT)).toBeInTheDocument();
    expect(markNoticeDismissed).not.toHaveBeenCalled();
  });

  it('records the dismissal only when the user dismisses it', async () => {
    dock();
    renderAlphaBugButton();

    fireEvent.click(await screen.findByRole('button', { name: 'Got it' }));

    expect(markNoticeDismissed).toHaveBeenCalledWith('cruush:alpha-bug-tip-seen', { offline: false });
    expect(screen.queryByText(TIP_TEXT)).not.toBeInTheDocument();
  });

  it('shows when the notices API is unreachable and does not write a server dismissal', async () => {
    resolveNoticeDismissal.mockResolvedValue({ dismissed: false, offline: true });
    dock();
    renderAlphaBugButton();

    fireEvent.click(await screen.findByRole('button', { name: 'Got it' }));

    expect(markNoticeDismissed).toHaveBeenCalledWith('cruush:alpha-bug-tip-seen', { offline: true });
  });

  it('stays hidden when it has already been dismissed', async () => {
    resolveNoticeDismissal.mockResolvedValue({ dismissed: true, offline: false });
    dock();
    renderAlphaBugButton();

    await waitFor(() => expect(resolveNoticeDismissal).toHaveBeenCalled());
    expect(screen.queryByText(TIP_TEXT)).not.toBeInTheDocument();
  });
});
