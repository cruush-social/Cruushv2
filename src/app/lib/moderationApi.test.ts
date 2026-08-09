import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changeModeratedAccountStatus,
  decideContentReview,
  getAdminNotifications,
  getModerationSystemErrors,
  getModerationQueue,
  getModerationQueueItem,
  getModerationReport,
  getModerationReports,
  getSupportRequests,
  moderateReport,
  removeReportedContent,
  updateSupportRequestStatus,
} from './moderationApi';

function apiResponse(data: unknown) {
  return {
    ok: true,
    text: vi.fn().mockResolvedValue(JSON.stringify({ data })),
  } as unknown as Response;
}

describe('moderationApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(apiResponse({ reports: [] })));
  });

  it('loads the report queue with pagination and optional status', async () => {
    await getModerationReports({ status: 'open', limit: 25, offset: 50 });

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/moderation/reports?status=open&limit=25&offset=50',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('loads an encoded report detail path', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiResponse({ report: { id: 'report/1' } }));

    await getModerationReport('report/1');

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/moderation/reports/report%2F1',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('resolves or dismisses a report with the backend payload', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiResponse({
      report: { id: 'report-1', status: 'resolved', updatedAt: '2026-07-11T12:00:00.000Z' },
      moderationAction: { id: 'action-1', createdAt: '2026-07-11T12:00:01.000Z' },
    }));

    await moderateReport('report-1', {
      status: 'resolved',
      reasonCode: 'reviewed_valid_report',
      notes: '  Reviewed and actioned.  ',
    });

    expect(fetch).toHaveBeenCalledWith('/api/admin/moderation/reports/report-1', expect.objectContaining({
      method: 'PATCH',
      credentials: 'include',
      body: JSON.stringify({
        status: 'resolved',
        reasonCode: 'reviewed_valid_report',
        notes: 'Reviewed and actioned.',
      }),
    }));
  });

  it('changes account status and links the audit action to a report', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiResponse({
      user: { id: 'user-2', accountStatus: 'suspended', accountStatusUpdatedAt: '2026-07-11T12:00:00.000Z' },
      moderationAction: { id: 'action-2', createdAt: '2026-07-11T12:00:01.000Z' },
    }));

    await changeModeratedAccountStatus('user/2', {
      status: 'suspended',
      reasonCode: 'abuse_confirmed',
      notes: '  Credible safety threat.  ',
      reportId: 'report-1',
    });

    expect(fetch).toHaveBeenCalledWith('/api/admin/moderation/users/user%2F2/status', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        status: 'suspended',
        reasonCode: 'abuse_confirmed',
        notes: 'Credible safety threat.',
        reportId: 'report-1',
      }),
    }));
  });

  it('loads the unified queue with server-side filters and pagination', async () => {
    await getModerationQueue({ source: 'automod', state: 'closed', limit: 25, offset: 75 });

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/moderation/queue?source=automod&state=closed&limit=25&offset=75',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('loads an encoded unified queue detail path', async () => {
    await getModerationQueueItem('review', 'review/1');

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/moderation/queue/review/review%2F1',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('loads the admin notification dashboard with filters and pagination', async () => {
    await getAdminNotifications({ filter: 'unread', limit: 25, offset: 50 });

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/moderation/notifications?filter=unread&limit=25&offset=50',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('loads unresolved moderation system errors for the dedicated moderator view', async () => {
    await getModerationSystemErrors({ limit: 25, offset: 50 });

    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/moderation/system-errors?limit=25&offset=50',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('loads and updates the support request email dashboard', async () => {
    await getSupportRequests({ status: 'in_progress', limit: 25, offset: 75 });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/admin/moderation/support-requests?status=in_progress&limit=25&offset=75',
      expect.objectContaining({ credentials: 'include' }),
    );

    await updateSupportRequestStatus('support/1', 'closed');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/admin/moderation/support-requests/support%2F1', expect.objectContaining({
      method: 'PATCH',
      credentials: 'include',
      body: JSON.stringify({ status: 'closed' }),
    }));
  });

  it('decides an automated review and removes reported content with audit notes', async () => {
    await decideContentReview('review-1', {
      action: 'reject',
      reasonCode: 'manual_review_rejected',
      notes: '  Confirmed.  ',
    });
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/admin/moderation/reviews/review-1/decision', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'reject', reasonCode: 'manual_review_rejected', notes: 'Confirmed.' }),
    }));

    await removeReportedContent('report-1', {
      reasonCode: 'reported_content_removed',
      notes: '  Removed after review.  ',
    });
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/admin/moderation/reports/report-1/remove-content', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ reasonCode: 'reported_content_removed', notes: 'Removed after review.' }),
    }));
  });
});
