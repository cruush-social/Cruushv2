import { ArrowLeft } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Button } from './ui/button';
import PublicPolicyLinks from './PublicPolicyLinks';
import SupportRequestForm from './SupportRequestForm';
import { useBackOrFallback } from '../lib/useBackOrFallback';

type SupportPageProps = {
  appealOnly?: boolean;
  publicAccess?: boolean;
  signedIn?: boolean;
};

export default function SupportPage({ appealOnly = false, publicAccess = false, signedIn = false }: SupportPageProps = {}) {
  const location = useLocation();
  const goBack = useBackOrFallback('/');
  const appealValue = new URLSearchParams(location.search).get('appeal');
  const ageAppealMode = appealOnly || appealValue === '1' || appealValue === 'age';
  const generalAppealMode = appealValue === 'general';
  const appealMode = ageAppealMode || generalAppealMode;

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

      <main className="w-full p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <SupportRequestForm
            appealMode={ageAppealMode}
            generalAppealMode={generalAppealMode}
            requireContactEmail={appealMode || publicAccess}
            signedIn={signedIn}
            source={appealMode || publicAccess ? 'auth' : 'settings'}
          />
          {!appealMode ? (
            <p className="text-sm text-muted-foreground">
              Need to appeal an age-related suspension? <Link className="underline" to="/support?appeal=1">Submit an appeal</Link>.
            </p>
          ) : null}
        </div>
        <PublicPolicyLinks className="mt-4 w-full" />
      </main>
    </div>
  );
}
