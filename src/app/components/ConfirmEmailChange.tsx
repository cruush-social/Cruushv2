import { useEffect, useMemo, useState } from 'react';
import { confirmEmailChange } from '../lib/authApi';
import { Button } from './ui/button';

type ConfirmState =
  | { status: 'confirming' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export default function ConfirmEmailChange() {
  const token = useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('token') ?? searchParams.get('confirmEmailToken');
  }, []);
  const [state, setState] = useState<ConfirmState>({ status: 'confirming' });

  useEffect(() => {
    let isActive = true;

    const runConfirmation = async () => {
      if (!token) {
        setState({ status: 'error', message: 'This confirmation link is missing a token.' });
        return;
      }

      try {
        const result = await confirmEmailChange({ token });

        if (!isActive) {
          return;
        }

        setState({ status: 'success', message: `Your email is now ${result.email}. Sign in with it to continue.` });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'This confirmation link is invalid or expired.',
        });
      }
    };

    void runConfirmation();

    return () => {
      isActive = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4 text-center">
        <h1 className="text-2xl">Confirm Email</h1>
        <p className="text-sm text-muted-foreground">
          {state.status === 'confirming' ? 'Checking your confirmation link...' : state.message}
        </p>

        {state.status !== 'confirming' ? (
          <Button
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Sign in
          </Button>
        ) : null}
      </div>
    </div>
  );
}
