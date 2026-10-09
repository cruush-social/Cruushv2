import { useState } from 'react';
import { useNavigate } from 'react-router';
import mileHighBadgeColored from '../assets/ui-icons/mile-high-club-badge-colored.svg';
import mileHighBadgeDimensional from '../assets/ui-icons/mile-high-club-badge-dimensional.svg';
import mileHighBadgeWhite from '../assets/ui-icons/mile-high-club-badge-white.svg';
import mileHighColored from '../assets/ui-icons/mile-high-club-colored.svg';
import mileHighWhite from '../assets/ui-icons/mile-high-club-white.svg';
import AppPageHeader from './AppPageHeader';

function PurplePlaneWithoutRing() {
  return (
    <svg aria-label="Purple plane without ring" className="h-20 w-20" role="img" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="mhc-preview-plane" x1="0" x2="1" y1="0.5" y2="0.5">
          <stop offset="0.06" stopColor="#ff0072" />
          <stop offset="0.53" stopColor="#6f00ff" />
          <stop offset="0.81" stopColor="#3826ff" />
          <stop offset="1" stopColor="#1181ff" />
        </linearGradient>
      </defs>
      <g transform="translate(32,32) scale(1.32)">
        <path
          d="M0,-13 C2,-13 3.4,-10 3.4,-6.6 L3.4,-3.4 L13,2.6 L13,6 L3.4,3.8 L3.4,9 L6.6,11.6 L6.6,13.6 L0,11.8 L-6.6,13.6 L-6.6,11.6 L-3.4,9 L-3.4,3.8 L-13,6 L-13,2.6 L-3.4,-3.4 L-3.4,-6.6 C-3.4,-10 -2,-13 0,-13 Z"
          fill="url(#mhc-preview-plane)"
        />
      </g>
    </svg>
  );
}

const TESTED_GLYPHS = [
  { id: 'purple-plane-ring', label: 'Purple plane with gradient ring', asset: mileHighBadgeColored },
  { id: 'purple-plane', label: 'Purple plane without ring', Preview: PurplePlaneWithoutRing },
  { id: 'dimensional-plane', label: 'Dimensional gradient plane', asset: mileHighBadgeDimensional },
  { id: 'white-plane-ring', label: 'White plane with ring', asset: mileHighBadgeWhite },
  { id: 'colored-mhc-mark', label: 'Colored MHC mark', asset: mileHighColored },
  { id: 'white-plane', label: 'White plane', asset: mileHighWhite },
] as const;

/** Local review page for the real MHC glyph assets tested in this app. */
export default function MileHighMarkPreview() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background pb-24 text-white">
      <AppPageHeader
        title="Mile High Club glyphs"
        onBack={() => navigate(-1)}
        bugButtonTestId="mile-high-mark-preview-bug-button-slot"
      />

      <main className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-4 sm:grid-cols-2">
        {TESTED_GLYPHS.map(({ id, label, asset, Preview }) => {
          const selected = selectedId === id;

          return (
            <section className="rounded-2xl border border-white/10 bg-black/45 p-4" key={id}>
              <h2 className="text-base text-white">{label}</h2>
              <div className="mt-4 flex min-h-28 items-center justify-center rounded-xl bg-[var(--cruush-gradient-soft-28)]">
                {Preview ? <Preview /> : <img alt={label} className="h-20 w-20 object-contain" src={asset} />}
              </div>
              <button
                aria-pressed={selected}
                className={`mt-4 w-full rounded-full px-4 py-2 text-sm ${selected ? 'bg-[var(--cruush-gradient)] text-white' : 'border border-white/20 text-white'}`}
                onClick={() => setSelectedId(id)}
                type="button"
              >
                {selected ? 'Selected' : 'Select'}
              </button>
            </section>
          );
        })}
      </main>
    </div>
  );
}
