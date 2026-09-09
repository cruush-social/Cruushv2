import type { ComponentType } from 'react';
import {
  Cable,
  CircleDot,
  Crown,
  DoorOpen,
  Drama,
  Eye,
  Feather,
  Hammer,
  HeartHandshake,
  MessageCircleQuestion,
  Shirt,
  Smile,
  Sparkles,
  UsersRound,
  Wand2,
  Zap,
} from 'lucide-react';
import { KINK_CATALOG, KINK_GROUPS, VIBE_GROUPS } from '../lib/profileOptions';
import {
  CyborgGlyph,
  LeatherGlyph,
  NeurodivergentGlyph,
  PartyHatGlyph,
  RaveGlyph,
  RubberGlyph,
} from './BadgeGlyphs';

export type ProfileBadgeGroup = 'Vibes' | 'Kinks';
export type ProfileBadgeGlyph = ComponentType<{ className?: string; strokeWidth?: number }>;

const PROFILE_BADGE_GROUPS = {
  Vibes: VIBE_GROUPS,
  Kinks: KINK_GROUPS,
} as const;

const PROFILE_BADGE_FALLBACK_ICONS: Record<ProfileBadgeGroup, Record<string, ProfileBadgeGlyph>> = {
  Vibes: {
    Style: Sparkles,
    Energy: Zap,
    Scenes: Drama,
    Archetypes: Crown,
    Identity: CircleDot,
    Other: Sparkles,
  },
  Kinks: {
    'Body & Touch': HeartHandshake,
    Power: Hammer,
    'Bondage & Sensation': Feather,
    Gear: Shirt,
    Roleplay: Drama,
    Group: UsersRound,
    'Public & Watching': Eye,
    Toys: Wand2,
    Edge: MessageCircleQuestion,
    Other: Sparkles,
  },
};

const PROFILE_BADGE_VALUE_ICONS: Record<string, ProfileBadgeGlyph> = {
  leather: LeatherGlyph,
  rubber: RubberGlyph,
  neurodivergent: NeurodivergentGlyph,
  // The rave smiley, not glow sticks: the mark the scene actually uses.
  raver: Smile,
  techie: Cable,
  cyborg: CyborgGlyph,
  party: PartyHatGlyph,
  'newly out': DoorOpen,
};

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

function slugValue(value: string) {
  return normalizeValue(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function profileBadgeCategory(group: ProfileBadgeGroup, value: string) {
  const slug = slugValue(value);
  if (group === 'Kinks') {
    return KINK_CATALOG.find((kink) => slugValue(kink.label) === slug)?.category ?? 'Other';
  }
  return PROFILE_BADGE_GROUPS[group].find((category) => (
    category.options.some((option) => slugValue(option) === slug)
  ))?.label ?? 'Other';
}

export function profileBadgeGlyph(group: ProfileBadgeGroup, value: string, category = profileBadgeCategory(group, value)) {
  return PROFILE_BADGE_VALUE_ICONS[normalizeValue(value)]
    ?? PROFILE_BADGE_FALLBACK_ICONS[group][category]
    ?? Sparkles;
}

export function resolveSavedProfileBadge(badgeId: string) {
  const normalized = normalizeValue(badgeId).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  const match = /^(vibes|kinks) (.+)$/.exec(normalized);
  if (!match) return null;

  const group: ProfileBadgeGroup = match[1] === 'vibes' ? 'Vibes' : 'Kinks';
  const savedSlug = slugValue(match[2]);
  const options = group === 'Kinks'
    ? KINK_CATALOG.map((kink) => kink.label)
    : PROFILE_BADGE_GROUPS[group].flatMap((category) => category.options);
  const value = options.find((option) => slugValue(option) === savedSlug);
  if (!value) return null;

  const category = profileBadgeCategory(group, value);
  return {
    icon: profileBadgeGlyph(group, value, category),
    label: value,
  };
}
