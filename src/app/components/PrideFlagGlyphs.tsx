import type { ReactNode } from 'react';

type FlagGlyphProps = {
  className?: string;
};

type StripeFlagProps = FlagGlyphProps & {
  colors: string[];
  children?: ReactNode;
};

function StripeFlag({ children, className, colors }: StripeFlagProps) {
  const stripeHeight = 20 / colors.length;
  return (
    <svg aria-hidden="true" className={className} preserveAspectRatio="xMidYMid meet" viewBox="0 0 28 20">
      <defs>
        <clipPath id="pride-flag-rounding">
          <rect height="20" rx="2.6" width="28" />
        </clipPath>
      </defs>
      <g clipPath="url(#pride-flag-rounding)">
        {colors.map((color, index) => (
          <rect fill={color} height={stripeHeight + 0.08} key={`${color}-${index}`} width="28" x="0" y={index * stripeHeight} />
        ))}
        {children}
      </g>
      <rect fill="none" height="19" rx="2.2" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" width="27" x="0.5" y="0.5" />
    </svg>
  );
}

function makeStripeFlag(colors: string[]) {
  return function PrideFlag({ className }: FlagGlyphProps) {
    return <StripeFlag className={className} colors={colors} />;
  };
}

export const RainbowFlagGlyph = makeStripeFlag(['#E40303', '#FF8C00', '#FFED00', '#008026', '#004DFF', '#750787']);
export const GayMenFlagGlyph = makeStripeFlag(['#078D70', '#26CEAA', '#98E8C1', '#FFFFFF', '#7BADE2', '#5049CC', '#3D1A78']);
export const LesbianFlagGlyph = makeStripeFlag(['#D52D00', '#EF7627', '#FF9A56', '#FFFFFF', '#D162A4', '#B55690', '#A30262']);
export const BisexualFlagGlyph = makeStripeFlag(['#D60270', '#D60270', '#9B4F96', '#0038A8', '#0038A8']);
export const PansexualFlagGlyph = makeStripeFlag(['#FF218C', '#FFD800', '#21B1FF']);
export const TransFlagGlyph = makeStripeFlag(['#5BCEFA', '#F5A9B8', '#FFFFFF', '#F5A9B8', '#5BCEFA']);
export const NonbinaryFlagGlyph = makeStripeFlag(['#FCF434', '#FFFFFF', '#9C59D1', '#2C2C2C']);
export const AceFlagGlyph = makeStripeFlag(['#000000', '#A3A3A3', '#FFFFFF', '#800080']);
export const AroFlagGlyph = makeStripeFlag(['#3DA542', '#A7D379', '#FFFFFF', '#A9A9A9', '#000000']);
export const GenderfluidFlagGlyph = makeStripeFlag(['#FF76A4', '#FFFFFF', '#C011D7', '#000000', '#2F3CBE']);
export const GenderqueerFlagGlyph = makeStripeFlag(['#B57EDC', '#FFFFFF', '#4A8123']);
export const AgenderFlagGlyph = makeStripeFlag(['#000000', '#B9B9B9', '#FFFFFF', '#B8F483', '#FFFFFF', '#B9B9B9', '#000000']);
export const PolysexualFlagGlyph = makeStripeFlag(['#F714BA', '#01D66A', '#1594F6']);
export const OmnisexualFlagGlyph = makeStripeFlag(['#FF9ACE', '#FF53BF', '#200044', '#6760FE', '#8EA6FF']);

export function IntersexFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#FFD800']}>
      <circle cx="14" cy="10" fill="none" r="4.2" stroke="#7902AA" strokeWidth="2.2" />
    </StripeFlag>
  );
}

export function DemisexualFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#FFFFFF', '#FFFFFF', '#6E0071', '#A4A4A4']}>
      <path d="M0 0 10 10 0 20Z" fill="#000000" />
    </StripeFlag>
  );
}

export function DemiromanticFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#FFFFFF', '#FFFFFF', '#3DA542', '#A9A9A9']}>
      <path d="M0 0 10 10 0 20Z" fill="#000000" />
    </StripeFlag>
  );
}

export function ProgressPrideFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#E40303', '#FF8C00', '#FFED00', '#008026', '#004DFF', '#750787']}>
      <path d="M0 0 12 10 0 20Z" fill="#000000" />
      <path d="M0 0 10 10 0 20Z" fill="#613915" />
      <path d="M0 0 8 10 0 20Z" fill="#5BCEFA" />
      <path d="M0 0 6 10 0 20Z" fill="#F5A9B8" />
      <path d="M0 0 4 10 0 20Z" fill="#FFFFFF" />
    </StripeFlag>
  );
}

export function LeatherFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#000000', '#2A2A7F', '#000000', '#2A2A7F', '#FFFFFF', '#2A2A7F', '#000000', '#2A2A7F', '#000000']}>
      <path d="M5.4 4.9C3.3 2.8.2 6.2 5.4 10.2 10.6 6.2 7.5 2.8 5.4 4.9Z" fill="#E70039" />
    </StripeFlag>
  );
}

export function BearFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#623804', '#D56300', '#FEDD63', '#FEE6B8', '#FFFFFF', '#555555', '#000000']}>
      <g fill="#000000">
        <circle cx="5.8" cy="7.2" r="1.1" />
        <circle cx="8.7" cy="6.1" r="1.1" />
        <circle cx="11.2" cy="7.6" r="1.1" />
        <circle cx="4.8" cy="10.1" r="1.1" />
        <path d="M6.2 10.2c1.2-2.1 4.6-1.1 4.8 1.3.2 2.2-1.9 3.6-4.1 2.6-1.7-.8-1.8-2.2-.7-3.9Z" />
      </g>
    </StripeFlag>
  );
}

export function PupFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#111111', '#1A2D50', '#FFFFFF', '#1A2D50', '#111111']}>
      <path d="M7.1 7.6a2 2 0 1 0-2.5-2.4L2.2 7.6a2 2 0 1 0 0 2.8l2.4 2.4a2 2 0 1 0 2.5-2.4h7.8a2 2 0 1 0 2.5 2.4l2.4-2.4a2 2 0 1 0 0-2.8l-2.4-2.4a2 2 0 1 0-2.5 2.4Z" fill="#D51D2F" transform="scale(.95) translate(1.4 .5)" />
    </StripeFlag>
  );
}

export function AllyFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#000000', '#FFFFFF', '#000000', '#FFFFFF', '#000000', '#FFFFFF']}>
      <path d="M6 18 14 2l8 16h-4.2L14 10.5 10.2 18Z" fill="url(#ally-rainbow)" />
      <defs>
        <linearGradient id="ally-rainbow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#E40303" />
          <stop offset="0.2" stopColor="#FF8C00" />
          <stop offset="0.4" stopColor="#FFED00" />
          <stop offset="0.6" stopColor="#008026" />
          <stop offset="0.8" stopColor="#004DFF" />
          <stop offset="1" stopColor="#750787" />
        </linearGradient>
      </defs>
    </StripeFlag>
  );
}
