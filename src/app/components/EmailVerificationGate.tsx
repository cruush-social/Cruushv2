import { useEffect, useState } from 'react';
import { MailCheck } from 'lucide-react';
import {
  getAuthSession,
  sendVerificationEmail,
  signOut,
  type AuthSessionPayload,
} from '../lib/authApi';
import {
  clearCurrentUser,
  getVerificationPreviewUrl,
  persistSessionUser,
  setVerificationPreviewUrl,
} from '../lib/sessionUser';
import { Button } from './ui/button';

type EmailVerificationGateProps = {
  email: string;
  onSignedOut: () => void;
  onVerified: (session: AuthSessionPayload) => void;
};

export default function EmailVerificationGate({ email, onSignedOut, onVerified }: EmailVerificationGateProps) {
  const [deliveryState, setDeliveryState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [checkState, setCheckState] = useState<'idle' | 'checking'>('idle');
  const [message, setMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState(() => getVerificationPreviewUrl());

  const sendEmail = async () => {
    setDeliveryState('sending');
    setMessage('');

    try {
      const delivery = await sendVerificationEmail();
      setVerificationPreviewUrl(delivery.previewUrl);
      setPreviewUrl(delivery.previewUrl);
      setDeliveryState('sent');
      setMessage(delivery.alreadyVerified ? 'Your email is already verified.' : 'Verification email sent.');

      if (delivery.alreadyVerified) {
        const session = await getAuthSession();
        persistSessionUser(session);
        onVerified(session);
      }
    } catch (error) {
      setDeliveryState('error');
      setMessage(error instanceof Error ? error.message : 'Unable to send verification email.');
    }
  };

  useEffect(() => {
    void sendEmail();
  }, []);

  const checkVerification = async () => {
    setCheckState('checking');
    setMessage('');

    try {
      const session = await getAuthSession();
      persistSessionUser(session);

      if (session.user.emailVerifiedAt) {
        onVerified(session);
        return;
      }

      setMessage('Email is not verified yet.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to check verification status.');
    } finally {
      setCheckState('idle');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    clearCurrentUser();
    onSignedOut();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center space-y-5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="h-6 w-6" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl">Verify your email</h1>
          <p className="text-sm text-muted-foreground">
            Check {email} before setting up your profile.
          </p>
        </div>

        {message ? (
          <div className="rounded-md border border-border bg-background/60 p-3 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}

        {previewUrl ? (
          <a className="block text-sm text-primary underline" href={previewUrl}>
            Open preview verification link
          </a>
        ) : null}

        <div className="space-y-3">
          <Button className="w-full" onClick={checkVerification} disabled={checkState === 'checking'}>
            {checkState === 'checking' ? 'Checking...' : 'I verified my email'}
          </Button>
          <Button className="w-full" variant="outline" onClick={sendEmail} disabled={deliveryState === 'sending'}>
            {deliveryState === 'sending' ? 'Sending...' : 'Resend email'}
          </Button>
          <button className="text-xs text-muted-foreground underline" onClick={handleSignOut} type="button">
            Use a different email
          </button>
        </div>
      </div>
    </div>
  );
}
