import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Card } from './ui/card';
import CruushPlusWord from './CruushPlusWord';
import { CRUUSH_PLUS_FEATURES } from '../lib/cruushPlusFeatures';

const BENEFITS_OPEN_STORAGE_KEY = 'cruush:rewards:benefits-open';

function readBenefitsOpenPreference() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const storedPreference = window.localStorage.getItem(BENEFITS_OPEN_STORAGE_KEY);
    return storedPreference === 'true';
  } catch {
    return false;
  }
}

function saveBenefitsOpenPreference(open: boolean) {
  try {
    window.localStorage.setItem(BENEFITS_OPEN_STORAGE_KEY, String(open));
  } catch {
    // Some privacy modes block local storage. The accordion still works for this visit.
  }
}

type CruushPlusBenefit = { readonly title: string; readonly description: string };

export default function CruushPlusBenefitsAccordion({
  features = CRUUSH_PLUS_FEATURES,
}: {
  features?: readonly CruushPlusBenefit[];
}) {
  const [benefitsOpen, setBenefitsOpen] = useState(readBenefitsOpenPreference);

  const handleBenefitsOpenChange = (value: string) => {
    const open = value === 'benefits';
    setBenefitsOpen(open);
    saveBenefitsOpenPreference(open);
  };

  return (
    <Card className="gap-0">
      <Accordion
        collapsible
        type="single"
        value={benefitsOpen ? 'benefits' : ''}
        onValueChange={handleBenefitsOpenChange}
      >
        <AccordionItem className="border-0" value="benefits">
          <AccordionTrigger
            aria-label={benefitsOpen ? 'Hide cruush+ benefits' : 'Show cruush+ benefits'}
            className="px-6 py-5 text-base hover:no-underline"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span>What <CruushPlusWord /> unlocks</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <ul aria-label="cruush+ features" className="grid grid-cols-1 gap-3">
              {features.map((feature) => (
                <li
                  className="rounded-xl border border-white/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_30px_rgba(255,0,114,0.18)]"
                  key={feature.title}
                  style={{ background: 'var(--cruush-gradient)' }}
                >
                  <p className="font-semibold text-white">{feature.title}</p>
                  <p className="mt-1 text-sm leading-5 text-white/85">{feature.description}</p>
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
