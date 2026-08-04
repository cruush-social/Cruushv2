/**
 * Backdrop displacement ported straight from the reference "glass displacement"
 * pen (jh3y). The displacement image is a black plate with a horizontal red
 * ramp and a vertical blue ramp blended with `difference`, then a blurred
 * block-out rect that flattens the centre so only the rim refracts. The filter
 * samples that map three times with slightly different scales to get the
 * chromatic aberration, isolates each channel, and screens them back together.
 *
 * Anything else (grey lens plates, screen-blended grey ramps) does not read as
 * glass, so keep this in lockstep with the reference.
 */
type DisplacementMapOptions = {
  alpha: number;
  blend: string;
  blur: number;
  border: number;
  height: number;
  lightness: number;
  radius: number;
  width: number;
};

type LiquidGlassFilterDefinition = DisplacementMapOptions & {
  blueOffset: number;
  displace: number;
  greenOffset: number;
  id: string;
  scale: number;
};

export const LIQUID_GLASS_FILTER_IDS = {
  bubble: 'cruush-liquid-glass-bubble',
  dock: 'cruush-liquid-glass-dock',
  field: 'cruush-liquid-glass-field',
  panel: 'cruush-liquid-glass-panel',
  pill: 'cruush-liquid-glass-pill',
} as const;

export function createDisplacementMap({
  alpha,
  blend,
  blur,
  border,
  height,
  lightness,
  radius,
  width,
}: DisplacementMapOptions) {
  const inset = Math.min(width, height) * (border * 0.5);
  const svg = [
    `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
    '<defs>',
    '<linearGradient id="red" x1="100%" y1="0%" x2="0%" y2="0%">',
    '<stop offset="0%" stop-color="#000"/>',
    '<stop offset="100%" stop-color="red"/>',
    '</linearGradient>',
    '<linearGradient id="blue" x1="0%" y1="0%" x2="0%" y2="100%">',
    '<stop offset="0%" stop-color="#000"/>',
    '<stop offset="100%" stop-color="blue"/>',
    '</linearGradient>',
    '</defs>',
    `<rect x="0" y="0" width="${width}" height="${height}" fill="black"/>`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#red)"/>`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#blue)" style="mix-blend-mode: ${blend}"/>`,
    `<rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="${radius}" fill="hsl(0 0% ${lightness}% / ${alpha})" style="filter:blur(${blur}px)"/>`,
    '</svg>',
  ].join('');

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Reference pen `base` config, shared by every surface.
 *
 * One deliberate departure from the pen: the chromatic offsets are 0. The pen
 * ships r 0 / g 10 / b 20, which splits the backdrop into red/green/blue copies
 * — the "rainbow" fringing. We keep the displacement (the bend at the rim) and
 * drop the split, so all three channels sample the map at the same scale and
 * recombine cleanly. Do not reintroduce non-zero offsets.
 */
const BASE = {
  alpha: 0.93,
  blend: 'difference',
  blueOffset: 0,
  blur: 11,
  border: 0.07,
  displace: 0,
  greenOffset: 0,
  lightness: 50,
  scale: -180,
} as const;

const FILTERS: LiquidGlassFilterDefinition[] = [
  // Reference `dock` preset: the only surface that frosts and blurs its output.
  { ...BASE, id: LIQUID_GLASS_FILTER_IDS.dock, width: 368, height: 80, radius: 40, displace: 0.2 },
  // Reference `bubble` preset.
  { ...BASE, id: LIQUID_GLASS_FILTER_IDS.bubble, width: 72, height: 72, radius: 36 },
  // Reference `pill` preset.
  { ...BASE, id: LIQUID_GLASS_FILTER_IDS.pill, width: 224, height: 56, radius: 28 },
  // Reference `base` config on a low-radius input field.
  { ...BASE, id: LIQUID_GLASS_FILTER_IDS.field, width: 288, height: 46, radius: 10 },
  // Panels stay on `base` too. The pen's `free` preset (lightness 60 / alpha
  // 0.74) leaves the block-out at rgb(146,113,146) instead of neutral grey, so
  // the centre of the surface displaces ~22px and the whole panel smears with
  // colour fringing. `base` blocks out to 127.5 and only the rim refracts.
  { ...BASE, id: LIQUID_GLASS_FILTER_IDS.panel, width: 336, height: 220, radius: 28 },
];

function LiquidGlassFilter({
  alpha,
  blend,
  blueOffset,
  blur,
  border,
  displace,
  greenOffset,
  height,
  id,
  lightness,
  radius,
  scale,
  width,
}: LiquidGlassFilterDefinition) {
  const map = createDisplacementMap({ alpha, blend, blur, border, height, lightness, radius, width });

  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feImage href={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
      <feDisplacementMap
        id={`${id}-redchannel`}
        in="SourceGraphic"
        in2="map"
        scale={scale}
        xChannelSelector="R"
        yChannelSelector="B"
        result="dispRed"
      />
      <feColorMatrix
        in="dispRed"
        type="matrix"
        values="1 0 0 0 0
                0 0 0 0 0
                0 0 0 0 0
                0 0 0 1 0"
        result="red"
      />
      <feDisplacementMap
        id={`${id}-greenchannel`}
        in="SourceGraphic"
        in2="map"
        scale={scale + greenOffset}
        xChannelSelector="R"
        yChannelSelector="B"
        result="dispGreen"
      />
      <feColorMatrix
        in="dispGreen"
        type="matrix"
        values="0 0 0 0 0
                0 1 0 0 0
                0 0 0 0 0
                0 0 0 1 0"
        result="green"
      />
      <feDisplacementMap
        id={`${id}-bluechannel`}
        in="SourceGraphic"
        in2="map"
        scale={scale + blueOffset}
        xChannelSelector="R"
        yChannelSelector="B"
        result="dispBlue"
      />
      <feColorMatrix
        in="dispBlue"
        type="matrix"
        values="0 0 0 0 0
                0 0 0 0 0
                0 0 1 0 0
                0 0 0 1 0"
        result="blue"
      />
      <feBlend in="red" in2="green" mode="screen" result="rg" />
      <feBlend in="rg" in2="blue" mode="screen" result="output" />
      <feGaussianBlur in="output" stdDeviation={displace} />
    </filter>
  );
}

export default function LiquidGlassFilters() {
  return (
    <svg aria-hidden="true" className="cruush-liquid-glass-filters" focusable="false">
      <defs>
        {FILTERS.map((filter) => (
          <LiquidGlassFilter key={filter.id} {...filter} />
        ))}
      </defs>
    </svg>
  );
}
