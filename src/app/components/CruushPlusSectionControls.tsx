import type { ReactNode } from 'react';
import { CRUUSH_PLUS_FEATURES } from '../lib/cruushPlusFeatures';
import CruushPlusBenefitsAccordion from './CruushPlusBenefitsAccordion';
import CruushPlusSectionTabs from './CruushPlusSectionTabs';

export default function CruushPlusSectionControls({
  active,
  beforeBenefits,
  features = CRUUSH_PLUS_FEATURES,
}: {
  active: 'checkout' | 'rewards';
  beforeBenefits?: ReactNode;
  features?: readonly { readonly title: string; readonly description: string }[];
}) {
  return (
    <div className="mx-auto flex w-[calc(100vw-2rem)] max-w-[40rem] flex-col gap-3">
      <CruushPlusSectionTabs active={active} />
      {beforeBenefits}
      <CruushPlusBenefitsAccordion features={features} />
    </div>
  );
}
