import { useNavigate } from 'react-router';
import { HANKY_COLORS, HankyFrame } from './HankyFrame';
import AppPageHeader from './AppPageHeader';

/**
 * Every hanky colour at the sizes a badge actually renders, so the choice is
 * made against the real thing rather than against a swatch.
 */
export default function HankyPreview() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-24 text-white">
      <AppPageHeader
        title="Hankies"
        onBack={() => navigate(-1)}
        bugButtonTestId="hanky-preview-bug-button-slot"
      />

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
