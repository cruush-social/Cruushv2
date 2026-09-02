import { useNavigate } from 'react-router';
import HeartPhoto from './HeartPhoto';
import { BadgeHoverLabel } from './BadgeFrames';
import { Button } from './ui/button';
import {
  POSITION_GLYPHS,
  ROLE_GLYPHS,
  positionGlyphFor,
  roleGlyphFor,
} from './PositionRoleGlyphs';

/**
 * The two marks that ride either side of your heart on the map.
 *
 * A profile starts with its role on the left and position on the right. Every
 * member can replace either side with anything in the current badge set.
 */

const HEART_UNIT_CLASS = 'relative flex h-20 w-[103px] items-end justify-center';
const CHIP_CLASS = 'absolute top-[62%] flex h-[1.5625rem] w-[1.5625rem] -translate-y-1/2 items-center justify-center rounded-full bg-black/86 backdrop-blur-md';

function BadgeChip({ side, children, meaning }: { side: 'left' | 'right'; children: React.ReactNode; meaning: string }) {
  return (
    <span
      aria-label={meaning}
      className={`group/badge ${CHIP_CLASS} ${side === 'left' ? 'left-[-0.25rem]' : 'right-[-0.25rem]'}`}
      role="img"
      style={{ border: '3.2px solid #004BFF' }}
      tabIndex={0}
    >
      {children}
      <BadgeHoverLabel>{meaning}</BadgeHoverLabel>
    </span>
  );
}

export default function ProfileBadgesTab({
  onChooseBadges,
  photo,
  position,
  role,
}: {
  onChooseBadges?: () => void;
  photo: string | null;
  position: string[];
  role: string[];
}) {
  const navigate = useNavigate();
  const firstRole = role[0] ?? null;
  const firstPosition = position[0] ?? null;
  const RoleGlyph = roleGlyphFor(firstRole);
  const PositionGlyph = positionGlyphFor(firstPosition);
  const handleChooseBadges = () => {
    if (onChooseBadges) {
      onChooseBadges();
      return;
    }

    navigate('/settings/badges');
  };

  return (
    <div className="space-y-6">
      {/* Your own heart, drawn the way the map draws it. */}
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/45 p-5">
        <span className={HEART_UNIT_CLASS}>
          <span className="relative block w-20">
            <HeartPhoto
              className="w-20"
              label="Your badges"
              masked={false}
              photo={photo}
              theme="current"
              userId="badge-preview"
            />
          </span>
          {RoleGlyph ? (
            <BadgeChip meaning={firstRole ?? 'Role badge'} side="left"><RoleGlyph className="h-3.5 w-3.5 text-white" /></BadgeChip>
          ) : null}
          {PositionGlyph ? (
            <BadgeChip meaning={firstPosition ?? 'Position badge'} side="right"><PositionGlyph className="h-3.5 w-3.5 text-white" /></BadgeChip>
          ) : null}
        </span>
        <p className="text-center text-sm text-muted-foreground">
          {RoleGlyph || PositionGlyph
            ? 'Your role sits on the left, your position on the right.'
            : 'Set a role and a position under Basics and they will appear here.'}
        </p>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base text-white">Roles</h2>
          <p className="text-xs text-muted-foreground">Left side of the heart.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(ROLE_GLYPHS).map(([value, Mark]) => {
            const selected = firstRole === value;

            return (
              <div
                className={`flex flex-col items-center gap-2 rounded-xl border p-3 ${
                  selected ? 'border-[#004BFF] bg-black/60' : 'border-white/10 bg-white/[0.035]'
                }`}
                key={value}
                title={value}
              >
                <Mark className="h-7 w-7 text-white" />
                <span className="text-center text-xs capitalize text-white/80">{value}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base text-white">Positions</h2>
          <p className="text-xs text-muted-foreground">Right side of the heart.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(POSITION_GLYPHS).map(([value, Mark]) => {
            const selected = firstPosition === value;

            return (
              <div
                className={`flex flex-col items-center gap-2 rounded-xl border p-3 ${
                  selected ? 'border-[#004BFF] bg-black/60' : 'border-white/10 bg-white/[0.035]'
                }`}
                key={value}
                title={value}
              >
                <Mark className="h-7 w-7 text-white" />
                <span className="text-center text-xs capitalize text-white/80">{value}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <h2 className="text-base text-white">Custom badges</h2>
        <p className="text-sm text-muted-foreground">
          Pick anything for either side instead of your role and position. Hover, or press and hold, a badge to read what it means.
        </p>
        <Button
          className="w-full rounded-full text-white"
          onClick={handleChooseBadges}
          style={{ background: 'var(--cruush-gradient)' }}
          type="button"
        >
          Choose your badges
        </Button>
      </section>
    </div>
  );
}
