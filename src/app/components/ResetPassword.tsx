import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Eye, EyeOff } from 'lucide-react';
import { CruushIcon } from './CruushIconImage';
import LaunchLoginMapTeaser from './LaunchLoginMapTeaser';
import PublicPolicyLinks from './PublicPolicyLinks';
import cruushLogo from '../assets/brand/cruush-logo.svg';
import { resetPassword } from '../lib/authApi';
import './Auth.css';

export default function ResetPassword() {
  const token = useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('token') ?? searchParams.get('resetPasswordToken') ?? '';
  }, []);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!token) {
      setError('Password reset link is missing a token.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      await resetPassword({ token, password });
      setPassword('');
      setConfirmPassword('');
      setNotice('Your password has been reset. You can sign in now.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset your password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="launch-login-auth-shell overflow-x-hidden">
      <LaunchLoginMapTeaser />
      <div className="launch-login-auth-card w-full max-w-[20rem] relative z-10" data-testid="reset-password-panel">
        <div className="launch-login-auth-brand text-center" data-testid="reset-password-brand">
          <h1 className="sr-only">cruush</h1>
          <img
            alt=""
            aria-hidden="true"
            className="launch-login-auth-logo-image"
            data-testid="reset-password-logo"
            draggable={false}
            src={cruushLogo}
          />
          <div className="launch-login-auth-tagline-stack">
            <p className="launch-login-auth-tagline" data-testid="reset-password-title">
              reset your password
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="launch-login-auth-form" autoComplete="on">
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
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="newPassword" className="sr-only">
              New password
            </label>
            <div className="launch-login-auth-password-field">
              <input
                id="newPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="new password"
                className="launch-login-auth-input w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
                required
                minLength={8}
                disabled={isLoading}
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

          <div className="space-y-2">
            <label htmlFor="confirmNewPassword" className="sr-only">
              Confirm new password
            </label>
            <div className="launch-login-auth-password-field">
              <input
                id="confirmNewPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="confirm password"
                className="launch-login-auth-input w-full h-10 px-4 bg-black/45 border border-white/10 text-white placeholder:text-white/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
                required
                minLength={8}
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

          <button
            type="submit"
            disabled={isLoading}
            className="launch-login-auth-submit w-full h-12 rounded-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
            style={{
              background: 'var(--cruush-gradient)',
            }}
          >
            <span className="relative z-10">{isLoading ? 'Resetting password...' : 'Reset password'}</span>
          </button>

          <Link
            to="/"
            className="launch-login-auth-secondary block w-full text-center text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            Back to sign in
          </Link>
        </form>
      </div>
      <div className="launch-login-auth-footer" data-testid="reset-password-footer">
        <a
          className="launch-login-auth-contact"
          data-testid="reset-password-contact"
          href="mailto:hello@cruush.app"
        >
          hello@cruush.app
        </a>
        <PublicPolicyLinks variant="compact" />
      </div>
    </div>
  );
}
