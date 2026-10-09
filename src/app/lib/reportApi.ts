import { requestApi } from './apiClient';

export type ReportTargetType = 'user' | 'profile' | 'conversation' | 'message' | 'post' | 'profile_photo' | 'place' | 'place_message';

export type ReportReason =
  | 'non_consensual_imagery'
  | 'minor_safety'
  | 'impersonation'
  | 'coercion_trafficking'
  | 'illegal_activity'
  | 'spam_scam'
  | 'harassment'
  | 'fetishization'
  | 'hate'
  | 'violence_threat'
  | 'privacy_location'
  | 'location_spoofing'
  | 'other';

export const REPORT_REASON_OPTIONS = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate speech or discrimination' },
  { value: 'non_consensual_imagery', label: 'Sexual content shared without consent' },
  { value: 'spam_scam', label: 'Spam or scam' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'coercion_trafficking', label: 'Coercion or trafficking' },
  { value: 'illegal_activity', label: 'Illegal activity' },
  { value: 'fetishization', label: 'Fetishization or chaser behavior' },
  { value: 'violence_threat', label: 'Threats or safety concern' },
  { value: 'minor_safety', label: 'Underage user concern' },
  { value: 'privacy_location', label: 'Privacy or location exposure' },
  { value: 'location_spoofing', label: 'Location spoofing' },
  { value: 'other', label: 'Other' },
] as const satisfies ReadonlyArray<{ value: ReportReason; label: string }>;

export type CreateReportPayload = {
  targetType: ReportTargetType;
  targetId: string;
  targetUserId?: string;
  reason: ReportReason;
  details?: string;
};

export type ReportRecord = {
  id: string;
  status: string;
  createdAt: string;
};

export function createReport(payload: CreateReportPayload) {
  const targetField = payload.targetType === 'user' || payload.targetType === 'profile'
    ? { targetUserId: payload.targetId }
    : payload.targetType === 'conversation'
      ? { conversationId: payload.targetId }
      : payload.targetType === 'message'
        ? { messageId: payload.targetId }
        : payload.targetType === 'post'
          ? { postId: payload.targetId }
          : payload.targetType === 'place'
            ? { placeId: payload.targetId }
            : payload.targetType === 'place_message'
              ? { placeMessageId: payload.targetId }
          : { profilePhotoUrl: payload.targetId, targetUserId: payload.targetUserId };

  return requestApi<ReportRecord>('/api/reports', {
    method: 'POST',
    body: JSON.stringify({
      targetType: payload.targetType,
      ...targetField,
      reason: payload.reason,
      details: payload.details?.trim() ?? '',
    }),
  });
}
