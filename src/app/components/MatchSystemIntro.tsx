import { useEffect } from 'react';
import { Button } from './ui/button';

interface MatchSystemIntroProps {
  onClose: () => void;
}

export default function MatchSystemIntro({ onClose }: MatchSystemIntroProps) {
  useEffect(() => {
    // trap focus if needed in future; simple mount effect for analytics can go here
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close match intro" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-lg rounded-lg border border-white/12 bg-black/90 p-6 shadow-lg">
        <header className="mb-3">
          <h2 className="text-lg font-semibold">How matching works on cruush</h2>
        </header>
        <div className="space-y-3 text-sm text-white/78">
          <p>
            When you heart someone on the map, we record that as an expression of interest. If they heart you back,
            you become a match — that opens a private chat and lets you connect directly.
          </p>

          <p>
            Matches are mutual and private. Your location is not shared in chat; only the map pins reflect
            approximate positions so people can find each other safely.
          </p>

          <p>
            You can control who sees you with privacy settings and "ghost mode" — and you can update your
            match preferences in the Match settings at any time.
          </p>

          <p className="text-xs text-white/60">This message will only appear once.</p>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Got it</Button>
        </div>
      </div>
    </div>
  );
}
