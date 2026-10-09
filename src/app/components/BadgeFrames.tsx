/**
 * Protected cruush presentation and behavior.
 * Do not change artwork, geometry, styling, content, controls, privacy rules,
 * interactions, animation sequences or timing unless Julien explicitly requests
 * that exact change in a user prompt. Improvement, cleanup and consistency are
 * not authorization. Preserve the approved local appearance and functionality.
 */

/**
 * Badge frames: the outside of a side badge, and nothing else.
 *
 * Almost every gender symbol is a circle with something attached to it, which
 * is why this works. The chip stays the circle it already was, at the size it
 * already was, and the frame only adds arms outside it. Nothing is drawn inside
 * the frame; whatever the badge is about goes in there separately.
 *
 * The arms extend past the circle, so a framed badge sits further out from the
 * heart than a plain one. It never overlaps the heart. Only the border and the
 * arms attached to it change.
 *
 * The role frames are here too. Dom uses a diamond, Sub uses a circle, Switch
 * uses a hexagon, and Heart is the default.
 */

import { Fragment, useId, type MouseEvent, type ElementType } from 'react';
import paisley515105 from '../assets/ui-icons/paisley-515105.png';
import { HEART_PIN_PATH } from '../lib/heartPin';

export type BadgeFrameId =
  | 'plain'
  | 'circle'
  | 'diamond'
  | 'heart'
  | 'square'
  | 'female'
  | 'male'
  | 'transgender'
  | 'nonbinary'
  | 'agender'
  | 'neutrois'
  | 'androgyne'
  | 'demigirl'
  | 'demiboy'
  | 'intergender'
  | 'genderfluid'
  | 'bigender'
  | 'third-gender'
  | 'pangender'
  | 'butch'
  | 'femme'
  | 'chevron'
  | 'bracket-square'
  | 'hexagon';

export const BADGE_INTERACTION_CLASS = 'cursor-help touch-manipulation select-none [-webkit-touch-callout:none]';

export function preventBadgeContextMenu(event: MouseEvent<HTMLElement>) {
  event.preventDefault();
}

type FrameProps = {
  className?: string;
  /** The badge itself, drawn inside the frame at its own scale. */
  children?: React.ReactNode;
  contentScalePercent?: number;
  fillColor?: string;
  /** Draw glyph artwork behind the existing frame border. */
  fillWithGlyph?: boolean;
  gradientStops?: readonly [string, string, string];
  hankyColor?: string;
  strokeColor?: string;
};

// `revealed` is the map's long-press state. It only opens the label where there
// is no hover to open it with, so a touch press shows every badge label beside
// the signal while a desktop pointer still reveals one badge at a time.
// A label wraps between words, never inside one, so no single letter is left
// hanging on its own line. A slashed pair such as "switch/service" is one word
// to the browser, so it gets its own break opportunity after each slash.
function withSlashBreaks(children: React.ReactNode) {
  if (typeof children !== 'string' || !children.includes('/')) {
    return children;
  }

  return children.split('/').map((part, index, parts) => (
    <Fragment key={`${part}-${index}`}>
      {index < parts.length - 1 ? `${part}/` : part}
      {index < parts.length - 1 ? <wbr /> : null}
    </Fragment>
  ));
}

export function BadgeHoverLabel({ children, revealed = false, align = 'center', compactHorizontalPadding = false, compactVerticalPadding = false, className = '' }: {
  children: React.ReactNode;
  revealed?: boolean;
  compactHorizontalPadding?: boolean;
  compactVerticalPadding?: boolean;
  className?: string;
  /**
   * Touch-side anchoring; desktop hover always centers beneath the badge.
   */
  align?: 'center' | 'start' | 'end';
}) {
  // Desktop hover reveals one label centered beneath its own badge. Preserve
  // the existing touch anchors and simultaneous long-press reveal behavior.
  const anchor = align === 'start'
    ? `left-0 translate-x-0 [@media(hover:hover)]:left-1/2 [@media(hover:hover)]:-translate-x-1/2 ${revealed ? '[@media(hover:none)]:left-1/2 [@media(hover:none)]:-translate-x-1/2' : ''}`
    : align === 'end'
      ? `right-0 translate-x-0 [@media(hover:hover)]:left-1/2 [@media(hover:hover)]:right-auto [@media(hover:hover)]:-translate-x-1/2 ${revealed ? '[@media(hover:none)]:left-1/2 [@media(hover:none)]:right-auto [@media(hover:none)]:-translate-x-1/2' : ''}`
      : 'left-1/2 -translate-x-1/2';
  // Centred pairs sit close, so the revealed label stays narrow enough that
  // the two sides do not cross under the heart between them. The label breaks
  // between words only, so a name that does not fit wraps at its space or
  // slash instead of leaving one letter hanging on its own line.
  const revealedWidth = revealed ? '[@media(hover:none)]:max-w-[5.5rem]' : '';

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute top-full z-50 mt-1.5 w-max max-w-[min(13rem,calc(100vw-2rem))] break-normal whitespace-normal rounded-xl border border-white/20 bg-black/95 ${compactHorizontalPadding ? 'px-1' : 'px-2'} ${compactVerticalPadding ? 'py-0.5' : 'py-1'} text-center text-[0.7rem] font-semibold leading-tight text-white opacity-0 shadow-lg transition-opacity group-active/badge:opacity-100 group-focus-within/badge:opacity-100 group-hover/badge:opacity-100 ${anchor} ${revealedWidth} ${revealed ? '[@media(hover:none)]:opacity-100' : ''} ${className}`}
    >
      {withSlashBreaks(children)}
    </span>
  );
}

/*
 * Everything is drawn in a 64 box. Plain and custom-shape borders nearly fill
 * the real 25px badge chip, leaving a clear center for the glyph. Gender-symbol
 * arms retain their compact center so the arms remain inside the viewBox.
 */
const CENTRE = 32;
const COMPACT_RADIUS = 15;
const BADGE_RADIUS = 27;
const STROKE = 6;
const HEART_FRAME_SCALE = 1.25;

export const SIDE_BADGE_SIZE_PX = 35;
export const MAP_SIDE_BADGE_SIZE_PX = SIDE_BADGE_SIZE_PX * 0.85;
export const MAP_SIDE_BADGE_PLACEMENT_CLASS = 'top-[70%] z-20 -translate-y-1/2';
export const SIDE_BADGE_GLYPH_SCALE_PERCENT = 60;
const HEART_BADGE_GLYPH_SCALE_PERCENT = SIDE_BADGE_GLYPH_SCALE_PERCENT * 0.85;
/** Leaves 1px between the badge and the visible edge of the 80px profile-heart path. */
export const SIDE_BADGE_EDGE_OFFSET_PX = -14.5;

export function sideBadgeEdgeOffsetPx(frame: BadgeFrameId) {
  const resolvedFrame = frame === 'chevron' ? 'diamond' : frame === 'square' ? 'circle' : frame;

  if (resolvedFrame === 'diamond') {
    return -18;
  }

  if (resolvedFrame === 'heart') {
    return -16.15;
  }

  return resolvedFrame === 'hexagon' ? -15.5 : SIDE_BADGE_EDGE_OFFSET_PX;
}

export function mapSideBadgeStyle(side: 'left' | 'right', frame: BadgeFrameId = 'circle') {
  const edgeOffset = sideBadgeEdgeOffsetPx(frame) + 4 + (SIDE_BADGE_SIZE_PX - MAP_SIDE_BADGE_SIZE_PX);

  return {
    height: MAP_SIDE_BADGE_SIZE_PX,
    width: MAP_SIDE_BADGE_SIZE_PX,
    ...(side === 'left' ? { left: edgeOffset } : { right: edgeOffset }),
  };
}

/** Arms, in the direction each symbol actually puts them. */
const VENUS_CROSS = `M${CENTRE} ${CENTRE + COMPACT_RADIUS}v13 M${CENTRE - 7} ${CENTRE + COMPACT_RADIUS + 6.5}h14`;
const MARS_ARROW = 'M43.6 20.4 55 9 M45.6 9h9.4v9.4';
const NONBINARY_STAR = `M${CENTRE} ${CENTRE - COMPACT_RADIUS}v-13 M${CENTRE - 6.4} ${CENTRE - COMPACT_RADIUS - 9.4} 6.4 5.4 M${CENTRE + 6.4} ${CENTRE - COMPACT_RADIUS - 9.4} -6.4 5.4`;
const AGENDER_BAR = `M${CENTRE - 9} ${CENTRE}h18`;
const NEUTROIS_STEM = `M${CENTRE} ${CENTRE - COMPACT_RADIUS}v-12`;
const STRUCK_ARM = 'M20.4 43.6 9 55 M9 45.6v9.4h9.4';
const THIRD_GENDER_ARM = `M${CENTRE - COMPACT_RADIUS} ${CENTRE}h-9 M${CENTRE - COMPACT_RADIUS - 9} ${CENTRE - 6.4} -6.4 6.4 6.4 6.4z`;

const FRAME_ARMS: Partial<Record<BadgeFrameId, string>> = {
  female: VENUS_CROSS,
  male: MARS_ARROW,
  transgender: `${VENUS_CROSS} ${MARS_ARROW} ${STRUCK_ARM}`,
  nonbinary: NONBINARY_STAR,
  agender: AGENDER_BAR,
  neutrois: NEUTROIS_STEM,
  androgyne: `${VENUS_CROSS} ${NEUTROIS_STEM} M${CENTRE - 6.4} ${CENTRE - COMPACT_RADIUS - 6} 6.4 -6 6.4 6`,
  demigirl: `${VENUS_CROSS} ${AGENDER_BAR}`,
  demiboy: `${MARS_ARROW} ${AGENDER_BAR}`,
  intergender: `${VENUS_CROSS} ${STRUCK_ARM}`,
  genderfluid: `${VENUS_CROSS} ${MARS_ARROW}`,
  bigender: `${VENUS_CROSS} ${MARS_ARROW} ${NEUTROIS_STEM}`,
  'third-gender': THIRD_GENDER_ARM,
  pangender: `${VENUS_CROSS} ${NONBINARY_STAR} ${AGENDER_BAR}`,
  butch: MARS_ARROW,
  femme: VENUS_CROSS,
};

/** The frames that are not circles, and are not about gender. */
const SHAPE_FRAMES: Partial<Record<BadgeFrameId, string>> = {
  // With a 6-unit stroke, this Dom diamond has more interior than Circle so the
  // same glyph remains clear of every corner.
  diamond: 'M32 -3 67 32 32 67 -3 32Z',
  heart: HEART_PIN_PATH,
  'bracket-square': 'M10 25V8h15 M54 25V8H39 M10 39v17h15 M54 39v17H39',
  hexagon: 'M17.5 7h29L61 32 46.5 57h-29L3 32Z',
};

const SHAPE_TRANSFORMS: Partial<Record<BadgeFrameId, string>> = {
  // These scales raise the actual stroked interior above Circle's interior
  // while the Heart icon receives its dedicated clearance reduction below.
  heart: `translate(-8 -8) scale(${HEART_FRAME_SCALE})`,
  hexagon: 'translate(-1.6 -1.6) scale(1.05)',
};

function badgeGlyphScalePercent(frame: BadgeFrameId) {
  return frame === 'heart' || frame === 'diamond'
    ? HEART_BADGE_GLYPH_SCALE_PERCENT
    : SIDE_BADGE_GLYPH_SCALE_PERCENT;
}

export function BadgeFrame({
  className,
  children,
  contentScalePercent,
  fillColor = '#05050A',
  fillWithGlyph = false,
  frame = 'plain',
  gradientStops,
  hankyColor,
  strokeColor,
}: FrameProps & { frame?: BadgeFrameId }) {
  const resolvedFrame = frame === 'chevron' ? 'diamond' : frame === 'square' ? 'circle' : frame;
  const arms = FRAME_ARMS[resolvedFrame];
  const shape = SHAPE_FRAMES[resolvedFrame];
  const shapeTransform = SHAPE_TRANSFORMS[resolvedFrame];
  const gradientId = `badge-frame-gradient-${useId().replace(/:/g, '')}`;
  const clipId = `badge-frame-clip-${useId().replace(/:/g, '')}`;
  const maskId = `badge-frame-hanky-mask-${useId().replace(/:/g, '')}`;
  const resolvedStroke = gradientStops ? `url(#${gradientId})` : strokeColor ?? 'currentColor';
  const hankyDetailColor = hankyColor?.toUpperCase() === '#1A1A1E' ? '#FFFFFF' : '#05050A';
  // Flag artwork uses the same filled-circle radius as an ordinary badge. It
  // continues underneath the usual border so that border rasterizes at the
  // same width instead of meeting a separately clipped layer at its inner edge.
  const glyphFillInsetPercent = ((CENTRE - BADGE_RADIUS) / 64) * 100;

  return (
    <span className={`relative inline-flex items-center justify-center ${className ?? ''}`}>
      {fillWithGlyph && !hankyColor ? (
        <span
          aria-hidden="true"
          className="absolute overflow-hidden rounded-full"
          style={{ inset: `${glyphFillInsetPercent}%`, stroke: 'none' }}
        >
          {children}
        </span>
      ) : null}
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full overflow-visible"
        fill="none"
        stroke={resolvedStroke}
        strokeLinecap={resolvedFrame === 'heart' ? 'butt' : 'round'}
        strokeLinejoin={resolvedFrame === 'heart' ? 'miter' : 'round'}
        strokeWidth={resolvedFrame === 'heart' ? STROKE / HEART_FRAME_SCALE : STROKE}
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {gradientStops ? (
            <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor={gradientStops[0]} />
              <stop offset="50%" stopColor={gradientStops[1]} />
              <stop offset="100%" stopColor={gradientStops[2]} />
            </linearGradient>
          ) : null}
          <clipPath id={clipId}>
            {shape ? <path d={shape} transform={shapeTransform} /> : <circle cx={CENTRE} cy={CENTRE} r={arms ? COMPACT_RADIUS : BADGE_RADIUS} />}
          </clipPath>
          {hankyColor ? (
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              style={{ maskType: 'alpha' }}
              x="0"
              y="0"
              width="64"
              height="64"
            >
              <image href={paisley515105} height="72" preserveAspectRatio="xMidYMid meet" width="72" x="-4" y="-4" />
            </mask>
          ) : null}
        </defs>
        {hankyColor ? (
          <g clipPath={`url(#${clipId})`}>
            {shape ? <path d={shape} fill={hankyDetailColor} stroke="none" transform={shapeTransform} /> : <circle cx={CENTRE} cy={CENTRE} fill={hankyDetailColor} r={arms ? COMPACT_RADIUS : BADGE_RADIUS} stroke="none" />}
            <rect fill={hankyColor} height="64" mask={`url(#${maskId})`} stroke="none" width="64" x="0" y="0" />
          </g>
        ) : null}
        {shape ? (
          <path
            d={shape}
            fill={hankyColor || fillWithGlyph ? 'none' : fillColor}
            transform={shapeTransform}
          />
        ) : (
          <circle cx={CENTRE} cy={CENTRE} fill={hankyColor || fillWithGlyph ? 'none' : fillColor} r={arms ? COMPACT_RADIUS : BADGE_RADIUS} />
        )}
        {arms ? <path d={arms} /> : null}
      </svg>

      {/* The badge sits in the circle, which never changes size. */}
      {hankyColor || fillWithGlyph ? null : (
        <span
          className="relative flex items-center justify-center"
          style={{
            width: `${contentScalePercent ?? badgeGlyphScalePercent(resolvedFrame)}%`,
            height: `${contentScalePercent ?? badgeGlyphScalePercent(resolvedFrame)}%`,
            transform: resolvedFrame === 'heart' ? 'translateY(10%)' : undefined,
          }}
        >
          {children}
        </span>
      )}
    </span>
  );
}

export const BADGE_FRAMES: Array<{ id: BadgeFrameId; label: string; group: string }> = [
  { id: 'plain', label: 'Plain', group: 'Shape' },
  { id: 'circle', label: 'Circle', group: 'Shape' },
  { id: 'diamond', label: 'Diamond', group: 'Shape' },
  { id: 'heart', label: 'Heart', group: 'Shape' },
  { id: 'bracket-square', label: 'Brackets', group: 'Shape' },
  { id: 'hexagon', label: 'Hexagon', group: 'Shape' },
  { id: 'female', label: 'Female', group: 'Gender' },
  { id: 'male', label: 'Male', group: 'Gender' },
  { id: 'transgender', label: 'Transgender', group: 'Gender' },
  { id: 'nonbinary', label: 'Nonbinary', group: 'Gender' },
  { id: 'genderfluid', label: 'Genderfluid', group: 'Gender' },
  { id: 'bigender', label: 'Bigender', group: 'Gender' },
  { id: 'agender', label: 'Agender', group: 'Gender' },
  { id: 'neutrois', label: 'Neutrois', group: 'Gender' },
  { id: 'androgyne', label: 'Androgyne', group: 'Gender' },
  { id: 'demigirl', label: 'Demigirl', group: 'Gender' },
  { id: 'demiboy', label: 'Demiboy', group: 'Gender' },
  { id: 'intergender', label: 'Intergender', group: 'Gender' },
  { id: 'third-gender', label: 'Third gender', group: 'Gender' },
  { id: 'pangender', label: 'Pangender', group: 'Gender' },
  { id: 'butch', label: 'Butch', group: 'Gender' },
  { id: 'femme', label: 'Femme', group: 'Gender' },
];

/** Shared framed badge artwork. Callers retain their existing placement and interaction wrappers. */
export function BadgeUnit({
  glyph: Glyph,
  glyphClassName = 'h-full w-full',
  glyphAriaHidden,
  contentClassName = 'flex h-full w-full items-center justify-center text-white',
  ...frameProps
}: Omit<FrameProps, 'children'> & {
  frame?: BadgeFrameId;
  glyph: ElementType;
  glyphClassName?: string;
  glyphAriaHidden?: true;
  contentClassName?: string;
}) {
  return (
    <BadgeFrame {...frameProps}>
      {!frameProps.hankyColor ? (
        <span className={contentClassName}>
          <Glyph aria-hidden={glyphAriaHidden} className={glyphClassName} strokeWidth={2.6} />
        </span>
      ) : null}
    </BadgeFrame>
  );
}
