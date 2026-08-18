import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import PublicPolicyLinks from './PublicPolicyLinks';
import SupportRequestForm from './SupportRequestForm';
import { useBackOrFallback } from '../lib/useBackOrFallback';

type SupportPageProps = {
  appealOnly?: boolean;
  publicAccess?: boolean;
};

export default function SupportPage({ appealOnly = false, publicAccess = false }: SupportPageProps = {}) {
  const goBack = useBackOrFallback('/');
  const appealMode = appealOnly || (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('appeal') === '1'
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center gap-4 z-10">
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

      <main className="max-w-2xl mx-auto p-6 space-y-4">
        <SupportRequestForm
          appealMode={appealMode}
          requireContactEmail={appealMode || publicAccess}
          source={appealMode || publicAccess ? 'auth' : 'settings'}
        />
        {!appealMode ? (
          <p className="text-sm text-muted-foreground">
            Need to appeal an age-related suspension? <a className="underline" href="/support?appeal=1">Submit an appeal</a>.
          </p>
        ) : null}
        <PublicPolicyLinks />
      </main>
    </div>
  );
}
