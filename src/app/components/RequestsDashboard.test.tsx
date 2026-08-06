import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RequestsDashboard from './RequestsDashboard';

const { getSupportRequests, replyToSupportRequest } = vi.hoisted(() => ({
  getSupportRequests: vi.fn(),
  replyToSupportRequest: vi.fn(),
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../lib/supportApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/supportApi')>('../lib/supportApi');
  return {
    ...actual,
    getSupportRequests,
    replyToSupportRequest,
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/requests']}>
      <Routes>
        <Route path="/requests" element={<RequestsDashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequestsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupportRequests.mockResolvedValue({
      requests: [{
        id: 'support-1',
        requesterUserId: 'user-1',
        contactEmail: 'reporter@example.com',
        category: 'bug',
        subject: 'Map crash',
        message: 'The map crashes after sign in.',
        source: 'settings',
        pageUrl: '/map',
        aiTriageStatus: 'pending',
        status: 'open',
        createdAt: '2026-07-07T12:20:00.000Z',
        updatedAt: '2026-07-07T12:20:00.000Z',
        recipientEmail: 'reporter@example.com',
        replyCount: 0,
        lastReplyAt: null,
      }],
      page: { limit: 25, offset: 0, total: 1, hasMore: false },
    });
    replyToSupportRequest.mockResolvedValue({
      reply: {
        id: 'reply-1',
        createdAt: '2026-07-07T12:30:00.000Z',
        deliveryStatus: 'sent',
        recipientEmail: 'reporter@example.com',
      },
    });
  });

  it('loads bug reports and sends a reply', async () => {
    renderDashboard();

    expect(await screen.findByText('Map crash')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Write the reply that should go to the reporter...'), {
      target: { value: 'We fixed the crash in the next build.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

    await waitFor(() => expect(replyToSupportRequest).toHaveBeenCalledWith('support-1', {
      message: 'We fixed the crash in the next build.',
    }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Reply sent.'));
  });

  it('shows access denied state for non-moderators', async () => {
    const { ApiClientError } = await import('../lib/apiClient');
    getSupportRequests.mockRejectedValue(new ApiClientError(403, 'FORBIDDEN', 'Moderator access required.'));

    renderDashboard();

    expect(await screen.findByText('Moderator access is required to read bug reports.')).toBeInTheDocument();
  });
});
