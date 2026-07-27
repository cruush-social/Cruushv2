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
  default: ({ onTokenChange }: { onTokenChange: (token: string) => void }) => {
    useEffect(() => {
      onTokenChange('captcha-token');
    }, [onTokenChange]);

    return <div>Mock Turnstile</div>;
  },
  getTurnstileSiteKey: () => 'site-key',
}));

describe('Auth', () => {
  beforeEach(() => {
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
    expect(container.querySelector('img[src*="cruush-logo.svg"]')).toHaveAttribute('alt', 'cruush');
    expect(screen.getByText('queer cruisers cruise cruush')).toBeInTheDocument();

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
});
