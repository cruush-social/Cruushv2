import { ApiClientError } from './apiClient';
import { getAuthSession, type AuthSessionPayload } from './authApi';

type StoredCruushUser = {
  age?: number | null;
  display_name?: string;
  email_verified_at?: string | null;
  id?: string;
  name?: string;
  year_of_birth?: number | null;
  moderator_role?: 'admin' | 'moderator' | null;
};

const VERIFICATION_PREVIEW_URL_KEY = 'cruush_verification_preview_url';

function readStoredUser() {
  const storedUser = localStorage.getItem('cruush_user');

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser) as StoredCruushUser;
  } catch {
    return null;
  }
}

export function persistCurrentUser(user: StoredCruushUser) {
  const existingUser = readStoredUser();
  const nextUser: StoredCruushUser = {
    ...existingUser,
    ...user,
  };

  localStorage.setItem('cruush_user', JSON.stringify(nextUser));
}

export function clearCurrentUser() {
  localStorage.removeItem('cruush_auth');
  localStorage.removeItem('cruush_user');
  localStorage.removeItem(VERIFICATION_PREVIEW_URL_KEY);
  sessionStorage.clear();
}

export function getStoredUserId() {
  return readStoredUser()?.id ?? null;
}

export function getStoredCurrentUser() {
  return readStoredUser();
}

export function persistSessionUser(session: AuthSessionPayload) {
  const yearOfBirth = session.profile?.yearOfBirth ?? null;
  const displayName = session.profile?.displayName?.trim() || session.user.displayName;

  persistCurrentUser({
    id: session.user.id,
    name: displayName,
    display_name: displayName,
    age: yearOfBirth ? new Date().getFullYear() - yearOfBirth : null,
    email_verified_at: session.user.emailVerifiedAt,
    year_of_birth: yearOfBirth,
    moderator_role: session.user.moderatorRole ?? null,
  });

  if (session.user.emailVerifiedAt) {
    clearVerificationPreviewUrl();
  }
}

export function getVerificationPreviewUrl() {
  return localStorage.getItem(VERIFICATION_PREVIEW_URL_KEY);
}

export function setVerificationPreviewUrl(previewUrl: string | null) {
  if (previewUrl) {
    localStorage.setItem(VERIFICATION_PREVIEW_URL_KEY, previewUrl);
    return;
  }

  localStorage.removeItem(VERIFICATION_PREVIEW_URL_KEY);
}

export function clearVerificationPreviewUrl() {
  localStorage.removeItem(VERIFICATION_PREVIEW_URL_KEY);
}

export async function loadCurrentSession() {
  try {
    const session = await getAuthSession();
    persistSessionUser(session);
    return session;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      clearCurrentUser();
      return null;
    }

    throw error;
  }
}

export async function getCurrentUserId() {
  const storedUserId = getStoredUserId();

  if (storedUserId) {
    return storedUserId;
  }

  const session = await loadCurrentSession();

  if (session?.user.id) {
    return session.user.id;
  }

  throw new Error('Unable to determine the current user.');
}
