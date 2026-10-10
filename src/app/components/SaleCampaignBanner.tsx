import CruushPlusWord from './CruushPlusWord';

export function SaleBanner({ percentOff, onClick }: { percentOff: number; onClick: () => void }) {
  if (percentOff <= 0) return null;

  return (
    <aside aria-label="cruush+ sale" className="border-b border-red-500/50 bg-red-950 px-4 text-center text-sm text-white">
      <p className="pt-3 font-semibold">You’ve been marked for sacrifice.</p>
      <p className="pt-1">{percentOff}% off <CruushPlusWord /></p>
      <button type="button" className="min-h-11 py-2 font-semibold underline decoration-red-400 underline-offset-4" onClick={onClick}>
        Claim your offer
      </button>
    </aside>
  );
}
