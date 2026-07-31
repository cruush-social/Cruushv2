import { requestApi } from './apiClient';

export type SupportRequestCategory = 'bug' | 'comment' | 'question' | 'policy';
export type SupportRequestSource = 'auth' | 'settings' | 'policy' | 'unknown';

export type CreateSupportRequestPayload = {
  category: SupportRequestCategory;
  subject: string;
  message: string;
  contactEmail?: string;
  source: SupportRequestSource;
  pageUrl?: string;
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

export function createSupportRequest(payload: CreateSupportRequestPayload) {
  return requestApi<SupportRequestRecord>('/api/support-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
