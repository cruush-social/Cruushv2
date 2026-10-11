import { useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import CruushPlusWord from './CruushPlusWord';
import type { CruushPlusConversionBenefit, CruushPlusConversionSurface } from '../lib/cruushPlusConversion';
import { trackCruushPlusConversion } from '../lib/posthog';

type CruushPlusGateNoticeProps = {
  description: string;
  compactMobileText?: boolean;
  mobileDescriptionLines?: readonly [string, string];
  onUpgrade: () => void;
  surface?: CruushPlusConversionSurface;
  benefit?: CruushPlusConversionBenefit;
};

export default function CruushPlusGateNotice({ description, compactMobileText = false, mobileDescriptionLines, onUpgrade, surface, benefit }: CruushPlusGateNoticeProps) {
  useEffect(() => {
    if (surface && benefit) {
      trackCruushPlusConversion('cruush_plus_paywall_viewed', { surface, benefit });
    }
  }, [benefit, surface]);

  return (
    <button
      type="button"
      aria-label="Get cruush+"
      className="flex w-full items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.08] px-4 py-3 text-left transition-colors hover:bg-primary/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
      onClick={() => {
        if (surface && benefit) {
          trackCruushPlusConversion('cruush_plus_upgrade_clicked', { surface, benefit });
        }
        onUpgrade();
      }}
    >
      <span className={mobileDescriptionLines ? "@container min-w-0 flex-1" : compactMobileText ? "min-w-0 flex-1 max-sm:text-[clamp(10px,3.1vw,14px)]" : "min-w-0 flex-1"}>
        <span className={mobileDescriptionLines ? "block text-sm text-white/72 max-sm:text-[min(1.125rem,9cqw)]" : compactMobileText ? "block text-sm text-white/72 max-sm:text-[length:inherit]" : "block text-sm text-white/72"}>{mobileDescriptionLines ? <>{mobileDescriptionLines[0]} <span className="max-sm:block">{mobileDescriptionLines[1]}</span></> : description}</span>
        <span className={mobileDescriptionLines ? "mt-1 block text-sm font-semibold max-sm:text-[min(1.125rem,9cqw)]" : compactMobileText ? "mt-1 block text-sm font-semibold max-sm:text-[length:inherit]" : "mt-1 block text-sm font-semibold"}><CruushPlusWord /> unlocks more</span>
      </span>
      <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
    </button>
  );
}
