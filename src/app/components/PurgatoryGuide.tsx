import { useNavigate } from 'react-router';
import AppPageHeader from './AppPageHeader';

export default function PurgatoryGuide() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <AppPageHeader title="Purgatory" onBack={() => navigate(-1)} bugButtonTestId="purgatory-guide-bug-button-slot" />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <section className="rounded-lg border border-white/10 bg-white/[0.045]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <h2 className="text-sm uppercase tracking-[0.16em] text-white/70">Sinners and Purgatory</h2>
          </div>
          <div className="space-y-3 px-4 py-3 text-sm text-white/60">
            <p>Sinners are members inside cruush’s service area. Purgatory is for members outside it. You can still post, message, and connect on cruush.</p>
            <p>The map is available within 100 miles of the center of New York during the NYC open beta.</p>
          </div>
        </section>
        <section className="rounded-lg border border-white/10 bg-white/[0.045]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <h2 className="text-sm uppercase tracking-[0.16em] text-white/70">Location and privacy</h2>
          </div>
          <div className="space-y-3 px-4 py-3 text-sm text-white/60">
            <p>Without an active Mile High Club location in the service area, Purgatory members cannot use profile pins.</p>
            <p>Location labels may show a town or a broad area instead of a distance. Each member’s visibility and privacy settings still apply.</p>
          </div>
        </section>
        <section className="rounded-lg border border-white/10 bg-white/[0.045]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <h2 className="text-sm uppercase tracking-[0.16em] text-white/70">Mile High Club</h2>
          </div>
          <div className="space-y-3 px-4 py-3 text-sm text-white/60">
            <p>An active Mile High Club location inside the service area restores normal map, Ghost Mode, and Pulse eligibility.</p>
            <p>While Mile High Club is active, profiles show its badge and location labels instead of Purgatory. It does not override another member’s privacy.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
