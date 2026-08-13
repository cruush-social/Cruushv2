import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, MapPin } from 'lucide-react';
import {
  requestPasswordReset,
  resendVerificationEmail,
  signIn,
  signUp,
  type BetaAccessLocationPayload,
  type AuthSessionPayload
} from '../lib/authApi';
import { checkBetaAccess, requestBetaCity } from '../lib/betaAccessApi';
import { getAppMeta, type AppMetaPayload } from '../lib/metaApi';
import { persistSessionUser, setVerificationPreviewUrl } from '../lib/sessionUser';
import { CruushIcon } from './CruushIconImage';
import LaunchLoginMapTeaser from './LaunchLoginMapTeaser';
import PublicPolicyLinks from './PublicPolicyLinks';
import Turnstile, { getTurnstileSiteKey } from './Turnstile';
import cruushLogo from '../assets/brand/cruush-logo.svg';
import './Auth.css';

interface AuthProps {
  onAuth: (session: AuthSessionPayload) => void;
}

const FALLBACK_ALPHA_TEST = {
  enabled: true,
  active: true,
  endsAt: null,
  ended: false,
} satisfies AppMetaPayload['alphaTest'];
const FALLBACK_BETA_ACCESS = {
  enabled: true,
} satisfies NonNullable<AppMetaPayload['betaAccess']>;

export default function Auth({ onAuth }: AuthProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [alphaPassword, setAlphaPassword] = useState('');
  const [alphaTest, setAlphaTest] = useState<AppMetaPayload['alphaTest'] | null>(null);
  const [betaAccess, setBetaAccess] = useState<AppMetaPayload['betaAccess'] | null>(null);
  const [betaAccessLocation, setBetaAccessLocation] = useState<BetaAccessLocationPayload | null>(null);
  const [betaAccessStatus, setBetaAccessStatus] = useState<'unknown' | 'checking' | 'allowed' | 'outside'>('unknown');
  const [humanCheckStartedAt, setHumanCheckStartedAt] = useState(() => Date.now());
  const [humanCheckTrap, setHumanCheckTrap] = useState('');
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
  const [captchaRequested, setCaptchaRequested] = useState(false);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modeSelectedByUser, setModeSelectedByUser] = useState(false);
  const [verificationPreviewUrl, setLocalVerificationPreviewUrl] = useState<string | null>(null);
  const [verificationRetryAvailable, setVerificationRetryAvailable] = useState(false);
  const [verificationDeliveryFailed, setVerificationDeliveryFailed] = useState(false);
  const [requestedCity, setRequestedCity] = useState('');
  const [cityRequestNotice, setCityRequestNotice] = useState('');
  const [cityRequestLoading, setCityRequestLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const isSignUp = mode === 'signup';
  const isForgotPassword = mode === 'forgot';
  const turnstileSiteKey = getTurnstileSiteKey();
  const alphaPasswordRequired = Boolean(alphaTest?.enabled && !betaAccess?.enabled);
  const betaAccessRequired = Boolean(betaAccess?.enabled);
  const shouldShowCaptcha = Boolean(
    !isForgotPassword &&
    turnstileSiteKey &&
    (captchaRequested || email.trim() || password || alphaPassword || twoFactorCode)
  );
  const handleCaptchaTokenChange = useCallback((token: string) => {
    setCaptchaToken(token);
  }, []);
  const handleCaptchaError = useCallback((message: string) => {
    setCaptchaToken('');
    setError(message);
    setNotice('');
    setVerificationRetryAvailable(false);
  }, []);

  useEffect(() => {
    let isActive = true;

    getAppMeta()
      .then((meta) => {
        if (isActive) {
          setAlphaTest(meta.alphaTest);
          setBetaAccess(meta.betaAccess ?? null);
          if (!meta.betaAccess?.enabled) {
            setBetaAccessStatus('allowed');
          }
        }
      })
      .catch(() => {
        if (isActive) {
          setAlphaTest(FALLBACK_ALPHA_TEST);
          setBetaAccess(FALLBACK_BETA_ACCESS);
          setBetaAccessStatus('unknown');
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const buildHumanCheck = () => ({
    startedAt: humanCheckStartedAt,
    submittedAt: Date.now(),
    trap: humanCheckTrap,
  });

  const resetHumanCheck = () => {
    setHumanCheckStartedAt(Date.now());
    setHumanCheckTrap('');
  };

  const resetCaptcha = () => {
    setCaptchaToken('');
    setCaptchaRequested(false);
    setCaptchaResetKey((current) => current + 1);
    resetHumanCheck();
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

    if (humanCheckTrap.trim()) {
      setError('Security check failed. Refresh and try again.');
      setIsLoading(false);
      return;
    }

    if (isSignUp && betaAccessRequired && !betaAccessLocation) {
      setError('NYC open beta. Check your location to continue.');
      setIsLoading(false);
      return;
    }

    if (isSignUp) {
      if (alphaPasswordRequired && !alphaPassword.trim()) {
        setError('Alpha password is required');
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
      if (!dateOfBirth) {
        setError('Enter your date of birth.');
        setIsLoading(false);
        return;
      }
    }

    if (turnstileSiteKey && !captchaToken) {
      setCaptchaRequested(true);
      setNotice(`Complete the security check below, then tap ${isSignUp ? 'Create Account' : 'Sign In'}.`);
      setIsLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        const delivery = await signUp({
          email,
          password,
          dateOfBirth,
          alphaPassword: alphaPasswordRequired ? alphaPassword.trim() : undefined,
          captchaToken,
          clientCheck: buildHumanCheck(),
          referralCode: referralCode || undefined,
          betaAccessLocation: betaAccessLocation ?? undefined,
        });
        try {
          window.sessionStorage.removeItem('cruush_referral_code');
        } catch {
          // Storage can be unavailable in privacy-restricted browsers.
        }
        setVerificationPreviewUrl(delivery.previewUrl);
        setLocalVerificationPreviewUrl(delivery.previewUrl);
        const deliveryFailed = delivery.verificationEmailSent === false;
        setVerificationDeliveryFailed(deliveryFailed);
        setVerificationRetryAvailable(deliveryFailed);
        setNotice(deliveryFailed ? '' : 'Check your email to verify your account, then sign in.');
        setModeSelectedByUser(true);
        setMode('signin');
        // Keep the password when delivery failed so the resend control below can use it.
        if (!deliveryFailed) {
          setPassword('');
        }
        setConfirmPassword('');
        setDateOfBirth('');
        setAlphaPassword('');
        setShowPassword(false);
        setShowConfirmPassword(false);
        setIsLoading(false);
        resetCaptcha();
      } else {
        const session = await signIn({
          email,
          password,
          captchaToken,
          clientCheck: buildHumanCheck(),
          twoFactorCode: twoFactorRequired ? twoFactorCode : undefined,
          betaAccessLocation: betaAccessLocation ?? undefined,
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

  const handleBetaAccessCheck = async () => {
    setError('');
    setNotice('');
    setCityRequestNotice('');

    if (!navigator.geolocation) {
      setError('Location services are required to access the launch beta.');
      return;
    }

    setBetaAccessStatus('checking');

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 60_000,
        });
      });
      const location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
      };
      const result = await checkBetaAccess(location);

      if (result.allowed) {
        setBetaAccessLocation(location);
        setBetaAccessStatus('allowed');
        setNotice('Beta access unlocked for your current area.');
      } else {
        setBetaAccessLocation(null);
        setBetaAccessStatus('outside');
      }
    } catch {
      setBetaAccessLocation(null);
      setBetaAccessStatus('unknown');
      setError('Unable to confirm your location. Share location to access the launch beta.');
    }
  };

  const handleBetaCityRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setCityRequestNotice('');

    if (!email.trim()) {
      setError('Email is required for the newsletter.');
      return;
    }

    if (requestedCity.trim().length < 2) {
      setError('Requested city is required.');
      return;
    }

    setCityRequestLoading(true);

    try {
      await requestBetaCity({
        email,
        requestedCity: requestedCity.trim(),
      });
      setCityRequestNotice('You are on the newsletter list. We saved your city request.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save your city request.');
    } finally {
      setCityRequestLoading(false);
    }
  };

  const toggleMode = () => {
    setModeSelectedByUser(true);
    setMode(isSignUp ? 'signin' : 'signup');
    setError('');
    setNotice('');
    setVerificationRetryAvailable(false);
    setConfirmPassword('');
    setDateOfBirth('');
    setAlphaPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setTwoFactorCode('');
    setTwoFactorRequired(false);
    setLocalVerificationPreviewUrl(null);
    resetCaptcha();
  };

  const showForgotPassword = () => {
    setModeSelectedByUser(true);
    setMode('forgot');
    setError('');
    setNotice('');
    setVerificationRetryAvailable(false);
    setPassword('');
    setConfirmPassword('');
    setDateOfBirth('');
    setAlphaPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setTwoFactorCode('');
    setTwoFactorRequired(false);
    setLocalVerificationPreviewUrl(null);
    resetCaptcha();
  };

  const showSignIn = () => {
    setModeSelectedByUser(true);
    setMode('signin');
    setError('');
    setNotice('');
    setVerificationRetryAvailable(false);
    setPassword('');
    setConfirmPassword('');
    setAlphaPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
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
      setVerificationDeliveryFailed(false);
      resetCaptcha();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend the verification email.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="launch-login-auth-shell overflow-x-hidden">
      <LaunchLoginMapTeaser />
      <div className="launch-login-auth-card w-full max-w-[20rem] relative z-10" data-testid="launch-login-auth-panel">
        {/* Logo */}
        <div className="launch-login-auth-brand text-center" data-testid="launch-login-auth-brand">
          <h1 className="sr-only">cruush</h1>
          <img
            alt=""
            aria-hidden="true"
            className="launch-login-auth-logo-image"
            data-testid="launch-login-auth-logo"
            draggable={false}
            src={cruushLogo}
          />
          <div className="launch-login-auth-tagline-stack">
            <p className="launch-login-auth-tagline" data-testid="launch-login-auth-tagline">
              <span>queer cruisers cruise</span>{' '}
              <span>cruush</span>
            </p>
            <div className="launch-login-auth-beta-capsule" data-testid="launch-login-auth-beta-capsule">
              nyc open beta
            </div>
          </div>
        </div>

        {/* Auth form */}
        {isSignUp && betaAccessRequired && betaAccessStatus === 'outside' ? (
          <form onSubmit={handleBetaCityRequest} className="launch-login-auth-form">
            {error ? (
              <div className="p-3 bg-[#d11f3a]/10 border border-[#d11f3a]/30 text-[#ff0072] text-sm rounded">
                {error}
              </div>
            ) : null}

            {cityRequestNotice ? (
              <div className="p-3 bg-white/5 border border-white/10 text-white/70 text-sm rounded">
                {cityRequestNotice}
              </div>
            ) : null}

            {betaAccessStatus === 'outside' ? (
              <div className="p-3 bg-white/5 border border-white/10 text-white/70 text-sm rounded space-y-2">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 text-[#ff0072]" />
                  <p>
                    NYC open beta.
                  </p>
                </div>
                <p className="text-white/50">Join the newsletter and request your city.</p>
              </div>
            ) : (
              <div className="p-3 bg-white/5 border border-white/10 text-white/70 text-sm rounded space-y-3">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 text-[#0ba8ff]" />
                  <p>
                    NYC open beta.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleBetaAccessCheck}
                  disabled={betaAccessStatus === 'checking'}
                  className="w-full h-11 text-sm text-white bg-white/10 border border-white/15 rounded-sm hover:bg-white/15 disabled:opacity-50"
                >
                  {betaAccessStatus === 'checking' ? 'Checking location...' : 'Check my location'}
                </button>
              </div>
            )}

            {betaAccessStatus === 'outside' ? (
              <>
                <div className="space-y-2">
                  <label htmlFor="betaNewsletterEmail" className="sr-only">
                    Email
                  </label>
                  <input
                    id="betaNewsletterEmail"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="launch-login-auth-input w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
                    required
                    disabled={cityRequestLoading}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="requestedCity" className="sr-only">
                    Requested city
                  </label>
                  <input
                    id="requestedCity"
                    type="text"
                    autoComplete="address-level2"
                    value={requestedCity}
                    onChange={(e) => setRequestedCity(e.target.value)}
                    placeholder="request your city"
                    className="launch-login-auth-input w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
                    required
                    disabled={cityRequestLoading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={cityRequestLoading}
                  className="launch-login-auth-submit w-full h-12 rounded-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
                  style={{
                    background: 'var(--cruush-gradient)',
                  }}
                >
                  <span className="relative z-10">{cityRequestLoading ? 'Saving...' : 'Join newsletter'}</span>
                </button>
              </>
            ) : null}
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="launch-login-auth-form" autoComplete="on">
          <div className="launch-login-auth-human-check" aria-hidden="true">
            <label htmlFor="launch-login-auth-middle-name">Leave blank</label>
            <input
              id="launch-login-auth-middle-name"
              name="cruush_auth_middle_name"
              type="text"
              autoCapitalize="none"
              autoComplete="off"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
              data-lpignore="true"
              data-protonpass-ignore="true"
              data-testid="launch-login-auth-human-check-input"
              inputMode="none"
              spellCheck={false}
              tabIndex={-1}
              value={humanCheckTrap}
              onChange={(event) => setHumanCheckTrap(event.target.value)}
              onFocus={(event) => event.currentTarget.blur()}
            />
            <input
              aria-hidden="true"
              name="username"
              type="text"
              autoComplete="username"
              className="launch-login-auth-username-decoy"
              data-1p-ignore="true"
              data-lpignore="true"
              tabIndex={-1}
              value={email}
              readOnly
            />
          </div>

          {error && (
            <div className="space-y-2 rounded p-3 text-sm">
              <div className="bg-[#d11f3a]/10 border border-[#d11f3a]/30 text-[#ff0072] rounded p-3">
                {error}
              </div>
              {/(suspend|ban)/i.test(error) ? (
                <a className="text-white/75 underline" href="/support?appeal=1">
                  Submit a suspension appeal
                </a>
              ) : null}
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
	              <p>
	                {verificationDeliveryFailed
	                  ? "Your account was created, but we couldn't send the verification email. Try again."
	                  : 'That account is not verified yet.'}
	              </p>
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

	          {!isForgotPassword && isSignUp && alphaPasswordRequired ? (
	            <div className="space-y-2">
	              <label htmlFor="alphaPassword" className="sr-only">
	                Alpha password
	              </label>
	              <input
	                id="alphaPassword"
	                type="password"
	                autoComplete="off"
	                value={alphaPassword}
	                onChange={(e) => setAlphaPassword(e.target.value)}
	                placeholder="alpha password"
	                className="launch-login-auth-input w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
	                required
	                disabled={isLoading}
	              />
	            </div>
	          ) : null}

	          {!isForgotPassword && isSignUp && betaAccessRequired && betaAccessStatus !== 'allowed' ? (
	            <div className="p-3 bg-white/5 border border-white/10 text-white/70 text-sm rounded space-y-3">
	              <div className="flex items-start gap-2">
	                <MapPin className="mt-0.5 h-4 w-4 text-[#0ba8ff]" />
	                <p>
                  NYC open beta.
	                </p>
	              </div>
	              <button
	                type="button"
	                onClick={handleBetaAccessCheck}
	                disabled={betaAccessStatus === 'checking'}
	                className="w-full h-11 text-sm text-white bg-white/10 border border-white/15 rounded-sm hover:bg-white/15 disabled:opacity-50"
	              >
	                {betaAccessStatus === 'checking' ? 'Checking location...' : 'Check my location'}
	              </button>
	            </div>
	          ) : null}

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
                className="launch-login-auth-input w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
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
              className="launch-login-auth-input w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
              required
              disabled={isLoading}
            />
          </div>

          {isSignUp ? (
            <div className="space-y-2">
              <label htmlFor="dateOfBirth" className="sr-only">Date of birth</label>
              <input
                id="dateOfBirth"
                type="date"
                autoComplete="bday"
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
                className="launch-login-auth-input w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
                required
                disabled={isLoading}
              />
            </div>
          ) : null}

          {!isForgotPassword && (
            <div className="space-y-2">
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <div className="launch-login-auth-password-field">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="password"
                  className="launch-login-auth-input w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
                  required
                  disabled={isLoading}
                  minLength={isSignUp ? 8 : 1}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="launch-login-auth-password-toggle"
                  disabled={isLoading}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {!isForgotPassword && isSignUp && (
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="sr-only">
                Confirm Password
              </label>
              <div className="launch-login-auth-password-field">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="password"
                  className="launch-login-auth-input w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
                  required={isSignUp}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  className="launch-login-auth-password-toggle"
                  disabled={isLoading}
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {shouldShowCaptcha ? (
            <div className="launch-login-auth-captcha" data-testid="launch-login-auth-captcha">
              <Turnstile
                onTokenChange={handleCaptchaTokenChange}
                onError={handleCaptchaError}
                resetKey={captchaResetKey}
              />
            </div>
          ) : null}

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

          <div className="launch-login-auth-secondary-actions">
            <button
              type="button"
              onClick={isForgotPassword ? showSignIn : toggleMode}
              disabled={isLoading}
              className="launch-login-auth-secondary w-full text-sm text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
            >
              {isForgotPassword
                ? 'Back to sign in'
                : isSignUp
                  ? 'Already have an account? Sign in'
                  : "Don't have an account? Sign up"}
            </button>

            {!isForgotPassword ? (
              <button
                type="button"
                onClick={showForgotPassword}
                disabled={isLoading}
                className="launch-login-auth-secondary w-full text-sm text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
              >
                Forgot your password?
              </button>
            ) : null}
          </div>
        </form>
        )}

      </div>
      <div className="launch-login-auth-footer" data-testid="launch-login-auth-footer">
        <a
          className="launch-login-auth-contact"
          data-testid="launch-login-auth-contact"
          href="mailto:hello@cruush.app"
        >
          hello@cruush.app
        </a>
        <a className="launch-login-auth-contact" href="/support?appeal=1">
          Appeal a suspension
        </a>

        <PublicPolicyLinks variant="compact" />
      </div>
    </div>
  );
}
