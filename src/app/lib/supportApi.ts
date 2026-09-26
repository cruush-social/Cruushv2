import { requestApi } from './apiClient';

export type SupportRequestCategory = 'bug' | 'comment' | 'question' | 'policy' | 'billing_payment' | 'billing_subscription' | 'billing_pulse' | 'billing_refund';
export type SupportRequestAdminCategory = SupportRequestCategory | 'suspension_appeal';
export type SupportRequestSource = 'auth' | 'settings' | 'policy' | 'survey' | 'unknown';

export type CreateSupportRequestPayload = {
  category: SupportRequestAdminCategory;
  subject: string;
  message: string;
  contactEmail?: string;
  source: SupportRequestSource;
  pageUrl?: string;
  device?: {
    model?: string;
    platform?: string;
    platformVersion?: string;
    mobile?: boolean;
  };
  screenshot?: {
    filename: string;
    contentType: 'image/jpeg' | 'image/png' | 'image/webp';
    contentBase64: string;
  };
};

export type SupportRequestRecord = {
  id: string;
  status: string;
  aiTriageStatus: string;
  createdAt: string;
};

export type SupportRequestAdminRecord = {
  id: string;
  requesterUserId: string | null;
  contactEmail: string | null;
  category: SupportRequestAdminCategory;
  subject: string;
  message: string;
  source: SupportRequestSource;
  pageUrl: string;
  aiTriageStatus: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  recipientEmail: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  appealEvidence?: Array<{
    type: SuspensionAppealEvidenceType;
    previewUrl: string;
  }>;
};

export type SuspensionAppealEvidenceType = 'id' | 'selfie';

export type CreateSuspensionAppealPayload = {
  contactEmail: string;
  idDocument: File;
  selfie: File;
};

export type CreateGeneralSuspensionAppealPayload = {
  contactEmail?: string;
  message: string;
};

export type SupportRequestAdminListResponse = {
  requests: SupportRequestAdminRecord[];
  page: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

export type ReplySupportRequestPayload = {
  message: string;
};

export type ReplySupportRequestResult = {
  reply: {
    id: string;
    createdAt: string;
    deliveryStatus: 'sent' | 'failed';
    recipientEmail: string;
  };
};

export function createSupportRequest(payload: CreateSupportRequestPayload) {
  return requestApi<SupportRequestRecord>('/api/support-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createSuspensionAppeal(payload: CreateSuspensionAppealPayload) {
  const form = new FormData();
  form.append('contactEmail', payload.contactEmail.trim());
  form.append('idDocument', payload.idDocument, payload.idDocument.name);
  form.append('selfie', payload.selfie, payload.selfie.name);

  return requestApi<SupportRequestRecord>('/api/support-requests/suspension-appeal', {
    method: 'POST',
    body: form,
  });
}

export function createGeneralSuspensionAppeal(payload: CreateGeneralSuspensionAppealPayload) {
  return requestApi<SupportRequestRecord>('/api/support-requests/general-suspension-appeal', {
    method: 'POST',
    body: JSON.stringify({
      ...(payload.contactEmail ? { contactEmail: payload.contactEmail.trim() } : {}),
      message: payload.message.trim(),
    }),
  });
}

export function getSupportRequests(options: {
  status?: 'open' | 'in_progress' | 'closed' | 'dismissed' | 'all';
  category?: 'all' | 'suspension_appeal';
  limit?: number;
  offset?: number;
} = {}) {
  const searchParams = new URLSearchParams();

  if (options.status) {
    searchParams.set('status', options.status);
  }
  if (options.category) {
    searchParams.set('category', options.category);
  }
  searchParams.set('limit', String(options.limit ?? 25));
  searchParams.set('offset', String(options.offset ?? 0));

  return requestApi<SupportRequestAdminListResponse>(`/api/admin/support-requests?${searchParams.toString()}`);
}

export function replyToSupportRequest(requestId: string, payload: ReplySupportRequestPayload) {
  return requestApi<ReplySupportRequestResult>(`/api/admin/support-requests/${encodeURIComponent(requestId)}/replies`, {
    method: 'POST',
    body: JSON.stringify({
      message: payload.message.trim(),
    }),
  });
}
