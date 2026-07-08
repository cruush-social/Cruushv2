import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Auth from './Auth';

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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        id: 'support-1',
        status: 'open',
        aiTriageStatus: 'pending',
        createdAt: '2026-07-07T12:00:00.000Z',
      },
    }), { status: 201 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a resend verification action after an unverified login attempt', async () => {
    render(<Auth onAuth={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'cruush' })).toHaveClass('cruush-logo-text');

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

  it('lets signed-out visitors contact support and reach public policy pages', async () => {
    render(<Auth onAuth={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Human trafficking policy' })).toHaveAttribute(
      'href',
      'https://www.cruush.app/human-trafficking-policy',
    );
    expect(screen.getByRole('link', { name: 'Report or request removal of content' })).toHaveAttribute(
      'href',
      'https://www.cruush.app/content-removal',
    );

    fireEvent.change(screen.getByLabelText('Reply email'), {
      target: { value: 'reviewer@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Support subject'), {
      target: { value: 'Question about reviewer access' },
    });
    fireEvent.change(screen.getByLabelText('Support message'), {
      target: { value: 'Can support help answer a bank reviewer question?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to support' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/support-requests', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        category: 'question',
        subject: 'Question about reviewer access',
        message: 'Can support help answer a bank reviewer question?',
        contactEmail: 'reviewer@example.com',
        source: 'auth',
        pageUrl: '/',
      }),
    })));
    expect(await screen.findByText('Support request sent')).toBeInTheDocument();
  });
});
