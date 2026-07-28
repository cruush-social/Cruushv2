import { useCallback, useState } from 'react';
import {
  requestPasswordReset,
  resendVerificationEmail,
  signIn,
  signUp,
  type AuthSessionPayload
} from '../lib/authApi';
import { persistSessionUser, setVerificationPreviewUrl } from '../lib/sessionUser';
import { CruushIcon } from './CruushIconImage';
import LaunchLoginMapTeaser, { LaunchLoginWaterPane } from './LaunchLoginMapTeaser';
import PublicPolicyLinks from './PublicPolicyLinks';
import Turnstile, { getTurnstileSiteKey } from './Turnstile';
import './Auth.css';

interface AuthProps {
  onAuth: (session: AuthSessionPayload) => void;
}

export default function Auth({ onAuth }: AuthProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [referralCode] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('ref')?.trim() ?? '';
    const validUrlCode = /^[A-Za-z0-9_-]{16,64}$/.test(fromUrl) ? fromUrl : '';

    try {
      if (validUrlCode) {
        window.sessionStorage.setItem('cruush_referral_code', validUrlCode);
        return validUrlCode;
      }

      const stored = window.sessionStorage.getItem('cruush_referral_code') ?? '';
      return /^[A-Za-z0-9_-]{16,64}$/.test(stored) ? stored : '';
    } catch {
      return validUrlCode;
    }
  });
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [verificationPreviewUrl, setLocalVerificationPreviewUrl] = useState<string | null>(null);
  const [verificationRetryAvailable, setVerificationRetryAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const isSignUp = mode === 'signup';
  const isForgotPassword = mode === 'forgot';
  const turnstileSiteKey = getTurnstileSiteKey();
  const handleCaptchaTokenChange = useCallback((token: string) => {
    setCaptchaToken(token);
  }, []);
  const handleCaptchaError = useCallback((message: string) => {
    setCaptchaToken('');
    setError(message);
    setNotice('');
    setVerificationRetryAvailable(false);
  }, []);

  const resetCaptcha = () => {
    setCaptchaToken('');
    setCaptchaResetKey((current) => current + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setVerificationRetryAvailable(false);
    setIsLoading(true);

    if (isForgotPassword) {
      try {
        const delivery = await requestPasswordReset(email);
        setLocalVerificationPreviewUrl(delivery.previewUrl);
        setNotice('If that email belongs to an account, a reset link is on the way.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to request a password reset.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (turnstileSiteKey && !captchaToken) {
      setError('Complete the captcha to continue.');
      setIsLoading(false);
      return;
    }

    if (isSignUp) {
      if (!displayName.trim()) {
        setError('Display name is required');
        setIsLoading(false);
        return;
      }
      if (displayName.trim().length < 2) {
        setError('Display name must be at least 2 characters');
        setIsLoading(false);
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        setIsLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setIsLoading(false);
        return;
      }
    }

    try {
      if (isSignUp) {
        const delivery = await signUp({
          email,
          password,
          displayName: displayName.trim(),
          captchaToken,
          referralCode: referralCode || undefined,
        });
        try {
          window.sessionStorage.removeItem('cruush_referral_code');
        } catch {
          // Storage can be unavailable in privacy-restricted browsers.
        }
        setVerificationPreviewUrl(delivery.previewUrl);
        setLocalVerificationPreviewUrl(delivery.previewUrl);
        setNotice('Check your email to verify your account, then sign in.');
        setMode('signin');
        setPassword('');
        setConfirmPassword('');
        setIsLoading(false);
        resetCaptcha();
      } else {
        const session = await signIn({
          email,
          password,
          captchaToken,
          twoFactorCode: twoFactorRequired ? twoFactorCode : undefined,
        });
        persistSessionUser(session);
        setIsLoading(false);
        onAuth(session);
      }
    } catch (err) {
      const errorCode = err instanceof Error ? (err as Error & { code?: string }).code : undefined;

      if (errorCode === 'EMAIL_VERIFICATION_REQUIRED') {
        setError(err instanceof Error ? err.message : 'Email verification is required.');
        setVerificationRetryAvailable(true);
        setIsLoading(false);
        return;
      }

      if (errorCode === 'TWO_FACTOR_REQUIRED') {
        setTwoFactorRequired(true);
        setError('Enter the code from your authenticator app or a recovery code.');
        setIsLoading(false);
        resetCaptcha();
        return;
      }

      if (errorCode === 'INVALID_TWO_FACTOR_CODE') {
        setTwoFactorRequired(true);
        setError(err instanceof Error ? err.message : 'Two-factor code is invalid.');
        setIsLoading(false);
        setTwoFactorCode('');
        resetCaptcha();
        return;
      }

      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
      setVerificationRetryAvailable(false);
      setIsLoading(false);
      resetCaptcha();
    }
  };

  const toggleMode = () => {
    setMode(isSignUp ? 'signin' : 'signup');
    setError('');
    setNotice('');
    setVerificationRetryAvailable(false);
    setConfirmPassword('');
    setTwoFactorCode('');
    setTwoFactorRequired(false);
    setLocalVerificationPreviewUrl(null);
    resetCaptcha();
  };

  const showForgotPassword = () => {
    setMode('forgot');
    setError('');
    setNotice('');
    setVerificationRetryAvailable(false);
    setPassword('');
    setConfirmPassword('');
    setTwoFactorCode('');
    setTwoFactorRequired(false);
    setLocalVerificationPreviewUrl(null);
    resetCaptcha();
  };

  const showSignIn = () => {
    setMode('signin');
    setError('');
    setNotice('');
    setVerificationRetryAvailable(false);
    setPassword('');
    setConfirmPassword('');
    setTwoFactorCode('');
    setTwoFactorRequired(false);
    setLocalVerificationPreviewUrl(null);
    resetCaptcha();
  };

  const handleResendVerification = async () => {
    setError('');
    setNotice('');
    setIsLoading(true);

    try {
      const delivery = await resendVerificationEmail({
        email,
        password,
      });
      setVerificationPreviewUrl(delivery.previewUrl);
      setLocalVerificationPreviewUrl(delivery.previewUrl);
      setNotice('Verification email sent. Check your inbox, then sign in again.');
      setVerificationRetryAvailable(false);
      resetCaptcha();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend the verification email.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start sm:justify-center px-6 py-8 relative overflow-x-hidden overflow-y-auto">
      <LaunchLoginMapTeaser />
      <div className="w-full max-w-[20rem] space-y-10 relative z-10">
        {/* Logo */}
        <div className="text-center">
          <div>
            <h1 className="sr-only">cruush</h1>
            <div className="h-64 sm:h-80" />
          </div>
        </div>

        {/* Auth form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-[#d11f3a]/10 border border-[#d11f3a]/30 text-[#ff0072] text-sm rounded">
              {error}
            </div>
          )}

          {notice && (
            <div className="p-3 bg-white/5 border border-white/10 text-white/70 text-sm rounded space-y-2">
              <div className="flex items-start gap-2">
                <CruushIcon name="notifications" className="mt-0.5 h-4 w-4" variant="colored" />
                <span>{notice}</span>
              </div>
              {verificationPreviewUrl ? (
                <a className="block text-[#004bff] underline" href={verificationPreviewUrl}>
                  Open link
                </a>
              ) : null}
            </div>
          )}

          {verificationRetryAvailable && !notice ? (
            <div className="p-3 bg-white/5 border border-white/10 text-white/70 text-sm rounded space-y-3">
              <p>That account is not verified yet.</p>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={isLoading}
                className="w-full h-11 text-sm text-white bg-white/10 border border-white/15 rounded-sm hover:bg-white/15 disabled:opacity-50"
              >
                Resend verification email
              </button>
            </div>
          ) : null}

          {!isForgotPassword && isSignUp && (
            <div className="space-y-2">
              <label htmlFor="displayName" className="sr-only">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="how you'll appear"
                className="w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
                required={isSignUp}
                disabled={isLoading}
              />
            </div>
          )}

          {!isForgotPassword && !isSignUp && twoFactorRequired ? (
            <div className="space-y-2">
              <label htmlFor="twoFactorCode" className="sr-only">
                Authenticator or recovery code
              </label>
              <input
                id="twoFactorCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value)}
                placeholder="123456"
                className="w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
                required
                disabled={isLoading}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
              required
              disabled={isLoading}
            />
          </div>

          {!isForgotPassword && (
            <div className="space-y-2">
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
                required
                disabled={isLoading}
                minLength={isSignUp ? 8 : 1}
              />
            </div>
          )}

          {!isForgotPassword && isSignUp && (
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="sr-only">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
                required={isSignUp}
                disabled={isLoading}
              />
            </div>
          )}

          {!isForgotPassword && (
            <Turnstile
              onTokenChange={handleCaptchaTokenChange}
              onError={handleCaptchaError}
              resetKey={captchaResetKey}
            />
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="launch-login-auth-submit w-full h-12 rounded-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
            style={{
              background: 'var(--cruush-gradient)',
            }}
          >
            {isLoading ? (
              <span className="relative z-10 flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {isSignUp ? 'Creating Account...' : isForgotPassword ? 'Sending Reset Link...' : 'Signing In...'}
              </span>
            ) : (
              <span className="relative z-10">{isSignUp ? 'Create Account' : isForgotPassword ? 'Send Reset Link' : 'Sign In'}</span>
            )}
          </button>

          <div className="space-y-3">
            <button
              type="button"
              onClick={isForgotPassword ? showSignIn : toggleMode}
              disabled={isLoading}
              className="w-full text-sm text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
            >
              {isForgotPassword
                ? 'Back to sign in'
                : isSignUp
                  ? 'Already have an account? Sign in'
                  : "Don't have an account? Sign up"}
            </button>

            {!isSignUp && !isForgotPassword ? (
              <button
                type="button"
                onClick={showForgotPassword}
                disabled={isLoading}
                className="w-full text-sm text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
              >
                Forgot your password?
              </button>
            ) : null}
          </div>
        </form>

        <PublicPolicyLinks variant="compact" />
      </div>
      <LaunchLoginWaterPane className="launch-login-map-teaser__water-pane--foreground" />
    </div>
  );
}
