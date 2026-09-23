import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../lib/apiClient';
import ModeratorReview from './ModeratorReview';

const {
  changeModeratedAccountStatus,
  decideContentReview,
  getAdminNotifications,
  getModerationSystemErrors,
  getModeratedUser,
  getModerationQueue,
  getModerationQueueItem,
  getSupportRequests,
  moderateReport,
  removeReportedContent,
  searchModeratedUsers,
  sendSiteWideAnnouncement,
  updateSupportRequestStatus,
} = vi.hoisted(() => ({
  changeModeratedAccountStatus: vi.fn(),
  decideContentReview: vi.fn(),
  getAdminNotifications: vi.fn(),
  getModerationSystemErrors: vi.fn(),
  getModeratedUser: vi.fn(),
  getModerationQueue: vi.fn(),
  getModerationQueueItem: vi.fn(),
  getSupportRequests: vi.fn(),
  moderateReport: vi.fn(),
  removeReportedContent: vi.fn(),
  searchModeratedUsers: vi.fn(),
  sendSiteWideAnnouncement: vi.fn(),
  updateSupportRequestStatus: vi.fn(),
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
    getAdminNotifications,
    getModerationSystemErrors,
    getModeratedUser,
    getModerationQueue,
    getModerationQueueItem,
    getSupportRequests,
    moderateReport,
    removeReportedContent,
    searchModeratedUsers,
    sendSiteWideAnnouncement,
    updateSupportRequestStatus,
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

const notification = {
  id: 'notification-1',
  user: { userId: 'user-2', displayName: 'Jordan', email: 'jordan@example.com' },
  actor: { userId: 'user-3', displayName: 'Casey' },
  type: 'direct_message',
  title: 'New message',
  body: 'Casey sent you a message.',
  linkUrl: '/messages/conversation-1',
  conversationId: 'conversation-1',
  metadata: {},
  readAt: null,
  createdAt: report.createdAt,
};

const supportRequest = {
  id: 'support-1',
  requester: { userId: 'user-2', displayName: 'Jordan', email: 'jordan@example.com' },
  contactEmail: 'jordan@example.com',
  category: 'bug',
  subject: 'Messages are missing',
  message: 'The chat screen is blank.',
  source: 'settings',
  pageUrl: '/messages',
  aiTriageStatus: 'complete',
  status: 'open' as const,
  githubIssueNumber: 42,
  triageBranch: 'bug/messages',
  triagePrUrl: null,
  triageAttempts: 1,
  triageClaimedAt: null,
  metadata: {},
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
};

const surveyRequest = {
  ...supportRequest,
  id: 'survey-1',
  requester: null,
  contactEmail: null,
  category: 'comment',
  subject: 'cruush survey response',
  message: 'Overall experience (1–5): 5',
  source: 'survey',
  pageUrl: '/survey',
  githubIssueNumber: null,
  triageBranch: null,
};

const suspensionAppealRequest = {
  ...supportRequest,
  id: 'appeal-1',
  category: 'suspension_appeal',
  subject: 'Suspension appeal',
  message: 'Please review my suspension appeal.',
  source: 'auth',
  pageUrl: '/support?appeal=1',
  githubIssueNumber: null,
  triageBranch: null,
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
    getAdminNotifications.mockResolvedValue({
      notifications: [notification],
      page: { limit: 25, offset: 0, total: 1, hasMore: false },
    });
    getModerationSystemErrors.mockResolvedValue({
      errors: [{
        id: 'system-error-1',
        provider: 'stream',
        surface: 'profile_photo',
        contentType: 'image',
        errorCode: 'http_503',
        errorMessage: 'Gateway timeout',
        lastContentId: 'media-123',
        lastProviderRequestId: 'stream-request-123',
        occurrences: 3,
        firstSeenAt: '2026-08-09T10:00:00.000Z',
        lastSeenAt: '2026-08-09T10:05:00.000Z',
      }],
    });
    getSupportRequests.mockResolvedValue({
      requests: [supportRequest],
      surveySummary: { responseCount: 0, ratings: [] },
      page: { limit: 25, offset: 0, total: 1, hasMore: false },
    });
    updateSupportRequestStatus.mockResolvedValue({ request: { ...supportRequest, status: 'closed' } });
  });

  it('contains the mobile moderation header controls without page-level overflow', async () => {
    renderReview();

    const tablist = await screen.findByRole('tablist', { name: 'Moderation views' });
    expect(tablist).toHaveClass('min-w-0', 'w-full', 'overflow-x-auto');
    expect(tablist.parentElement).toHaveClass('min-w-0');
    expect(tablist.parentElement).toHaveClass('flex-col', 'sm:flex-row');
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveClass('w-full', 'shrink-0', 'sm:w-auto');
  });

  it('shows the authorization loading state while the queue request is pending', () => {
    getModerationQueue.mockReturnValue(new Promise(() => {}));
    renderReview();
    expect(screen.getByText('Checking moderator access...')).toBeInTheDocument();
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

  it('loads the notification dashboard from the moderator tools', async () => {
    renderReview();
    fireEvent.click(await screen.findByRole('tab', { name: 'Notifications' }));
    expect(await screen.findByText('New message')).toBeInTheDocument();
    expect(screen.getByText('Casey sent you a message.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Notification filter'), { target: { value: 'unread' } });
    await waitFor(() => expect(getAdminNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ filter: 'unread' })));
  });

  it('sends a site-wide notification from the notification dashboard', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    getAdminNotifications.mockResolvedValue({
      notifications: [],
      page: { limit: 25, offset: 0, total: 0, hasMore: false },
    });
    sendSiteWideAnnouncement.mockResolvedValue({
      recipients: 4,
      notificationsCreated: 4,
      pushesAttempted: 4,
    });
    renderReview();

    fireEvent.click(await screen.findByRole('tab', { name: 'Notifications' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Announcement title' }), { target: { value: 'New release' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Announcement message' }), { target: { value: 'The latest cruush updates are live.' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Announcement link' }), { target: { value: '/changelog' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send notification' }));

    await waitFor(() => expect(sendSiteWideAnnouncement).toHaveBeenCalledWith({
      title: 'New release',
      body: 'The latest cruush updates are live.',
      linkUrl: '/changelog',
    }));
    expect(toastSuccess).toHaveBeenCalledWith('Announcement sent to 4 verified active accounts.');
  });

  it('loads grouped provider failures in their own moderator view', async () => {
    renderReview();
    fireEvent.click(await screen.findByRole('tab', { name: 'System errors' }));
    expect(await screen.findByText('Gateway timeout')).toBeInTheDocument();
    expect(screen.getByText('Asset media-123')).toBeInTheDocument();
    expect(screen.getByText('Provider request stream-request-123')).toBeInTheDocument();
    expect(getModerationSystemErrors).toHaveBeenCalledWith({ limit: 50 });
  });

  it('loads the email inbox dashboard and lets moderators change request status', async () => {
    renderReview();
    fireEvent.click(await screen.findByRole('tab', { name: 'Surveys & support' }));
    expect(await screen.findByText('Messages are missing')).toBeInTheDocument();
    expect(screen.getByText('The chat screen is blank.')).toBeInTheDocument();
    expect(screen.getByText('No survey responses yet.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Status for Messages are missing'), { target: { value: 'closed' } });
    await waitFor(() => expect(updateSupportRequestStatus).toHaveBeenCalledWith('support-1', 'closed'));
    expect(toastSuccess).toHaveBeenCalledWith('Request marked closed.');
  });

  it('filters the support inbox to age suspension appeals', async () => {
    getSupportRequests.mockImplementation(({ category }: { category?: string }) => Promise.resolve({
      requests: category === 'suspension_appeal' ? [suspensionAppealRequest] : [supportRequest],
      surveySummary: { responseCount: 0, ratings: [] },
      page: { limit: 25, offset: 0, total: 1, hasMore: false },
    }));
    renderReview();

    fireEvent.click(await screen.findByRole('tab', { name: 'Surveys & support' }));
    expect(await screen.findByText('Messages are missing')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Request type filter'), { target: { value: 'suspension_appeal' } });

    await waitFor(() => expect(getSupportRequests).toHaveBeenLastCalledWith({
      status: 'open',
      category: 'suspension_appeal',
      limit: 25,
      offset: 0,
    }));
    expect(await screen.findByText('Suspension appeal')).toBeInTheDocument();
    expect(screen.queryByText('Messages are missing')).not.toBeInTheDocument();
  });

  it('marks survey responses and visualizes star-rating averages and distributions', async () => {
    getSupportRequests.mockResolvedValue({
      requests: [surveyRequest],
      surveySummary: {
        responseCount: 2,
        ratings: [
          { key: 'overall', responseCount: 2, average: 4, distribution: [0, 0, 1, 0, 1] },
          { key: 'ease', responseCount: 2, average: 4.5, distribution: [0, 0, 0, 1, 1] },
          { key: 'map', responseCount: 1, average: 3, distribution: [0, 0, 1, 0, 0] },
          { key: 'privacy', responseCount: 2, average: 2.5, distribution: [0, 1, 1, 0, 0] },
        ],
      },
      page: { limit: 25, offset: 0, total: 1, hasMore: false },
    });
    renderReview();

    fireEvent.click(await screen.findByRole('tab', { name: 'Surveys & support' }));

    expect(await screen.findByText('Survey response')).toBeInTheDocument();
    expect(screen.getByText('2 survey responses across all inbox statuses')).toBeInTheDocument();
    const overallCard = screen.getByRole('heading', { name: 'Overall experience' }).closest('article');
    expect(overallCard).not.toBeNull();
    expect(within(overallCard!).getByText('4.0 / 5')).toBeInTheDocument();
    expect(within(overallCard!).getByRole('meter', { name: 'Overall experience average 4.0 out of 5' })).toHaveAttribute('aria-valuenow', '4');
    expect(within(overallCard!).getByLabelText('5 stars: 1')).toHaveTextContent('5★ 1');
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
