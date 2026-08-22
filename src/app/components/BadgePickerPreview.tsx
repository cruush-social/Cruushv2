import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  Bed,
  CircleDot,
  Crown,
  Droplet,
  Eye,
  Hammer,
  Hand,
  Handshake,
  Link2,
  Smile,
  MinusCircle,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { MapMarkerPin } from './MapView';
import { getMyProfile } from '../lib/profileApi';

/**
 * A place to decide what the two side badges on a heart should say. Built from
 * the real heart and the real badge chip so the choice is made against what the
 * map actually draws.
 */

type BadgeOption = {
  id: string;
  label: string;
  icon: LucideIcon;
  group: string;
};

const BADGE_OPTIONS: BadgeOption[] = [
  { id: 'oral', label: 'Oral', icon: Smile, group: 'Acts' },
  { id: 'penetration', label: 'Penetration', icon: ArrowDown, group: 'Acts' },
  { id: 'fisting', label: 'Fisting', icon: Hand, group: 'Acts' },
  { id: 'rimming', label: 'Rimming', icon: CircleDot, group: 'Acts' },
  { id: 'hands', label: 'Hands', icon: Handshake, group: 'Acts' },
  { id: 'bondage', label: 'Bondage', icon: Link2, group: 'Kink' },
  { id: 'impact', label: 'Impact', icon: Hammer, group: 'Kink' },
  { id: 'service', label: 'Service', icon: Bed, group: 'Kink' },
  { id: 'control', label: 'Control', icon: Crown, group: 'Kink' },
  { id: 'watersports', label: 'Watersports', icon: Droplet, group: 'Kink' },
  { id: 'watching', label: 'Watching', icon: Eye, group: 'Kink' },
  { id: 'group', label: 'Group', icon: Users, group: 'Kink' },
  { id: 'none', label: 'Nothing here', icon: MinusCircle, group: 'Kink' },
];

// Hanky code: the side says your role, the badge says the act. Left is what you
// give, right is what you take. The same badge on both sides reads as versatile,
// exactly the way wearing it on both sides always has.
const SIDES = [
  { id: 'left' as const, label: 'Left', hint: 'What you give' },
  { id: 'right' as const, label: 'Right', hint: 'What you take' },
];

// Copied from the map's own badge chip: same size, same 3.2px border, same
// placement, same surface. Your pin's border colour is the indigo the map uses.
const CURRENT_USER_BORDER = 'rgba(0, 75, 255, 0.8)';

function BadgeChip({ icon: Icon, side }: { icon: LucideIcon; side: 'left' | 'right' }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'absolute flex h-[1.5625rem] w-[1.5625rem] items-center justify-center rounded-full border bg-black/85 text-white backdrop-blur-sm',
        side === 'left' ? 'left-[-0.25rem]' : 'right-[-0.25rem]',
        'top-[62%] z-20 -translate-y-1/2',
      ].join(' ')}
      role="img"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderColor: CURRENT_USER_BORDER,
        borderWidth: '3.2px',
      }}
    >
      <Icon aria-hidden="true" className="h-[0.9375rem] w-[0.9375rem]" strokeWidth={2.6} />
    </span>
  );
}

export default function BadgePickerPreview() {
  const navigate = useNavigate();
  const [leftBadge, setLeftBadge] = useState('oral');
  const [rightBadge, setRightBadge] = useState('penetration');
  const [activeSide, setActiveSide] = useState<'left' | 'right'>('left');
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getMyProfile>> | null>(null);

  useEffect(() => {
    let isMounted = true;

    void getMyProfile()
      .then((loaded) => {
        if (isMounted) {
          setProfile(loaded);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  const chosen = { left: leftBadge, right: rightBadge };
  const setChosen = activeSide === 'left' ? setLeftBadge : setRightBadge;
  const leftOption = BADGE_OPTIONS.find((option) => option.id === leftBadge) ?? BADGE_OPTIONS[0];
  const rightOption = BADGE_OPTIONS.find((option) => option.id === rightBadge) ?? BADGE_OPTIONS[0];
  const groups = [...new Set(BADGE_OPTIONS.map((option) => option.group))];

  return (
    <div className="min-h-screen bg-background pb-24 text-white">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-background/95 px-4 py-3 backdrop-blur-md">
        <button
          aria-label="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/55"
          onClick={() => navigate(-1)}
          type="button"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg">Your side badges</h1>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
        <p className="text-sm text-white/62">
          Two badges ride on your heart. Left is what you give, right is what you take, the
          way a hanky has always been read. Put the same badge on both sides and it reads as
          versatile.
        </p>

        {/* The map's own unit, drawn by the map's own component. The badges
            are its real badge slots, not chips drawn on top of it. */}
        <section className="flex items-center justify-center rounded-2xl border border-white/10 bg-black/45 py-16">
          <MapMarkerPin
            marker={{
              id: 'badge-preview',
              kind: 'person',
              displayName: profile?.display_name ?? 'You',
              userId: 'badge-preview',
              signal: null,
              approximateLatitude: 0,
              approximateLongitude: 0,
              photo: profile?.photos?.[0] ?? null,
              isCurrentUser: true,
              badge: { key: rightOption.id, label: rightOption.label },
              relationship: { kind: 'mutual_cruush', precision: 'precise' },
            }}
            previewed
          />
        </section>

        <div className="grid grid-cols-2 gap-2">
          {SIDES.map((side) => (
            <button
              className={`rounded-xl border p-3 text-left transition ${
                activeSide === side.id
                  ? 'border-primary/45 text-white'
                  : 'border-white/10 bg-black/40 text-white/72 hover:bg-white/[0.06]'
              }`}
              key={side.id}
              onClick={() => setActiveSide(side.id)}
              style={activeSide === side.id ? { background: 'var(--cruush-gradient-soft-18)' } : undefined}
              type="button"
            >
              <span className="block text-sm">{side.label}</span>
              <span className="mt-0.5 block text-xs text-white/55">{side.hint}</span>
            </button>
          ))}
        </div>

        {groups.map((group) => (
          <section className="space-y-2" key={group}>
            <h2 className="text-xs uppercase tracking-[0.14em] text-white/48">{group}</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {BADGE_OPTIONS.filter((option) => option.group === group).map((option) => {
                const selected = chosen[activeSide] === option.id;
                const Icon = option.icon;

                return (
                  <button
                    className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-2 text-center text-xs transition ${
                      selected
                        ? 'border-primary/45 text-white'
                        : 'border-white/10 bg-black/40 text-white/72 hover:bg-white/[0.06]'
                    }`}
                    key={option.id}
                    onClick={() => setChosen(option.id)}
                    style={selected ? { background: 'var(--cruush-gradient-soft-18)' } : undefined}
                    type="button"
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-black/85"
                      style={{ borderColor: 'rgba(0, 75, 255, 0.8)', borderWidth: '3.2px' }}
                    >
                      <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={2.6} />
                    </span>
                    <span className="leading-tight">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
