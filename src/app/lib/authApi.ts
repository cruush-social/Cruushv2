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

export function getAuthSession() {
  return requestApi<AuthSessionPayload>('/api/auth/me');
}

export function signUp(payload: { email: string; password: string; displayName: string }) {
  return requestApi<AuthSessionPayload>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function signIn(payload: { email: string; password: string }) {
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
