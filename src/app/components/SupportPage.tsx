import { Link, useLocation } from 'react-router';
import PublicPolicyLinks from './PublicPolicyLinks';
import SupportRequestForm from './SupportRequestForm';
import AppPageHeader from './AppPageHeader';
import type { SupportRequestCategory } from '../lib/supportApi';
import { useBackOrFallback } from '../lib/useBackOrFallback';

type SupportPageProps = {
  appealOnly?: boolean;
  publicAccess?: boolean;
  signedIn?: boolean;
};

export default function SupportPage({ appealOnly = false, publicAccess = false, signedIn = false }: SupportPageProps = {}) {
  const location = useLocation();
  const goBack = useBackOrFallback('/');
  const searchParams = new URLSearchParams(location.search);
  const appealValue = searchParams.get('appeal');
  const billingCategories: Record<string, SupportRequestCategory> = {
    payment: 'billing_payment',
    subscription: 'billing_subscription',
    pulse: 'billing_pulse',
    refund: 'billing_refund',
  };
  const billingValue = searchParams.get('billing') ?? '';
  const initialCategory = searchParams.get('refund') === '1'
    ? 'billing_refund'
    : Object.hasOwn(billingCategories, billingValue) ? billingCategories[billingValue] : 'question';
  const ageAppealMode = appealOnly || appealValue === '1' || appealValue === 'age';
  const generalAppealMode = appealValue === 'general';
  const appealMode = ageAppealMode || generalAppealMode;

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppPageHeader
        title="Support"
        onBack={goBack}
        backLabel={appealMode || publicAccess ? 'Back to sign in' : 'Back to settings'}
        bugButtonTestId="support-page-bug-button-slot"
      />

      <main className="w-full p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <SupportRequestForm
            initialCategory={initialCategory}
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
