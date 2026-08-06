import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import BottomNav from './app/components/BottomNav';
import AlphaBugButton from './app/components/AlphaBugButton';
import FirstRunTutorial from './app/components/FirstRunTutorial';
import { Button } from './app/components/ui/button';
import './styles/index.css';

function FakeFeed() {
  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border px-4 py-3">
        <h1 className="text-xl">Local Feed</h1>
      </header>
      <div className="space-y-3 p-4">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="rounded-xl border border-border p-4">
            <p className="text-sm">Someone nearby posted something.</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline">Reply</Button>
              <Button size="sm" variant="outline">Delete</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Preview() {
  const [run, setRun] = useState(0);

  return (
    <MemoryRouter initialEntries={['/map']}>
      <FakeFeed />
      <div className="fixed left-3 top-3 z-[70]">
        <Button size="sm" variant="outline" onClick={() => setRun((value) => value + 1)}>
          Replay tutorial
        </Button>
      </div>
      <BottomNav />
      <AlphaBugButton enabled />
      <FirstRunTutorial forceOpen key={run} />
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
