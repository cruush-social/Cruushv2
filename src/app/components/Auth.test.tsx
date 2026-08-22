import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Auth from './Auth';
import { AUTH_POLICY_LINKS } from './PublicPolicyLinks';

const authCss = readFileSync('src/app/components/Auth.css', 'utf8');

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
    expect(authCss).toContain('place-items: center;');
    expect(authCss).toContain('width: 100dvw;');
    expect(authCss).toContain('width: min(20.5rem, calc(100dvw - 1.5rem));');
    expect(authCss).toContain('width: 100%;');
  });

  it('makes the mobile auth shell the touch scroll owner', () => {
    render(<Auth onAuth={vi.fn()} />);

    expect(authCss).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.launch-login-auth-shell \{[\s\S]*?height: 100dvh;[\s\S]*?overflow-y: scroll;[\s\S]*?overscroll-behavior-y: auto;[\s\S]*?-webkit-overflow-scrolling: touch;[\s\S]*?touch-action: pan-y;/);
  });

  it('keeps the age suspension appeal reachable from sign in', () => {
    render(<Auth onAuth={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Appeal an age-related suspension' })).toHaveAttribute(
      'href',
      '/support?appeal=1',
    );
  });

  it('keeps general support reachable from sign in', () => {
    render(<Auth onAuth={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute(
      'href',
      '/support',
    );
  });

  it('keeps readable spacing between mobile auth form controls', () => {
    expect(authCss).toContain('margin-top: 0.48rem !important;');
    expect(authCss).toContain('margin-top: 0.72rem !important;');
    expect(authCss).toContain('margin-top: 0.62rem !important;');
    expect(authCss).toContain('gap: 0.44rem;');
    expect(authCss).toContain('min-height: 2rem;');
  });

  it('keeps the auth landing surface constrained to one viewport', () => {
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
    expect(authCss).toContain('height: 100dvh');
    expect(authCss).toContain('overflow: hidden');
    expect(authCss).not.toContain('launch-login-auth-rain-pane');
  });

  it('shows a resend verification action after an unverified login attempt', async () => {
    const { container } = render(<Auth onAuth={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'cruush' })).toHaveClass('sr-only');
    expect(screen.getByTestId('launch-login-auth-brand')).toHaveClass('launch-login-auth-brand');
    expect(screen.getByTestId('launch-login-auth-logo')).toHaveClass('launch-login-auth-logo-image');
    expect(screen.queryByTestId('launch-login-brand-mark')).not.toBeInTheDocument();
    expect(screen.getByTestId('launch-login-map-teaser')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('launch-login-auth-panel')).toHaveClass('launch-login-auth-card');
    expect(screen.queryByTestId('launch-login-auth-captcha')).not.toBeInTheDocument();
    expect(screen.queryByTestId('launch-login-foreground-rain-pane')).not.toBeInTheDocument();
    expect(screen.getByTestId('launch-login-video-logo-scrub')).toBeInTheDocument();
    expect(screen.queryByTestId('launch-login-map-scene')).not.toBeInTheDocument();
    const humanCheckInput = screen.getByTestId('launch-login-auth-human-check-input');
    expect(humanCheckInput).toHaveAttribute('tabindex', '-1');
    expect(humanCheckInput).toHaveAttribute('name', 'cruush_auth_middle_name');
    expect(humanCheckInput).toHaveAttribute('autocomplete', 'off');
    expect(humanCheckInput).toHaveAttribute('data-lpignore', 'true');
    expect(humanCheckInput).toHaveAttribute('data-bwignore', 'true');
    expect(container.querySelectorAll('[data-testid="launch-login-map-teaser"] img')).toHaveLength(0);
    expect(screen.getByTestId('launch-login-auth-tagline')).toHaveTextContent('queer cruisers cruise cruush');
    expect(screen.getByLabelText('Email')).toHaveClass('launch-login-auth-input');
    const signInButton = screen.getByRole('button', { name: 'Sign In' });
    expect(signInButton).toHaveClass('launch-login-auth-submit');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'river@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-123' } });
    fireEvent.click(signInButton);

    const captchaSlot = await screen.findByTestId('launch-login-auth-captcha');
    expect(captchaSlot).toHaveClass('launch-login-auth-captcha');
    expect(captchaSlot.compareDocumentPosition(signInButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await screen.findByText('Mock Turnstile');

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
    const contactLink = screen.getByRole('link', { name: 'hello@cruush.app' });
    const footer = screen.getByTestId('launch-login-auth-footer');
    expect(footer).toContainElement(contactLink);
    expect(footer).toContainElement(legalNotice);
    expect(contactLink).toHaveClass('launch-login-auth-contact');
    expect(contactLink).toHaveAttribute('href', 'mailto:hello@cruush.app');
    expect(contactLink.compareDocumentPosition(legalNotice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(legalNotice).toHaveClass('text-center', 'text-white/30');
    expect(screen.queryByText('Legal and safety')).not.toBeInTheDocument();
    for (const link of AUTH_POLICY_LINKS) {
      expect(within(legalNotice).getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.path,
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
    expect(signInPassword).toHaveAttribute('placeholder', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(signInPassword).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(signInPassword).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));

    const signUpPassword = screen.getByLabelText('Password');
    const confirmPassword = screen.getByLabelText('Confirm Password');
    expect(signUpPassword).toHaveAttribute('type', 'password');
    expect(confirmPassword).toHaveAttribute('type', 'password');
    expect(signUpPassword).toHaveAttribute('placeholder', 'password');
    expect(confirmPassword).toHaveAttribute('placeholder', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show confirm password' }));

    expect(signUpPassword).toHaveAttribute('type', 'text');
    expect(confirmPassword).toHaveAttribute('type', 'text');
  });

  it('keeps the password reset link directly under the account switch', () => {
    render(<Auth onAuth={vi.fn()} />);

    const signUpSwitch = screen.getByRole('button', { name: "Don't have an account? Sign up" });
    let resetLink = screen.getByRole('button', { name: 'Forgot your password?' });
    expect(signUpSwitch.compareDocumentPosition(resetLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(signUpSwitch);

    const signInSwitch = screen.getByRole('button', { name: 'Already have an account? Sign in' });
    resetLink = screen.getByRole('button', { name: 'Forgot your password?' });
    expect(signInSwitch.compareDocumentPosition(resetLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not show launch rave tickets on the auth surface', async () => {
    render(<Auth onAuth={vi.fn()} />);

    expect(screen.queryByRole('link', { name: 'Launch rave tickets' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));
    expect(screen.queryByTestId('launch-login-auth-captcha')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'river@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password-123' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Accept the Terms of Service' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Accept the Privacy Policy' }));

    expect(screen.queryByRole('link', { name: 'Launch rave tickets' })).not.toBeInTheDocument();
    expect(await screen.findByTestId('launch-login-auth-captcha')).toBeInTheDocument();
  });

  it('opens alpha visitors on signup without launch rave tickets visible', async () => {
    getAppMeta.mockResolvedValue({
      service: 'cruush-server',
      auth: 'session-cookie',
      storage: 'postgres',
      migratedFromSupabase: true,
      alphaTest: {
        enabled: true,
        active: true,
        endsAt: '2026-08-07T07:59:00.000Z',
        ended: false,
      },
    });

    render(<Auth onAuth={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Alpha password')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));

    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Alpha password')).toHaveAttribute('placeholder', 'alpha password');
    expect(screen.queryByRole('link', { name: 'Launch rave tickets' })).not.toBeInTheDocument();
  });

  it('shows alpha signup and the beta radius check before account creation', async () => {
    getAppMeta.mockResolvedValue({
      service: 'cruush-server',
      auth: 'session-cookie',
      storage: 'postgres',
      migratedFromSupabase: true,
      alphaTest: {
        enabled: true,
        active: true,
        endsAt: '2026-08-07T07:59:00.000Z',
        ended: false,
      },
      betaAccess: {
        enabled: true,
      },
    });

    render(<Auth onAuth={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Alpha password')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check my location' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));

    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Alpha password')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check my location' })).toBeInTheDocument();
    expect(screen.getAllByText('NYC open beta.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Launch rave tickets' })).not.toBeInTheDocument();
  });

  it('fails closed to alpha signup and beta radius check when launch metadata is unavailable', async () => {
    getAppMeta.mockRejectedValue(new Error('meta unavailable'));

    render(<Auth onAuth={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Alpha password')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }));

    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Alpha password')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check my location' })).toBeInTheDocument();
    expect(screen.getAllByText('NYC open beta.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Launch rave tickets' })).not.toBeInTheDocument();
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
    expect(screen.queryByLabelText('Display Name')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'river@example.com' } });
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1994-06-15' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password-123' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Accept the Terms of Service' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Accept the Privacy Policy' }));
    await screen.findByText('Mock Turnstile');
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(signUp).toHaveBeenCalledWith(expect.objectContaining({
      referralCode: 'abcdefghijklmnop',
    })));
    expect(signUp.mock.calls[0]?.[0]).not.toHaveProperty('displayName');
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
    expect(screen.queryByLabelText('Display Name')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'river@example.com' } });
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1994-06-15' } });
    fireEvent.change(alphaPasswordInput, { target: { value: 'door-password' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password-123' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Accept the Terms of Service' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Accept the Privacy Policy' }));
    await screen.findByText('Mock Turnstile');
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(signUp).toHaveBeenCalledWith(expect.objectContaining({
      alphaPassword: 'door-password',
    })));
    expect(signUp.mock.calls[0]?.[0]).not.toHaveProperty('displayName');
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
    await screen.findByText('Mock Turnstile');
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    const codeInput = await screen.findByLabelText('MFA code or recovery code');
    fireEvent.change(codeInput, { target: { value: '123456' } });
    await screen.findByText('Mock Turnstile');
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(signIn).toHaveBeenLastCalledWith(expect.objectContaining({
      twoFactorCode: '123456',
    })));
    expect(onAuth).toHaveBeenCalledTimes(1);
  });
});
