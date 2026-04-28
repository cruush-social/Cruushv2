import supabase from '../../../utils/supabase/client';

type StoredCruushUser = {
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

export async function getCurrentUserId() {
  const parsed = readStoredUser();

  if (parsed?.id) {
    return parsed.id;
  }

  const { data, error } = await supabase.auth.getUser();

  if (!error && data.user?.id) {
    persistCurrentUser({
      id: data.user.id,
      name: parsed?.name ?? data.user.user_metadata?.display_name ?? data.user.email ?? 'Cruush user',
      display_name: parsed?.display_name ?? data.user.user_metadata?.display_name ?? data.user.email ?? 'Cruush user',
      year_of_birth: parsed?.year_of_birth ?? null,
    });
    return data.user.id;
  }

  throw new Error('Unable to determine the current user.');
}
