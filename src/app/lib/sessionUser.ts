import { ApiClientError } from './apiClient';
import { getAuthSession, type AuthSessionPayload } from './authApi';

type StoredCruushUser = {
  age?: number | null;
  display_name?: string;
  id?: string;
  name?: string;
  year_of_birth?: number | null;
};

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
}

export function getStoredUserId() {
  return readStoredUser()?.id ?? null;
}

export function persistSessionUser(session: AuthSessionPayload) {
  const yearOfBirth = session.profile?.yearOfBirth ?? null;
  const displayName = session.profile?.displayName?.trim() || session.user.displayName;

  persistCurrentUser({
    id: session.user.id,
    name: displayName,
    display_name: displayName,
    age: yearOfBirth ? new Date().getFullYear() - yearOfBirth : null,
    year_of_birth: yearOfBirth,
  });
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
