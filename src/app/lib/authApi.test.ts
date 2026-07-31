import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changePassword,
  deleteAccount,
  requestPasswordReset,
  resetPassword,
  resendVerificationEmail,
  signIn,
  signUp
} from './authApi';

describe('authApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ data: { accepted: true, previewUrl: null } })),
    }));
  });

  it('sends captcha tokens with signup and login requests', async () => {
    await signUp({
      email: 'river@example.com',
      password: 'password-123',
      captchaToken: 'captcha-token',
    });
    await signIn({
      email: 'river@example.com',
      password: 'password-123',
      captchaToken: 'captcha-token',
    });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/auth/signup', expect.objectContaining({
      body: JSON.stringify({
        email: 'river@example.com',
        password: 'password-123',
        captchaToken: 'captcha-token',
      }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/auth/login', expect.objectContaining({
      body: JSON.stringify({
        email: 'river@example.com',
        password: 'password-123',
        captchaToken: 'captcha-token',
      }),
    }));
  });

  it('calls the forgot and reset password endpoints', async () => {
    await requestPasswordReset('river@example.com');
    await resetPassword({
      token: 'reset-token-1234567890',
      password: 'new-password-123',
    });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/auth/password/forgot', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'river@example.com' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/auth/password/reset', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        token: 'reset-token-1234567890',
        password: 'new-password-123',
      }),
    }));
  });

  it('calls the password change and account deletion endpoints', async () => {
    await changePassword({
      currentPassword: 'current-password',
      newPassword: 'new-password-123',
    });
    await deleteAccount({
      password: 'current-password',
      confirmation: 'DELETE',
    });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/auth/password/change', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        currentPassword: 'current-password',
        newPassword: 'new-password-123',
      }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/auth/me', expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({
        password: 'current-password',
        confirmation: 'DELETE',
      }),
    }));
  });

  it('calls the verification resend endpoint', async () => {
    await resendVerificationEmail({
      email: 'river@example.com',
      password: 'password-123',
    });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/auth/verification/resend', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        email: 'river@example.com',
        password: 'password-123',
      }),
    }));
  });
});
