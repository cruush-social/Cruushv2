import { useEffect, type ReactNode } from 'react';
import AppPageHeader from './AppPageHeader';

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
      <AppPageHeader
        title="Test onboarding"
        onClose={onClose}
        closeLabel="Close onboarding test"
        bugButtonTestId="admin-onboarding-bug-button-slot"
      />
      <div className="min-h-0 flex-1">
        {children}
      </div>
    </main>
  );
}
