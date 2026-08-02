type DisplacementMapOptions = {
  alpha?: number;
  blur?: number;
  border?: number;
  height: number;
  lightness?: number;
  radius: number;
  width: number;
};

type LiquidGlassFilterDefinition = {
  blueOffset: number;
  id: string;
  map: string;
  outputBlur: number;
  scale: number;
};

export const LIQUID_GLASS_FILTER_IDS = {
  bubble: 'cruush-liquid-glass-bubble',
  dock: 'cruush-liquid-glass-dock',
  panel: 'cruush-liquid-glass-panel',
  pill: 'cruush-liquid-glass-pill',
} as const;

function createDisplacementMap({
  alpha = 0.93,
  blur = 11,
  border = 0.07,
  height,
  lightness = 50,
  radius,
  width,
}: DisplacementMapOptions) {
  const borderInset = Math.min(width, height) * (border * 0.5);
  const innerWidth = width - borderInset * 2;
  const innerHeight = height - borderInset * 2;
  const svg = [
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`,
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
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#blue)" style="mix-blend-mode:difference"/>`,
    `<rect x="${borderInset}" y="${borderInset}" width="${innerWidth}" height="${innerHeight}" rx="${radius}" fill="hsl(0 0% ${lightness}% / ${alpha})" style="filter:blur(${blur}px)"/>`,
    '</svg>',
  ].join('');

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const FILTERS: LiquidGlassFilterDefinition[] = [
  {
    blueOffset: 20,
    id: LIQUID_GLASS_FILTER_IDS.dock,
    map: createDisplacementMap({ width: 368, height: 80, radius: 40, border: 0.06, blur: 12, lightness: 48 }),
    outputBlur: 0.22,
    scale: -180,
  },
  {
    blueOffset: 18,
    id: LIQUID_GLASS_FILTER_IDS.bubble,
    map: createDisplacementMap({ width: 72, height: 72, radius: 36, border: 0.1, blur: 9, lightness: 52 }),
    outputBlur: 0.18,
    scale: -150,
  },
  {
    blueOffset: 16,
    id: LIQUID_GLASS_FILTER_IDS.pill,
    map: createDisplacementMap({ width: 224, height: 56, radius: 28, border: 0.08, blur: 10, lightness: 50 }),
    outputBlur: 0.14,
    scale: -145,
  },
  {
    blueOffset: 14,
    id: LIQUID_GLASS_FILTER_IDS.panel,
    map: createDisplacementMap({ width: 336, height: 220, radius: 28, border: 0.11, blur: 12, lightness: 47, alpha: 0.86 }),
    outputBlur: 0.18,
    scale: -125,
  },
];

function LiquidGlassFilter({
  blueOffset,
  id,
  map,
  outputBlur,
  scale,
}: LiquidGlassFilterDefinition) {
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
        scale={scale + 10}
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
      <feGaussianBlur in="output" stdDeviation={outputBlur} />
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
