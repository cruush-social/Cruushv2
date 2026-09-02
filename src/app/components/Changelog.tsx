import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { registerBugButtonSlot } from '../lib/bugButtonSlot';
import { Button } from './ui/button';

const changelogReleases = [
  {
    version: 'v1.6',
    items: [
      'Explore from another location with Mile High Club.',
      'Find Spots by vibe and amenities, see who is there, and read their Pink Book while checked in.',
      'Spot check-ins expire. Pink Book posts stay until their author deletes them.',
      'Post text to Feed for free, search #tags, and add up to three photos with cruush+.',
      'cruush+ includes 5 Pulses per day, with optional alerts protected from repeats.',
      'Complete Side Quests to earn bonus Pings and cruush+ days.',
      'Ghost Mode keeps its familiar animation with the new 1.6 icon, while Dark Room adds a private way to browse.',
      'Profiles, messages, map controls, loading states, and mobile layouts feel faster and clearer.',
    ],
  },
  {
    version: 'v1.5',
    items: [
      'Cruise browsing now shows full 4:5 profile photos with profile details and actions layered in dark glass controls.',
      'Your Seeking filters now stay selected while you browse profiles.',
      'Activity tabs now use more consistent layouts, cruush actions, and top-three Vibe labels.',
      'Nearby alerts now take you directly to the relevant person’s map pin while respecting their location-sharing settings.',
      'Mobile sign-up now scrolls reliably, with themed checkboxes and clearer footer spacing.',
      'Map controls and top actions stay separated on small screens.',
      'Survey responses are delivered more reliably so feedback reaches the cruush team.',
    ],
  },
  {
    version: 'v1.4',
    items: [
      'Ghost Mode has clearer controls and status feedback on the map.',
      'Choose each notification type separately, including nearby activity and rewards.',
      'Nearby activity can reach you inside cruush whenever you have it enabled.',
      'Daily check-ins now include a bonus day for every seven-day streak.',
      'Dark Room adds a cruush+ privacy control, while Ghost Mode and precise-location controls are available to basic and cruush+ accounts.',
      'Ping is easier to find, with a clear cooldown between signals.',
      'The map feels smoother, with clearer tiles, easier-to-read labels, larger controls, better tap and press interactions, steadier navigation, and a simpler mobile tutorial.',
      'Messages now have the same detailed Seeking filters as the map, without changing your map filters.',
      'New accounts can receive one free day of cruush+ when they enable 2FA.',
      'General bug fixes and quality improvements make cruush feel more reliable across the app.',
    ],
  },
  {
    version: 'v1.3',
    items: [
      'Ghost Mode has clearer controls and status feedback on the map.',
      'Choose each notification type separately, including nearby activity and rewards.',
      'Nearby activity can reach you inside cruush whenever you have it enabled.',
      'Daily check-ins now include a bonus day for every seven-day streak.',
      'Dark Room adds a cruush+ privacy control, while Ghost Mode and precise-location controls are available to basic and cruush+ accounts.',
      'Ping is easier to find, with a clear cooldown between signals.',
      'The map feels smoother, with clearer tiles, easier-to-read labels, larger controls, better tap and press interactions, steadier navigation, and a simpler mobile tutorial.',
      'Messages now have the same detailed Seeking filters as the map, without changing your map filters.',
      'New accounts can receive one free day of cruush+ when they enable 2FA.',
      'General bug fixes and quality improvements make cruush feel more reliable across the app.',
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
      'Mutual states use the purple mutual treatment more consistently across chat surfaces.',
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
