import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { Eye, Filter, Ghost } from 'lucide-react';
import BottomNav from './app/components/BottomNav';
import AlphaBugButton from './app/components/AlphaBugButton';
import FirstRunTutorial from './app/components/FirstRunTutorial';
import { Button } from './app/components/ui/button';
import { Input } from './app/components/ui/input';
import './styles/index.css';

// Stand-ins for the screens the tutorial visits, carrying the same test ids the real
// controls do so the spotlight rings land where they will in the app. This is a preview
// of the tutorial, not of the map.
function MapStandIn() {
  return (
    <div className="min-h-screen bg-[#0b0b0f] pb-32">
      <div className="flex items-center justify-end gap-2 px-3 pt-3">
        <Button variant="ghost" size="icon" aria-label="Ghost Mode Settings" className="rounded-full">
          <Ghost className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" data-testid="map-dl-mode-toggle" aria-label="Turn DL Mode off" className="rounded-full">
          <Eye className="h-5 w-5" />
        </Button>
      </div>
      <div className="mt-4 flex flex-col items-end gap-2 px-3">
        <Button data-testid="map-seeking-button" className="h-8 rounded-full border border-white/10 bg-background/68 px-4 text-[11px] uppercase tracking-[0.18em]">
          <Filter className="mr-2 h-4 w-4" />
          Seeking
        </Button>
        <Button data-testid="map-visibility-button" className="h-8 rounded-full border border-white/10 bg-background/68 px-4 text-[11px] uppercase tracking-[0.18em]">
          Visibility
        </Button>
      </div>
      <p className="mt-16 text-center text-sm text-muted-foreground">map</p>
    </div>
  );
}

function FeedStandIn() {
  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border px-4 py-3"><h1 className="text-xl">Local Feed</h1></header>
      <div className="p-4">
        <div data-testid="local-feed-composer" className="rounded-xl border border-border p-3">
          <textarea className="min-h-24 w-full resize-none bg-transparent text-sm outline-none" placeholder="Share something with nearby people..." />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline">1h</Button>
            <Button size="sm" variant="outline">6h</Button>
            <Button size="sm">24h</Button>
          </div>
          <Button
            className="mt-3 w-full"
            data-testid="local-feed-post-button"
            onClick={() => window.dispatchEvent(new CustomEvent('cruush:feed-post-created'))}
            style={{ background: 'var(--cruush-gradient)' }}
          >
            Post
          </Button>
        </div>
      </div>
    </div>
  );
}

function RewardsStandIn() {
  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border px-4 py-3"><h1 className="text-xl">Rewards</h1></header>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">Your referral link</p>
        <Input aria-label="Referral link" readOnly value="https://cruush.app/join/abc123" />
      </div>
    </div>
  );
}

function Screens() {
  const location = useLocation();

  return (
    <Routes>
      <Route path="/rewards" element={<RewardsStandIn />} />
      <Route path="/feed" element={<FeedStandIn />} />
      <Route path="*" element={<MapStandIn key={location.pathname} />} />
    </Routes>
  );
}

function Preview() {
  const [run, setRun] = useState(0);

  return (
    <MemoryRouter initialEntries={['/map']}>
      <Screens />
      <div className="fixed left-3 top-3 z-[70]">
        <Button size="sm" variant="outline" onClick={() => setRun((value) => value + 1)}>
          Replay
        </Button>
      </div>
      <BottomNav />
      <AlphaBugButton enabled />
      <FirstRunTutorial forceOpen key={run} />
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
