import pillowPrincessRaster from '../assets/ui-icons/pillow-princess-raster.png';
import serviceRaster from '../assets/ui-icons/service-6745554.png';
import stoneTopRaster from '../assets/ui-icons/stone-top-raster.png';
import { DomEmblem, SubEmblem, SwitchEmblem } from './BdsmEmblems';

/**
 * Marks for the two badges a basic account carries: the role on one side of the
 * heart and the position on the other.
 *
 * Positions read as direction, which is the convention the hanky code already
 * set: up gives, down takes, both ways is both. Roles read as who is leading.
 * Every mark is drawn in the same line weight as the lucide icons beside them
 * so a row of badges reads as one set, and every one of them holds at the size
 * a badge chip renders, which is 25px.
 */

type GlyphProps = {
  className?: string;
  strokeWidth?: number;
};

function Glyph({ children, className, strokeWidth = 2 }: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

function NounProjectGlyph({ className, source }: GlyphProps & { source: string }) {
  const maskImage = `url(${source})`;

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        backgroundColor: 'currentColor',
        maskImage,
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
        maskSize: 'contain',
        WebkitMaskImage: maskImage,
        WebkitMaskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
      }}
    />
  );
}

/* Positions */

export function TopGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 19V6" />
      <path d="M6.5 11.5 12 5.5l5.5 6" />
    </Glyph>
  );
}

export function BottomGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 5v13" />
      <path d="M6.5 12.5 12 18.5l5.5-6" />
    </Glyph>
  );
}

export function VersatileGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* Both directions on one shaft: gives and takes equally. */}
      <path d="M12 4.5v15" />
      <path d="M7.5 9 12 4.5 16.5 9" />
      <path d="M7.5 15 12 19.5 16.5 15" />
    </Glyph>
  );
}

export function VersTopGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* Versatile, weighted up: the second head is smaller. */}
      <path d="M12 4.5v15" />
      <path d="M7.5 9 12 4.5 16.5 9" />
      <path d="M9.4 16.4 12 19 14.6 16.4" />
    </Glyph>
  );
}

export function VersBottomGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* Versatile, weighted down. */}
      <path d="M12 4.5v15" />
      <path d="M9.4 7.6 12 5l2.6 2.6" />
      <path d="M7.5 15 12 19.5 16.5 15" />
    </Glyph>
  );
}

export function SideGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      {/* Neither up nor down: the arrow lies on its side. */}
      <path d="M4.5 12h15" />
      <path d="M9 7.5 4.5 12 9 16.5" />
      <path d="M15 7.5 19.5 12 15 16.5" />
    </Glyph>
  );
}

export function StoneTopGlyph(props: GlyphProps) {
  return <NounProjectGlyph {...props} source={stoneTopRaster} />;
}

export function PillowPrincessGlyph(props: GlyphProps) {
  return <NounProjectGlyph {...props} source={pillowPrincessRaster} />;
}

/* Roles */

export function DominantGlyph(props: GlyphProps) {
  return <DomEmblem className={props.className} />;
}

export function SubmissiveGlyph(props: GlyphProps) {
  return <SubEmblem className={props.className} />;
}

export function SwitchGlyph(props: GlyphProps) {
  return <SwitchEmblem className={props.className} />;
}

export function ServiceGlyph(props: GlyphProps) {
  return <NounProjectGlyph {...props} source={serviceRaster} />;
}

function CompoundRoleGlyph({
  className,
  kind,
  role,
}: GlyphProps & { kind: 'pleasure' | 'service'; role: 'dom' | 'sub' | 'switch' }) {
  const RoleMark = role === 'dom' ? DomEmblem : role === 'sub' ? SubEmblem : SwitchEmblem;

  return (
    <span aria-hidden="true" className={`relative inline-flex ${className ?? ''}`}>
      {kind === 'service' ? (
        <ServiceGlyph className="absolute inset-[18%] h-[64%] w-[64%] opacity-90" />
      ) : (
        <svg className="absolute inset-[20%] h-[60%] w-[60%]" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
          <path d="M12 20.4 4.5 13A5 5 0 0 1 12 6.4 5 5 0 0 1 19.5 13Z" />
        </svg>
      )}
      <RoleMark className="absolute -bottom-[7%] -right-[7%] h-[54%] w-[54%] rounded-full bg-[#05050A]" />
    </span>
  );
}

export function ServiceDomGlyph(props: GlyphProps) {
  return <CompoundRoleGlyph {...props} kind="service" role="dom" />;
}

export function ServiceSubGlyph(props: GlyphProps) {
  return <CompoundRoleGlyph {...props} kind="service" role="sub" />;
}

export function ServiceSwitchGlyph(props: GlyphProps) {
  return <CompoundRoleGlyph {...props} kind="service" role="switch" />;
}

export function PleasureDomGlyph(props: GlyphProps) {
  return <CompoundRoleGlyph {...props} kind="pleasure" role="dom" />;
}

export function PleasureSubGlyph(props: GlyphProps) {
  return <CompoundRoleGlyph {...props} kind="pleasure" role="sub" />;
}

export function PleasureSwitchGlyph(props: GlyphProps) {
  return <CompoundRoleGlyph {...props} kind="pleasure" role="switch" />;
}

export const POSITION_GLYPHS: Record<string, (props: GlyphProps) => JSX.Element> = {
  top: TopGlyph,
  bottom: BottomGlyph,
  versatile: VersatileGlyph,
  'vers top': VersTopGlyph,
  'vers bottom': VersBottomGlyph,
  side: SideGlyph,
  'stone top': StoneTopGlyph,
  'pillow princess': PillowPrincessGlyph,
};

export const ROLE_GLYPHS: Record<string, (props: GlyphProps) => JSX.Element> = {
  dominant: DominantGlyph,
  submissive: SubmissiveGlyph,
  switch: SwitchGlyph,
  service: ServiceGlyph,
  'service dom': ServiceDomGlyph,
  'service sub': ServiceSubGlyph,
  'service switch': ServiceSwitchGlyph,
  'pleasure dom': PleasureDomGlyph,
  'pleasure sub': PleasureSubGlyph,
  'pleasure switch': PleasureSwitchGlyph,
};

export function positionGlyphFor(value: string | null | undefined) {
  return value ? POSITION_GLYPHS[value.trim().toLowerCase()] ?? null : null;
}

export function roleGlyphFor(value: string | null | undefined) {
  return value ? ROLE_GLYPHS[value.trim().toLowerCase()] ?? null : null;
}
