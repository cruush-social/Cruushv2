import { requestApi } from './apiClient';

export type AuthSessionPayload = {
  user: {
    id: string;
    email: string;
    displayName: string;
    emailVerifiedAt: string | null;
    createdAt: string;
    accountStatus?: 'active' | 'under_review' | 'suspended' | 'banned' | 'deleted';
    moderatorRole?: 'admin' | 'moderator' | null;
  };
  profile: {
    displayName: string | null;
    yearOfBirth: number | null;
  } | null;
  needsOnboarding: boolean;
  needsCodeOfConduct: boolean;
  codeOfConductVersion: string;
  acceptedCodeOfConductVersion: string | null;
  codeOfConductAcceptedAt: string | null;
  alphaTest?: {
    enabled: boolean;
    active: boolean;
    endsAt: string | null;
    ended: boolean;
  };
};

export type VerificationDeliveryPayload = {
  alreadyVerified: boolean;
  email?: string;
  expiresAt: string | null;
  previewUrl: string | null;
  // Absent on older responses. False means the account exists but delivery failed, so the
  // caller should offer a resend rather than reporting a failed signup.
  verificationEmailSent?: boolean;
};

export type VerifyEmailPayload = {
  verified: boolean;
  email: string;
};

export type PasswordResetRequestPayload = {
  accepted: true;
  previewUrl: string | null;
};

export type PasswordResetPayload = {
  reset: true;
};

export type PasswordChangePayload = {
  changed: true;
};

export type ClientSecurityCheckPayload = {
  startedAt: number;
  submittedAt: number;
  trap: string;
};

export type BetaAccessLocationPayload = {
  lat: number;
  lng: number;
  accuracyMeters?: number;
};

export function getAuthSession() {
  return requestApi<AuthSessionPayload>('/api/auth/me');
}

export function signUp(payload: { email: string; password: string; alphaPassword?: string; captchaToken?: string; clientCheck?: ClientSecurityCheckPayload; referralCode?: string; betaAccessLocation?: BetaAccessLocationPayload }) {
  return requestApi<VerificationDeliveryPayload>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function signIn(payload: { email: string; password: string; captchaToken?: string; clientCheck?: ClientSecurityCheckPayload; twoFactorCode?: string; betaAccessLocation?: BetaAccessLocationPayload }) {
  return requestApi<AuthSessionPayload>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function signOut() {
  return requestApi<void>('/api/auth/logout', {
    method: 'POST',
  });
}

export function acceptCodeOfConduct(version: string) {
  return requestApi<AuthSessionPayload>('/api/auth/code-of-conduct/accept', {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}

export function sendVerificationEmail() {
  return requestApi<VerificationDeliveryPayload>('/api/auth/verification/send', {
    method: 'POST',
  });
}

export function verifyEmailToken(token: string) {
  return requestApi<VerifyEmailPayload>('/api/auth/verification/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function resendVerificationEmail(payload: { email: string; password: string }) {
  return requestApi<VerificationDeliveryPayload>('/api/auth/verification/resend', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function requestPasswordReset(email: string) {
  return requestApi<PasswordResetRequestPayload>('/api/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(payload: { token: string; password: string }) {
  return requestApi<PasswordResetPayload>('/api/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function changePassword(payload: { currentPassword: string; newPassword: string }) {
  return requestApi<PasswordChangePayload>('/api/auth/password/change', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteAccount(payload: { password: string; confirmation: 'DELETE' }) {
  return requestApi<void>('/api/auth/me', {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}
