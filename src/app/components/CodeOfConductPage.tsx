import { useBackOrFallback } from '../lib/useBackOrFallback';
import { useEffect, useState } from 'react';
import { getAuthSession } from '../lib/authApi';
import AppPageHeader from './AppPageHeader';
import ProfileOnboarding from './ProfileOnboarding';

type CodeOfConductPageProps = {
  onBack?: () => void;
  onClose?: () => void;
};

export default function CodeOfConductPage({ onBack, onClose }: CodeOfConductPageProps) {
  const goBack = useBackOrFallback('/map');
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading...');

  useEffect(() => {
    let active = true;
    void getAuthSession().then((session) => {
      if (!active) return;
      const acceptedAt = session.codeOfConductAcceptedAt;
      if (acceptedAt && Number.isFinite(Date.parse(acceptedAt))) {
        setSignedAt(acceptedAt);
        setStatus('');
      } else {
        setStatus('Signing time unavailable.');
      }
    }).catch((error) => {
      if (active) setStatus(error instanceof Error ? error.message : 'Unable to load the signed agreement.');
    });
    return () => { active = false; };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <AppPageHeader
        title="Code of Conduct"
        onClose={onClose}
        closeLabel="Close Code of Conduct"
        onBack={onBack ?? goBack}
        backLabel="Back"
        bugButtonTestId="code-of-conduct-bug-button-slot"
      />
      <div className="min-h-0 flex-1 overflow-hidden">
          {status ? <p role="status" className="p-4 text-sm text-white/72">{status}</p> : signedAt ? (
            <ProfileOnboarding constrainedViewport signedCodeOfConductAt={signedAt} onComplete={() => {}} />
          ) : null}
      </div>
    </div>
  );
}
