import type { AuthSessionPayload } from './authApi';

export function canTestOnboarding(user: AuthSessionPayload['user'] | null | undefined) {
  return user?.moderatorRole === 'admin'
    && user.emailVerifiedAt != null
    && user.email.trim().toLowerCase() === 'julienlenazny@gmail.com';
}
