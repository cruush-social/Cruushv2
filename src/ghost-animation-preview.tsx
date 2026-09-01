import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapMarkerPin } from './app/components/MapView';
import type { MapMarker } from './app/lib/mapMarkers';
import './styles/index.css';

function GhostRun({ run }: { run: number }) {
  const [animationHint, setAnimationHint] = useState<MapMarker['animationHint']>('NONE');
  const [expiresAtMs] = useState(() => Date.now() + 10_000);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimationHint('FADE_LAST_MINUTE'));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <MapMarkerPin
      marker={{
        id: `ghost-preview-${run}`,
        displayName: 'Ghost preview',
        approximateLatitude: 40.7128,
        approximateLongitude: -74.006,
        animationHint,
        displayMode: 'GHOST',
        ghostRotationExpiresAtMs: expiresAtMs,
      }}
    />
  );
}

function Preview() {
  const [run, setRun] = useState(1);

  useEffect(() => {
    const timer = window.setInterval(() => setRun((value) => value + 1), 12_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-16 bg-black p-6 text-white">
      <h1 className="text-2xl">Ghost Mode animation</h1>
      <div className="flex h-64 w-full max-w-md items-center justify-center overflow-visible rounded-3xl border border-white/15 bg-[#080808]">
        <GhostRun key={run} run={run} />
      </div>
      <button
        className="rounded-full px-8 py-3 text-lg text-white"
        onClick={() => setRun((value) => value + 1)}
        style={{ background: 'var(--cruush-gradient)' }}
        type="button"
      >
        Replay last 10 seconds
      </button>
      <p className="text-sm text-white/60">Replays automatically.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
