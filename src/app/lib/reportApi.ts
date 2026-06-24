import { requestApi } from './apiClient';

export type ReportTargetType = 'profile' | 'conversation' | 'message';

export type ReportReason =
  | 'non_consensual_imagery'
  | 'minor_safety'
  | 'impersonation'
  | 'coercion_trafficking'
  | 'illegal_activity'
  | 'spam_scam'
  | 'harassment'
  | 'hate'
  | 'violence_threat'
  | 'privacy_location'
  | 'other';

export type CreateReportPayload = {
  targetType: ReportTargetType;
  targetUserId?: string;
  conversationId?: string;
  messageId?: string;
  reason: ReportReason;
  details?: string;
};

export type ReportRecord = {
  id: string;
  status: string;
  createdAt: string;
};

export function createReport(payload: CreateReportPayload) {
  return requestApi<ReportRecord>('/api/reports', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
