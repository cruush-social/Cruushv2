import { Sparkles } from 'lucide-react';
import { formatBadgeLabel } from '../lib/badgeIntent';
import { createSavedMapMarkerBadge, type MapMarkerBadge } from '../lib/mapMarkers';
import type { SideBadges } from '../lib/profileApi';
import { BadgeFrame, BadgeHoverLabel, SIDE_BADGE_SIZE_PX } from './BadgeFrames';
import { HANKY_COLORS } from './HankyFrame';
import { positionGlyphFor, roleGlyphFor } from './PositionRoleGlyphs';

export type SideBadgeTone = 'current' | 'mutual' | 'nearby' | 'mile-high' | 'pulse';

const BADGE_BORDER_COLORS: Record<SideBadgeTone, string> = {
  current: '#004BFF',
  mutual: '#6F00FF',
  nearby: '#FF0072',
  'mile-high': '#77B9DA',
  pulse: '#C8FF31',
};

function SavedSideBadge({ badge, side, tone }: {
  badge: MapMarkerBadge;
  side: 'left' | 'right';
  tone: SideBadgeTone;
}) {
  const Glyph = badge.kind === 'role'
    ? roleGlyphFor(badge.iconName)
    : badge.kind === 'position'
      ? positionGlyphFor(badge.iconName)
      : Sparkles;
  const hanky = badge.badgeId?.startsWith('hanky ')
    ? HANKY_COLORS.find((color) => `hanky ${color.id.replace(/-/g, ' ')}` === badge.badgeId)
    : undefined;
  const label = hanky
    ? formatBadgeLabel(hanky.meaning, badge.intent ?? 'none')
    : formatBadgeLabel(badge.label, badge.intent ?? 'none');
  const borderColor = BADGE_BORDER_COLORS[tone];

  return (
    <span
      aria-label={`${side} badge: ${label}`}
      className="group/badge relative inline-flex shrink-0 items-center justify-center text-white"
      data-badge-tone={tone}
      data-testid={`activity-${side}-badge`}
      role="img"
      style={{ color: borderColor, width: SIDE_BADGE_SIZE_PX, height: SIDE_BADGE_SIZE_PX }}
    >
      <BadgeFrame
        className="h-full w-full"
        frame="circle"
        hankyColor={hanky?.color}
        strokeColor={borderColor}
      >
        {!hanky ? (
          <span className="flex h-full w-full items-center justify-center text-white">
            <Glyph aria-hidden="true" className="h-full w-full" strokeWidth={2.6} />
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
    <span className="flex items-center justify-center gap-1" style={{ minHeight: SIDE_BADGE_SIZE_PX }} data-testid="activity-side-badges">
      {left ? <SavedSideBadge badge={left} side="left" tone={tone} /> : null}
      {right ? <SavedSideBadge badge={right} side="right" tone={tone} /> : null}
    </span>
  );
}
