import { ApiClientError } from './apiClient';
import { getAuthSession, type AuthSessionPayload } from './authApi';
import { clearDeletedAccountDistancePreferences } from './distancePreferences';
import { clearOnboardingDraft } from './onboardingDraft';
import { clearDeletedAccountNoticeFlags } from './persistentNotice';

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
const deletedAccountIds = new Set<string>();

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
  const userId = user.id ?? existingUser?.id;
  if (userId && deletedAccountIds.has(userId)) return;
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

/** Account erasure is broader than logout, but never clears another account's cache. */
export function clearDeletedAccountUser(deletedUserId?: string | null) {
  let currentUserId: string | null = null;
  try { currentUserId = getStoredUserId(); } catch { /* Attempt known-key erasure below. */ }
  const userId = deletedUserId ?? currentUserId;
  const ownsCurrentSession = !currentUserId || currentUserId === userId;
  const remove = (key: string) => {
    try { localStorage.removeItem(key); } catch { /* Continue with other account data. */ }
  };

  if (userId) {
    deletedAccountIds.add(userId);
    const accountKeys = [
      `cruush:pulse-gesture-intro-seen:${userId}`,
      `cruush:affiliate-login-day:v1:${userId}`,
    ];
    // Earlier versions carry the same account ID and must also be erased.
    const versionedPrefixes = [
      'cruush:first-entry-push:', 'cruush:first-entry-push-completed:',
      'cruush:first-entry-install:', 'cruush:first-entry-purgatory:',
      'cruush:affiliate-login-day:',
    ];
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && versionedPrefixes.some(prefix => key.startsWith(prefix)
          && /^v\d+$/.test(key.slice(prefix.length, -(userId.length + 1)))
          && key.endsWith(`:${userId}`))) accountKeys.push(key);
      }
    } catch { /* Fixed keys and cookie fallbacks can still be removed. */ }
    // These fixed keys also work when the browser blocks key enumeration.
    for (const prefix of versionedPrefixes) accountKeys.push(`${prefix}v1:${userId}`);
    accountKeys.forEach(remove);
    clearDeletedAccountNoticeFlags(userId);
  }

  clearDeletedAccountDistancePreferences(userId, ownsCurrentSession);
  if (!ownsCurrentSession) return;
  clearOnboardingDraft();
  [
    'cruush_auth', 'cruush_user', VERIFICATION_PREVIEW_URL_KEY,
    'cruush.activity.seenAt', 'feed.mutual.seenAt',
    'cruush:dl-mode-enabled', 'cruush:dl-mode-show-only-exception',
  ].forEach(remove);
  try { sessionStorage.clear(); } catch { /* The browser may deny storage access. */ }
}

export function getStoredUserId() {
  return readStoredUser()?.id ?? null;
}

export function getStoredCurrentUser() {
  return readStoredUser();
}

export function persistSessionUser(session: AuthSessionPayload) {
  if (deletedAccountIds.has(session.user.id)) return;
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
    if (deletedAccountIds.has(session.user.id)) return null;
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
