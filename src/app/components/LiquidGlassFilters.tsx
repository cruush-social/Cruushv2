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
  field: 'cruush-liquid-glass-field',
  panel: 'cruush-liquid-glass-panel',
  pill: 'cruush-liquid-glass-pill',
} as const;

function createDisplacementMap({
  alpha = 0.82,
  blur = 7,
  border = 0.07,
  height,
  lightness = 54,
  radius,
  width,
}: DisplacementMapOptions) {
  const borderInset = Math.min(width, height) * border;
  const ringInset = borderInset * 0.45;
  const innerWidth = width - borderInset * 2;
  const innerHeight = height - borderInset * 2;
  const ringWidth = width - ringInset * 2;
  const ringHeight = height - ringInset * 2;
  const svg = [
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`,
    '<defs>',
    '<linearGradient id="xLens" x1="0%" y1="50%" x2="100%" y2="50%">',
    '<stop offset="0%" stop-color="rgb(30,30,30)"/>',
    '<stop offset="18%" stop-color="rgb(118,118,118)"/>',
    '<stop offset="50%" stop-color="rgb(128,128,128)"/>',
    '<stop offset="82%" stop-color="rgb(138,138,138)"/>',
    '<stop offset="100%" stop-color="rgb(226,226,226)"/>',
    '</linearGradient>',
    '<linearGradient id="yLens" x1="50%" y1="0%" x2="50%" y2="100%">',
    '<stop offset="0%" stop-color="rgb(32,32,32)"/>',
    '<stop offset="22%" stop-color="rgb(118,118,118)"/>',
    '<stop offset="50%" stop-color="rgb(128,128,128)"/>',
    '<stop offset="78%" stop-color="rgb(138,138,138)"/>',
    '<stop offset="100%" stop-color="rgb(224,224,224)"/>',
    '</linearGradient>',
    `<filter id="softLens"><feGaussianBlur stdDeviation="${blur}"/></filter>`,
    '</defs>',
    `<rect x="0" y="0" width="${width}" height="${height}" fill="rgb(128,128,128)"/>`,
    `<rect x="${ringInset}" y="${ringInset}" width="${ringWidth}" height="${ringHeight}" rx="${radius}" fill="url(#xLens)" opacity="0.72"/>`,
    `<rect x="${ringInset}" y="${ringInset}" width="${ringWidth}" height="${ringHeight}" rx="${radius}" fill="url(#yLens)" opacity="0.72" style="mix-blend-mode:screen"/>`,
    `<rect x="${borderInset}" y="${borderInset}" width="${innerWidth}" height="${innerHeight}" rx="${Math.max(radius - borderInset, 2)}" fill="hsl(0 0% ${lightness}% / ${alpha})" filter="url(#softLens)"/>`,
    `<rect x="${ringInset}" y="${ringInset}" width="${ringWidth}" height="${ringHeight}" rx="${radius}" fill="none" stroke="white" stroke-opacity="0.3" stroke-width="${Math.max(ringInset, 1)}"/>`,
    '</svg>',
  ].join('');

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const FILTERS: LiquidGlassFilterDefinition[] = [
  {
    blueOffset: 20,
    id: LIQUID_GLASS_FILTER_IDS.dock,
    map: createDisplacementMap({ width: 368, height: 80, radius: 40, border: 0.08, blur: 7, lightness: 55 }),
    outputBlur: 0.12,
    scale: -92,
  },
  {
    blueOffset: 14,
    id: LIQUID_GLASS_FILTER_IDS.bubble,
    map: createDisplacementMap({ width: 72, height: 72, radius: 36, border: 0.12, blur: 5.5, lightness: 56 }),
    outputBlur: 0.08,
    scale: -72,
  },
  {
    blueOffset: 16,
    id: LIQUID_GLASS_FILTER_IDS.pill,
    map: createDisplacementMap({ width: 224, height: 56, radius: 28, border: 0.1, blur: 6, lightness: 55 }),
    outputBlur: 0.1,
    scale: -78,
  },
  {
    blueOffset: 10,
    id: LIQUID_GLASS_FILTER_IDS.field,
    map: createDisplacementMap({ width: 288, height: 46, radius: 10, border: 0.14, blur: 4.5, lightness: 56, alpha: 0.8 }),
    outputBlur: 0.08,
    scale: -56,
  },
  {
    blueOffset: 12,
    id: LIQUID_GLASS_FILTER_IDS.panel,
    map: createDisplacementMap({ width: 336, height: 220, radius: 28, border: 0.08, blur: 8, lightness: 53, alpha: 0.74 }),
    outputBlur: 0.12,
    scale: -58,
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
