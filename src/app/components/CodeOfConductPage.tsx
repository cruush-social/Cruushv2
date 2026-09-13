import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, X } from 'lucide-react';
import { getAuthSession } from '../lib/authApi';
import { Button } from './ui/button';
import BugButtonSlot from './BugButtonSlot';
import ProfileOnboarding from './ProfileOnboarding';

type CodeOfConductPageProps = {
  onBack?: () => void;
  onClose?: () => void;
};

export default function CodeOfConductPage({ onBack, onClose }: CodeOfConductPageProps) {
  const navigate = useNavigate();
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
      <header className="z-10 flex shrink-0 items-center gap-4 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={onBack ?? (() => navigate('/settings'))} aria-label="Back to settings">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-xl">Code of Conduct</h2>
        {onClose ? (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close Code of Conduct">
            <X className="h-5 w-5" />
          </Button>
        ) : null}
        <BugButtonSlot testId="code-of-conduct-bug-button-slot" />
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
          {status ? <p role="status" className="p-4 text-sm text-white/72">{status}</p> : signedAt ? (
            <ProfileOnboarding constrainedViewport signedCodeOfConductAt={signedAt} onComplete={() => {}} />
          ) : null}
      </div>
    </div>
  );
}
