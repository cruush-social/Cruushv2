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
 * The BDSM emblem frames are here too. Those are not gendered and they do not
 * use a circle: a chevron leads, a square is led, a hexagon goes either way.
 */

export type BadgeFrameId =
  | 'plain'
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

type FrameProps = {
  className?: string;
  /** The badge itself, drawn inside the frame at its own scale. */
  children?: React.ReactNode;
};

/*
 * Everything is drawn in a 64 box with the circle fixed at r 15 on centre. The
 * circle is always the same size no matter which arms are attached, so a row of
 * framed badges lines up on the circle rather than on the bounding box.
 */
const CENTRE = 32;
const RADIUS = 15;
const STROKE = 4.4;

/** Arms, in the direction each symbol actually puts them. */
const VENUS_CROSS = `M${CENTRE} ${CENTRE + RADIUS}v13 M${CENTRE - 7} ${CENTRE + RADIUS + 6.5}h14`;
const MARS_ARROW = 'M43.6 20.4 55 9 M45.6 9h9.4v9.4';
const NONBINARY_STAR = `M${CENTRE} ${CENTRE - RADIUS}v-13 M${CENTRE - 6.4} ${CENTRE - RADIUS - 9.4} 6.4 5.4 M${CENTRE + 6.4} ${CENTRE - RADIUS - 9.4} -6.4 5.4`;
const AGENDER_BAR = `M${CENTRE - 9} ${CENTRE}h18`;
const NEUTROIS_STEM = `M${CENTRE} ${CENTRE - RADIUS}v-12`;
const STRUCK_ARM = 'M20.4 43.6 9 55 M9 45.6v9.4h9.4';
const THIRD_GENDER_ARM = `M${CENTRE - RADIUS} ${CENTRE}h-9 M${CENTRE - RADIUS - 9} ${CENTRE - 6.4} -6.4 6.4 6.4 6.4z`;

const FRAME_ARMS: Partial<Record<BadgeFrameId, string>> = {
  female: VENUS_CROSS,
  male: MARS_ARROW,
  transgender: `${VENUS_CROSS} ${MARS_ARROW} ${STRUCK_ARM}`,
  nonbinary: NONBINARY_STAR,
  agender: AGENDER_BAR,
  neutrois: NEUTROIS_STEM,
  androgyne: `${VENUS_CROSS} ${NEUTROIS_STEM} M${CENTRE - 6.4} ${CENTRE - RADIUS - 6} 6.4 -6 6.4 6`,
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
  heart: 'M32 49.5C19.2 41.6 13 34.9 13 27.6a9.9 9.9 0 0 1 19-3.6 9.9 9.9 0 0 1 19 3.6c0 7.3-6.2 14-19 21.9z',
  square: 'M17 17h30v30H17z',
  chevron: 'M15 14h34v18L32 50 15 32z',
  'bracket-square': 'M18 24v-8h8 M46 24v-8h-8 M18 40v8h8 M46 40v8h-8',
  hexagon: 'M23 15h18l9 17-9 17H23l-9-17z',
};

export function BadgeFrame({ className, children, frame = 'plain' }: FrameProps & { frame?: BadgeFrameId }) {
  const arms = FRAME_ARMS[frame];
  const shape = SHAPE_FRAMES[frame];

  return (
    <span className={`relative inline-flex items-center justify-center ${className ?? ''}`}>
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={STROKE}
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
      >
        {shape ? (
          <path d={shape} />
        ) : (
          <circle cx={CENTRE} cy={CENTRE} r={RADIUS} />
        )}
        {arms ? <path d={arms} /> : null}
      </svg>

      {/* The badge sits in the circle, which never changes size. */}
      <span className="relative flex items-center justify-center" style={{ width: '46%', height: '46%' }}>
        {children}
      </span>
    </span>
  );
}

export const BADGE_FRAMES: Array<{ id: BadgeFrameId; label: string; group: string }> = [
  { id: 'plain', label: 'Plain', group: 'Shape' },
  { id: 'heart', label: 'Heart', group: 'Shape' },
  { id: 'square', label: 'Square', group: 'Shape' },
  { id: 'chevron', label: 'Chevron', group: 'Shape' },
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
