import { useCallback, useState } from 'react';
import { Heart, MailCheck } from 'lucide-react';
import { requestPasswordReset, signIn, signUp, type AuthSessionPayload } from '../lib/authApi';
import { persistSessionUser, setVerificationPreviewUrl } from '../lib/sessionUser';
import Turnstile, { getTurnstileSiteKey } from './Turnstile';

interface AuthProps {
  onAuth: (session: AuthSessionPayload) => void;
}

export default function Auth({ onAuth }: AuthProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [verificationPreviewUrl, setLocalVerificationPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isSignUp = mode === 'signup';
  const isForgotPassword = mode === 'forgot';
  const turnstileSiteKey = getTurnstileSiteKey();
  const handleCaptchaTokenChange = useCallback((token: string) => {
    setCaptchaToken(token);
  }, []);

  const resetCaptcha = () => {
    setCaptchaToken('');
    setCaptchaResetKey((current) => current + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
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
        });
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
        });
        persistSessionUser(session);
        setIsLoading(false);
        onAuth(session);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
      setIsLoading(false);
      resetCaptcha();
    }
  };

  const toggleMode = () => {
    setMode(isSignUp ? 'signin' : 'signup');
    setError('');
    setNotice('');
    setConfirmPassword('');
    setLocalVerificationPreviewUrl(null);
    resetCaptcha();
  };

  const showForgotPassword = () => {
    setMode('forgot');
    setError('');
    setNotice('');
    setPassword('');
    setConfirmPassword('');
    setLocalVerificationPreviewUrl(null);
    resetCaptcha();
  };

  const showSignIn = () => {
    setMode('signin');
    setError('');
    setNotice('');
    setPassword('');
    setConfirmPassword('');
    setLocalVerificationPreviewUrl(null);
    resetCaptcha();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Ambient background gradient */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background:
            'radial-gradient(circle at 20% 30%, rgba(255, 47, 114, 0.15), transparent 50%), radial-gradient(circle at 80% 70%, rgba(122, 43, 255, 0.1), transparent 50%)',
        }}
      />

      <div className="w-full max-w-md space-y-12 relative z-10">
        {/* Logo and tagline */}
        <div className="text-center space-y-6">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <Heart className="w-16 h-16 text-white/10" />
              <div
                className="absolute inset-0 blur-xl opacity-30"
                style={{
                  background: 'radial-gradient(circle, rgba(255, 47, 114, 0.6), transparent 70%)',
                }}
              />
            </div>
          </div>
          <div>
            <h1
              className="text-7xl mb-4"
              style={{
                fontFamily: 'UnifrakturMaguntia, serif',
                background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              cruush
            </h1>
            <p className="text-white/50 text-sm">premium queer cruising for nearby discovery</p>
          </div>
        </div>

        {/* Auth form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-[#d11f3a]/10 border border-[#d11f3a]/30 text-[#ff2f72] text-sm rounded">
              {error}
            </div>
          )}

          {notice && (
            <div className="p-3 bg-white/5 border border-white/10 text-white/70 text-sm rounded space-y-2">
              <div className="flex items-start gap-2">
                <MailCheck className="mt-0.5 h-4 w-4 text-[#22b8ff]" />
                <span>{notice}</span>
              </div>
              {verificationPreviewUrl ? (
                <a className="block text-[#22b8ff] underline" href={verificationPreviewUrl}>
                  Open link
                </a>
              ) : null}
            </div>
          )}

          {!isForgotPassword && isSignUp && (
            <div className="space-y-2">
              <label htmlFor="displayName" className="text-sm text-white/60">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="how you'll appear"
                className="w-full h-12 px-4 bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff2f72]/50 transition-colors rounded-sm"
                required={isSignUp}
                disabled={isLoading}
              />
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm text-white/60">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-12 px-4 bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff2f72]/50 transition-colors rounded-sm"
              required
              disabled={isLoading}
            />
          </div>

          {!isForgotPassword && (
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm text-white/60">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-12 px-4 bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff2f72]/50 transition-colors rounded-sm"
                required
                disabled={isLoading}
                minLength={isSignUp ? 8 : 1}
              />
            </div>
          )}

          {!isForgotPassword && isSignUp && (
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm text-white/60">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-12 px-4 bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff2f72]/50 transition-colors rounded-sm"
                required={isSignUp}
                disabled={isLoading}
              />
            </div>
          )}

          {!isForgotPassword && (
            <Turnstile onTokenChange={handleCaptchaTokenChange} resetKey={captchaResetKey} />
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-14 text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
            }}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
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
              <>{isSignUp ? 'Create Account' : isForgotPassword ? 'Send Reset Link' : 'Sign In'}</>
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

        <p className="text-xs text-center text-white/30">
          By continuing, you agree to our{' '}
          <button className="underline hover:text-white/50">Terms of Service</button> and{' '}
          <button className="underline hover:text-white/50">Privacy Policy</button>
        </p>
      </div>
    </div>
  );
}
