import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from './ui/button';

const changelogReleases = [
  {
    version: 'v1.2',
    items: [
      'The interactive map tutorial now walks through Seeking, Visibility, DL Mode, and Zoom using the real controls, can be replayed from Settings, and stays above the bottom navigation.',
      'The map remembers your place after you open a profile, refreshes visibility changes more promptly, and supports a wider zoom range.',
      'Message discovery filters and sort controls are clearer and stay readable on smaller screens.',
      'Chat keeps your draft when a send fails, makes settings easier to reach, and gives the composer more room.',
      'View-once photos, disappearing-message controls, and quick-access photo saves now have clearer, more reliable states.',
      'Profiles now clearly show when messaging is mutuals-only, and Ghost Mode profiles stay out of discovery.',
      'Mobile installation uses clearer iPhone and browser instructions and catches the install prompt more reliably.',
      'The first-post prompt opens the composer directly, and post duration is now yours to choose.',
      'Onboarding now distinguishes Map communities from gender identity.',
    ],
  },
  {
    version: 'v1.1',
    items: [
      'Messages now default to Mutuals, with Public, Mutuals, and Crowd permission options.',
      'The message picker separates Public and Mutuals, adds sorting, and shows more profile context.',
      'Visible feed pins now appear in message discovery when someone has that setting enabled.',
      'Feed settings include a 7-day post window, broader nearby radius, and clearer feed pin controls.',
      'Privacy Audit now summarizes where you are visible, who can message you, and revocable precise-location grants.',
      'Notification controls now include a real clear action.',
      'Mutual cruush states use the purple mutual treatment more consistently across chat surfaces.',
    ],
  },
];

export default function Changelog() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-20 text-white">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-white/10 bg-background/88 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back to settings">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl">Changelog</h2>
          <p className="text-sm text-white/52">{changelogReleases[0].version}</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        {changelogReleases.map((release) => (
          <section key={release.version} className="rounded-xl border border-white/10 bg-card/80 p-4">
            <h3 className="text-base">cruush {release.version}</h3>
            <div className="mt-4 space-y-3">
              {release.items.map((item) => (
                <div key={item} className="rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm text-white/72">
                  {item}
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
