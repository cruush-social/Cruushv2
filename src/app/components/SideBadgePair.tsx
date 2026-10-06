import { formatBadgeLabel } from '../lib/badgeIntent';
import { createSavedMapMarkerBadge, type MapMarkerBadge } from '../lib/mapMarkers';
import type { SideBadges } from '../lib/profileApi';
import { BADGE_INTERACTION_CLASS, BadgeUnit, BadgeHoverLabel, preventBadgeContextMenu, SIDE_BADGE_SIZE_PX } from './BadgeFrames';
import { HANKY_COLORS } from './HankyFrame';
import { positionGlyphFor, roleGlyphFor } from './PositionRoleGlyphs';
import { USER_BORDER_COLORS, type UserBorderTone } from '../lib/userBorderTone';
import { resolveSavedBadgeGlyph } from './SavedBadgeGlyphs';

export type SideBadgeTone = UserBorderTone;

function SavedSideBadge({ badge, side, tone }: {
  badge: MapMarkerBadge;
  side: 'left' | 'right';
  tone: SideBadgeTone;
}) {
  const savedBadge = resolveSavedBadgeGlyph(badge.badgeId ?? '');
  const Glyph = badge.kind === 'role'
    ? roleGlyphFor(badge.iconName)
    : badge.kind === 'position'
      ? positionGlyphFor(badge.iconName)
      : savedBadge.icon;
  const hanky = badge.badgeId?.startsWith('hanky ')
    ? HANKY_COLORS.find((color) => `hanky ${color.id.replace(/-/g, ' ')}` === badge.badgeId)
    : undefined;
  const label = hanky
    ? formatBadgeLabel(hanky.meaning, badge.intent ?? 'none')
    : formatBadgeLabel(savedBadge.label ?? badge.label, badge.intent ?? 'none');
  const title = badge.meaning ?? label;
  const DisplayGlyph = badge.iconPath
    ? ({ className }: { className?: string }) => <img alt="" className={`${className ?? ''} object-contain brightness-0 invert`} src={badge.iconPath} />
    : Glyph;
  const borderColor = USER_BORDER_COLORS[tone];

  return (
    <span
      aria-label={`${side} badge: ${title}`}
      className={`group/badge relative inline-flex shrink-0 items-center justify-center text-white ${BADGE_INTERACTION_CLASS}`}
      data-badge-tone={tone}
      data-testid={`activity-${side}-badge`}
      role="img"
      onContextMenu={preventBadgeContextMenu}
      style={{ color: borderColor, width: SIDE_BADGE_SIZE_PX, height: SIDE_BADGE_SIZE_PX }}
      tabIndex={0}
    >
      <BadgeUnit
        fillWithGlyph={savedBadge.fillsFrame}
        className="h-full w-full"
        frame="circle"
        hankyColor={hanky?.color}
        strokeColor={borderColor}
        glyph={DisplayGlyph}
      />
      {/* On a card the label centres under its own badge, the way the map
          does it. The outer-edge anchor is for the map's paired badges, where
          two labels either side of a heart would otherwise meet in the middle;
          a card has the room. */}
      <BadgeHoverLabel>{title}</BadgeHoverLabel>
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
