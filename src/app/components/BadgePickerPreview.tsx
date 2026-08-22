import { useEffect, useState } from 'react';
import { KeyholeEyeGlyph, LipsGlyph, PartyHatGlyph, StraightEdgeGlyph, TongueGlyph } from './BadgeGlyphs';
import {
  CollarHolderFemaleGlyph,
  CollarHolderGlyph,
  CollarHolderMaleGlyph,
  CollarHolderNonbinaryGlyph,
  CollarSwitchGlyph,
  CollaredFemaleGlyph,
  CollaredGlyph,
  CollaredLittleGlyph,
  CollaredMaleGlyph,
  CollaredNonbinaryGlyph,
  UncollaredFemaleGlyph,
  UncollaredGlyph,
  UncollaredLittleGlyph,
  UncollaredMaleGlyph,
  UncollaredNonbinaryGlyph,
} from './OwnershipGlyphs';
import {
  DoubleMarsGlyph,
  DoubleTransGlyph,
  DoubleVenusGlyph,
  IntersexGlyph,
  LabrysGlyph,
  MarsVenusGlyph,
  NonbinaryGlyph,
  PlayingCard,
  PolyGlyph,
  T4TGlyph,
  TransGlyph,
} from './CommunityGlyphs';
import {
  DominantGlyph,
  ServiceGlyph,
  SubmissiveGlyph,
  SwitchGlyph,
} from './PositionRoleGlyphs';
import {
  ArrowDown,
  ArrowLeft,
  Baby,
  BadgeCheck,
  Bed,
  Bookmark,
  Cable,
  Camera,
  Dot,
  Droplets,
  Dumbbell,
  Footprints,
  HandMetal,
  Medal,
  MessageCircleQuestion,
  Minus,
  Moon,
  Mountain,
  PenTool,
  Pin,
  Recycle,
  Scissors,
  Shirt,
  ShieldCheck,
  Sparkles,
  Target,
  ThumbsDown,
  Flower2,
  HeartHandshake,
  Pill,
  Zap,
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
  Maximize2,
  MinusCircle,
  Repeat2,
  Shield,
  Spline,
  Building2,
  Car,
  DoorOpen,
  EyeOff,
  Flame,
  Route,
  TreePine,
  VenetianMask,
  Waves,
  Users,
  UsersRound,
  Wand2,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import HeartPhoto from './HeartPhoto';
import { getMyProfile } from '../lib/profileApi';
import { BADGE_INTENTS, formatBadgeLabel, type BadgeIntent } from '../lib/badgeIntent';

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
  // Acts: what happens, in the plainest terms.
  { id: 'oral', label: 'Oral', icon: LipsGlyph, group: 'Acts' },
  { id: 'rimming', label: 'Rimming', icon: CircleDot, group: 'Acts' },
  { id: 'penetration', label: 'Penetration', icon: ArrowDown, group: 'Acts' },
  { id: 'anal', label: 'Anal', icon: Target, group: 'Acts' },
  { id: 'fisting', label: 'Fisting', icon: Grab, group: 'Acts' },
  { id: 'large-insertion', label: 'Large insertion', icon: Maximize2, group: 'Acts' },
  { id: 'hands', label: 'Hands', icon: Handshake, group: 'Acts' },
  { id: 'frottage', label: 'Frottage', icon: Repeat2, group: 'Acts' },
  { id: 'mutual', label: 'Mutual', icon: Users, group: 'Acts' },
  { id: 'sixty-nine', label: 'Sixty-nine', icon: Recycle, group: 'Acts' },
  { id: 'docking', label: 'Docking', icon: Link2, group: 'Acts' },
  { id: 'nipple-play', label: 'Nipple play', icon: Dot, group: 'Acts' },
  { id: 'toys', label: 'Toys', icon: Wand2, group: 'Acts' },
  { id: 'edging', label: 'Edging', icon: Hourglass, group: 'Acts' },
  { id: 'gooning', label: 'Gooning', icon: TongueGlyph, group: 'Acts' },
  { id: 'cum-play', label: 'Cum play', icon: Droplets, group: 'Acts' },

  // Power: who is leading, and how hard.
  { id: 'dominant', label: 'Dominant', icon: DominantGlyph, group: 'Power' },
  { id: 'submissive', label: 'Submissive', icon: SubmissiveGlyph, group: 'Power' },
  { id: 'switch', label: 'Switch', icon: SwitchGlyph, group: 'Power' },
  { id: 'service', label: 'Service', icon: ServiceGlyph, group: 'Power' },
  { id: 'bondage', label: 'Bondage', icon: Link2, group: 'Power' },
  { id: 'rope', label: 'Rope', icon: Spline, group: 'Power' },
  { id: 'impact', label: 'Impact', icon: Hammer, group: 'Power' },
  { id: 'spanking', label: 'Spanking', icon: HandMetal, group: 'Power' },
  { id: 'control', label: 'Control', icon: Crown, group: 'Power' },
  { id: 'chastity', label: 'Chastity', icon: Lock, group: 'Power' },
  { id: 'humiliation', label: 'Humiliation', icon: ThumbsDown, group: 'Power' },
  { id: 'praise', label: 'Praise', icon: Sparkles, group: 'Power' },
  { id: 'cbt', label: 'CBT', icon: Scissors, group: 'Power' },
  { id: 'electro', label: 'Electro', icon: Zap, group: 'Power' },
  { id: 'breath', label: 'Breath', icon: Wind, group: 'Power' },
  { id: 'watersports', label: 'Watersports', icon: Droplet, group: 'Power' },
  { id: 'age-play', label: 'Age play', icon: Baby, group: 'Power' },

  // Collar: where you stand, in the emblems the community already uses. The
  // inner mark says whose gender is meant, not yours.
  { id: 'collar-holder', label: 'Holds a collar', icon: CollarHolderGlyph, group: 'Collar' },
  { id: 'collar-holder-f', label: 'Holds, woman', icon: CollarHolderFemaleGlyph, group: 'Collar' },
  { id: 'collar-holder-m', label: 'Holds, man', icon: CollarHolderMaleGlyph, group: 'Collar' },
  { id: 'collar-holder-nb', label: 'Holds, nonbinary', icon: CollarHolderNonbinaryGlyph, group: 'Collar' },
  { id: 'collared', label: 'Collared', icon: CollaredGlyph, group: 'Collar' },
  { id: 'collared-f', label: 'Collared, to a woman', icon: CollaredFemaleGlyph, group: 'Collar' },
  { id: 'collared-m', label: 'Collared, to a man', icon: CollaredMaleGlyph, group: 'Collar' },
  { id: 'collared-nb', label: 'Collared, to nonbinary', icon: CollaredNonbinaryGlyph, group: 'Collar' },
  { id: 'collared-little', label: 'Collared little', icon: CollaredLittleGlyph, group: 'Collar' },
  { id: 'uncollared', label: 'Uncollared', icon: UncollaredGlyph, group: 'Collar' },
  { id: 'uncollared-f', label: 'Uncollared, seeks a woman', icon: UncollaredFemaleGlyph, group: 'Collar' },
  { id: 'uncollared-m', label: 'Uncollared, seeks a man', icon: UncollaredMaleGlyph, group: 'Collar' },
  { id: 'uncollared-nb', label: 'Uncollared, seeks nonbinary', icon: UncollaredNonbinaryGlyph, group: 'Collar' },
  { id: 'uncollared-little', label: 'Uncollared little', icon: UncollaredLittleGlyph, group: 'Collar' },
  { id: 'collar-switch', label: 'Switch', icon: CollarSwitchGlyph, group: 'Collar' },

  // Gear: what you wear, and what you want worn.
  { id: 'leather', label: 'Leather', icon: Shield, group: 'Gear' },
  { id: 'rubber', label: 'Rubber', icon: Layers, group: 'Gear' },
  { id: 'latex', label: 'Latex', icon: Droplet, group: 'Gear' },
  { id: 'denim', label: 'Denim', icon: Shirt, group: 'Gear' },
  { id: 'uniform', label: 'Uniform', icon: BadgeCheck, group: 'Gear' },
  { id: 'jock', label: 'Jock', icon: Medal, group: 'Gear' },
  { id: 'underwear', label: 'Underwear', icon: Bookmark, group: 'Gear' },
  { id: 'socks', label: 'Socks', icon: Footprints, group: 'Gear' },
  { id: 'sneakers', label: 'Sneakers', icon: Footprints, group: 'Gear' },
  { id: 'harness', label: 'Harness', icon: Cable, group: 'Gear' },
  { id: 'hood', label: 'Hood', icon: VenetianMask, group: 'Gear' },
  { id: 'pup-play', label: 'Pup play', icon: Bone, group: 'Gear' },
  { id: 'drag', label: 'Drag', icon: Drama, group: 'Gear' },
  { id: 'roleplay', label: 'Roleplay', icon: Wand2, group: 'Gear' },

  // Body: what you are drawn to.
  { id: 'feet', label: 'Feet', icon: Footprints, group: 'Body' },
  { id: 'armpit', label: 'Armpit', icon: Wind, group: 'Body' },
  { id: 'muscle', label: 'Muscle', icon: Dumbbell, group: 'Body' },
  { id: 'bear', label: 'Bear', icon: Mountain, group: 'Body' },
  { id: 'chub', label: 'Chub', icon: CircleDot, group: 'Body' },
  { id: 'daddy', label: 'Daddy', icon: Crown, group: 'Body' },
  { id: 'boy', label: 'Boy', icon: Feather, group: 'Body' },
  { id: 'hairy', label: 'Hairy', icon: Waves, group: 'Body' },
  { id: 'smooth', label: 'Smooth', icon: Minus, group: 'Body' },
  { id: 'tattoos', label: 'Tattoos', icon: PenTool, group: 'Body' },
  { id: 'piercings', label: 'Piercings', icon: Pin, group: 'Body' },
  { id: 'sensation', label: 'Sensation', icon: Feather, group: 'Body' },

  // Scene: where and with how many.
  { id: 'group', label: 'Group', icon: UsersRound, group: 'Scene' },
  { id: 'threesome', label: 'Threesome', icon: Users, group: 'Scene' },
  { id: 'orgy', label: 'Orgy', icon: UsersRound, group: 'Scene' },
  { id: 'cuckolding', label: 'Cuckolding', icon: KeyholeEyeGlyph, group: 'Scene' },
  { id: 'voyeur', label: 'Voyeur', icon: Eye, group: 'Scene' },
  { id: 'exhibition', label: 'Exhibition', icon: Flame, group: 'Scene' },
  { id: 'public', label: 'Public', icon: Building2, group: 'Scene' },
  { id: 'cruising', label: 'Cruising', icon: Route, group: 'Scene' },
  { id: 'glory-hole', label: 'Glory hole', icon: DoorOpen, group: 'Scene' },
  { id: 'bathhouse', label: 'Bathhouse', icon: Waves, group: 'Scene' },
  { id: 'backroom', label: 'Backroom', icon: DoorOpen, group: 'Scene' },
  { id: 'sling', label: 'Sling', icon: Cable, group: 'Scene' },
  { id: 'outdoors', label: 'Outdoors', icon: TreePine, group: 'Scene' },
  { id: 'hotel', label: 'Hotel', icon: Bed, group: 'Scene' },
  { id: 'car', label: 'Car', icon: Car, group: 'Scene' },
  { id: 'overnight', label: 'Overnight', icon: Moon, group: 'Scene' },
  { id: 'camera', label: 'On camera', icon: Camera, group: 'Scene' },
  { id: 'discreet', label: 'Discreet', icon: EyeOff, group: 'Scene' },

  // Community: who you are and who you are looking for. People flag these as
  // loudly as anything else on this list.
  { id: 'trans', label: 'Trans', icon: TransGlyph, group: 'Community' },
  { id: 't4t', label: 'T4T', icon: T4TGlyph, group: 'Community' },
  { id: 'nonbinary', label: 'Nonbinary', icon: NonbinaryGlyph, group: 'Community' },
  { id: 'dyke', label: 'Dyke', icon: LabrysGlyph, group: 'Community' },
  { id: 'butch', label: 'Butch', icon: HandMetal, group: 'Community' },
  { id: 'femme', label: 'Femme', icon: Flower2, group: 'Community' },
  { id: 'stud', label: 'Stud', icon: Medal, group: 'Community' },
  { id: 'twink', label: 'Twink', icon: Feather, group: 'Community' },
  { id: 'otter', label: 'Otter', icon: Waves, group: 'Community' },
  { id: 'leather-family', label: 'Leather family', icon: Shield, group: 'Community' },
  { id: 'poly', label: 'Poly', icon: PolyGlyph, group: 'Community' },
  { id: 'queer', label: 'Queer', icon: Sparkles, group: 'Community' },
  { id: 'ace-spec', label: 'Ace spectrum', icon: PlayingCard, group: 'Community' },
  { id: 'newly-out', label: 'Newly out', icon: DoorOpen, group: 'Community' },
  { id: 'poz-friendly', label: 'Poz friendly', icon: HeartHandshake, group: 'Community' },
  { id: 'on-prep', label: 'On PrEP', icon: Pill, group: 'Community' },

  // Pride: the interlocking gender symbols, which people read faster than any
  // flag and which pair as easily as a hanky does.
  { id: 'mars-mars', label: 'Men', icon: DoubleMarsGlyph, group: 'Pride' },
  { id: 'venus-venus', label: 'Women', icon: DoubleVenusGlyph, group: 'Pride' },
  { id: 'mars-venus', label: 'Both', icon: MarsVenusGlyph, group: 'Pride' },
  { id: 'trans-trans', label: 'Trans on trans', icon: DoubleTransGlyph, group: 'Pride' },
  { id: 'trans-symbol', label: 'Trans', icon: TransGlyph, group: 'Pride' },
  { id: 'intersex', label: 'Intersex', icon: IntersexGlyph, group: 'Pride' },
  { id: 'enby', label: 'Nonbinary', icon: NonbinaryGlyph, group: 'Pride' },
  { id: 'labrys', label: 'Labrys', icon: LabrysGlyph, group: 'Pride' },

  // Boundaries: worth flagging as loudly as anything else.
  { id: 'party', label: 'Party', icon: PartyHatGlyph, group: 'Boundaries' },
  { id: 'sober', label: 'Sober', icon: MinusCircle, group: 'Boundaries' },
  { id: 'straight-edge', label: 'Straight edge', icon: StraightEdgeGlyph, group: 'Boundaries' },
  { id: 'safe-only', label: 'Safe only', icon: ShieldCheck, group: 'Boundaries' },
  { id: 'ask-me', label: 'Ask me', icon: MessageCircleQuestion, group: 'Boundaries' },
  { id: 'none', label: 'No badge', icon: MinusCircle, group: 'Boundaries' },
];

// Hanky code: the side says your role, the badge says the act. Left is what you
// give, right is what you take. The same badge on both sides reads as versatile,
// exactly the way wearing it on both sides always has.
const SIDES = [
  { id: 'left' as const, label: 'Left', hint: 'Left' },
  { id: 'right' as const, label: 'Right', hint: 'Right' },
];

// Copied from the map's own badge chip: same size, same 3.2px border, same
// placement, same surface. Your pin's border colour is the indigo the map uses.
const CURRENT_USER_BORDER = '#004BFF';

function BadgeChip({ icon: Icon, side, meaning }: {
  icon: LucideIcon;
  side: 'left' | 'right';
  /** What the badge says, shown above it on hover. */
  meaning?: string;
}) {
  return (
    <span
      className={[
        'group/badge absolute flex h-[1.5625rem] w-[1.5625rem] items-center justify-center rounded-full border bg-black/85 text-white backdrop-blur-sm',
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
      {meaning ? (
        <span
          className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-[0.7rem] leading-none text-white opacity-0 transition-opacity group-hover/badge:opacity-100"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)' }}
        >
          {meaning}
        </span>
      ) : null}
    </span>
  );
}

export default function BadgePickerPreview() {
  const navigate = useNavigate();
  const [leftBadge, setLeftBadge] = useState('none');
  const [rightBadge, setRightBadge] = useState('none');
  const [startedFromProfile, setStartedFromProfile] = useState(false);
  const [leftIntent, setLeftIntent] = useState<BadgeIntent>('none');
  const [rightIntent, setRightIntent] = useState<BadgeIntent>('none');
  const [activeSide, setActiveSide] = useState<'left' | 'right'>('left');
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getMyProfile>> | null>(null);
  const groups = [...new Set(BADGE_OPTIONS.map((option) => option.group))];
  const [activeGroup, setActiveGroup] = useState(groups[0]);

  useEffect(() => {
    let isMounted = true;

    void getMyProfile()
      .then((loaded) => {
        if (!isMounted) {
          return;
        }

        setProfile(loaded);

        // Left carries your role and right your position until you say
        // otherwise, which is what a basic account already shows.
        setStartedFromProfile((already) => {
          if (already) {
            return already;
          }

          const role = (loaded?.role ?? [])[0];
          const position = (loaded?.position ?? [])[0];

          if (role && BADGE_OPTIONS.some((option) => option.id === role)) {
            setLeftBadge(role);
          }

          if (position && BADGE_OPTIONS.some((option) => option.id === position)) {
            setRightBadge(position);
          }

          return true;
        });
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

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6">
        {/* You are the thing being dressed, so you sit in the middle. Tap a side
            to work on it; everything under here changes that side only. */}
        <div className="flex flex-col items-center gap-5">
          <span className="relative flex h-[7rem] w-[9rem] scale-[1.38] items-center justify-center">
            <span className="relative flex h-20 w-[103px] items-center justify-center">
              <HeartPhoto
                className="w-20"
                label="Your heart with its side badges"
                masked={false}
                photo={profile?.photos?.[0] ?? null}
                theme="current"
                userId="badge-preview"
              />
              <BadgeChip
                icon={leftOption.icon}
                meaning={leftOption.id === 'none' ? undefined : formatBadgeLabel(leftOption.label, leftIntent)}
                side="left"
              />
              <BadgeChip
                icon={rightOption.icon}
                meaning={rightOption.id === 'none' ? undefined : formatBadgeLabel(rightOption.label, rightIntent)}
                side="right"
              />
            </span>
          </span>

          <div className="grid w-full grid-cols-2 gap-2">
            {SIDES.map((side) => {
              const option = side.id === 'left' ? leftOption : rightOption;
              const intent = side.id === 'left' ? leftIntent : rightIntent;
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
                  <span className="mt-0.5 block truncate text-sm">
                    {option.id === 'none' ? 'Empty' : formatBadgeLabel(option.label, intent)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* What this badge says about you, for the side you are working on. */}
        <div className="mt-6 space-y-2">
          <h2 className="text-xs uppercase tracking-[0.14em] text-white/48">
            What this side says
          </h2>
          <div className="flex flex-wrap gap-2">
            {BADGE_INTENTS.map((intent) => {
              const current = activeSide === 'left' ? leftIntent : rightIntent;
              const selected = current === intent.id;

              return (
                <button
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    selected
                      ? 'border-[#004BFF] bg-black/60 text-white'
                      : 'border-white/10 bg-black/40 text-white/64 hover:bg-white/[0.06]'
                  }`}
                  key={intent.id}
                  onClick={() => (activeSide === 'left' ? setLeftIntent : setRightIntent)(intent.id)}
                  type="button"
                >
                  {intent.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-white/52">
            Left starts as your role and right as your position. Either side can carry anything.
          </p>
        </div>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
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

        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
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
    </div>
  );
}
