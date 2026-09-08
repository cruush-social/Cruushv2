import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { HANKY_COLORS, HankyFrame } from './HankyFrame';
import BugButtonSlot from './BugButtonSlot';

/**
 * Every hanky colour at the sizes a badge actually renders, so the choice is
 * made against the real thing rather than against a swatch.
 */
export default function HankyPreview() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-24 text-white">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-background/95 px-4 py-3 backdrop-blur-md">
        <button
          aria-label="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/55"
          onClick={() => navigate(-1)}
          type="button"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg">Hankies</h1>
      
        <BugButtonSlot testId="hanky-preview-bug-button-slot" />
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">
        {HANKY_COLORS.map((hanky) => (
          <section
            className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/45 p-4"
            key={hanky.id}
          >
            <HankyFrame className="h-14 w-14 shrink-0" color={hanky.color} />
            <HankyFrame className="h-8 w-8 shrink-0" color={hanky.color} />
            <HankyFrame className="h-[1.5625rem] w-[1.5625rem] shrink-0" color={hanky.color} />
            <div className="min-w-0">
              <p className="truncate text-sm text-white">{hanky.label}</p>
              <p className="truncate text-xs text-white/55">{hanky.meaning}</p>
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
