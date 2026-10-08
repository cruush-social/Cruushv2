import { useNavigate } from 'react-router';
import AppPageHeader from './AppPageHeader';

const changelogReleases = [
  {
    version: 'v1.9',
    items: [
      'Browse persistent Clubs from Messages with separate My Clubs and Browse Clubs views.',
      'cruush+ members can create a Club with a mutual cruush, choose its visibility, and add searchable tags.',
      'Each Club has a linked chat, member roles, moderation controls, sharing, and join-request review.',
      'Club membership records and private application answers now use encrypted storage.',
      'The Badge picker adds 111 Kink icons and 333 Vibe icons, searchable by name or category.',
      'Side-badge choices and short titles stay with your profile and appear on map hearts.',
    ],
  },
  {
    version: 'v1.8',
    items: [
      'Pay for cruush+ or Pulse with Bitcoin from Cash App, PayPal, Venmo, or another compatible wallet.',
      'Bitcoin checkout shows the exact amount and address, a QR code, copy controls, and a 24-hour payment window.',
      'Track payment progress through six confirmations and return to an unfinished checkout without losing its details.',
      'Order history in Settings keeps cruush+ and Pulse purchases visible, including confirmation and activation status.',
      'Fixed-term cruush+ purchases never auto-renew. New reminders arrive three days and one day before access ends.',
      'Billing support now has dedicated choices for payment issues, subscriptions or renewals, Pulse purchases, and refund requests.',
      'Feed posts can now reach more than one Crowd at a time.',
      'Mobile onboarding stays readable and scrollable around the keyboard, including long option lists.',
      'Map gestures and recentering are steadier: pinching stays on the map instead of zooming the page.',
      'Sign-in retries and photo uploads recover more reliably when a connection drops.',
      'Badge frames now keep Pride symbols inside their borders, with clearer sizing across the map and profiles.',
    ],
  },
  {
    version: 'v1.7',
    items: [
      'DL Mode now shows a lit state on the map, and controls which photo audiences see masked covers.',
      'Badges expand with collar emblems, Pride symbols, frames, hanky code, and the twelve zodiac signs.',
      'Relationship status is now a Seeking filter and shows on your profile.',
      'Read receipts show when your direct message was read.',
      'Notifications add Do Not Disturb hours.',
      'Color vision (color-blind) accessibility modes and larger text options are available across the app.',
      'Push notifications now prompt automatically after install and after onboarding.',
      'The Spot directory is cleaner: duplicate, unnamed, and mislabeled Spots removed, transit stops added, categories reorganized.',
      'Sign the Code of Conduct from Settings.',
      'Public report and suspension appeal forms, with a dedicated sign-in screen for suspended accounts.',
    ],
  },
  {
    version: 'v1.6',
    items: [
      'Explore from another location with Mile High Club.',
      'Find Spots by vibe and amenities, see who is there, and read their Pink Book while checked in.',
      'Browse a larger Spot directory with new Adult shop, Music venue, and Sports venue categories.',
      'Spot check-ins expire. Pink Book posts stay until their author deletes them.',
      'Checking into a Spot now shares it to the Feed.',
      'All members can customize both side badges.',
      'Basic profiles can add 3 kinks; cruush+ removes the profile kink limit.',
      'Post text to Feed for free and search #tags. cruush+ adds up to ten tags on a post and up to three photos.',
      'cruush+ includes 5 Pulses per day, with optional alerts protected from repeats.',
      'Complete Side Quests to earn bonus Pulses and cruush+ days.',
      'Ghost Mode keeps its familiar animation with the new 1.6 icon.',
      'Dark Room gives cruush+ a private way to browse.',
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
      'Pulse is easier to find, with a clear cooldown between signals.',
      'The map feels smoother, with clearer tiles, easier-to-read labels, larger controls, better tap and press interactions, steadier navigation, and a simpler mobile tutorial.',
      'Messages now have the same detailed Seeking filters as the map, without changing your map filters.',
      'New accounts can receive one free day of cruush+ when they enable 2FA.',
      'General bug fixes and quality improvements make cruush feel more reliable across the app.',
    ],
  },
  {
    version: 'v1.2',
    items: [
      'Pulse briefly activates your map heart and posts your signal to the local feed for your saved post duration.',
      'The tutorial points at the real buttons without covering them.',
      'The map now stays inside the NYC beta area and remembers your position after you open a profile.',
      'Message discovery filters and sort controls are clearer and stay readable on smaller screens.',
      'Chat keeps your draft when a send fails, makes settings easier to reach, gives the composer more room, and shows a live countdown on disappearing messages you send.',
      'Quick access gallery photos upload more reliably, while view-once photos and disappearing-message controls have clearer states.',
      'Profiles now show more clearly when messaging is cruushes-only.',
      'The new winged-heart Profile icon stays white until selected, then fills with the cruush gradient.',
      'Popup notifications now have a green border.',
      'Mobile installation uses clearer iPhone and browser instructions and catches the install prompt more reliably.',
      'Feed post duration is yours to choose, with Never as the default.',
    ],
  },
  {
    version: 'v1.1',
    items: [
      'Messages now default to Cruushes, with Public, Cruushes, and Crowd permission options.',
      'The message picker separates Public and Cruushes, adds sorting, and shows more profile context.',
      'Visible feed pins now appear in message discovery when someone has that setting enabled.',
      'Feed settings include a 7-day post window, broader nearby radius, and clearer feed pin controls.',
      'Privacy Audit now summarizes where you are visible, who can message you, and revocable precise-location grants.',
      'You can now clear your notifications.',
      'Mutual cruushes show in purple throughout Messages.',
    ],
  },
];

export default function Changelog() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-20 text-white">
      <AppPageHeader
        title="Changelog"
        onBack={() => navigate(-1)}
        backLabel="Back to settings"
        bugButtonTestId="changelog-bug-button-slot"
      >
        <p className="text-sm text-white/52">{changelogReleases[0].version}</p>
      </AppPageHeader>

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
