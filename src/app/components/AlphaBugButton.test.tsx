import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AlphaBugButton, { ALPHA_BUG_TIP_STORAGE_KEY } from './AlphaBugButton';
import { registerBugButtonSlot, resetBugButtonSlotsForTest } from '../lib/bugButtonSlot';
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

function renderAlphaBugButton(
  enabled = true,
  initialEntry = '/map?layer=nearby',
  requireContactEmail = false,
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AlphaBugButton enabled={enabled} requireContactEmail={requireContactEmail} />
    </MemoryRouter>
  );
}

describe('AlphaBugButton', () => {
  afterEach(() => {
    resetBugButtonSlotsForTest();
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: undefined });
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
    expect(reportButton).toHaveClass(
      'right-[calc(0.75rem+env(safe-area-inset-right))]',
      'top-[calc(0.75rem+env(safe-area-inset-top))]',
      'z-[1500]',
    );

    fireEvent.click(reportButton);
    expect(screen.getByRole('dialog', { name: 'Report alpha bug' })).toHaveAttribute('data-testid', 'alpha-bug-dialog');
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveClass('alpha-bug-overlay', '!z-[1602]');
    expect(screen.getByText('/map?layer=nearby')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('What broke?'), {
      target: { value: 'Map pins disappeared after I changed filters.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send bug report' }));

    await waitFor(() => expect(createSupportRequest).toHaveBeenCalledWith(expect.objectContaining({
      category: 'bug',
      subject: 'Alpha bug: /map?layer=nearby',
      message: 'Map pins disappeared after I changed filters.',
      source: 'unknown',
      pageUrl: '/map?layer=nearby',
    })));
    expect(await screen.findByText('Bug report sent')).toBeInTheDocument();
    expect(screen.getByText('Describe what broke and how support can reproduce it.')).toBeInTheDocument();
    expect(screen.queryByText(/attaches a screenshot/i)).not.toBeInTheDocument();
  });

  it('submits without requesting screen sharing', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const getDisplayMedia = vi.fn().mockRejectedValue(new Error('Screen sharing must not be requested.'));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia } });
    try {
      renderAlphaBugButton();
      fireEvent.click(screen.getByRole('button', { name: 'Report alpha bug' }));
      fireEvent.change(screen.getByLabelText('What broke?'), {
        target: { value: 'The report should not open a screen-sharing prompt.' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send bug report' }));
      expect(await screen.findByText('Bug report sent')).toBeInTheDocument();
      expect(getDisplayMedia).not.toHaveBeenCalled();
      expect(createSupportRequest.mock.calls[0][0]).not.toHaveProperty('screenshot');
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'mediaDevices', descriptor);
      else Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  });

  it('includes a required reply email in signed-out bug reports', async () => {
    window.history.replaceState({}, '', '/support?appeal=1');
    renderAlphaBugButton(true, '/support?appeal=1', true);

    fireEvent.click(screen.getByRole('button', { name: 'Report alpha bug' }));
    expect(screen.getByLabelText('Reply email')).toBeRequired();
    fireEvent.change(screen.getByLabelText('Reply email'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.change(screen.getByLabelText('What broke?'), {
      target: { value: 'The appeal upload opens the camera instead of my photo picker.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send bug report' }));

    await waitFor(() => expect(createSupportRequest).toHaveBeenCalledWith(expect.objectContaining({
      category: 'bug',
      subject: 'Alpha bug: /support?appeal=1',
      message: 'The appeal upload opens the camera instead of my photo picker.',
      contactEmail: 'person@example.com',
      source: 'unknown',
      pageUrl: '/support?appeal=1',
    })));
    expect(await screen.findByText('Bug report sent')).toBeInTheDocument();
  });

  it('records browser-provided device context with the page when no screenshot is available', async () => {
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: {
        mobile: true,
        platform: 'Android',
        getHighEntropyValues: vi.fn().mockResolvedValue({
          model: 'Pixel 9',
          platform: 'Android',
          platformVersion: '16',
          mobile: true,
        }),
      },
    });
    renderAlphaBugButton(true, '/map?layer=nearby');

    fireEvent.click(screen.getByRole('button', { name: 'Report alpha bug' }));
    fireEvent.change(screen.getByLabelText('What broke?'), {
      target: { value: 'The profile preview is too narrow at this window size.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send bug report' }));

    await waitFor(() => expect(createSupportRequest).toHaveBeenCalledWith(expect.objectContaining({
      pageUrl: '/map?layer=nearby',
      device: {
        model: 'Pixel 9',
        platform: 'Android',
        platformVersion: '16',
        mobile: true,
      },
    })));
  });

  it('keeps the same upper-right corner on chat routes', () => {
    window.history.replaceState({}, '', '/chat/group/group-1');
    renderAlphaBugButton(true, '/chat/group/group-1');

    expect(screen.getByRole('button', { name: 'Report alpha bug' })).toHaveClass(
      'right-[calc(0.75rem+env(safe-area-inset-right))]',
      'top-[calc(0.75rem+env(safe-area-inset-top))]',
      'z-[1500]',
    );
  });

  it.each(['/feed', '/profile/edit', '/admin/moderation'])('keeps the same upper-right corner on %s', (route) => {
    renderAlphaBugButton(true, route);

    expect(screen.getByRole('button', { name: 'Report alpha bug' })).toHaveClass(
      'right-[calc(0.75rem+env(safe-area-inset-right))]',
      'top-[calc(0.75rem+env(safe-area-inset-top))]',
      'z-[1500]',
    );
  });

  it('docks into a registered header slot so it shares the header line', () => {
    // Design rule: the title, back button, header actions and the bug button
    // always share one line. A screen that registers a slot gets the button
    // docked inside it, never floating over the header on its own row.
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    registerBugButtonSlot(slot);

    renderAlphaBugButton();

    const reportButton = screen.getByRole('button', { name: 'Report alpha bug' });
    expect(slot).toContainElement(reportButton);
    expect(reportButton).toHaveClass('h-full', 'w-full');
    expect(reportButton).not.toHaveClass('fixed');
  });

  it('refreshes popup placement after an entrance animation without a layout resize', () => {
    const surface = document.createElement('div');
    surface.setAttribute('role', 'dialog');
    const slot = document.createElement('div');
    surface.appendChild(slot);
    document.body.appendChild(surface);
    Object.defineProperty(slot, 'offsetWidth', { value: 40 });
    Object.defineProperty(slot, 'offsetHeight', { value: 40 });
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 500, 400));
    let opening = true;
    vi.spyOn(slot, 'getBoundingClientRect').mockImplementation(() => opening
      ? new DOMRect(550, 125, 38, 38)
      : new DOMRect(548, 112, 40, 40));
    registerBugButtonSlot(slot);
    renderAlphaBugButton();
    const button = screen.getByRole('button', { name: 'Report alpha bug' });
    const openingPlacement = button.style.transform;
    expect(openingPlacement).not.toBe('');

    opening = false;
    fireEvent.animationEnd(surface);

    expect(button.style.transform).not.toBe(openingPlacement);
    surface.remove();
  });

  it('leaves a slot whose screen has gone and floats again, so no page is without it', async () => {
    // The map registers a slot; a full page that unmounts the map does not.
    // The button used to stay portaled into the dead node and vanish from
    // every such page.
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    registerBugButtonSlot(slot);

    renderAlphaBugButton();
    expect(slot).toContainElement(screen.getByRole('button', { name: 'Report alpha bug' }));

    // What React does as the screen tears down: the ref is handed null, then
    // the node leaves the document.
    registerBugButtonSlot(null);
    slot.remove();
    await act(async () => {
      await Promise.resolve();
    });

    const reportButton = await screen.findByRole('button', { name: 'Report alpha bug' });
    expect(document.body).toContainElement(reportButton);
    expect(reportButton).toHaveClass('fixed');
  });

  it('falls back to the fixed upper-right corner when no slot is registered', () => {
    renderAlphaBugButton();

    const reportButton = screen.getByRole('button', { name: 'Report alpha bug' });
    expect(reportButton).toHaveClass(
      'fixed',
      'right-[calc(0.75rem+env(safe-area-inset-right))]',
      'top-[calc(0.75rem+env(safe-area-inset-top))]',
    );
  });

  it('remains available on the signed-out support flow', () => {
    renderAlphaBugButton(true, '/support', true);

    expect(screen.getByTestId('alpha-bug-button')).toBeVisible();
    expect(screen.getByTestId('alpha-bug-button')).not.toHaveAttribute('aria-hidden');
    expect(screen.getByTestId('alpha-bug-button')).not.toHaveAttribute('tabindex', '-1');
  });

  it('keeps the first-run map tip below the map controls', async () => {
    clearPersistentNoticeFlag(ALPHA_BUG_TIP_STORAGE_KEY);
    getUserNoticeDismissal.mockResolvedValueOnce({ dismissed: false, dismissedAt: null });

    renderAlphaBugButton();

    const tipCopy = await screen.findByText('Alpha test: tap the bug icon to report anything broken.');
    const tip = tipCopy.closest('div');
    expect(tip).toHaveClass(
      'left-4',
      'top-[calc(20.125rem+env(safe-area-inset-top))]',
      'sm:top-[calc(9.25rem+env(safe-area-inset-top))]',
    );
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
