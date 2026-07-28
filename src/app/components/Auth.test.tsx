import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Auth from './Auth';
import { AUTH_POLICY_LINKS } from './PublicPolicyLinks';

const { signIn, resendVerificationEmail, signUp, requestPasswordReset } = vi.hoisted(() => ({
  signIn: vi.fn(),
  resendVerificationEmail: vi.fn(),
  signUp: vi.fn(),
  requestPasswordReset: vi.fn(),
}));

vi.mock('../lib/authApi', () => ({
  signIn,
  signUp,
  resendVerificationEmail,
  requestPasswordReset,
}));

vi.mock('./Turnstile', () => ({
  default: ({
    onTokenChange,
    resetKey,
  }: {
    onTokenChange: (token: string) => void;
    resetKey: number;
  }) => {
    useEffect(() => {
      onTokenChange('captcha-token');
    }, [onTokenChange, resetKey]);

    return <div>Mock Turnstile</div>;
  },
  getTurnstileSiteKey: () => 'site-key',
}));

describe('Auth', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    window.sessionStorage.clear();
    signIn.mockReset();
    resendVerificationEmail.mockReset();
    signUp.mockReset();
    requestPasswordReset.mockReset();
    signIn.mockRejectedValue(Object.assign(new Error('Verify your email before signing in.'), {
      code: 'EMAIL_VERIFICATION_REQUIRED',
    }));
    resendVerificationEmail.mockResolvedValue({
      alreadyVerified: false,
      expiresAt: '2026-04-30T12:00:00.000Z',
      previewUrl: 'https://cruush.test/verify-email?token=abc',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a resend verification action after an unverified login attempt', async () => {
    const { container } = render(<Auth onAuth={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'cruush' })).toHaveClass('sr-only');
    expect(screen.getByTestId('launch-login-brand-mark')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-map-teaser')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('launch-login-auth-panel')).toHaveClass('launch-login-auth-card');
    expect(screen.getByTestId('launch-login-auth-captcha')).toHaveClass('launch-login-auth-captcha');
    expect(screen.queryByTestId('launch-login-foreground-water-pane')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="launch-login-map-teaser"] img')).toHaveLength(0);
    expect(screen.queryByText('queer cruisers cruise cruush')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveClass('launch-login-auth-input');
    expect(screen.getByRole('button', { name: 'Sign In' })).toHaveClass('launch-login-auth-submit');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'river@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await screen.findByText('Verify your email before signing in.');
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));

    await waitFor(() => expect(resendVerificationEmail).toHaveBeenCalledWith({
      email: 'river@example.com',
      password: 'password-123',
    }));
    expect(await screen.findByText('Verification email sent. Check your inbox, then sign in again.')).toBeInTheDocument();
  });

  it('links signed-out visitors to public policy pages without rendering the support form inline', async () => {
    render(<Auth onAuth={vi.fn()} />);

    const legalNotice = screen.getByLabelText('Legal and safety links');
    expect(legalNotice).toHaveClass('text-xs', 'text-center', 'text-white/30');
    expect(screen.queryByText('Legal and safety')).not.toBeInTheDocument();
    for (const link of AUTH_POLICY_LINKS) {
      expect(within(legalNotice).getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        `https://www.cruush.app${link.path}`,
      );
    }
    expect(screen.queryByLabelText('Contact support')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reply email')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Support subject')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Support message')).not.toBeInTheDocument();
  });

  it('retains a referral query parameter through signup without displaying it', async () => {
    window.history.replaceState({}, '', '/?ref=abcdefghijklmnop');
    signUp.mockResolvedValue({
      alreadyVerified: false,
      expiresAt: '2026-07-28T12:00:00.000Z',
      previewUrl: null,
    });
    render(<Auth onAuth={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));
    expect(screen.getByLabelText('Display Name')).toHaveAttribute('placeholder', 'your name');
    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'River' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'river@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(signUp).toHaveBeenCalledWith(expect.objectContaining({
      referralCode: 'abcdefghijklmnop',
    })));
    expect(screen.queryByText('abcdefghijklmnop')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('cruush_referral_code')).toBeNull();
  });

  it('prompts for and submits a second factor only after the backend requires it', async () => {
    signIn
      .mockRejectedValueOnce(Object.assign(new Error('Enter your authenticator code.'), {
        code: 'TWO_FACTOR_REQUIRED',
      }))
      .mockResolvedValueOnce({
        user: {
          id: '8b2f51cf-65e2-4cb3-b09b-c8cc3e3bbb21',
          email: 'river@example.com',
          displayName: 'River',
          emailVerifiedAt: '2026-07-27T12:00:00.000Z',
          createdAt: '2026-07-01T12:00:00.000Z',
        },
        profile: { displayName: 'River', yearOfBirth: 1990 },
        needsOnboarding: false,
        needsCodeOfConduct: false,
        codeOfConductVersion: '2026-07-07',
        acceptedCodeOfConductVersion: '2026-07-07',
        codeOfConductAcceptedAt: '2026-07-01T12:00:00.000Z',
      });
    const onAuth = vi.fn();
    render(<Auth onAuth={onAuth} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'river@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    const codeInput = await screen.findByLabelText('Authenticator or recovery code');
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(signIn).toHaveBeenLastCalledWith(expect.objectContaining({
      twoFactorCode: '123456',
    })));
    expect(onAuth).toHaveBeenCalledTimes(1);
  });
});
