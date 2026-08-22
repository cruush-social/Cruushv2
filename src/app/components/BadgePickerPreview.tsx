import { useEffect, useState } from 'react';
import { KeyholeEyeGlyph, LipsGlyph, PartyHatGlyph, StraightEdgeGlyph, TongueGlyph } from './BadgeGlyphs';
import {
  LabrysGlyph,
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
  { id: 'left' as const, label: 'Left', hint: 'Usually what you give' },
  { id: 'right' as const, label: 'Right', hint: 'Usually what you take' },
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
  const [leftBadge, setLeftBadge] = useState('none');
  const [rightBadge, setRightBadge] = useState('none');
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

          <p className="w-full text-center text-xs text-white/52">
            Left usually means what you like to give and right what you like to take. Plenty of
            people ignore that, and either side can carry anything. Leave a side on No badge to
            keep it empty.
          </p>

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
