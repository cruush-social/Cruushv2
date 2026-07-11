import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changeModeratedAccountStatus,
  getModerationReport,
  getModerationReports,
  moderateReport,
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
});
