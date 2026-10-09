import { useEffect, useRef, useState } from 'react';
import { ZODIAC_SIGNS, ZodiacGlyph } from './ZodiacGlyphs';
import { AnalGlyph, BondageGlyph, CyborgGlyph, GooningGlyph, HarnessGlyph, LeatherGlyph, LipsGlyph, NeurodivergentGlyph, NippleGlyph, PartyHatGlyph, PenetrationGlyph, RimmingGlyph, RubberGlyph, SpankingGlyph, StraightEdgeGlyph } from './BadgeGlyphs';
import {
  BdsmTriskelionGlyph,
  BisexualGlyph,
  PlayingCard,
  DoubleMarsGlyph,
  DoubleVenusGlyph,
  IntersexGlyph,
  LabrysGlyph,
  MarsVenusGlyph,
  NonbinaryGlyph,
  PolyGlyph,
  T4TGlyph,
  TransGlyph,
} from './CommunityGlyphs';
import {
  AceFlagGlyph,
  AgenderFlagGlyph,
  AllyFlagGlyph,
  AroFlagGlyph,
  BearPawGlyph,
  BearFlagGlyph,
  BisexualFlagGlyph,
  DemisexualFlagGlyph,
  DemiromanticFlagGlyph,
  GayMenFlagGlyph,
  GenderfluidFlagGlyph,
  GenderqueerFlagGlyph,
  IntersexFlagGlyph,
  LeatherFlagGlyph,
  LesbianFlagGlyph,
  NonbinaryFlagGlyph,
  OmnisexualFlagGlyph,
  PansexualFlagGlyph,
  PolysexualFlagGlyph,
  ProgressPrideFlagGlyph,
  PupFlagGlyph,
  RainbowFlagGlyph,
  TransFlagGlyph,
} from './PrideFlagGlyphs';
import {
  BottomEmblem,
  DomEmblem,
  DominantTakenEmblem,
  SubEmblem,
  SubmissiveTakenEmblem,
  SwitchEmblem,
  TakenSwitchEmblem,
  TopEmblem,
  TopSwitchEmblem,
  BottomSwitchEmblem,
} from './BdsmEmblems';
import {
  PillowPrincessGlyph,
  PleasureDomGlyph,
  PleasureSubGlyph,
  PleasureSwitchGlyph,
  ServiceGlyph,
  ServiceDomGlyph,
  ServiceSubGlyph,
  ServiceSwitchGlyph,
  SideGlyph,
  StoneTopGlyph,
  VersatileGlyph,
  SnakeGlyph,
} from './PositionRoleGlyphs';
import { BratGlyph, CheatingGlyph, ExhibitionismGlyph, FilmingGlyph, LatexMaskGlyph, PacifierGlyph } from './RequestedRasterGlyphs';
import {
  Activity,
  Axe,
  BadgeCheck,
  Bed,
  Bookmark,
  Cable,
  Droplets,
  Dumbbell,
  Footprints,
  Medal,
  Minus,
  Moon,
  PenTool,
  Pin,
  Recycle,
  Scissors,
  Sparkles,
  ThumbsDown,
  HeartHandshake,
  Zap,
  Bone,
  CircleArrowDown,
  CircleDot,
  Crown,
  Drama,
  Droplet,
  Eye,
  Feather,
  Hammer,
  Grab,
  Gavel,
  Hand,
  HandHeart,
  Handshake,
  HeartCrack,
  Hourglass,
  KeyRound,
  Link2,
  Lock,
  Maximize2,
  Megaphone,
  PawPrint,
  Rabbit,
  Rat,
  Repeat2,
  Spline,
  Building2,
  Car,
  DoorOpen,
  EyeOff,
  Route,
  TreePine,
  Sun,
  Tag,
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
import MapHome from './MapHome';
import { HANKY_COLORS, HankyFrame, HankyPaisleyIcon, type HankyColor } from './HankyFrame';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import {
  emptySideBadges,
  getMyProfile,
  saveMySideBadges,
  type SideBadgeSelection,
  type SideBadges,
} from '../lib/profileApi';
import { DEFAULT_PRIVACY_SETTINGS, getMyPrivacySettings } from '../lib/privacyApi';
import { DARK_ROOM_PALETTE } from '../lib/darkRoomPalette';
import { BADGE_INTENTS, formatBadgeLabel, type BadgeIntent } from '../lib/badgeIntent';
import { useIsMobile } from './ui/use-mobile';
import { KINK_GROUPS, VIBE_GROUPS } from '../lib/profileOptions';
import { Button } from './ui/button';
import { profileBadgeCategory, profileBadgeGlyph, type ProfileBadgeGroup } from './ProfileBadgeGlyphs';
import AppPageHeader from './AppPageHeader';
import {
  BadgeUnit,
  BADGE_INTERACTION_CLASS,
  BadgeHoverLabel,
  MAP_SIDE_BADGE_PLACEMENT_CLASS,
  mapSideBadgeStyle,
  preventBadgeContextMenu,
  type BadgeFrameId,
} from './BadgeFrames';

/**
 * A place to decide what the two side badges on a heart should say. Built from
 * the real heart and the real badge chip so the choice is made against what the
 * map actually draws.
 */

export type BadgeOption = {
  id: string;
  label: string;
  icon: (props: { className?: string; strokeWidth?: number }) => JSX.Element;
  group: string;
  category?: string;
  hanky?: HankyColor;
  imageSrc?: string;
};

type BadgePoolGroup = 'Kinks' | 'Vibes';

type BadgePoolManifest = {
  icons: Array<{
    id: string;
    label: string;
    iconCategory: string;
    file: string;
  }>;
};

const HIDDEN_POOL_ICON_LABELS = new Set(['clamp', 'bodysuit / catsuit reference']);

function poolIconLabel(group: BadgePoolGroup, label: string) {
  if (group === 'Kinks' && label === 'Penis') return 'Cock';
  if (group === 'Kinks' && label === 'Breast') return 'Boobs';
  if (group === 'Vibes' && label === 'Handcuffs sex police') return 'Handcuffs';
  return label;
}

export const HANKY_GROUP = 'Hanky code';
const HANKY_BADGE_OPTIONS: BadgeOption[] = HANKY_COLORS.map((hanky) => ({
  id: `hanky-${hanky.id}`,
  label: hanky.meaning,
  icon: ({ className }) => <HankyFrame className={className} color={hanky.color} />,
  group: HANKY_GROUP,
  hanky,
}));

const ZODIAC_BADGE_OPTIONS: BadgeOption[] = ZODIAC_SIGNS.map((sign) => ({
  id: `zodiac-${sign}`,
  label: `${sign.charAt(0).toUpperCase()}${sign.slice(1)}`,
  icon: ({ className }) => <ZodiacGlyph className={className} sign={sign} />,
  group: 'Zodiac',
}));

export const BADGE_OPTIONS: BadgeOption[] = [
  // Role: the same role axis used by the profile editor.
  { id: 'dominant', label: 'Dominant', icon: DomEmblem, group: 'Role' },
  { id: 'dominant-taken', label: 'Dominant, taken', icon: DominantTakenEmblem, group: 'Role' },
  { id: 'submissive', label: 'Submissive', icon: SubEmblem, group: 'Role' },
  { id: 'submissive-taken', label: 'Submissive, taken', icon: SubmissiveTakenEmblem, group: 'Role' },
  { id: 'switch', label: 'Switch', icon: SwitchEmblem, group: 'Role' },
  { id: 'switch-taken', label: 'Switch, taken', icon: TakenSwitchEmblem, group: 'Role' },
  { id: 'service', label: 'Service', icon: ServiceGlyph, group: 'Role' },
  { id: 'service dom', label: 'Service dom', icon: ServiceDomGlyph, group: 'Role' },
  { id: 'service sub', label: 'Service sub', icon: ServiceSubGlyph, group: 'Role' },
  { id: 'service switch', label: 'Service switch', icon: ServiceSwitchGlyph, group: 'Role' },
  { id: 'pleasure dom', label: 'Pleasure dom', icon: PleasureDomGlyph, group: 'Role' },
  { id: 'pleasure sub', label: 'Pleasure sub', icon: PleasureSubGlyph, group: 'Role' },
  { id: 'pleasure switch', label: 'Pleasure switch', icon: PleasureSwitchGlyph, group: 'Role' },
  { id: 'worship', label: 'Worshipper', icon: HeartHandshake, group: 'Role' },
  { id: 'worshipped', label: 'Worshipped', icon: Sun, group: 'Role' },
  { id: 'handler', label: 'Handler', icon: Handshake, group: 'Role' },
  { id: 'pet', label: 'Pet', icon: Bone, group: 'Role' },
  { id: 'brat', label: 'Brat', icon: BratGlyph, group: 'Role' },
  { id: 'brat-tamer', label: 'Brat tamer', icon: Gavel, group: 'Role' },
  { id: 'caregiver', label: 'Caregiver', icon: HandHeart, group: 'Role' },
  { id: 'degradee', label: 'Degradee', icon: CircleArrowDown, group: 'Role' },
  { id: 'degrader', label: 'Degrader', icon: Megaphone, group: 'Role' },
  { id: 'little', label: 'Little', icon: PacifierGlyph, group: 'Role' },
  { id: 'masochist', label: 'Masochist', icon: HeartCrack, group: 'Role' },
  { id: 'owner', label: 'Owner', icon: KeyRound, group: 'Role' },
  { id: 'prey', label: 'Prey', icon: Rat, group: 'Role' },
  { id: 'hunter', label: 'Hunter', icon: SnakeGlyph, group: 'Role' },
  { id: 'rigger', label: 'Rigger', icon: Spline, group: 'Role' },
  { id: 'rope-bunny', label: 'Rope bunny', icon: Rabbit, group: 'Role' },
  { id: 'sadist', label: 'Sadist', icon: Axe, group: 'Role' },
  { id: 'sadomasochist', label: 'Sadomasochist', icon: Activity, group: 'Role' },
  { id: 'trainer', label: 'Trainer', icon: Dumbbell, group: 'Role' },

  // Kinks: reuse the established badge glyphs for the profile kink choices.
  { id: 'bondage', label: 'Bondage', icon: BondageGlyph, group: 'Kinks' },
  { id: 'rope', label: 'Rope', icon: Spline, group: 'Kinks' },
  { id: 'impact', label: 'Impact', icon: Hammer, group: 'Kinks' },
  { id: 'spanking', label: 'Spanking', icon: SpankingGlyph, group: 'Kinks' },
  { id: 'control', label: 'Control', icon: Crown, group: 'Kinks' },
  { id: 'chastity', label: 'Chastity', icon: Lock, group: 'Kinks' },
  { id: 'humiliation', label: 'Humiliation', icon: ThumbsDown, group: 'Kinks' },
  { id: 'praise', label: 'Praise', icon: Sparkles, group: 'Kinks' },
  { id: 'cbt', label: 'Cock & ball torture', icon: Scissors, group: 'Kinks' },
  { id: 'electro', label: 'Electro', icon: Zap, group: 'Kinks' },
  { id: 'breath', label: 'Breath play', icon: Wind, group: 'Kinks' },
  { id: 'gooning', label: 'Gooning', icon: GooningGlyph, group: 'Kinks' },
  { id: 'watersports', label: 'Watersports', icon: Droplet, group: 'Kinks' },

  // Position: the other axis. The emblem set says this with an arrow, because a
  // top and a dominant are not the same thing.
  { id: 'top', label: 'Top', icon: TopEmblem, group: 'Position' },
  { id: 'bottom', label: 'Bottom', icon: BottomEmblem, group: 'Position' },
  { id: 'versatile', label: 'Versatile', icon: VersatileGlyph, group: 'Position' },
  { id: 'vers top', label: 'Vers top', icon: TopSwitchEmblem, group: 'Position' },
  { id: 'vers bottom', label: 'Vers bottom', icon: BottomSwitchEmblem, group: 'Position' },
  { id: 'side', label: 'Side', icon: SideGlyph, group: 'Position' },
  { id: 'stone top', label: 'Stone top', icon: StoneTopGlyph, group: 'Position' },
  { id: 'stone bottom', label: 'Stone bottom', icon: PillowPrincessGlyph, group: 'Position' },
  { id: 'hands only', label: 'Hands only', icon: Hand, group: 'Position' },
  { id: 'oral only', label: 'Oral only', icon: LipsGlyph, group: 'Position' },

  // Vibes: reuse the existing visual language for choices also found in Vibes.
  { id: 'leather', label: 'Leather', icon: LeatherGlyph, group: 'Vibes' },
  { id: 'rubber', label: 'Rubber', icon: RubberGlyph, group: 'Vibes' },
  { id: 'jock', label: 'Jock', icon: Medal, group: 'Vibes' },
  { id: 'drag', label: 'Drag', icon: Drama, group: 'Vibes' },
  { id: 'pup', label: 'Pup', icon: Bone, group: 'Vibes' },

  // Kink gear remains in the shared Kinks menu.
  { id: 'latex', label: 'Latex', icon: LatexMaskGlyph, group: 'Kinks' },
  { id: 'uniforms', label: 'Uniforms', icon: BadgeCheck, group: 'Kinks' },
  { id: 'underwear', label: 'Underwear', icon: Bookmark, group: 'Kinks' },
  { id: 'socks', label: 'Socks', icon: Footprints, group: 'Kinks' },
  { id: 'sneakers', label: 'Sneakers', icon: Footprints, group: 'Kinks' },
  { id: 'harness', label: 'Harness', icon: HarnessGlyph, group: 'Kinks' },
  { id: 'masks', label: 'Masks', icon: VenetianMask, group: 'Kinks' },
  { id: 'pup-play', label: 'Pup play', icon: Bone, group: 'Kinks' },
  { id: 'roleplay', label: 'Roleplay', icon: Wand2, group: 'Kinks' },

  // Body: what you are drawn to.
  { id: 'feet', label: 'Feet', icon: Footprints, group: 'Kinks' },
  { id: 'pits', label: 'Pits', icon: Wind, group: 'Kinks' },
  { id: 'muscle-worship', label: 'Muscle worship', icon: Dumbbell, group: 'Kinks' },
  { id: 'sensation', label: 'Sensation', icon: Feather, group: 'Kinks' },
  { id: 'daddy', label: 'Daddy', icon: Crown, group: 'Vibes' },
  { id: 'bear', label: 'Bear', icon: BearPawGlyph, group: 'Vibes' },
  { id: 'chub', label: 'Chub', icon: CircleDot, group: 'Vibes' },
  { id: 'hairy', label: 'Hairy', icon: Waves, group: 'Vibes' },
  { id: 'smooth', label: 'Smooth', icon: Minus, group: 'Vibes' },
  { id: 'tattoos', label: 'Tattoos', icon: PenTool, group: 'Vibes' },
  { id: 'piercings', label: 'Piercings', icon: Pin, group: 'Vibes' },

  // Scene: where and with how many.
  { id: 'group', label: 'Group', icon: UsersRound, group: 'Kinks' },
  { id: 'threesome', label: 'Threesome', icon: Users, group: 'Kinks' },
  { id: 'orgy', label: 'Orgy', icon: UsersRound, group: 'Kinks' },
  { id: 'cuckolding', label: 'Cuckolding', icon: CheatingGlyph, group: 'Kinks' },
  { id: 'voyeurism', label: 'Voyeurism', icon: Eye, group: 'Kinks' },
  { id: 'exhibitionism', label: 'Exhibitionism', icon: ExhibitionismGlyph, group: 'Kinks' },
  { id: 'public', label: 'Public', icon: Building2, group: 'Kinks' },
  { id: 'cruising-spots', label: 'Cruising spots', icon: Route, group: 'Kinks' },
  { id: 'glory-hole', label: 'Glory hole', icon: DoorOpen, group: 'Kinks' },
  { id: 'bathhouse', label: 'Bathhouse', icon: Waves, group: 'Kinks' },
  { id: 'backroom', label: 'Backroom', icon: DoorOpen, group: 'Kinks' },
  { id: 'sling', label: 'Sling', icon: Cable, group: 'Kinks' },
  { id: 'outdoor-scenes', label: 'Outdoor scenes', icon: TreePine, group: 'Kinks' },
  { id: 'hotel', label: 'Hotel', icon: Bed, group: 'Kinks' },
  { id: 'car', label: 'Car', icon: Car, group: 'Kinks' },
  { id: 'overnight', label: 'Overnight', icon: Moon, group: 'Kinks' },
  { id: 'camera-play', label: 'Camera play', icon: FilmingGlyph, group: 'Kinks' },
  { id: 'discreet', label: 'Discreet', icon: EyeOff, group: 'Vibes' },

  // Pride: established community symbols sized to sit beside the hanky set.
  { id: 'gay', label: 'Gay', icon: DoubleMarsGlyph, group: 'Pride' },
  { id: 'lesbian', label: 'Lesbian', icon: DoubleVenusGlyph, group: 'Pride' },
  { id: 'labrys', label: 'Labrys', icon: LabrysGlyph, group: 'Pride' },
  { id: 'bisexual', label: 'Bisexual', icon: BisexualGlyph, group: 'Pride' },
  { id: 'straight', label: 'Straight', icon: MarsVenusGlyph, group: 'Pride' },
  { id: 't4t', label: 'T4T', icon: T4TGlyph, group: 'Pride' },
  { id: 'trans-symbol', label: 'Trans', icon: TransGlyph, group: 'Pride' },
  { id: 'intersex', label: 'Intersex', icon: IntersexGlyph, group: 'Pride' },
  { id: 'enby', label: 'Nonbinary', icon: NonbinaryGlyph, group: 'Pride' },
  { id: 'ace-spec', label: 'Ace spectrum', icon: PlayingCard, group: 'Pride' },
  { id: 'poly', label: 'Poly', icon: PolyGlyph, group: 'Pride' },
  { id: 'queer', label: 'Queer', icon: Sparkles, group: 'Pride' },
  { id: 'poz-friendly', label: 'Poz friendly', icon: HeartHandshake, group: 'Pride' },
  { id: 'bear-pride', label: 'Bear', icon: BearPawGlyph, group: 'Pride' },
  { id: 'bdsm-pride', label: 'BDSM', icon: BdsmTriskelionGlyph, group: 'Pride' },
  { id: 'flag-rainbow', label: 'Rainbow flag', icon: RainbowFlagGlyph, group: 'Pride' },
  { id: 'flag-progress', label: 'Progress Pride flag', icon: ProgressPrideFlagGlyph, group: 'Pride' },
  { id: 'flag-gay-men', label: 'Gay men flag', icon: GayMenFlagGlyph, group: 'Pride' },
  { id: 'flag-lesbian', label: 'Lesbian flag', icon: LesbianFlagGlyph, group: 'Pride' },
  { id: 'flag-bisexual', label: 'Bisexual flag', icon: BisexualFlagGlyph, group: 'Pride' },
  { id: 'flag-pansexual', label: 'Pansexual flag', icon: PansexualFlagGlyph, group: 'Pride' },
  { id: 'flag-trans', label: 'Trans flag', icon: TransFlagGlyph, group: 'Pride' },
  { id: 'flag-nonbinary', label: 'Nonbinary flag', icon: NonbinaryFlagGlyph, group: 'Pride' },
  { id: 'flag-intersex', label: 'Intersex flag', icon: IntersexFlagGlyph, group: 'Pride' },
  { id: 'flag-ace', label: 'Ace flag', icon: AceFlagGlyph, group: 'Pride' },
  { id: 'flag-aro', label: 'Aromantic flag', icon: AroFlagGlyph, group: 'Pride' },
  { id: 'flag-demisexual', label: 'Demisexual flag', icon: DemisexualFlagGlyph, group: 'Pride' },
  { id: 'flag-demiromantic', label: 'Demiromantic flag', icon: DemiromanticFlagGlyph, group: 'Pride' },
  { id: 'flag-genderfluid', label: 'Genderfluid flag', icon: GenderfluidFlagGlyph, group: 'Pride' },
  { id: 'flag-genderqueer', label: 'Genderqueer flag', icon: GenderqueerFlagGlyph, group: 'Pride' },
  { id: 'flag-agender', label: 'Agender flag', icon: AgenderFlagGlyph, group: 'Pride' },
  { id: 'flag-polysexual', label: 'Polysexual flag', icon: PolysexualFlagGlyph, group: 'Pride' },
  { id: 'flag-omnisexual', label: 'Omnisexual flag', icon: OmnisexualFlagGlyph, group: 'Pride' },
  { id: 'flag-bear', label: 'Bear flag', icon: BearFlagGlyph, group: 'Pride' },
  { id: 'flag-leather', label: 'Leather flag', icon: LeatherFlagGlyph, group: 'Pride' },
  { id: 'flag-pup', label: 'Pup flag', icon: PupFlagGlyph, group: 'Pride' },
  { id: 'flag-ally', label: 'Ally flag', icon: AllyFlagGlyph, group: 'Pride' },

  ...ZODIAC_BADGE_OPTIONS,
  ...HANKY_BADGE_OPTIONS,
];

const PROFILE_BADGE_GROUPS = {
  Vibes: VIBE_GROUPS,
  Kinks: KINK_GROUPS,
} as const;

function normalizeProfileBadgeValue(value: string) {
  return value.trim().toLowerCase();
}
function profileBadgeId(group: ProfileBadgeGroup, value: string) {
  return `${group.toLowerCase()}-${normalizeProfileBadgeValue(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function buildProfileBadgeOptions(group: ProfileBadgeGroup, values: string[] = []) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].map((value) => {
    const normalized = normalizeProfileBadgeValue(value);
    const existing = BADGE_OPTIONS.find((option) => (
      option.group === group
      && (normalizeProfileBadgeValue(option.id) === normalized || normalizeProfileBadgeValue(option.label) === normalized)
    ));
    const category = profileBadgeCategory(group, value);

    return existing
      ? { ...existing, category }
      : {
          id: profileBadgeId(group, value),
          label: `${value.charAt(0).toUpperCase()}${value.slice(1)}`,
          icon: profileBadgeGlyph(group, value, category),
          group,
          category,
        };
  });
}

const CLASSIC_VIBE_BADGE_OPTIONS = buildProfileBadgeOptions(
  'Vibes',
  VIBE_GROUPS.flatMap((category) => category.options),
);

function uniqueBadgeIcons(options: BadgeOption[]) {
  const seen = new Set<BadgeOption['icon']>();
  return options.filter((option) => {
    if (seen.has(option.icon)) {
      return false;
    }
    seen.add(option.icon);
    return true;
  });
}

function badgeTitle(option: BadgeOption, intent: BadgeIntent, meaning?: string) {
  return meaning?.trim()
    || (option.hanky
      ? formatBadgeLabel(option.hanky.meaning, intent)
      : formatBadgeLabel(option.label, intent));
}

function optionalBadgeTitle(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function buildPoolBadgeOptions(group: BadgePoolGroup, manifest: BadgePoolManifest): BadgeOption[] {
  return manifest.icons
    .filter((entry) => !HIDDEN_POOL_ICON_LABELS.has(entry.label.trim().toLocaleLowerCase()))
    .filter((entry, index, entries) => entries.findIndex((candidate) => (
      poolIconLabel(group, candidate.label).trim().toLocaleLowerCase()
        === poolIconLabel(group, entry.label).trim().toLocaleLowerCase()
    )) === index)
    .map((entry) => ({
    id: `${group.toLowerCase()}-icon-${entry.id}`,
    label: poolIconLabel(group, entry.label),
    category: entry.iconCategory,
    group,
    imageSrc: `/badge-icons/${entry.file}`,
    icon: ({ className }) => <img alt="" className={`${className ?? ''} object-contain brightness-0 invert`} decoding="async" loading="lazy" src={`/badge-icons/${entry.file}`} />,
  }));
}

// Hanky code: the side says your role, the badge says the act. Left is what you
// give, right is what you take. The same badge on both sides reads as versatile,
// exactly the way wearing it on both sides always has.
const SIDES = [
  { id: 'left' as const, label: 'Left', hint: 'Left badge' },
  { id: 'right' as const, label: 'Right', hint: 'Right badge' },
];

// Copied from the map's own badge chip: same size, same 3.2px border, same
// placement, same surface. Your pin's border colour is the indigo the map uses.
const CURRENT_USER_BORDER = '#004BFF';

function FilledPencilGlyph({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
    </svg>
  );
}

function badgeFrameId(_value: string | null | undefined, _hanky = false): BadgeFrameId {
  return 'circle';
}

function BadgeChip({ darkRoom = false, embedded = false, frame, option, side, meaning }: {
  frame: BadgeFrameId;
  option: BadgeOption;
  side: 'left' | 'right';
  /** What the badge says, shown above it on hover. */
  meaning?: string;
  darkRoom?: boolean;
  embedded?: boolean;
}) {
  const Icon = option.icon as LucideIcon;
  const gradientStops = darkRoom
    ? [DARK_ROOM_PALETTE.dark, DARK_ROOM_PALETTE.middle, DARK_ROOM_PALETTE.light] as const
    : undefined;

  return (
    <span
      aria-label={meaning}
      className={[
        `group/badge absolute flex items-center justify-center text-white ${BADGE_INTERACTION_CLASS}`,
        embedded ? 'top-[70%] -translate-y-1/2' : MAP_SIDE_BADGE_PLACEMENT_CLASS,
      ].join(' ')}
      role="img"
      onContextMenu={preventBadgeContextMenu}
      style={{
        color: CURRENT_USER_BORDER,
        ...mapSideBadgeStyle(side, frame),
      }}
      tabIndex={0}
    >
      <BadgeUnit
        fillWithGlyph={false}
        className="h-full w-full"
        frame={frame}
        gradientStops={gradientStops}
        hankyColor={option.hanky?.color}
        strokeColor={CURRENT_USER_BORDER}

        glyph={Icon}
        glyphAriaHidden
      />
      {meaning ? <BadgeHoverLabel>{meaning}</BadgeHoverLabel> : null}
    </span>
  );
}

type BadgePickerPreviewProps = {
  embedded?: boolean;
  onboardingProfile?: {
    photos: string[];
    role: string[];
    position: string[];
    vibes: string[];
    kinks: string[];
    side_badges: SideBadges;
  };
  onOnboardingBadgesChange?: (sideBadges: SideBadges) => void;
  onClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onExitGuardReady?: (guard: (() => Promise<boolean>) | null) => void;
  onSaveReady?: (save: (() => Promise<boolean>) | null) => void;
  onSaveStateChange?: (state: 'idle' | 'saving' | 'saved' | 'error') => void;
};

export default function BadgePickerPreview({
  embedded = false,
  onboardingProfile,
  onOnboardingBadgesChange,
  onClose,
  onDirtyChange,
  onExitGuardReady,
  onSaveReady,
  onSaveStateChange,
}: BadgePickerPreviewProps = {}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const containedEmbedded = embedded;
  const [leftBadge, setLeftBadge] = useState('none');
  const [rightBadge, setRightBadge] = useState('none');
  const [startedFromProfile, setStartedFromProfile] = useState(false);
  const [leftIntent, setLeftIntent] = useState<BadgeIntent>('none');
  const [rightIntent, setRightIntent] = useState<BadgeIntent>('none');
  const [leftTitle, setLeftTitle] = useState('');
  const [rightTitle, setRightTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [leftFrame, setLeftFrame] = useState<BadgeFrameId>('circle');
  const [rightFrame, setRightFrame] = useState<BadgeFrameId>('circle');
  const [darkRoomEnabled, setDarkRoomEnabled] = useState(false);
  const [activeSide, setActiveSide] = useState<'left' | 'right'>('left');
  const [profile, setProfile] = useState<{
    photos?: string[];
    role?: string[];
    position?: string[];
    vibes?: string[];
    kinks?: string[];
    side_badges?: SideBadges;
  } | null>(onboardingProfile ?? null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [badgePoolOptions, setBadgePoolOptions] = useState<Record<BadgePoolGroup, BadgeOption[]>>({ Kinks: [], Vibes: [] });
  const hasChangedBadgeRef = useRef(false);
  const sideBadgesRef = useRef<SideBadges>(emptySideBadges);
  const saveVersionRef = useRef(0);
  const badgeGroups = [...new Set(BADGE_OPTIONS.map((option) => option.group))];
  const primaryGroups = ['Role', 'Position', HANKY_GROUP, 'Vibes', 'Kinks'];
  const groups = [
    ...primaryGroups.filter((group) => badgeGroups.includes(group)),
    ...badgeGroups.filter((group) => !primaryGroups.includes(group)),
  ];
  const [activeGroup, setActiveGroup] = useState(groups[0]);
  const profileBadgeOptions = [
    ...buildProfileBadgeOptions('Vibes', profile?.vibes ?? []),
    ...buildProfileBadgeOptions('Kinks', profile?.kinks ?? []),
  ];
  const baseBadgeOptions = [
    ...BADGE_OPTIONS,
    ...CLASSIC_VIBE_BADGE_OPTIONS.filter((option) => !BADGE_OPTIONS.some((existing) => existing.id === option.id)),
  ];
  const allBadgeOptions = [
    ...baseBadgeOptions,
    ...profileBadgeOptions.filter((option) => !baseBadgeOptions.some((existing) => existing.id === option.id)),
    ...badgePoolOptions.Kinks,
    ...badgePoolOptions.Vibes,
  ];
  const [activePoolCategory, setActivePoolCategory] = useState('All');
  const [poolSearch, setPoolSearch] = useState('');
  const activePoolGroup = activeGroup === 'Kinks' || activeGroup === 'Vibes' ? activeGroup : null;
  const activePoolOptions = activePoolGroup === 'Vibes'
    ? [...uniqueBadgeIcons(CLASSIC_VIBE_BADGE_OPTIONS), ...badgePoolOptions.Vibes]
    : activePoolGroup
      ? badgePoolOptions.Kinks
      : [];
  const poolCategories = [...new Set(activePoolOptions.map((option) => option.category ?? 'Other'))];
  const optionsForActiveGroup = activePoolGroup
    ? activePoolOptions
    : BADGE_OPTIONS.filter((option) => option.group === activeGroup);
  const visiblePoolOptions = activePoolOptions.filter((option) => {
    const inCategory = activePoolCategory === 'All' || option.category === activePoolCategory;
    const search = poolSearch.trim().toLowerCase();
    const matchesSearch = !search || [option.label, option.category].some((value) => value?.toLowerCase().includes(search));
    return inCategory && matchesSearch;
  });

  useEffect(() => {
    let isMounted = true;

    void Promise.all([
      fetch('/badge-icons/kink-icon-pool-data.json').then((response) => response.ok ? response.json() as Promise<BadgePoolManifest> : Promise.reject()),
      fetch('/badge-icons/vibe-icon-pool-data.json').then((response) => response.ok ? response.json() as Promise<BadgePoolManifest> : Promise.reject()),
    ])
      .then(([kinks, vibes]) => {
        if (isMounted) {
          setBadgePoolOptions({
            Kinks: buildPoolBadgeOptions('Kinks', kinks),
            Vibes: buildPoolBadgeOptions('Vibes', vibes),
          });
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!profile || hasChangedBadgeRef.current) {
      return;
    }

    const findOption = (value: string | undefined) => {
      const normalized = value?.trim().toLowerCase();
      return normalized
        ? allBadgeOptions.find((option) => option.id.toLowerCase() === normalized || option.label.toLowerCase() === normalized)
        : undefined;
    };
    const savedSideBadges = profile.side_badges ?? emptySideBadges;
    const leftSaved = savedSideBadges.left;
    const rightSaved = savedSideBadges.right;

    if (leftSaved) {
      const option = findOption(leftSaved.badge_id);
      if (option) {
        setLeftBadge(option.id);
        setLeftIntent(leftSaved.intent);
        setLeftTitle(leftSaved.meaning ?? '');
      }
    }

    if (rightSaved) {
      const option = findOption(rightSaved.badge_id);
      if (option) {
        setRightBadge(option.id);
        setRightIntent(rightSaved.intent);
        setRightTitle(rightSaved.meaning ?? '');
      }
    }
  }, [badgePoolOptions, profile]);

  useEffect(() => {
    let isMounted = true;

    const profileRequest = onboardingProfile
      ? Promise.resolve([onboardingProfile, DEFAULT_PRIVACY_SETTINGS] as const)
      : Promise.all([
          getMyProfile(),
          getMyPrivacySettings().catch(() => DEFAULT_PRIVACY_SETTINGS),
        ]);

    void profileRequest
      .then(([loaded, privacy]) => {
        if (!isMounted) {
          return;
        }

        setProfile(loaded);
        setDarkRoomEnabled(privacy.baseMode === 'STEALTH');

        // Left carries your role and right your position until you say
        // otherwise, which is what a basic account already shows. Never let a
        // late profile response overwrite a Hanky or badge the user just chose.
        setStartedFromProfile((already) => {
          if (already || hasChangedBadgeRef.current) {
            return already;
          }

          const loadedProfileBadgeOptions = [
            ...buildProfileBadgeOptions('Vibes', loaded.vibes ?? []),
            ...buildProfileBadgeOptions('Kinks', loaded.kinks ?? []),
          ];
          const loadedBadgeOptions = [
            ...BADGE_OPTIONS,
            ...loadedProfileBadgeOptions.filter((option) => !BADGE_OPTIONS.some((existing) => existing.id === option.id)),
          ];
          const findOption = (value: string | undefined) => {
            const normalized = value?.trim().toLowerCase();
            return normalized
              ? loadedBadgeOptions.find((option) => option.id.toLowerCase() === normalized || option.label.toLowerCase() === normalized)
              : undefined;
          };
          const savedSideBadges = loaded.side_badges ?? emptySideBadges;
          const leftSaved = savedSideBadges.left;
          const rightSaved = savedSideBadges.right;
          const role = findOption(leftSaved?.badge_id) ?? findOption((loaded?.role ?? [])[0]);
          const position = findOption(rightSaved?.badge_id) ?? findOption((loaded?.position ?? [])[0]);

          sideBadgesRef.current = savedSideBadges;

          if (role) {
            setLeftBadge(role.id);
          }

          if (position) {
            setRightBadge(position.id);
          }

          if (leftSaved) {
            setLeftIntent(leftSaved.intent);
            setLeftTitle(leftSaved.meaning ?? '');
            setLeftFrame(badgeFrameId(leftSaved.frame, Boolean(role?.hanky)));
          }

          if (rightSaved) {
            setRightIntent(rightSaved.intent);
            setRightTitle(rightSaved.meaning ?? '');
            setRightFrame(badgeFrameId(rightSaved.frame, Boolean(position?.hanky)));
          }

          return true;
        });
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [onboardingProfile]);

  useEffect(() => {
    if (saveState !== 'saved') {
      return undefined;
    }

    const timeout = window.setTimeout(() => setSaveState('idle'), 2000);
    return () => window.clearTimeout(timeout);
  }, [saveState]);

  useEffect(() => {
    onSaveStateChange?.(saveState);
  }, [onSaveStateChange, saveState]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasChangedBadgeRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, []);

  const chosen = { left: leftBadge, right: rightBadge };
  const leftOption = allBadgeOptions.find((option) => option.id === leftBadge) ?? BADGE_OPTIONS[0];
  const rightOption = allBadgeOptions.find((option) => option.id === rightBadge) ?? BADGE_OPTIONS[0];
  const showingHankyCode = activeGroup === HANKY_GROUP;
  const activeOption = activeSide === 'left' ? leftOption : rightOption;
  const activeFrame = activeSide === 'left' ? leftFrame : rightFrame;
  const activeTitle = activeSide === 'left' ? leftTitle : rightTitle;
  const persistSideSelection = (side: 'left' | 'right', selection: SideBadgeSelection | null) => {
    const nextSideBadges: SideBadges = {
      ...sideBadgesRef.current,
      [side]: selection,
    };
    sideBadgesRef.current = nextSideBadges;
    setProfile((current) => current ? { ...current, side_badges: nextSideBadges } : current);
    onOnboardingBadgesChange?.(nextSideBadges);
    setSaveState('idle');
  };
  const chooseBadge = (id: string) => {
    if (chosen[activeSide] === id) {
      return;
    }

    hasChangedBadgeRef.current = true;
    onDirtyChange?.(true);
    if (activeSide === 'left') {
      setLeftBadge(id);
    } else {
      setRightBadge(id);
    }
    persistSideSelection(activeSide, {
      badge_id: id,
      intent: activeSide === 'left' ? leftIntent : rightIntent,
      frame: activeFrame,
      meaning: optionalBadgeTitle(activeTitle),
      icon_path: allBadgeOptions.find((option) => option.id === id)?.imageSrc,
    });
  };
  const chooseIntent = (intent: BadgeIntent) => {
    const badgeId = chosen[activeSide];
    hasChangedBadgeRef.current = true;
    onDirtyChange?.(true);
    (activeSide === 'left' ? setLeftIntent : setRightIntent)(intent);
    persistSideSelection(activeSide, {
      badge_id: badgeId,
      intent,
      frame: activeFrame,
      meaning: optionalBadgeTitle(activeTitle),
      icon_path: activeOption.imageSrc,
    });
  };
  const chooseGroup = (group: string) => {
    setActiveGroup(group);
    setActivePoolCategory('All');
    setPoolSearch('');
  };
  const changeTitle = (value: string) => {
    const title = value.slice(0, 10);
    hasChangedBadgeRef.current = true;
    onDirtyChange?.(true);
    (activeSide === 'left' ? setLeftTitle : setRightTitle)(title);
    persistSideSelection(activeSide, {
      badge_id: chosen[activeSide],
      intent: activeSide === 'left' ? leftIntent : rightIntent,
      frame: activeFrame,
      meaning: optionalBadgeTitle(title),
      icon_path: activeOption.imageSrc,
    });
  };
  const confirmPendingSave = async () => {
    if (!hasChangedBadgeRef.current) {
      return true;
    }

    const version = saveVersionRef.current + 1;
    saveVersionRef.current = version;
    setSaveState('saving');

    try {
      const savedSideBadges = onboardingProfile
        ? sideBadgesRef.current
        : await saveMySideBadges(sideBadgesRef.current);

      if (saveVersionRef.current !== version) {
        return false;
      }

      sideBadgesRef.current = savedSideBadges;
      setProfile((current) => current ? { ...current, side_badges: savedSideBadges } : current);
      hasChangedBadgeRef.current = false;
      onDirtyChange?.(false);
      setSaveState('saved');
      return true;
    } catch {
      if (saveVersionRef.current === version) {
        setSaveState('error');
      }
      return false;
    }
  };
  const leaveEditor = async (afterSave: () => void) => {
    if (hasChangedBadgeRef.current) {
      const shouldSave = window.confirm('Save badge changes before leaving?');

      if (!shouldSave || !(await confirmPendingSave())) {
        return;
      }
    }

    afterSave();
  };
  const canLeaveEditor = async () => {
    if (!hasChangedBadgeRef.current) {
      return true;
    }

    const shouldSave = window.confirm('Save badge changes before leaving?');
    return shouldSave ? confirmPendingSave() : false;
  };
  useEffect(() => {
    if (!onExitGuardReady) {
      return undefined;
    }

    onExitGuardReady(canLeaveEditor);
    return () => onExitGuardReady(null);
  });
  useEffect(() => {
    if (!onSaveReady) {
      return undefined;
    }

    onSaveReady(confirmPendingSave);
    return () => onSaveReady(null);
  });
  const closeEditor = () => {
    void leaveEditor(() => {
      if (embedded) {
        onClose?.();
      } else {
        navigate(-1);
      }
    });
  };
  const renderOptionCard = (option: BadgeOption) => {
    const selected = chosen[activeSide] === option.id;
    const Icon = option.icon;

    return (
      <button
        className={`flex h-24 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-center text-sm leading-tight transition ${
          selected
            ? 'border-[#004BFF] bg-black/60 text-white'
            : 'border-white/10 bg-black/40 text-white/70 hover:bg-white/[0.06]'
        }`}
        key={option.id}
        onClick={() => chooseBadge(option.id)}
        title={option.hanky ? option.hanky.meaning : option.label}
        type="button"
      >
        {option.hanky ? (
          <>
            <HankyPaisleyIcon
              className="h-6 w-6 shrink-0"
              color={option.hanky.color}
              label={option.hanky.meaning}
            />
            <span className="min-w-0 break-words">{option.hanky.meaning}</span>
          </>
        ) : (
          <>
            <Icon aria-hidden="true" className="h-6 w-6 shrink-0 text-white" strokeWidth={2.2} />
            <span className="min-w-0 break-words">{option.label}</span>
          </>
        )}
      </button>
    );
  };

  return (
    <>
      {!isMobile && !containedEmbedded ? (
        <div className="fixed inset-0 z-0">
          <MapHome />
        </div>
      ) : null}
      <div className={!containedEmbedded && isMobile
        ? 'min-h-screen bg-background text-white'
        : containedEmbedded
          ? 'relative flex min-h-0 flex-col text-white'
          : 'fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-6 text-white backdrop-blur-sm'}
      >
      <div
        aria-label={!isMobile && !containedEmbedded ? 'Badges' : undefined}
        aria-modal={!isMobile && !containedEmbedded ? true : undefined}
        className={!containedEmbedded && isMobile
          ? 'flex min-h-screen flex-col bg-background'
          : containedEmbedded
            ? 'flex min-h-0 w-full flex-col bg-transparent'
            : 'flex h-[min(844px,calc(100vh-3rem))] w-[390px] flex-col overflow-y-auto rounded-[28px] border border-white/12 bg-background shadow-[0_24px_80px_rgba(0,0,0,0.58)]'}
        data-state={!isMobile ? 'open' : undefined}
        role={!isMobile && !containedEmbedded ? 'dialog' : undefined}
      >
      {!embedded ? <AppPageHeader
        title="Badges"
        onBack={closeEditor}
        onClose={closeEditor}
        closeLabel="Close Badges"
        bugButtonTestId="badge-picker-preview-bug-button-slot"
        actions={(
          <>
          <span
            aria-live="polite"
            className={`text-[0.68rem] uppercase tracking-[0.12em] ${saveState === 'error' ? 'text-red-400' : 'text-white/45'}`}
          >
            {saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : ''}
          </span>
          <Button
            className="bg-[var(--cruush-gradient)] text-white hover:opacity-90"
            disabled={saveState === 'saving' || !hasChangedBadgeRef.current}
            onClick={() => void confirmPendingSave()}
            size="sm"
            type="button"
          >
            Save
          </Button>
          </>
        )}
      /> : null}

      <main className={`mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 ${containedEmbedded ? 'min-h-0 pb-8 pt-0' : !containedEmbedded && isMobile ? 'pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6' : 'pb-8 pt-6'}`}>
        {/* You are the thing being dressed, so you sit in the middle. Tap a side
            to work on it; everything under here changes that side only. */}
        <div className={`${!containedEmbedded && isMobile ? 'sticky top-[65px] z-10 -mx-4 border-b border-white/10 bg-background/95 px-4 pb-4 pt-1 backdrop-blur-md' : ''} flex flex-col items-center gap-5`}>
          <span className="relative flex h-[7rem] w-[9rem] items-center justify-center">
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
                embedded={containedEmbedded}
                frame={leftFrame}
                option={leftOption}
                meaning={leftOption.id === 'none' ? undefined : badgeTitle(leftOption, leftIntent, leftTitle)}
                side="left"
                darkRoom={darkRoomEnabled}
              />
              <BadgeChip
                embedded={containedEmbedded}
                frame={rightFrame}
                option={rightOption}
                meaning={rightOption.id === 'none' ? undefined : badgeTitle(rightOption, rightIntent, rightTitle)}
                side="right"
                darkRoom={darkRoomEnabled}
              />
            </span>
          </span>

          <div className="grid w-full grid-cols-2 gap-2">
            {SIDES.map((side) => {
              const option = side.id === 'left' ? leftOption : rightOption;
              const intent = side.id === 'left' ? leftIntent : rightIntent;
              const title = side.id === 'left' ? leftTitle : rightTitle;
              const active = activeSide === side.id;

              return (
                <div className="min-w-0" key={side.id}>
                  <div
                    className={`relative rounded-xl border px-3 py-2 text-left transition ${
                      active
                        ? 'border-[#004BFF] bg-black/60 text-white'
                        : 'border-white/10 bg-black/40 text-white/64 hover:bg-white/[0.06]'
                    }`}
                  >
                    <button
                      aria-label={`Select ${side.label.toLowerCase()} badge`}
                      className="absolute inset-0 z-0"
                      onClick={() => setActiveSide(side.id)}
                      type="button"
                    />
                    <div className="pointer-events-none relative z-10">
                      <span className="block text-[0.7rem] uppercase tracking-[0.12em] text-white/48">{side.hint}</span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1 text-sm leading-tight">
                        {active && editingTitle ? (
                          <>
                            <label className="sr-only" htmlFor="badge-title">Badge title</label>
                            <input
                              className="pointer-events-auto min-w-0 flex-1 bg-transparent p-0 text-sm leading-tight text-white outline-none"
                              id="badge-title"
                              maxLength={10}
                              onChange={(event) => changeTitle(event.target.value)}
                              placeholder="Badge title"
                              value={activeTitle}
                            />
                          </>
                        ) : (
                          <span className="min-w-0 break-words">
                            {option.id === 'none'
                              ? 'Empty'
                              : badgeTitle(option, intent, title)}
                          </span>
                        )}
                        <button
                          aria-expanded={active && editingTitle}
                          aria-label={`Edit ${side.label.toLowerCase()} badge title`}
                          className="pointer-events-auto shrink-0 text-white/60 transition hover:text-white"
                          onClick={() => {
                            setActiveSide(side.id);
                            setEditingTitle((editing) => active ? !editing : true);
                          }}
                          type="button"
                        >
                          <FilledPencilGlyph className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* What this badge says about you, for the side you are working on. */}
        {showingHankyCode ? (
          <div className="mt-6 space-y-2">
            <Dialog>
              <DialogTrigger asChild>
                <button
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-left text-sm text-white/76 transition hover:bg-white/[0.06]"
                  type="button"
                >
                  How Hanky code works
                </button>
              </DialogTrigger>
              <DialogContent className="scrollbar-hide max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-lg border-white/10 bg-background p-5 sm:!w-[calc(100vw-4rem)] sm:!max-w-3xl">
                <DialogHeader>
                  <DialogTitle>cruush Hanky code</DialogTitle>
                </DialogHeader>
                <div className="mt-2 grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:grid-cols-3">
                  {HANKY_COLORS.map((hanky) => (
                    <div
                      aria-label={hanky.meaning}
                      className="flex min-w-0 items-center gap-2 rounded-lg bg-white/[0.045] px-3 py-2.5"
                      key={hanky.id}
                    >
                      <HankyPaisleyIcon
                        className="h-7 w-7 shrink-0"
                        color={hanky.color}
                        label={hanky.meaning}
                      />
                      <p className="min-w-0 break-words text-xs leading-tight text-white/74">{hanky.meaning}</p>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : null}

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
                  onClick={() => chooseIntent(intent.id)}
                  type="button"
                >
                  {intent.label}
                </button>
              );
            })}
          </div>
        </div>

        <fieldset className="mt-6">
          <legend className="text-xs uppercase tracking-[0.14em] text-white/48">Badge category</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {groups.map((group) => {
              const selected = activeGroup === group;
              return (
                <button
                  aria-pressed={selected}
                  className={`flex h-11 min-w-0 items-center justify-center rounded-xl border px-2 text-center text-xs leading-tight transition ${
                    selected
                      ? 'border-[#004BFF] bg-black/60 text-white'
                      : 'border-white/10 bg-black/40 text-white/64 hover:bg-white/[0.06]'
                  }`}
                  key={group}
                  onClick={() => chooseGroup(group)}
                  type="button"
                >
                  {group}
                </button>
              );
            })}
          </div>
        </fieldset>

        {activePoolGroup ? (
          <div className="mt-3 space-y-3">
            <div>
              <input
                aria-label={`Search ${activePoolGroup} icons`}
                className="h-11 w-full rounded-full border border-white/12 bg-black/55 px-4 text-sm text-white outline-none focus:border-[#004BFF]"
                onChange={(event) => setPoolSearch(event.target.value)}
                placeholder="Search icons"
                type="search"
                value={poolSearch}
              />
            </div>
            <div className="flex flex-wrap gap-2" aria-label={`${activePoolGroup} icon category`}>
              {['All', ...poolCategories].map((category) => {
                const selected = activePoolCategory === category;
                return (
                  <button
                    aria-pressed={selected}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      selected
                        ? 'border-[#004BFF] bg-black/60 text-white'
                        : 'border-white/10 bg-black/40 text-white/64 hover:bg-white/[0.06]'
                    }`}
                    key={category}
                    onClick={() => setActivePoolCategory(category)}
                    type="button"
                  >
                    {category}
                  </button>
                );
              })}
            </div>
            {visiblePoolOptions.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {visiblePoolOptions.map(renderOptionCard)}
              </div>
            ) : (
              <p className="rounded-xl border border-white/10 bg-black/40 px-4 py-4 text-sm text-white/60">
                No {activePoolGroup} icons match that search.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {optionsForActiveGroup.map(renderOptionCard)}
          </div>
        )}
      </main>
      </div>
      </div>
    </>
  );
}
