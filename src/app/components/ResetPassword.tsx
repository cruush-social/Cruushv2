import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Heart, KeyRound } from 'lucide-react';
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
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background:
            'radial-gradient(circle at 20% 30%, rgba(255, 47, 114, 0.15), transparent 50%), radial-gradient(circle at 80% 70%, rgba(34, 184, 255, 0.1), transparent 50%)',
        }}
      />

      <div className="w-full max-w-md space-y-10 relative z-10">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <Heart className="w-14 h-14 text-white/10" />
          </div>
          <div>
            <h1
              className="text-6xl mb-4"
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
            <p className="text-white/50 text-sm">Reset your password</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-[#d11f3a]/10 border border-[#d11f3a]/30 text-[#ff2f72] text-sm rounded">
              {error}
            </div>
          )}

          {notice && (
            <div className="p-3 bg-white/5 border border-white/10 text-white/70 text-sm rounded flex items-start gap-2">
              <KeyRound className="mt-0.5 h-4 w-4 text-[#22b8ff]" />
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
              className="w-full h-12 px-4 bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff2f72]/50 transition-colors rounded-sm"
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
              className="w-full h-12 px-4 bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#ff2f72]/50 transition-colors rounded-sm"
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
              background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
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
