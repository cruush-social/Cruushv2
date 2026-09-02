import { ArrowLeft } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Button } from './ui/button';
import PublicPolicyLinks from './PublicPolicyLinks';
import SupportRequestForm from './SupportRequestForm';
import { useBackOrFallback } from '../lib/useBackOrFallback';

type SupportPageProps = {
  appealOnly?: boolean;
  publicAccess?: boolean;
};

export default function SupportPage({ appealOnly = false, publicAccess = false }: SupportPageProps = {}) {
  const location = useLocation();
  const goBack = useBackOrFallback('/');
  const searchParams = new URLSearchParams(location.search);
  const appealMode = appealOnly || searchParams.get('appeal') === '1';
  const refundMode = !appealMode && searchParams.get('refund') === '1';

  return (
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-background pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 flex w-full max-w-full items-center gap-3 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={goBack}
          aria-label={appealMode || publicAccess ? 'Back to sign in' : 'Back to settings'}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl">Support</h2>
      </header>

      <main className="box-border w-full min-w-0 max-w-full px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto w-full min-w-0 max-w-2xl space-y-4">
          <SupportRequestForm
            appealMode={appealMode}
            refundMode={refundMode}
            requireContactEmail={appealMode || publicAccess}
            source={appealMode || publicAccess ? 'auth' : 'settings'}
          />
          {!appealMode ? (
            <p className="text-sm text-muted-foreground">
              Need to appeal an age-related suspension? <Link className="underline" to="/support?appeal=1">Submit an appeal</Link>.
            </p>
          ) : null}
        </div>
        <PublicPolicyLinks className="mx-auto mt-4 w-full min-w-0 max-w-2xl" />
      </main>
    </div>
  );
}
