import { requestApi } from './apiClient';

export type ModerationReportStatus = 'open' | 'automod_processing' | 'resolved' | 'dismissed';
export type ModerationTargetType = 'user' | 'profile' | 'conversation' | 'message' | 'post' | 'profile_photo';
export type ModeratedAccountStatus = 'active' | 'under_review' | 'suspended';

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
  };
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
