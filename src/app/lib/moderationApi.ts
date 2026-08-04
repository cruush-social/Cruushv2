import { requestApi } from './apiClient';

export type ModerationReportStatus = 'open' | 'automod_processing' | 'resolved' | 'dismissed';
export type ModerationTargetType = 'user' | 'profile' | 'conversation' | 'message' | 'post' | 'profile_photo';
export type ModeratedAccountStatus = 'active' | 'under_review' | 'suspended' | 'banned';

export type ModerationActionReceipt = {
  id: string;
  createdAt: string;
};

export type ModerationReport = {
  id: string;
  reporter: {
    userId: string;
    displayName: string;
  };
  target: {
    type: ModerationTargetType;
    userId: string | null;
    displayName: string | null;
    conversationId: string | null;
    messageId: string | null;
    postId: string | null;
    mediaObjectId: string | null;
    profilePhotoUrl: string | null;
    accountStatus?: ModeratedAccountStatus | null;
  };
  contentReviewId?: string | null;
  reason: string;
  details: string;
  status: ModerationReportStatus;
  createdAt: string;
  updatedAt: string;
};

export type ModerationReportList = {
  reports: ModerationReport[];
};

export type ModerationReportDetail = {
  report: ModerationReport;
};

export type ModerateReportPayload = {
  status: 'resolved' | 'dismissed';
  reasonCode: string;
  notes?: string;
};

export type ModerateReportResult = {
  report: {
    id: string;
    status: 'resolved' | 'dismissed';
    updatedAt: string;
  };
  moderationAction: ModerationActionReceipt;
};

export type ChangeAccountStatusPayload = {
  status: ModeratedAccountStatus;
  reasonCode: string;
  notes?: string;
  reportId?: string;
};

export type ChangeAccountStatusResult = {
  user: {
    id: string;
    accountStatus: ModeratedAccountStatus;
    accountStatusUpdatedAt: string;
  };
  moderationAction: ModerationActionReceipt;
};

export type ModerationQueueSource = 'all' | 'reports' | 'automod';
export type ModerationQueueState = 'open' | 'closed' | 'all';

export type ModerationQueueItem = {
  key: string;
  kind: 'report' | 'review';
  id: string;
  status: string;
  reason: string | null;
  summary: string;
  createdAt: string;
  updatedAt: string;
  subject: {
    userId: string | null;
    displayName: string | null;
    accountStatus: ModeratedAccountStatus | null;
  };
  target: {
    type: ModerationTargetType;
    conversationId: string | null;
    messageId: string | null;
    postId: string | null;
    mediaObjectId: string | null;
    profilePhotoUrl: string | null;
  };
  reporter: {
    userId: string | null;
    displayName: string;
  } | null;
  moderation: {
    contentReviewId: string;
    surface: string | null;
    contentType: string | null;
    provider: string | null;
    normalizedLabels: unknown[];
    policyDecision: Record<string, unknown>;
    contentRef: Record<string, unknown>;
  } | null;
};

export type ModerationContentReview = {
  id: string;
  user: {
    id: string;
    displayName: string;
    accountStatus: ModeratedAccountStatus;
  };
  surface: string;
  contentType: string;
  storageStatus: string;
  moderationStatus: string;
  reason: string | null;
  contentId: string | null;
  contentRef: Record<string, unknown>;
  provider: string | null;
  providerRequestId: string | null;
  normalizedLabels: unknown[];
  policyDecision: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
};

export type ModerationContentContext = {
  kind: 'post' | 'message' | 'conversation' | 'profile' | 'media' | 'moderation_metadata' | 'unavailable';
  text?: string;
  author?: string;
  createdAt?: string;
  messages?: Array<{ id: string; text: string; author: string; createdAt: string }>;
  displayName?: string;
  bio?: string;
  pronouns?: string[];
  photos?: string[];
  updatedAt?: string;
  mediaObjectId?: string | null;
  previewUrl?: string | null;
  message?: string | null;
};

export type ModerationHistoryItem = {
  id: string;
  action: string;
  reasonCode: string;
  notes: string;
  actorDisplayName: string;
  createdAt: string;
};

export type ModerationQueueDetail = {
  item:
    | { kind: 'report'; report: ModerationReport }
    | { kind: 'review'; review: ModerationContentReview };
  context: ModerationContentContext;
  history: ModerationHistoryItem[];
  availableActions: {
    canResolve?: boolean;
    canDecideReview?: boolean;
    canRemoveContent?: boolean;
    canModerateAccount?: boolean;
  };
};

export type ModerationQueueResponse = {
  items: ModerationQueueItem[];
  page: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

export function getModerationReports(options: {
  status?: ModerationReportStatus;
  limit?: number;
  offset?: number;
} = {}) {
  const searchParams = new URLSearchParams();

  if (options.status) {
    searchParams.set('status', options.status);
  }
  searchParams.set('limit', String(options.limit ?? 100));
  searchParams.set('offset', String(options.offset ?? 0));

  return requestApi<ModerationReportList>(`/api/admin/moderation/reports?${searchParams.toString()}`);
}

export function getModerationReport(reportId: string) {
  return requestApi<ModerationReportDetail>(`/api/admin/moderation/reports/${encodeURIComponent(reportId)}`);
}

export function moderateReport(reportId: string, payload: ModerateReportPayload) {
  return requestApi<ModerateReportResult>(`/api/admin/moderation/reports/${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: payload.status,
      reasonCode: payload.reasonCode,
      notes: payload.notes?.trim() ?? '',
    }),
  });
}

export function changeModeratedAccountStatus(userId: string, payload: ChangeAccountStatusPayload) {
  return requestApi<ChangeAccountStatusResult>(`/api/admin/moderation/users/${encodeURIComponent(userId)}/status`, {
    method: 'POST',
    body: JSON.stringify({
      status: payload.status,
      reasonCode: payload.reasonCode,
      notes: payload.notes?.trim() ?? '',
      ...(payload.reportId ? { reportId: payload.reportId } : {}),
    }),
  });
}

export type ModeratedUser = {
  id: string;
  displayName: string;
  email: string;
  accountStatus: ModeratedAccountStatus;
  accountStatusUpdatedAt: string;
  createdAt: string;
  moderatorRole: 'admin' | 'moderator' | null;
  isOwner: boolean;
  openReportCount: number;
  totalReportCount: number;
};

export type ModeratedUserSearchResponse = {
  users: ModeratedUser[];
  page: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

export type ModeratedUserDetail = {
  user: ModeratedUser;
  history: ModerationHistoryItem[];
  reports: ModerationReport[];
};

export function searchModeratedUsers(options: {
  query?: string;
  status?: ModeratedAccountStatus;
  limit?: number;
  offset?: number;
} = {}) {
  const searchParams = new URLSearchParams({
    limit: String(options.limit ?? 25),
    offset: String(options.offset ?? 0),
  });

  if (options.query?.trim()) {
    searchParams.set('query', options.query.trim());
  }
  if (options.status) {
    searchParams.set('status', options.status);
  }

  return requestApi<ModeratedUserSearchResponse>(`/api/admin/moderation/users?${searchParams.toString()}`);
}

export function getModeratedUser(userId: string) {
  return requestApi<ModeratedUserDetail>(`/api/admin/moderation/users/${encodeURIComponent(userId)}`);
}

export function getModerationQueue(options: {
  source?: ModerationQueueSource;
  state?: ModerationQueueState;
  limit?: number;
  offset?: number;
} = {}) {
  const searchParams = new URLSearchParams({
    source: options.source ?? 'all',
    state: options.state ?? 'open',
    limit: String(options.limit ?? 25),
    offset: String(options.offset ?? 0),
  });
  return requestApi<ModerationQueueResponse>(`/api/admin/moderation/queue?${searchParams.toString()}`);
}

export function getModerationQueueItem(kind: 'report' | 'review', id: string) {
  return requestApi<ModerationQueueDetail>(
    `/api/admin/moderation/queue/${kind}/${encodeURIComponent(id)}`,
  );
}

export function decideContentReview(reviewId: string, payload: {
  action: 'approve' | 'reject';
  reasonCode: string;
  notes?: string;
}) {
  return requestApi<{
    review: { id: string; moderationStatus: 'allowed' | 'blocked' };
    moderationAction: ModerationActionReceipt;
  }>(`/api/admin/moderation/reviews/${encodeURIComponent(reviewId)}/decision`, {
    method: 'POST',
    body: JSON.stringify({
      action: payload.action,
      reasonCode: payload.reasonCode,
      notes: payload.notes?.trim() ?? '',
    }),
  });
}

export function removeReportedContent(reportId: string, payload: {
  reasonCode: string;
  notes: string;
}) {
  return requestApi<{
    report: { id: string; status: 'resolved' };
    action: 'remove_post' | 'remove_message' | 'remove_media';
    moderationAction: ModerationActionReceipt;
  }>(`/api/admin/moderation/reports/${encodeURIComponent(reportId)}/remove-content`, {
    method: 'POST',
    body: JSON.stringify({
      reasonCode: payload.reasonCode,
      notes: payload.notes.trim(),
    }),
  });
}
