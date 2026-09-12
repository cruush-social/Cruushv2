import { createElement } from 'react';
import bimboRaster from '../assets/ui-icons/bimbo-flaticon-11431890.png';
import cheatingRaster from '../assets/ui-icons/cheating-noun-27256.png';
import bratRaster from '../assets/ui-icons/brat-flaticon-3638961.png';
import dollRaster from '../assets/ui-icons/doll-flaticon-16458752.png';
import exhibitionismRaster from '../assets/ui-icons/exhibitionism-noun-970491.png';
import filmingRaster from '../assets/ui-icons/filming-noun-3817923.png';
import fuckMachineRaster from '../assets/ui-icons/fuck-machine-flaticon-4648539.png';
import latexMaskRaster from '../assets/ui-icons/latex-mask-noun-3574195.png';
import masturbatorRaster from '../assets/ui-icons/masturbator-flaticon-16012048.png';
import mutualMasturbationRaster from '../assets/ui-icons/mutual-masturbation-flaticon-9463796.png';
import pacifierRaster from '../assets/ui-icons/pacifier-flaticon-483101.png';
import rubberGlovesRaster from '../assets/ui-icons/rubber-gloves-noun-4891935.png';
import sphRaster from '../assets/ui-icons/sph-noun-3883876.png';
import spitRoastRaster from '../assets/ui-icons/spit-roast-noun-759966.png';
import strapOnRaster from '../assets/ui-icons/strap-on-flaticon-16011932.png';

type GlyphProps = {
  className?: string;
  strokeWidth?: number;
};

function RasterBadgeGlyph({ className, source }: GlyphProps & { source: string }) {
  const maskImage = `url(${source})`;
  return createElement('span', {
    'aria-hidden': true,
    className,
    style: {
      display: 'inline-block',
      backgroundColor: 'currentColor',
      maskImage,
      maskPosition: 'center',
      maskRepeat: 'no-repeat',
      maskSize: 'contain',
      WebkitMaskImage: maskImage,
      WebkitMaskPosition: 'center',
      WebkitMaskRepeat: 'no-repeat',
      WebkitMaskSize: 'contain',
    },
  });
}


export function BimboGlyph({ className }: GlyphProps) {
  return createElement('svg', { 'aria-hidden': true, className, viewBox: '0 0 512 512', xmlns: 'http://www.w3.org/2000/svg' },
    createElement('path', { fill: '#000000', d: 'M231 157 244 153 304 169 317 216 311 225 244 225 237 204Z' }),
    createElement('path', { fill: '#000000', d: 'M242 283 277 292 304 284 338 273 343 283 317 308 291 312 239 299Z' }),
    createElement('image', { href: bimboRaster, width: 512, height: 512, style: { filter: 'brightness(0) invert(1)' } }),
  );
}

export function CheatingGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: cheatingRaster });
}

export function BratGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: bratRaster });
}

export function DollGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: dollRaster });
}

export function ExhibitionismGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: exhibitionismRaster });
}

export function FilmingGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: filmingRaster });
}

export function FuckMachineGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: fuckMachineRaster });
}

export function LatexMaskGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: latexMaskRaster });
}

export function MasturbatorGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: masturbatorRaster });
}

export function MutualMasturbationGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: mutualMasturbationRaster });
}

export function PacifierGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: pacifierRaster });
}

export function RubberGlovesGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: rubberGlovesRaster });
}

export function SmallPenisHumiliationGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: sphRaster });
}

export function SpitRoastGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: spitRoastRaster });
}

export function StrapOnGlyph(props: GlyphProps) {
  return RasterBadgeGlyph({ ...props, source: strapOnRaster });
}
