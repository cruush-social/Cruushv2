import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import BugButtonSlot from './BugButtonSlot';
import { Button } from './ui/button';

// The authenticated route gates access. Opening it hands the whole screen to
// the same onboarding screen App renders for a new member, in preview mode so
// nothing is written to the account. Nothing here renders its own onboarding
// layout, so the replay cannot drift from what members see.
export default function AdminOnboardingReplay({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    onStart();
  }, [onStart]);

  return null;
}

// The admin-only way out of the replay: the original Test onboarding bar with
// its close button, above the shared onboarding screen. Like the other signed-in
// menus, Close sits left of the docked bug button and the bar carries no
// floating Accessibility button.
export function AdminOnboardingReplayFrame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-background" aria-label="Test onboarding">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card p-3">
        <h2 className="min-w-0 flex-1 text-xl">Test onboarding</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close onboarding test"><X className="h-5 w-5" /></Button>
        <BugButtonSlot testId="admin-onboarding-bug-button-slot" />
      </header>
      <div className="min-h-0 flex-1">
        {children}
      </div>
    </main>
  );
}
