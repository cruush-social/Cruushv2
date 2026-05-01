import { requestApi } from './apiClient';

export type AuthSessionPayload = {
  user: {
    id: string;
    email: string;
    displayName: string;
    emailVerifiedAt: string | null;
    createdAt: string;
  };
  profile: {
    displayName: string | null;
    yearOfBirth: number | null;
  } | null;
  needsOnboarding: boolean;
};

export type VerificationDeliveryPayload = {
  alreadyVerified: boolean;
  email?: string;
  expiresAt: string | null;
  previewUrl: string | null;
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

export function getAuthSession() {
  return requestApi<AuthSessionPayload>('/api/auth/me');
}

export function signUp(payload: { email: string; password: string; displayName: string; captchaToken?: string }) {
  return requestApi<VerificationDeliveryPayload>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function signIn(payload: { email: string; password: string; captchaToken?: string }) {
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
