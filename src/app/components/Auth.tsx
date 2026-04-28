import { useState } from 'react';
import { Heart } from 'lucide-react';
import supabase from '../../../utils/supabase/client';
import { persistCurrentUser } from '../lib/sessionUser';

interface AuthProps {
  onAuth: (isNewUser: boolean) => void;
}

export default function Auth({ onAuth }: AuthProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Validation
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
        // Supabase sign up
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName.trim() },
          },
        });
        if (signUpError) {
          setError(signUpError.message);
          setIsLoading(false);
          return;
        }
        localStorage.setItem('cruush_auth', 'true');
        if (data.user?.id) {
          persistCurrentUser({
            id: data.user.id,
            name: displayName.trim(),
            display_name: displayName.trim(),
            year_of_birth: null,
          });
        }
        setIsLoading(false);
        onAuth(true); // New user needs onboarding
      } else {
        // Supabase sign in
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message);
          setIsLoading(false);
          return;
        }
        localStorage.setItem('cruush_auth', 'true');
        if (data.user?.id) {
          const displayNameFromAuth =
            typeof data.user.user_metadata?.display_name === 'string'
              ? data.user.user_metadata.display_name
              : data.user.email ?? 'Cruush user';
          persistCurrentUser({
            id: data.user.id,
            name: displayNameFromAuth,
            display_name: displayNameFromAuth,
            year_of_birth: null,
          });
        }
        setIsLoading(false);
        onAuth(false); // Existing user, no onboarding needed
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError('');
    setConfirmPassword('');
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

          {isSignUp && (
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

          {isSignUp && (
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
                {isSignUp ? 'Creating Account...' : 'Signing In...'}
              </span>
            ) : (
              <>{isSignUp ? 'Create Account' : 'Sign In'}</>
            )}
          </button>

          <button
            type="button"
            onClick={toggleMode}
            disabled={isLoading}
            className="w-full text-sm text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
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
