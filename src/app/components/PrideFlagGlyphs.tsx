import { useId, type ReactNode } from 'react';

type FlagGlyphProps = {
  className?: string;
};

type StripeFlagProps = FlagGlyphProps & {
  colors: string[];
  children?: ReactNode;
};

function StripeFlag({ children, className, colors }: StripeFlagProps) {
  const stripeHeight = 24 / colors.length;
  const clipId = `pride-flag-rounding-${useId().replace(/:/g, '')}`;
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <defs>
        <clipPath id={clipId}>
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {colors.map((color, index) => (
          <rect fill={color} height={stripeHeight + 0.08} key={`${color}-${index}`} width="24" x="0" y={index * stripeHeight} />
        ))}
        {children}
      </g>
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
      <circle cx="12" cy="12" fill="none" r="4.5" stroke="#7902AA" strokeWidth="2.2" />
    </StripeFlag>
  );
}

export function DemisexualFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#FFFFFF', '#FFFFFF', '#6E0071', '#A4A4A4']}>
      <path d="M0 0 12 12 0 24Z" fill="#000000" />
    </StripeFlag>
  );
}

export function DemiromanticFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#FFFFFF', '#FFFFFF', '#3DA542', '#A9A9A9']}>
      <path d="M0 0 12 12 0 24Z" fill="#000000" />
    </StripeFlag>
  );
}

export function ProgressPrideFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#E40303', '#FF8C00', '#FFED00', '#008026', '#004DFF', '#750787']}>
      <path d="M0 0 14 12 0 24Z" fill="#000000" />
      <path d="M0 0 11.5 12 0 24Z" fill="#613915" />
      <path d="M0 0 9 12 0 24Z" fill="#5BCEFA" />
      <path d="M0 0 6.5 12 0 24Z" fill="#F5A9B8" />
      <path d="M0 0 4 12 0 24Z" fill="#FFFFFF" />
    </StripeFlag>
  );
}

export function LeatherFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#000000', '#2A2A7F', '#000000', '#2A2A7F', '#FFFFFF', '#2A2A7F', '#000000', '#2A2A7F', '#000000']}>
      <path d="M8.4 7.9C6.3 5.8 3.2 9.2 8.4 13.2 13.6 9.2 10.5 5.8 8.4 7.9Z" fill="#E70039" />
    </StripeFlag>
  );
}

export function BearFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#623804', '#D56300', '#FEDD63', '#FEE6B8', '#FFFFFF', '#555555', '#000000']}>
      <g fill="#000000">
        <circle cx="5.1" cy="7.2" r="1.15" />
        <circle cx="7.6" cy="5.7" r="1.15" />
        <circle cx="10.5" cy="5.9" r="1.15" />
        <circle cx="12.9" cy="7.8" r="1.15" />
        <path d="M6.1 10.1c.7-2.2 3.6-3.2 5.1-1.3 1.6 2 .2 4.7-2.3 4.7-2.2 0-3.5-1.5-2.8-3.4Z" />
      </g>
    </StripeFlag>
  );
}

export function BearPawGlyph({ className }: FlagGlyphProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="6" cy="8" r="2" />
      <circle cx="10" cy="5.7" r="2" />
      <circle cx="14.3" cy="6" r="2" />
      <circle cx="18" cy="8.8" r="2" />
      <path d="M7.5 14.1c1-3.3 5.4-4.7 7.7-1.9 2.4 3 .3 7-3.5 7-3.3 0-5.2-2.2-4.2-5.1Z" />
    </svg>
  );
}

export function PupFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#111111', '#1A2D50', '#FFFFFF', '#1A2D50', '#111111']}>
      <g fill="#D51D2F" transform="rotate(-9 12 12)">
        <rect height="3.8" rx="1.9" width="15" x="4.5" y="10.1" />
        <circle cx="4.6" cy="9.5" r="2.15" />
        <circle cx="4.6" cy="14.5" r="2.15" />
        <circle cx="19.4" cy="9.5" r="2.15" />
        <circle cx="19.4" cy="14.5" r="2.15" />
      </g>
    </StripeFlag>
  );
}

export function AllyFlagGlyph({ className }: FlagGlyphProps) {
  return (
    <StripeFlag className={className} colors={['#000000', '#FFFFFF', '#000000', '#FFFFFF', '#000000', '#FFFFFF']}>
      <path d="M4 20 12 3l8 17h-4.2L12 11.2 8.2 20Z" fill="url(#ally-rainbow)" />
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
