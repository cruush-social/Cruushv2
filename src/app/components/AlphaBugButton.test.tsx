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
    const dialog = screen.getByRole('dialog', { name: 'Report beta bug' });
    expect(dialog).toHaveAttribute('data-testid', 'alpha-bug-dialog');
    expect(dialog).toHaveAttribute('data-dialog-framing', 'floating');
    expect(dialog).toHaveClass('content-start', 'p-4', 'sm:p-6');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('left-1');
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveClass('alpha-bug-overlay', '!z-[1602]');
    expect(screen.queryByText('/map?layer=nearby')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('What broke?'), {
      target: { value: 'Map pins disappeared after I changed filters.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send bug report' }));

    await waitFor(() => expect(createSupportRequest).toHaveBeenCalledWith(expect.objectContaining({
      category: 'bug',
      subject: 'Alpha bug: /map',
      message: 'Map pins disappeared after I changed filters.',
      source: 'unknown',
      pageUrl: '/map',
    })));
    expect(await screen.findByText('Bug report sent')).toBeInTheDocument();
    expect(screen.queryByText('Describe what broke and how support can reproduce it.')).not.toBeInTheDocument();
    expect(screen.queryByText(/attaches a screenshot/i)).not.toBeInTheDocument();
  });

  it('submits the router page without displaying it when the browser location has not caught up', async () => {
    window.history.replaceState({}, '', '/');
    renderAlphaBugButton(true, '/privacy/dl-mode?from=settings');

    fireEvent.click(screen.getByRole('button', { name: 'Report alpha bug' }));
    expect(screen.queryByText('/privacy/dl-mode?from=settings')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('What broke?'), {
      target: { value: 'The privacy setting did not save after I returned.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send bug report' }));
    await waitFor(() => expect(createSupportRequest).toHaveBeenCalledWith(expect.objectContaining({
      pageUrl: '/privacy/dl-mode',
    })));
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
      subject: 'Alpha bug: /support',
      message: 'The appeal upload opens the camera instead of my photo picker.',
      contactEmail: 'person@example.com',
      source: 'unknown',
      pageUrl: '/support',
    })));
    expect(await screen.findByText('Bug report sent')).toBeInTheDocument();
  });

  it('does not read or submit device context without explicit opt-in', async () => {
    const getHighEntropyValues = vi.fn().mockResolvedValue({
      platform: 'Android',
      mobile: true,
    });
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: {
        mobile: true,
        platform: 'Android',
        getHighEntropyValues,
      },
    });
    renderAlphaBugButton(true, '/map?layer=nearby');

    fireEvent.click(screen.getByRole('button', { name: 'Report alpha bug' }));
    expect(screen.getByRole('checkbox', { name: 'Share device and browser details' })).not.toBeChecked();
    expect(getHighEntropyValues).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('What broke?'), {
      target: { value: 'The profile preview is too narrow at this window size.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send bug report' }));

    await waitFor(() => expect(createSupportRequest).toHaveBeenCalledTimes(1));
    expect(getHighEntropyValues).not.toHaveBeenCalled();
    expect(createSupportRequest.mock.calls[0][0]).not.toHaveProperty('device');
  });

  it('records browser-provided device context after explicit opt-in', async () => {
    const getHighEntropyValues = vi.fn().mockResolvedValue({
      platform: 'Android',
      mobile: true,
    });
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: {
        mobile: true,
        platform: 'Android',
        getHighEntropyValues,
      },
    });
    renderAlphaBugButton(true, '/map?layer=nearby');

    fireEvent.click(screen.getByRole('button', { name: 'Report alpha bug' }));
    expect(getHighEntropyValues).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Share device and browser details' }));
    expect(screen.getByText('Sharing device and browser details helps us diagnose the problem.')).toBeInTheDocument();
    expect(screen.queryByText('Device:')).not.toBeInTheDocument();
    expect(screen.queryByText('Android')).not.toBeInTheDocument();
    expect(getHighEntropyValues).toHaveBeenCalledOnce();
    expect(screen.queryByText('/map?layer=nearby')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('What broke?'), {
      target: { value: 'The profile preview is too narrow at this window size.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send bug report' }));

    await waitFor(() => expect(createSupportRequest).toHaveBeenCalledWith(expect.objectContaining({
      pageUrl: '/map',
      device: {
        platform: 'Android',
        mobile: true,
      },
    })));
  });

  it('discloses and submits account-email linkage only when selected', async () => {
    renderAlphaBugButton(true, '/settings');

    fireEvent.click(screen.getByRole('button', { name: 'Report alpha bug' }));
    expect(screen.getByText('Allow support to use my account email for follow-up. It is deleted after 30 days.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow email follow-up' }));
    fireEvent.change(screen.getByLabelText('What broke?'), {
      target: { value: 'The profile preview is too narrow at this window size.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send bug report' }));

    await waitFor(() => expect(createSupportRequest).toHaveBeenCalledWith(expect.objectContaining({
      linkAccountEmail: true,
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

  it.each([375, 1280])('uses the popup-local reporter instead of duplicating the map reporter at %ipx', (width) => {
    const widthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    const mapSlot = document.createElement('div');
    mapSlot.dataset.testid = 'map-bug-button-slot';
    const popupSlot = document.createElement('div');
    document.body.appendChild(mapSlot);
    document.body.appendChild(popupSlot);
    registerBugButtonSlot(mapSlot);
    registerBugButtonSlot(popupSlot);

    try {
      renderAlphaBugButton(true, '/map');

      const reportButtons = screen.getAllByRole('button', { name: 'Report alpha bug' });
      expect(reportButtons).toHaveLength(1);
      expect(popupSlot).toContainElement(reportButtons[0]);
      expect(reportButtons[0]).toHaveClass('h-full', 'w-full');
      expect(reportButtons[0]).not.toHaveClass('fixed');
    } finally {
      mapSlot.remove();
      popupSlot.remove();
      if (widthDescriptor) Object.defineProperty(window, 'innerWidth', widthDescriptor);
    }
  });

  it('stays docked in a popup slot across its entrance animation, with no measured offset', () => {
    // 940de53 pushed the docked button around with an inline transform measured
    // off the slot, which then had to be re-measured on animationend. bbcc5fa
    // reverted that to the production implementation: the button is a real
    // child of the slot at h-full/w-full, so it follows the slot's own box and
    // must carry no measured offset, before or after the popup animates in.
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
    expect(slot).toContainElement(button);
    expect(button).toHaveClass('h-full', 'w-full');
    expect(button).not.toHaveClass('fixed');
    expect(button.style.transform).toBe('');

    opening = false;
    fireEvent.animationEnd(surface);

    expect(slot).toContainElement(button);
    expect(button).toHaveClass('h-full', 'w-full');
    expect(button).not.toHaveClass('fixed');
    expect(button.style.transform).toBe('');
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

    const tipCopy = await screen.findByText('NYC open beta: tap the bug icon to report anything broken.');
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
