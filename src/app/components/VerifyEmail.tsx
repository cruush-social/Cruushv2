import { useEffect, useMemo, useState } from 'react';
import { verifyEmailToken } from '../lib/authApi';
import { clearVerificationPreviewUrl, persistSessionUser } from '../lib/sessionUser';
import { Button } from './ui/button';

type VerifyState =
  | { status: 'verifying' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export default function VerifyEmail() {
  const token = useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('token');
  }, []);
  const [state, setState] = useState<VerifyState>({ status: 'verifying' });

  useEffect(() => {
    let isActive = true;

    const runVerification = async () => {
      if (!token) {
        setState({ status: 'error', message: 'This verification link is missing a token.' });
        return;
      }

      try {
        const session = await verifyEmailToken(token);

        if (!isActive) {
          return;
        }

        persistSessionUser(session);
        clearVerificationPreviewUrl();
        setState({ status: 'success', message: 'Your email is verified.' });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Verification failed.',
        });
      }
    };

    void runVerification();

    return () => {
      isActive = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4 text-center">
        <h1 className="text-2xl">Verify Email</h1>
        <p className="text-sm text-muted-foreground">
          {state.status === 'verifying' ? 'Checking your verification link...' : state.message}
        </p>

        {state.status !== 'verifying' ? (
          <Button
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Return to cruush
          </Button>
        ) : null}
      </div>
    </div>
  );
}
