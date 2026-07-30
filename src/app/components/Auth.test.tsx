import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Auth from './Auth';
import { AUTH_POLICY_LINKS } from './PublicPolicyLinks';

const { signIn, resendVerificationEmail, signUp, requestPasswordReset, getAppMeta } = vi.hoisted(() => ({
  signIn: vi.fn(),
  resendVerificationEmail: vi.fn(),
  signUp: vi.fn(),
  requestPasswordReset: vi.fn(),
  getAppMeta: vi.fn(),
}));

vi.mock('../lib/authApi', () => ({
  signIn,
  signUp,
  resendVerificationEmail,
  requestPasswordReset,
}));

vi.mock('../lib/metaApi', () => ({
  getAppMeta,
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
    getAppMeta.mockReset();
    getAppMeta.mockResolvedValue({
      service: 'cruush-server',
      auth: 'session-cookie',
      storage: 'postgres',
      migratedFromSupabase: true,
      alphaTest: {
        enabled: false,
        active: false,
        endsAt: null,
        ended: false,
      },
    });
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

  it('keeps the mobile auth layout centered without a left offset', () => {
    render(<Auth onAuth={vi.fn()} />);

    const cssText = Array.from(document.styleSheets).map((sheet) => Array.from(sheet.cssRules ?? []).map((rule) => rule.cssText).join('\n')).join('\n');

    expect(cssText).not.toContain('--auth-mobile-center-shift');
  });

  it('does not pin the mobile footer actions over the form', () => {
    render(<Auth onAuth={vi.fn()} />);

    const cssText = Array.from(document.styleSheets).map((sheet) => Array.from(sheet.cssRules ?? []).map((rule) => rule.cssText).join('\n')).join('\n');

    expect(cssText).not.toContain('position: fixed');
    expect(cssText).not.toContain('overflow-y-auto');
  });

  it('allows the mobile auth wrapper and card to grow without clipping', () => {
    const { container } = render(<Auth onAuth={vi.fn()} />);

    const shell = container.querySelector('.launch-login-auth-shell');
    const card = container.querySelector('.launch-login-auth-card');

    expect(shell).toBeInTheDocument();
    expect(card).toBeInTheDocument();
    expect(shell?.className).toContain('overflow-x-hidden');
    expect(shell?.className).not.toContain('overflow-y-auto');
    expect(card?.className).not.toContain('overflow-y-auto');
    expect(shell?.className).not.toContain('fixed');
    expect(card?.className).not.toContain('fixed');
  });

  it('shows a resend verification action after an unverified login attempt', async () => {
    const { container } = render(<Auth onAuth={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'cruush' })).toHaveClass('sr-only');
    expect(screen.getByTestId('launch-login-auth-brand')).toHaveClass('launch-login-auth-brand');
    expect(screen.getByTestId('launch-login-auth-logo')).toHaveClass('launch-login-auth-logo-image');
    expect(screen.queryByTestId('launch-login-brand-mark')).not.toBeInTheDocument();
    expect(screen.getByTestId('launch-login-map-teaser')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('launch-login-auth-panel')).toHaveClass('launch-login-auth-card');
    const captchaSlot = screen.getByTestId('launch-login-auth-captcha');
    expect(captchaSlot).toHaveClass('launch-login-auth-captcha');
    expect(screen.getByTestId('launch-login-foreground-water-pane')).toHaveClass('launch-login-auth-rain-pane');
    const humanCheckInput = container.querySelector('#launch-login-auth-extra-url');
    expect(humanCheckInput).toHaveAttribute('tabindex', '-1');
    expect(humanCheckInput).toHaveAttribute('name', 'cruush_auth_extra_url');
    expect(humanCheckInput).toHaveAttribute('autocomplete', 'new-password');
    expect(humanCheckInput).toHaveAttribute('data-lpignore', 'true');
    expect(container.querySelectorAll('[data-testid="launch-login-map-teaser"] img')).toHaveLength(0);
    expect(screen.getByTestId('launch-login-auth-tagline')).toHaveTextContent('queer cruisers cruise cruush');
    expect(screen.getByLabelText('Email')).toHaveClass('launch-login-auth-input');
    const signInButton = screen.getByRole('button', { name: 'Sign In' });
    expect(signInButton).toHaveClass('launch-login-auth-submit');
    expect(signInButton.compareDocumentPosition(captchaSlot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'river@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-123' } });
    fireEvent.click(signInButton);

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

  it('lets people reveal and hide password fields on sign in and sign up', () => {
    render(<Auth onAuth={vi.fn()} />);

    const signInPassword = screen.getByLabelText('Password');
    expect(signInPassword).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(signInPassword).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(signInPassword).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));

    const signUpPassword = screen.getByLabelText('Password');
    const confirmPassword = screen.getByLabelText('Confirm Password');
    expect(signUpPassword).toHaveAttribute('type', 'password');
    expect(confirmPassword).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show confirm password' }));

    expect(signUpPassword).toHaveAttribute('type', 'text');
    expect(confirmPassword).toHaveAttribute('type', 'text');
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

  it('requires and submits the alpha password when alpha signup is enabled', async () => {
    getAppMeta.mockResolvedValue({
      service: 'cruush-server',
      auth: 'session-cookie',
      storage: 'postgres',
      migratedFromSupabase: true,
      alphaTest: {
        enabled: true,
        active: true,
        endsAt: '2026-07-29T03:59:00.000Z',
        ended: false,
      },
    });
    signUp.mockResolvedValue({
      alreadyVerified: false,
      expiresAt: '2026-07-28T12:00:00.000Z',
      previewUrl: null,
    });

    render(<Auth onAuth={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));

    const alphaPasswordInput = await screen.findByLabelText('Alpha password');
    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'River' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'river@example.com' } });
    fireEvent.change(alphaPasswordInput, { target: { value: 'door-password' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(signUp).toHaveBeenCalledWith(expect.objectContaining({
      alphaPassword: 'door-password',
    })));
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
