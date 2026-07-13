import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../lib/apiClient';
import ModeratorReview from './ModeratorReview';

const {
  changeModeratedAccountStatus,
  getModerationReport,
  getModerationReports,
  moderateReport,
} = vi.hoisted(() => ({
  changeModeratedAccountStatus: vi.fn(),
  getModerationReport: vi.fn(),
  getModerationReports: vi.fn(),
  moderateReport: vi.fn(),
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../lib/moderationApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/moderationApi')>('../lib/moderationApi');
  return {
    ...actual,
    changeModeratedAccountStatus,
    getModerationReport,
    getModerationReports,
    moderateReport,
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

const reportFixture = {
  id: 'report-1',
  reporter: {
    userId: 'user-1',
    displayName: 'River',
  },
  target: {
    type: 'post' as const,
    userId: 'user-2',
    displayName: 'Jordan',
    conversationId: null,
    messageId: null,
    postId: 'post-1',
    mediaObjectId: null,
    profilePhotoUrl: null,
  },
  reason: 'harassment',
  details: 'Threatening language in the post.',
  status: 'open' as const,
  createdAt: '2026-07-11T10:00:00.000Z',
  updatedAt: '2026-07-11T10:00:00.000Z',
};

function renderModeratorReview() {
  return render(
    <MemoryRouter initialEntries={['/admin/moderation']}>
      <Routes>
        <Route path="/admin/moderation" element={<ModeratorReview />} />
        <Route path="/map" element={<div>Map route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openReportDetail() {
  fireEvent.click(await screen.findByRole('button', { name: 'Open report report-1' }));
  await waitFor(() => expect(getModerationReport).toHaveBeenCalledWith('report-1'));
  expect(await screen.findByText('Threatening language in the post.')).toBeInTheDocument();
}

describe('ModeratorReview', () => {
  beforeEach(() => {
    changeModeratedAccountStatus.mockReset();
    getModerationReport.mockReset();
    getModerationReports.mockReset();
    moderateReport.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();

    getModerationReports.mockResolvedValue({ reports: [reportFixture] });
    getModerationReport.mockResolvedValue({ report: reportFixture });
    moderateReport.mockResolvedValue({
      report: {
        id: 'report-1',
        status: 'resolved',
        updatedAt: '2026-07-11T11:00:00.000Z',
      },
      moderationAction: {
        id: 'action-report',
        createdAt: '2026-07-11T11:00:01.000Z',
      },
    });
    changeModeratedAccountStatus.mockResolvedValue({
      user: {
        id: 'user-2',
        accountStatus: 'under_review',
        accountStatusUpdatedAt: '2026-07-11T11:05:00.000Z',
      },
      moderationAction: {
        id: 'action-account',
        createdAt: '2026-07-11T11:05:01.000Z',
      },
    });
  });

  it('shows the authorization loading state while the queue request is pending', () => {
    getModerationReports.mockReturnValue(new Promise(() => {}));

    renderModeratorReview();

    expect(screen.getByText('Checking moderator access...')).toBeInTheDocument();
    expect(screen.queryByText('Report queue')).not.toBeInTheDocument();
  });

  it('shows an empty queue and supports refresh', async () => {
    getModerationReports.mockResolvedValue({ reports: [] });

    renderModeratorReview();

    expect(await screen.findByText('No reports match these filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(getModerationReports).toHaveBeenCalledTimes(2));
  });

  it('renders queue rows and loads protected report detail', async () => {
    renderModeratorReview();

    expect(await screen.findByRole('button', { name: 'Open report report-1' })).toBeInTheDocument();
    expect(screen.getByText('Harassment or bullying')).toBeInTheDocument();
    expect(screen.getByText('Jordan · post-1')).toBeInTheDocument();

    await openReportDetail();

    expect(screen.getByText('River')).toBeInTheDocument();
    expect(screen.getByText('Full moderation history is not exposed by the current backend.')).toBeInTheDocument();
  });

  it('resolves a report and displays its action receipt after server confirmation', async () => {
    renderModeratorReview();
    await openReportDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Resolve report' }));
    fireEvent.change(screen.getByLabelText('Moderation note (optional)'), {
      target: { value: 'Reviewed and actioned.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve report' }));

    await waitFor(() => expect(moderateReport).toHaveBeenCalledWith('report-1', {
      status: 'resolved',
      reasonCode: 'reviewed_valid_report',
      notes: 'Reviewed and actioned.',
    }));
    expect(toastSuccess).toHaveBeenCalledWith('Report resolved.');
    expect(await screen.findByText('Report resolved')).toBeInTheDocument();
    expect(screen.getByText('action-report')).toBeInTheDocument();
  });

  it('dismisses a report with the fixed audit reason code', async () => {
    moderateReport.mockResolvedValueOnce({
      report: {
        id: 'report-1',
        status: 'dismissed',
        updatedAt: '2026-07-11T11:00:00.000Z',
      },
      moderationAction: {
        id: 'action-dismiss',
        createdAt: '2026-07-11T11:00:01.000Z',
      },
    });
    renderModeratorReview();
    await openReportDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss report' }));

    await waitFor(() => expect(moderateReport).toHaveBeenCalledWith('report-1', {
      status: 'dismissed',
      reasonCode: 'not_actionable',
      notes: '',
    }));
    expect(toastSuccess).toHaveBeenCalledWith('Report dismissed.');
  });

  it('requires an audit note before changing account status', async () => {
    renderModeratorReview();
    await openReportDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Set under review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set under review' }));

    expect(await screen.findByText('Add a moderation note before changing account status.')).toBeInTheDocument();
    expect(changeModeratedAccountStatus).not.toHaveBeenCalled();
  });

  it.each([
    ['under_review', 'Set under review', 'needs_manual_review', 'under review'],
    ['suspended', 'Suspend', 'abuse_confirmed', 'suspended'],
    ['active', 'Set active', 'review_cleared', 'active'],
  ] as const)('sets a target account to %s after confirmation', async (status, actionLabel, reasonCode, expectedLabel) => {
    changeModeratedAccountStatus.mockResolvedValueOnce({
      user: {
        id: 'user-2',
        accountStatus: status,
        accountStatusUpdatedAt: '2026-07-11T11:05:00.000Z',
      },
      moderationAction: {
        id: `action-${status}`,
        createdAt: '2026-07-11T11:05:01.000Z',
      },
    });
    renderModeratorReview();
    await openReportDetail();

    fireEvent.click(screen.getByRole('button', { name: actionLabel }));
    fireEvent.change(screen.getByLabelText('Moderation note'), {
      target: { value: 'Documented moderator decision.' },
    });
    const confirmLabel = status === 'suspended' ? 'Suspend account' : actionLabel;
    fireEvent.click(screen.getByRole('button', { name: confirmLabel }));

    await waitFor(() => expect(changeModeratedAccountStatus).toHaveBeenCalledWith('user-2', {
      status,
      reasonCode,
      notes: 'Documented moderator decision.',
      reportId: 'report-1',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent(new RegExp(`Confirmed status: ${expectedLabel}`, 'i'));
    expect(screen.getByText(`action-${status}`)).toBeInTheDocument();
  });

  it('shows a safe error and leaves the action dialog open when moderation fails', async () => {
    moderateReport.mockRejectedValueOnce(new Error('sensitive database detail'));
    renderModeratorReview();
    await openReportDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Resolve report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve report' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Unable to complete this moderation action right now.'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('sensitive database detail')).not.toBeInTheDocument();
  });

  it('does not submit a moderation action twice while pending', async () => {
    let resolveAction: (value: unknown) => void = () => {};
    moderateReport.mockReturnValue(new Promise((resolve) => {
      resolveAction = resolve;
    }));
    renderModeratorReview();
    await openReportDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Resolve report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submitting...' }));

    expect(moderateReport).toHaveBeenCalledTimes(1);

    resolveAction({
      report: { id: 'report-1', status: 'resolved', updatedAt: '2026-07-11T11:00:00.000Z' },
      moderationAction: { id: 'action-report', createdAt: '2026-07-11T11:00:01.000Z' },
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Report resolved.'));
  });

  it('does not expose the moderation interface to unauthorized users', async () => {
    getModerationReports.mockRejectedValueOnce(new ApiClientError(403, 'FORBIDDEN', 'private backend message'));

    renderModeratorReview();

    expect(await screen.findByText('Moderator access required')).toBeInTheDocument();
    expect(screen.queryByText('Report queue')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve report' })).not.toBeInTheDocument();
  });

  it('shows a retryable safe state for non-authorization failures', async () => {
    getModerationReports.mockRejectedValueOnce(new Error('database hostname'));

    renderModeratorReview();

    expect(await screen.findByText('Moderation queue unavailable')).toBeInTheDocument();
    expect(screen.queryByText('database hostname')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(getModerationReports).toHaveBeenCalledTimes(2));
  });
});
