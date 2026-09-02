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
    expect(getSupportRequests).toHaveBeenCalledWith({
      status: 'open',
      category: 'all',
      limit: 25,
      offset: 0,
    });
    fireEvent.change(screen.getByPlaceholderText('Write the reply that should go to the reporter...'), {
      target: { value: 'We fixed the crash in the next build.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

    await waitFor(() => expect(replyToSupportRequest).toHaveBeenCalledWith('support-1', {
      message: 'We fixed the crash in the next build.',
    }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Reply sent.'));
  });

  it('filters age suspension appeals and renders their private evidence', async () => {
    getSupportRequests.mockImplementation(async (options) => {
      if (options.category !== 'suspension_appeal') {
        return {
          requests: [],
          page: { limit: 25, offset: 0, total: 0, hasMore: false },
        };
      }

      return {
        requests: [{
          id: 'appeal-1',
          requesterUserId: 'user-appeal',
          contactEmail: 'appeal@example.com',
          category: 'suspension_appeal',
          subject: 'Suspension appeal',
          message: 'Please review my age suspension.',
          source: 'auth',
          pageUrl: '/support?appeal=1',
          aiTriageStatus: 'pending',
          status: 'open',
          createdAt: '2026-09-01T06:00:00.000Z',
          updatedAt: '2026-09-01T06:00:00.000Z',
          recipientEmail: 'appeal@example.com',
          replyCount: 0,
          lastReplyAt: null,
          appealEvidence: [
            { type: 'id', previewUrl: '/api/admin/moderation/support-requests/appeal-1/appeal-evidence/id' },
            { type: 'selfie', previewUrl: '/api/admin/moderation/support-requests/appeal-1/appeal-evidence/selfie' },
          ],
        }],
        page: { limit: 25, offset: 0, total: 1, hasMore: false },
      };
    });

    renderDashboard();
    fireEvent.change(await screen.findByRole('combobox', { name: 'Request type filter' }), {
      target: { value: 'suspension_appeal' },
    });

    expect(await screen.findByRole('heading', { name: 'Suspension appeal' })).toBeInTheDocument();
    expect(screen.getByText('1 age suspension appeal')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Redacted ID showing date of birth and photo' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Appeal selfie' })).toBeInTheDocument();
    expect(getSupportRequests).toHaveBeenLastCalledWith({
      status: 'open',
      category: 'suspension_appeal',
      limit: 25,
      offset: 0,
    });
  });

  it('loads requests beyond the first 25 rows', async () => {
    getSupportRequests.mockResolvedValue({
      requests: [],
      page: { limit: 25, offset: 0, total: 26, hasMore: true },
    });

    renderDashboard();
    fireEvent.click(await screen.findByRole('button', { name: 'Next request page' }));

    await waitFor(() => expect(getSupportRequests).toHaveBeenLastCalledWith({
      status: 'open',
      category: 'all',
      limit: 25,
      offset: 25,
    }));
  });

  it('shows access denied state for non-moderators', async () => {
    const { ApiClientError } = await import('../lib/apiClient');
    getSupportRequests.mockRejectedValue(new ApiClientError(403, 'FORBIDDEN', 'Moderator access required.'));

    renderDashboard();

    expect(await screen.findByText('Moderator access is required to read bug reports.')).toBeInTheDocument();
    expect(screen.queryByText('No requests match this filter.')).not.toBeInTheDocument();
  });
});
