import { useNavigate } from 'react-router';
import HeartPhoto from './HeartPhoto';
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
 * A basic account carries what its profile already says: the role on the left,
 * the position on the right. cruush+ opens both slots to anything in the badge
 * set, the way a hanky code lets you say something the profile fields do not.
 */

const HEART_UNIT_CLASS = 'relative flex h-20 w-[103px] items-end justify-center';
const CHIP_CLASS = 'absolute top-[62%] flex h-[1.5625rem] w-[1.5625rem] -translate-y-1/2 items-center justify-center rounded-full bg-black/86 backdrop-blur-md';

function BadgeChip({ side, children }: { side: 'left' | 'right'; children: React.ReactNode }) {
  return (
    <span
      className={`${CHIP_CLASS} ${side === 'left' ? 'left-[-0.25rem]' : 'right-[-0.25rem]'}`}
      style={{ border: '3.2px solid #004BFF' }}
    >
      {children}
    </span>
  );
}

export default function ProfileBadgesTab({
  cruushPlus,
  photo,
  position,
  role,
}: {
  cruushPlus: boolean;
  photo: string | null;
  position: string[];
  role: string[];
}) {
  const navigate = useNavigate();
  const firstRole = role[0] ?? null;
  const firstPosition = position[0] ?? null;
  const RoleGlyph = roleGlyphFor(firstRole);
  const PositionGlyph = positionGlyphFor(firstPosition);

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
            <BadgeChip side="left"><RoleGlyph className="h-3.5 w-3.5 text-white" /></BadgeChip>
          ) : null}
          {PositionGlyph ? (
            <BadgeChip side="right"><PositionGlyph className="h-3.5 w-3.5 text-white" /></BadgeChip>
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
          {cruushPlus
            ? 'Pick anything for either side instead of your role and position. Hover a badge anywhere in the app to read what it means.'
            : 'cruush+ lets you pick anything for either side instead of your role and position, and takes the ceiling off your kinks.'}
        </p>
        <Button
          className="w-full rounded-full text-white"
          onClick={() => navigate(cruushPlus ? '/settings/badges' : '/cruush-plus')}
          style={{ background: 'var(--cruush-gradient)' }}
          type="button"
        >
          {cruushPlus ? 'Choose your badges' : 'See cruush+'}
        </Button>
      </section>
    </div>
  );
}
