import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { registerBugButtonSlot } from '../lib/bugButtonSlot';
import { Button } from './ui/button';

const changelogReleases = [
  {
    version: 'v1.3',
    items: [
      'Ghost Mode no longer shares how far away you are. People nearby see that you are around, never your distance.',
      'Ghost Mode no longer shares which privacy radius you picked, so nobody can tell a tight radius from a wide one.',
      'Notification settings now switch each alert type on or off on its own, including nearby activity and rewards.',
      'Nearby alerts cover a five-mile radius and reach you in the app whether or not push notifications are on.',
      'Rewards move to one daily check-in, with a bonus day each time you finish a seven-day streak.',
      'Stealth Mode is part of cruush+, while Ghost Mode and precise-location controls stay free.',
      'Ping sits directly below cruush+ in the map controls and waits out a cooldown between signals.',
      'The map top action bar and its icons are larger, and map pins respond to both a short tap and a press and hold.',
      'Map navigation, touch handling, the tutorial, and the mobile menu were tightened up.',
      'Behind the scenes, links and notification endpoints the server handles are validated more strictly.',
    ],
  },
  {
    version: 'v1.2',
    items: [
      'Ping briefly activates your map heart and posts your signal to the local feed for your saved post duration.',
      'The interactive tutorial highlights the real Install, Notifications, Seeking, Visibility, DL Mode, Ping, and Zoom controls without covering them or the bottom navigation.',
      'The map now stays inside the NYC beta area and remembers your position after you open a profile.',
      'Message discovery filters and sort controls are clearer and stay readable on smaller screens.',
      'Chat keeps your draft when a send fails, makes settings easier to reach, gives the composer more room, and shows a live countdown on disappearing messages you send.',
      'Quick-access photos upload more reliably, while view-once photos and disappearing-message controls have clearer states.',
      'Profiles now show more clearly when messaging is mutuals-only.',
      'The new winged-heart Profile icon stays white until selected, then fills with the cruush gradient.',
      'Popup notifications now share a flat chartreuse border treatment.',
      'Mobile installation uses clearer iPhone and browser instructions and catches the install prompt more reliably.',
      'Feed post duration is yours to choose, with Never as the default.',
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
        <div
          className="ml-auto flex items-center"
          data-testid="changelog-bug-button-slot"
          ref={registerBugButtonSlot}
        />
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
