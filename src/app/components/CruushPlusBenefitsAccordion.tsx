import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Card } from './ui/card';
import CruushPlusWord from './CruushPlusWord';
import { CRUUSH_PLUS_FEATURES } from '../lib/cruushPlusFeatures';

type CruushPlusBenefit = { readonly title: string; readonly description: string };

export default function CruushPlusBenefitsAccordion({
  features = CRUUSH_PLUS_FEATURES,
}: {
  features?: readonly CruushPlusBenefit[];
}) {
  // Always starts closed. It used to reopen itself from a saved preference,
  // which pushed the checkout down the page on every later visit.
  const [benefitsOpen, setBenefitsOpen] = useState(false);

  const handleBenefitsOpenChange = (value: string) => {
    setBenefitsOpen(value === 'benefits');
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
            <ul aria-label="cruush+ features" className="grid gap-3 sm:grid-cols-2">
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
