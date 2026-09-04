import pillowPrincessRaster from '../assets/ui-icons/pillow-princess-raster.png';
import serviceRaster from '../assets/ui-icons/service-6745554.png';
import stoneTopRaster from '../assets/ui-icons/stone-top-raster.png';
import {
  Activity,
  Axe,
  Bone,
  CircleArrowDown,
  Drama,
  Dumbbell,
  Feather,
  Gavel,
  Hand,
  HandHeart,
  Handshake,
  HeartHandshake,
  HeartCrack,
  KeyRound,
  Megaphone,
  PawPrint,
  Rabbit,
  Rat,
  Spline,
  Sun,
} from 'lucide-react';
import { BottomSwitchEmblem, DomEmblem, SubEmblem, SwitchEmblem, TopSwitchEmblem } from './BdsmEmblems';
import { LipsGlyph } from './BadgeGlyphs';

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

/** A snake, coiled from tail to raised head, for the Hunter role. */
export function SnakeGlyph({ className, strokeWidth = 2 }: GlyphProps) {
  return (
    <Glyph className={className} strokeWidth={strokeWidth}>
      <path d="M4.4 18.8c3.4 0 3.4-3.4 6.8-3.4s3.4 3.4 6.8 3.4c2 0 2.6-1.2 2.6-2.6 0-2-1.8-2.8-3.6-3.4-2.6-.9-4.6-1.7-4.6-4 0-2 1.7-3.6 3.9-3.6 1.8 0 3 .9 3.6 2" />
      <circle cx="19.1" cy="6.6" r="0.9" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/** A baby rattle for the Little role. */
export function RattleGlyph({ className, strokeWidth = 2 }: GlyphProps) {
  return (
    <Glyph className={className} strokeWidth={strokeWidth}>
      <circle cx="9" cy="8" r="5" />
      <circle cx="9" cy="8" r="1.6" fill="currentColor" stroke="none" />
      <path d="m12.7 11.6 4.4 4.4" />
      <circle cx="18.6" cy="17.5" r="2.4" />
    </Glyph>
  );
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
      {/* The two marks sit corner to corner, drawn large enough that their
          boxes meet in the middle. The drawn shapes stay clear of their own
          corners, so nothing covers anything: the role emblem must never hide
          part of the service or pleasure mark underneath it. */}
      {kind === 'service' ? (
        <ServiceGlyph className="absolute left-0 top-0 h-[56%] w-[56%] opacity-90" />
      ) : (
        <svg className="absolute left-0 top-0 h-[56%] w-[56%]" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
          <path d="M12 20.4 4.5 13A5 5 0 0 1 12 6.4 5 5 0 0 1 19.5 13Z" />
        </svg>
      )}
      <RoleMark className="absolute bottom-0 right-0 h-[50%] w-[50%] rounded-full bg-[#05050A]" />
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
  // Saved profiles carry every spelling this value has had. All of them draw
  // the same mark, so nobody's badge shows a different vers icon because of
  // when they picked it.
  vers: VersatileGlyph,
  // The badge menu has drawn vers top and vers bottom as the switch hexagon
  // with a top or bottom mark inside it since they were added. The map and the
  // cards were drawing their own arrow glyphs for the same values, which is why
  // the same position showed a different icon depending on the surface.
  'vers top': TopSwitchEmblem,
  'versatile top': TopSwitchEmblem,
  'vers bottom': BottomSwitchEmblem,
  'versatile bottom': BottomSwitchEmblem,
  side: SideGlyph,
  'stone top': StoneTopGlyph,
  'stone bottom': PillowPrincessGlyph,
  'pillow princess': PillowPrincessGlyph,
  'hands only': Hand,
  'oral only': LipsGlyph,
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
  worship: HeartHandshake,
  worshipper: HeartHandshake,
  worshipped: Sun,
  handler: Handshake,
  pet: Bone,
  brat: Drama,
  'brat tamer': Gavel,
  caregiver: HandHeart,
  degradee: CircleArrowDown,
  degrader: Megaphone,
  little: RattleGlyph,
  masochist: HeartCrack,
  owner: KeyRound,
  prey: Rat,
  hunter: SnakeGlyph,
  rigger: Spline,
  'rope bunny': Rabbit,
  sadist: Axe,
  sadomasochist: Activity,
  trainer: Dumbbell,
};

export function positionGlyphFor(value: string | null | undefined) {
  return value ? POSITION_GLYPHS[value.trim().toLowerCase()] ?? null : null;
}

export function roleGlyphFor(value: string | null | undefined) {
  return value ? ROLE_GLYPHS[value.trim().toLowerCase()] ?? null : null;
}
