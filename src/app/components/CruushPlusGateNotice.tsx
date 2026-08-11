import { ChevronRight } from 'lucide-react';
import CruushPlusWord from './CruushPlusWord';

type CruushPlusGateNoticeProps = {
  description: string;
  onUpgrade: () => void;
};

export default function CruushPlusGateNotice({ description, onUpgrade }: CruushPlusGateNoticeProps) {
  return (
    <button
      type="button"
      aria-label="Get cruush+"
      className="flex w-full items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.08] px-4 py-3 text-left transition-colors hover:bg-primary/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
      onClick={onUpgrade}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-white/72">{description}</span>
        <span className="mt-1 block text-sm font-semibold"><CruushPlusWord /> unlocks more</span>
      </span>
      <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
    </button>
  );
}
