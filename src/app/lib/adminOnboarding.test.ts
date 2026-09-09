import { describe, expect, it } from 'vitest';
import { canTestOnboarding } from './adminOnboarding';
import type { AuthSessionPayload } from './authApi';

describe('admin onboarding test access', () => {
  it('allows only the verified named administrator', () => {
    const user: AuthSessionPayload['user'] = {
      id: 'admin', email: 'julienlenazny@gmail.com', displayName: 'Julien',
      emailVerifiedAt: '2026-09-08', createdAt: '2026-09-08', moderatorRole: 'admin',
    };
    expect(canTestOnboarding(user)).toBe(true);
    expect(canTestOnboarding({ ...user, email: 'another-admin@example.com' })).toBe(false);
    expect(canTestOnboarding({ ...user, moderatorRole: 'moderator' })).toBe(false);
    expect(canTestOnboarding({ ...user, moderatorRole: null })).toBe(false);
    expect(canTestOnboarding({ ...user, emailVerifiedAt: null })).toBe(false);
    expect(canTestOnboarding(null)).toBe(false);
  });
});
