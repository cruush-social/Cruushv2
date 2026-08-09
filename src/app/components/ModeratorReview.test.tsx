import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../lib/apiClient';
import ModeratorReview from './ModeratorReview';

const {
  changeModeratedAccountStatus,
  decideContentReview,
  getModeratedUser,
  getModerationQueue,
  getModerationQueueItem,
  moderateReport,
  removeReportedContent,
  searchModeratedUsers,
} = vi.hoisted(() => ({
  changeModeratedAccountStatus: vi.fn(),
  decideContentReview: vi.fn(),
  getModeratedUser: vi.fn(),
  getModerationQueue: vi.fn(),
  getModerationQueueItem: vi.fn(),
  moderateReport: vi.fn(),
  removeReportedContent: vi.fn(),
  searchModeratedUsers: vi.fn(),
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
    decideContentReview,
    getModeratedUser,
    getModerationQueue,
    getModerationQueueItem,
    moderateReport,
    removeReportedContent,
    searchModeratedUsers,
  };
});

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}));

const report = {
  id: 'report-1',
  reporter: { userId: 'user-1', displayName: 'River' },
  target: {
    type: 'post' as const,
    userId: 'user-2',
    displayName: 'Jordan',
    accountStatus: 'active' as const,
    conversationId: null,
    messageId: null,
    postId: 'post-1',
    mediaObjectId: null,
    profilePhotoUrl: null,
  },
  contentReviewId: 'review-report-1',
  reason: 'harassment',
  details: 'Threatening language in the post.',
  status: 'open' as const,
  createdAt: '2026-07-11T10:00:00.000Z',
  updatedAt: '2026-07-11T10:00:00.000Z',
};

const reportItem = {
  key: 'report:report-1',
  kind: 'report' as const,
  id: 'report-1',
  status: 'open',
  reason: 'harassment',
  summary: 'Threatening language in the post.',
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
  subject: { userId: 'user-2', displayName: 'Jordan', accountStatus: 'active' as const },
  target: {
    type: 'post' as const,
    conversationId: null,
    messageId: null,
    postId: 'post-1',
    mediaObjectId: null,
    profilePhotoUrl: null,
  },
  reporter: report.reporter,
  moderation: null,
};

const reportDetail = {
  item: { kind: 'report' as const, report },
  context: {
    kind: 'post' as const,
    text: 'Reported post body',
    author: 'Jordan',
    createdAt: report.createdAt,
  },
  history: [],
  availableActions: { canResolve: true, canRemoveContent: true, canModerateAccount: true },
};

const reviewItem = {
  ...reportItem,
  key: 'review:review-1',
  kind: 'review' as const,
  id: 'review-1',
  status: 'pending_review',
  reason: 'provider_flagged_by_automod',
  summary: 'provider flagged by automod',
  reporter: null,
  moderation: {
    contentReviewId: 'review-1',
    surface: 'feed',
    contentType: 'text',
    provider: 'stream',
    normalizedLabels: [],
    policyDecision: {},
    contentRef: {},
  },
};

const reviewDetail = {
  item: {
    kind: 'review' as const,
    review: {
      id: 'review-1',
      user: { id: 'user-2', displayName: 'Jordan', accountStatus: 'active' as const },
      surface: 'feed',
      contentType: 'text',
      storageStatus: 'queued',
      moderationStatus: 'pending_review',
      reason: 'provider_flagged_by_automod',
      contentId: null,
      contentRef: {},
      provider: 'stream',
      providerRequestId: 'provider-1',
      normalizedLabels: [{ normalized_label: 'harassment' }],
      policyDecision: { decision: 'quarantine' },
      createdAt: report.createdAt,
      completedAt: report.updatedAt,
    },
  },
  context: { kind: 'moderation_metadata' as const, message: 'Rejected before storage.' },
  history: [],
  availableActions: { canDecideReview: true, canModerateAccount: true, canRemoveContent: false },
};

const moderatedUser = {
  id: 'user-2',
  displayName: 'Jordan',
  email: 'jordan@example.com',
  accountStatus: 'active' as const,
  accountStatusUpdatedAt: report.updatedAt,
  createdAt: report.createdAt,
  moderatorRole: null,
  isOwner: false,
  openReportCount: 1,
  totalReportCount: 3,
};

function queue(items = [reportItem], page = { limit: 25, offset: 0, total: items.length, hasMore: false }) {
  return { items, page };
}

function renderReview() {
  return render(
    <MemoryRouter initialEntries={['/admin/moderation']}>
      <Routes>
        <Route path="/admin/moderation" element={<ModeratorReview />} />
        <Route path="/settings" element={<div>Settings route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openReport() {
  fireEvent.click(await screen.findByRole('button', { name: 'Open User report report-1' }));
  expect(await screen.findByText('Reported post body')).toBeInTheDocument();
}

describe('ModeratorReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getModerationQueue.mockResolvedValue(queue());
    getModerationQueueItem.mockImplementation((kind: string) => Promise.resolve(kind === 'report' ? reportDetail : reviewDetail));
    moderateReport.mockResolvedValue({
      report: { id: 'report-1', status: 'resolved', updatedAt: report.updatedAt },
      moderationAction: { id: 'action-1', createdAt: report.updatedAt },
    });
    removeReportedContent.mockResolvedValue({
      report: { id: 'report-1', status: 'resolved' },
      action: 'remove_post',
      moderationAction: { id: 'action-remove', createdAt: report.updatedAt },
    });
    decideContentReview.mockResolvedValue({
      review: { id: 'review-1', moderationStatus: 'allowed' },
      moderationAction: { id: 'action-review', createdAt: report.updatedAt },
    });
    changeModeratedAccountStatus.mockResolvedValue({
      user: { id: 'user-2', accountStatus: 'under_review', accountStatusUpdatedAt: report.updatedAt },
      moderationAction: { id: 'action-account', createdAt: report.updatedAt },
    });
    searchModeratedUsers.mockResolvedValue({
      users: [moderatedUser],
      page: { limit: 25, offset: 0, total: 1, hasMore: false },
    });
    getModeratedUser.mockResolvedValue({ user: moderatedUser, history: [], reports: [] });
  });

  it('shows the authorization loading state while the queue request is pending', () => {
    getModerationQueue.mockReturnValue(new Promise(() => {}));
    renderReview();
    expect(screen.getByText('Checking moderator access...')).toBeInTheDocument();
  });

  // Regression: the header was a single non-wrapping row, so on a phone the view
  // controls sat on top of the title and the description.
  it('wraps the header instead of stacking the view controls over the title', async () => {
    getModerationQueue.mockResolvedValue(queue([]));
    renderReview();

    const title = await screen.findByRole('heading', { name: 'Moderation dashboard' });
    const headerRow = title.closest('header')?.firstElementChild;
    const controls = screen.getByRole('tablist', { name: 'Moderation views' }).parentElement;

    expect(headerRow?.className).toContain('flex-wrap');
    expect(title.className).toContain('truncate');
    expect(title.parentElement?.className).toContain('min-w-0');
    expect(controls?.className).toContain('w-full');
    expect(controls?.className).toContain('sm:w-auto');
  });

  it('shows the empty unified queue and supports refresh', async () => {
    getModerationQueue.mockResolvedValue(queue([]));
    renderReview();
    expect(await screen.findByText('No moderation items match these filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(getModerationQueue).toHaveBeenCalledTimes(2));
  });

  it('renders a report and its protected content context', async () => {
    renderReview();
    await openReport();
    expect(getModerationQueueItem).toHaveBeenCalledWith('report', 'report-1');
    expect(screen.getByText('Threatening language in the post.')).toBeInTheDocument();
  });

  it('uses server-side pagination for the full queue', async () => {
    getModerationQueue.mockResolvedValue(queue([reportItem], { limit: 25, offset: 0, total: 30, hasMore: true }));
    renderReview();
    await screen.findByText('1-1 of 30');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(getModerationQueue).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })));
  });

  it('resolves a report with an audit receipt', async () => {
    renderReview();
    await openReport();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve report' }));
    await waitFor(() => expect(moderateReport).toHaveBeenCalledWith('report-1', expect.objectContaining({
      status: 'resolved',
      reasonCode: 'reviewed_valid_report',
    })));
  });

  it('requires an audit note before removing reported content', async () => {
    renderReview();
    await openReport();
    fireEvent.click(screen.getByRole('button', { name: 'Remove content' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove content' }));
    expect(await screen.findByText('Add an audit note before confirming this action.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Audit note'), { target: { value: 'Confirmed violating post.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove content' }));
    await waitFor(() => expect(removeReportedContent).toHaveBeenCalledWith('report-1', {
      reasonCode: 'reported_content_removed',
      notes: 'Confirmed violating post.',
    }));
  });

  it('loads and approves an automod review candidate', async () => {
    getModerationQueue.mockResolvedValue(queue([reviewItem]));
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Open Automod review review-1' }));
    expect(await screen.findByText('Rejected before storage.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.change(screen.getByLabelText('Audit note'), { target: { value: 'False positive confirmed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve content' }));
    await waitFor(() => expect(decideContentReview).toHaveBeenCalledWith('review-1', {
      action: 'approve',
      reasonCode: 'manual_review_approved',
      notes: 'False positive confirmed.',
    }));
  });

  it('changes the target account status with an audit note', async () => {
    renderReview();
    await openReport();
    fireEvent.click(screen.getByRole('button', { name: 'Mark under review' }));
    fireEvent.change(screen.getByLabelText('Audit note'), { target: { value: 'Needs additional investigation.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set under review' }));
    await waitFor(() => expect(changeModeratedAccountStatus).toHaveBeenCalledWith('user-2', expect.objectContaining({
      status: 'under_review',
      reportId: 'report-1',
    })));
  });

  it('permanently bans the reported account from the queue detail', async () => {
    changeModeratedAccountStatus.mockResolvedValue({
      user: { id: 'user-2', accountStatus: 'banned', accountStatusUpdatedAt: report.updatedAt },
      moderationAction: { id: 'action-9', createdAt: report.updatedAt },
    });
    renderReview();
    await openReport();
    fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
    expect(await screen.findByText('Permanently ban this account?')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Audit note'), { target: { value: 'Confirmed severe abuse.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ban account' }));
    await waitFor(() => expect(changeModeratedAccountStatus).toHaveBeenCalledWith('user-2', expect.objectContaining({
      status: 'banned',
      reasonCode: 'severe_abuse_permanent_ban',
      reportId: 'report-1',
    })));
  });

  it('searches accounts and bans a user without an attached report', async () => {
    changeModeratedAccountStatus.mockResolvedValue({
      user: { id: 'user-2', accountStatus: 'banned', accountStatusUpdatedAt: report.updatedAt },
      moderationAction: { id: 'action-ban', createdAt: report.updatedAt },
    });
    renderReview();
    fireEvent.click(await screen.findByRole('tab', { name: 'Accounts' }));
    fireEvent.change(await screen.findByLabelText('Search accounts'), { target: { value: 'jordan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(searchModeratedUsers).toHaveBeenCalledWith(expect.objectContaining({ query: 'jordan' })));

    fireEvent.click(await screen.findByRole('button', { name: 'Open account Jordan' }));
    expect(await screen.findByText('jordan@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
    fireEvent.change(screen.getByLabelText('Audit note'), { target: { value: 'Repeat harassment.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ban account' }));

    await waitFor(() => expect(changeModeratedAccountStatus).toHaveBeenCalledWith('user-2', expect.objectContaining({
      status: 'banned',
      reasonCode: 'severe_abuse_permanent_ban',
    })));
    expect(changeModeratedAccountStatus).toHaveBeenCalledWith('user-2', expect.not.objectContaining({ reportId: expect.anything() }));
  });

  it('does not expose the dashboard to unauthorized users', async () => {
    getModerationQueue.mockRejectedValue(new ApiClientError(403, 'FORBIDDEN', 'Moderator access required.'));
    renderReview();
    expect(await screen.findByText('Moderator access required')).toBeInTheDocument();
    expect(screen.queryByText('Unified queue')).not.toBeInTheDocument();
  });

  it('shows a retryable safe state for non-authorization failures', async () => {
    getModerationQueue.mockRejectedValue(new Error('database hostname'));
    renderReview();
    expect(await screen.findByText('Moderation queue unavailable')).toBeInTheDocument();
    expect(screen.queryByText('database hostname')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(getModerationQueue).toHaveBeenCalledTimes(2));
  });
});
