import { useEffect, useState } from 'react';
import { KeyholeEyeGlyph, LipsGlyph, PartyHatColorGlyph, StraightEdgeGlyph, TongueGlyph } from './BadgeGlyphs';
import {
  ArrowDown,
  ArrowLeft,
  Bed,
  Bone,
  CircleDot,
  Crown,
  Drama,
  Droplet,
  Eye,
  Feather,
  Hammer,
  Grab,
  Handshake,
  Hourglass,
  Layers,
  Link2,
  Lock,
  MinusCircle,
  Repeat2,
  Shield,
  Spline,
  TreePine,
  Users,
  UsersRound,
  Wand2,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import HeartPhoto from './HeartPhoto';
import { getMyProfile } from '../lib/profileApi';

/**
 * A place to decide what the two side badges on a heart should say. Built from
 * the real heart and the real badge chip so the choice is made against what the
 * map actually draws.
 */

type BadgeOption = {
  id: string;
  label: string;
  icon: (props: { className?: string; strokeWidth?: number }) => JSX.Element;
  group: string;
};

const BADGE_OPTIONS: BadgeOption[] = [
  { id: 'oral', label: 'Oral', icon: LipsGlyph, group: 'Acts' },
  { id: 'penetration', label: 'Penetration', icon: ArrowDown, group: 'Acts' },
  { id: 'fisting', label: 'Fisting', icon: Grab, group: 'Acts' },
  { id: 'rimming', label: 'Rimming', icon: CircleDot, group: 'Acts' },
  { id: 'hands', label: 'Hands', icon: Handshake, group: 'Acts' },
  { id: 'frottage', label: 'Frottage', icon: Repeat2, group: 'Acts' },
  { id: 'toys', label: 'Toys', icon: Wand2, group: 'Acts' },
  { id: 'mutual', label: 'Mutual', icon: Users, group: 'Acts' },
  { id: 'bondage', label: 'Bondage', icon: Link2, group: 'Kink' },
  { id: 'impact', label: 'Impact', icon: Hammer, group: 'Kink' },
  { id: 'service', label: 'Service', icon: Bed, group: 'Kink' },
  { id: 'control', label: 'Control', icon: Crown, group: 'Kink' },
  { id: 'watersports', label: 'Watersports', icon: Droplet, group: 'Kink' },
  { id: 'edging', label: 'Edging', icon: Hourglass, group: 'Kink' },
  { id: 'gooning', label: 'Gooning', icon: TongueGlyph, group: 'Kink' },
  { id: 'chastity', label: 'Chastity', icon: Lock, group: 'Kink' },
  { id: 'leather', label: 'Leather', icon: Shield, group: 'Kink' },
  { id: 'rubber', label: 'Rubber', icon: Layers, group: 'Kink' },
  { id: 'pup', label: 'Pup play', icon: Bone, group: 'Kink' },
  { id: 'rope', label: 'Rope', icon: Spline, group: 'Kink' },
  { id: 'sensation', label: 'Sensation', icon: Feather, group: 'Kink' },
  { id: 'breath', label: 'Breath', icon: Wind, group: 'Kink' },
  { id: 'roleplay', label: 'Roleplay', icon: Drama, group: 'Kink' },
  { id: 'exhibition', label: 'Exhibition', icon: Eye, group: 'Scene' },
  { id: 'voyeur', label: 'Voyeur', icon: KeyholeEyeGlyph, group: 'Scene' },
  { id: 'group', label: 'Group', icon: UsersRound, group: 'Scene' },
  { id: 'public', label: 'Public', icon: TreePine, group: 'Scene' },
  { id: 'chems', label: 'Party', icon: PartyHatColorGlyph, group: 'Scene' },
  { id: 'sober', label: 'Straight edge', icon: StraightEdgeGlyph, group: 'Scene' },
  { id: 'none', label: 'No badge', icon: MinusCircle, group: 'Scene' },
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
const CURRENT_USER_BORDER = '#004BFF';

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
      <Icon aria-hidden="true" className="h-[0.8125rem] w-[0.8125rem]" strokeWidth={2.6} />
    </span>
  );
}

export default function BadgePickerPreview() {
  const navigate = useNavigate();
  const [leftBadge, setLeftBadge] = useState('oral');
  const [rightBadge, setRightBadge] = useState('penetration');
  const [activeSide, setActiveSide] = useState<'left' | 'right'>('left');
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getMyProfile>> | null>(null);
  const groups = [...new Set(BADGE_OPTIONS.map((option) => option.group))];
  const [activeGroup, setActiveGroup] = useState(groups[0]);

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

  return (
    <div className="flex min-h-screen flex-col bg-background text-white">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-background/95 px-4 py-3 backdrop-blur-md">
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

      {/* Browse by category, try one on, watch it land on the heart below. */}
      <div className="sticky top-[3.75rem] z-10 border-b border-white/10 bg-background/95 px-4 py-2 backdrop-blur-md">
        <div className="flex gap-2 overflow-x-auto">
          {groups.map((group) => (
            <button
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition ${
                activeGroup === group
                  ? 'border-[#004BFF] bg-black/60 text-white'
                  : 'border-white/10 bg-black/40 text-white/64 hover:bg-white/[0.06]'
              }`}
              key={group}
              onClick={() => setActiveGroup(group)}
              type="button"
            >
              {group}
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {BADGE_OPTIONS.filter((option) => option.group === activeGroup).map((option) => {
            const selected = chosen[activeSide] === option.id;
            const Icon = option.icon;

            return (
              <button
                className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center text-sm leading-tight transition ${
                  selected
                    ? 'border-[#004BFF] bg-black/60 text-white'
                    : 'border-white/10 bg-black/40 text-white/70 hover:bg-white/[0.06]'
                }`}
                key={option.id}
                onClick={() => setChosen(option.id)}
                type="button"
              >
                <Icon aria-hidden="true" className="h-6 w-6 text-white" strokeWidth={2.2} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </main>

      {/* The fitting mirror: the unit at the size it reads on the map, big. */}
      <div className="sticky bottom-0 z-20 border-t border-white/10 bg-background/96 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-5 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4">
          <span className="relative flex h-[6.5rem] w-[8rem] scale-[1.38] items-center justify-center">
            <span className="relative flex h-20 w-[103px] items-center justify-center">
              <HeartPhoto
                className="w-20"
                label="Your heart with its side badges"
                masked={false}
                photo={profile?.photos?.[0] ?? null}
                theme="current"
                userId="badge-preview"
              />
              <BadgeChip icon={leftOption.icon} side="left" />
              <BadgeChip icon={rightOption.icon} side="right" />
            </span>
          </span>

          <div className="grid w-full grid-cols-2 gap-2">
            {SIDES.map((side) => {
              const option = side.id === 'left' ? leftOption : rightOption;
              const active = activeSide === side.id;

              return (
                <button
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    active
                      ? 'border-[#004BFF] bg-black/60 text-white'
                      : 'border-white/10 bg-black/40 text-white/64 hover:bg-white/[0.06]'
                  }`}
                  key={side.id}
                  onClick={() => setActiveSide(side.id)}
                  type="button"
                >
                  <span className="block text-[0.7rem] uppercase tracking-[0.12em] text-white/48">
                    {side.hint}
                  </span>
                  <span className="mt-0.5 block truncate text-sm">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
