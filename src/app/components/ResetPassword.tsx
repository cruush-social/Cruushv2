import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { KeyRound } from 'lucide-react';
import { CruushIcon } from './CruushIconImage';
import { resetPassword } from '../lib/authApi';

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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div className="w-full max-w-md space-y-10 relative z-10">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <CruushIcon name="cruush" className="h-14 w-14 opacity-15" />
          </div>
          <div>
            <h1
              className="cruush-logo-text text-6xl mb-4"
            >
              cruush
            </h1>
            <p className="text-white/50 text-sm">Reset your password</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-[#d11f3a]/10 border border-[#d11f3a]/30 text-[#ff0072] text-sm rounded">
              {error}
            </div>
          )}

          {notice && (
            <div className="p-3 bg-white/5 border border-white/10 text-white/70 text-sm rounded flex items-start gap-2">
              <KeyRound className="mt-0.5 h-4 w-4 text-[#004bff]" />
              <span>{notice}</span>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="newPassword" className="text-sm text-white/60">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full h-12 px-4 bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
              required
              minLength={8}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmNewPassword" className="text-sm text-white/60">
              Confirm New Password
            </label>
            <input
              id="confirmNewPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full h-12 px-4 bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff0072]/50 transition-colors rounded-sm"
              required
              minLength={8}
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-14 text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'var(--cruush-gradient)',
            }}
          >
            {isLoading ? 'Resetting Password...' : 'Reset Password'}
          </button>

          <Link
            to="/"
            className="block w-full text-center text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            Back to sign in
          </Link>
        </form>
      </div>
    </div>
  );
}
