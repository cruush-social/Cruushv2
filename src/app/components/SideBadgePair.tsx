import type { ComponentType } from 'react';
import { Sparkles } from 'lucide-react';
import { formatBadgeLabel } from '../lib/badgeIntent';
import { createSavedMapMarkerBadge, type MapMarkerBadge } from '../lib/mapMarkers';
import type { SideBadges } from '../lib/profileApi';
import { AnalGlyph, BondageGlyph, CyborgGlyph, GooningGlyph, HarnessGlyph, KeyholeEyeGlyph, LeatherGlyph, LipsGlyph, NeurodivergentGlyph, NippleGlyph, PartyHatGlyph, PenetrationGlyph, RaveGlyph, RimmingGlyph, RubberGlyph, SpankingGlyph, StraightEdgeGlyph } from './BadgeGlyphs';
import { BADGE_INTERACTION_CLASS, BadgeFrame, BadgeHoverLabel, preventBadgeContextMenu, SIDE_BADGE_SIZE_PX } from './BadgeFrames';
import { BdsmTriskelionGlyph, BisexualGlyph, DoubleMarsGlyph, DoubleVenusGlyph, IntersexGlyph, LabrysGlyph, MarsVenusGlyph, NonbinaryGlyph, PlayingCard, PolyGlyph, T4TGlyph, TransGlyph } from './CommunityGlyphs';
import { HANKY_COLORS } from './HankyFrame';
import {
  AceFlagGlyph,
  AgenderFlagGlyph,
  AllyFlagGlyph,
  AroFlagGlyph,
  BearFlagGlyph,
  BisexualFlagGlyph,
  DemiromanticFlagGlyph,
  DemisexualFlagGlyph,
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
import { positionGlyphFor, roleGlyphFor } from './PositionRoleGlyphs';
import { USER_BORDER_COLORS, type UserBorderTone } from '../lib/userBorderTone';
import { resolveSavedProfileBadge } from './ProfileBadgeGlyphs';

export type SideBadgeTone = UserBorderTone;

type SavedBadgeGlyph = ComponentType<{ className?: string; strokeWidth?: number }>;

const SAVED_CUSTOM_GLYPHS: Record<string, SavedBadgeGlyph> = {
  oral: LipsGlyph,
  rimming: RimmingGlyph,
  penetration: PenetrationGlyph,
  anal: AnalGlyph,
  'nipple play': NippleGlyph,
  gooning: GooningGlyph,
  leather: LeatherGlyph,
  rubber: RubberGlyph,
  bondage: BondageGlyph,
  spanking: SpankingGlyph,
  harness: HarnessGlyph,
  cuckolding: KeyholeEyeGlyph,
  party: PartyHatGlyph,
  'straight edge': StraightEdgeGlyph,
  gay: DoubleMarsGlyph,
  lesbian: DoubleVenusGlyph,
  labrys: LabrysGlyph,
  bisexual: BisexualGlyph,
  straight: MarsVenusGlyph,
  t4t: T4TGlyph,
  'trans symbol': TransGlyph,
  intersex: IntersexGlyph,
  enby: NonbinaryGlyph,
  nonbinary: NonbinaryGlyph,
  poly: PolyGlyph,
  'bdsm pride': BdsmTriskelionGlyph,
  'ace spec': PlayingCard,
  'flag rainbow': RainbowFlagGlyph,
  'flag progress': ProgressPrideFlagGlyph,
  'flag gay men': GayMenFlagGlyph,
  'flag lesbian': LesbianFlagGlyph,
  'flag bisexual': BisexualFlagGlyph,
  'flag pansexual': PansexualFlagGlyph,
  'flag trans': TransFlagGlyph,
  'flag nonbinary': NonbinaryFlagGlyph,
  'flag intersex': IntersexFlagGlyph,
  'flag ace': AceFlagGlyph,
  'flag aro': AroFlagGlyph,
  'flag demisexual': DemisexualFlagGlyph,
  'flag demiromantic': DemiromanticFlagGlyph,
  'flag genderfluid': GenderfluidFlagGlyph,
  'flag genderqueer': GenderqueerFlagGlyph,
  'flag agender': AgenderFlagGlyph,
  'flag polysexual': PolysexualFlagGlyph,
  'flag omnisexual': OmnisexualFlagGlyph,
  'flag bear': BearFlagGlyph,
  'flag leather': LeatherFlagGlyph,
  'flag pup': PupFlagGlyph,
  'flag ally': AllyFlagGlyph,
  'vibes neurodivergent': NeurodivergentGlyph,
  'vibes rave': RaveGlyph,
  'vibes cyborg': CyborgGlyph,
};

function SavedSideBadge({ badge, side, tone }: {
  badge: MapMarkerBadge;
  side: 'left' | 'right';
  tone: SideBadgeTone;
}) {
  const profileBadge = resolveSavedProfileBadge(badge.badgeId ?? '');
  const Glyph = profileBadge?.icon ?? (badge.kind === 'role'
    ? roleGlyphFor(badge.iconName)
    : badge.kind === 'position'
      ? positionGlyphFor(badge.iconName)
      : SAVED_CUSTOM_GLYPHS[badge.badgeId ?? ''] ?? Sparkles);
  const hanky = badge.badgeId?.startsWith('hanky ')
    ? HANKY_COLORS.find((color) => `hanky ${color.id.replace(/-/g, ' ')}` === badge.badgeId)
    : undefined;
  const label = hanky
    ? formatBadgeLabel(hanky.meaning, badge.intent ?? 'none')
    : formatBadgeLabel(profileBadge?.label ?? badge.label, badge.intent ?? 'none');
  const borderColor = USER_BORDER_COLORS[tone];

  return (
    <span
      aria-label={`${side} badge: ${label}`}
      className={`group/badge relative inline-flex shrink-0 items-center justify-center text-white ${BADGE_INTERACTION_CLASS}`}
      data-badge-tone={tone}
      data-testid={`activity-${side}-badge`}
      role="img"
      onContextMenu={preventBadgeContextMenu}
      style={{ color: borderColor, width: SIDE_BADGE_SIZE_PX, height: SIDE_BADGE_SIZE_PX }}
      tabIndex={0}
    >
      <BadgeFrame
        className="h-full w-full"
        frame="circle"
        hankyColor={hanky?.color}
        strokeColor={borderColor}
      >
        {!hanky ? (
          <span className="flex h-full w-full items-center justify-center text-white">
            <Glyph className="h-full w-full" strokeWidth={2.6} />
          </span>
        ) : null}
      </BadgeFrame>
      <BadgeHoverLabel>{label}</BadgeHoverLabel>
    </span>
  );
}

export default function SideBadgePair({ badges, tone }: {
  badges?: SideBadges | null;
  tone: SideBadgeTone;
}) {
  const left = createSavedMapMarkerBadge(badges?.left, null);
  const right = createSavedMapMarkerBadge(badges?.right, null);

  if (!left && !right) {
    return null;
  }

  return (
    <span className="mt-1 flex w-full items-center justify-center gap-1" style={{ minHeight: SIDE_BADGE_SIZE_PX }} data-badge-placement="below-heart" data-testid="activity-side-badges">
      {left ? <SavedSideBadge badge={left} side="left" tone={tone} /> : null}
      {right ? <SavedSideBadge badge={right} side="right" tone={tone} /> : null}
    </span>
  );
}
