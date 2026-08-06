import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from './ui/button';

const changelogItems = [
  'Messages now default to Mutuals, with Public, Mutuals, and Crowd permission options.',
  'The message picker separates Public and Mutuals, adds sorting, and shows more profile context.',
  'Visible feed pins now appear in message discovery when someone has that setting enabled.',
  'Feed settings include a 7-day post window, broader nearby radius, and clearer feed pin controls.',
  'Privacy Audit now summarizes where you are visible, who can message you, and revocable precise-location grants.',
  'Notification controls now include a real clear action.',
  'Mutual cruush states use the purple mutual treatment more consistently across chat surfaces.',
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
          <p className="text-sm text-white/52">v1.1</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <section className="rounded-xl border border-white/10 bg-card/80 p-4">
          <h3 className="text-base">cruush v1.1</h3>
          <div className="mt-4 space-y-3">
            {changelogItems.map((item) => (
              <div key={item} className="rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm text-white/72">
                {item}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
