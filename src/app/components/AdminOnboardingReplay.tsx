import { useNavigate } from 'react-router';
import { X } from 'lucide-react';
import ProfileOnboarding from './ProfileOnboarding';
import BugButtonSlot from './BugButtonSlot';
import { Button } from './ui/button';

// The authenticated route gates access. Reuse the real onboarding component
// with its existing non-persisting preview mode so steps cannot drift apart.
export default function AdminOnboardingReplay({ codeOfConductVersion }: { codeOfConductVersion: string }) {
  const navigate = useNavigate();
  const close = () => navigate('/settings');
  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-background" aria-label="Test onboarding">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card p-3">
        <h2 className="min-w-0 flex-1 text-xl">Test onboarding</h2>
        <BugButtonSlot testId="admin-onboarding-bug-button-slot" />
        <Button variant="ghost" size="icon" onClick={close} aria-label="Close onboarding test"><X className="h-5 w-5" /></Button>
      </header>
      <div className="min-h-0 flex-1">
        <ProfileOnboarding onComplete={close} needsCodeOfConduct codeOfConductVersion={codeOfConductVersion} constrainedViewport previewMode />
      </div>
    </main>
  );
}
