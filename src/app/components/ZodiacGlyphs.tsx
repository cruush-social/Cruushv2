import type { ImgHTMLAttributes } from 'react';
import ariesRaster from '../assets/ui-icons/zodiac-aries-3382481.png';
import taurusRaster from '../assets/ui-icons/zodiac-taurus-3382307.png';
import geminiRaster from '../assets/ui-icons/zodiac-gemini-3382287.png';
import cancerRaster from '../assets/ui-icons/zodiac-cancer-3382284.png';
import leoRaster from '../assets/ui-icons/zodiac-leo-3382288.png';
import virgoRaster from '../assets/ui-icons/zodiac-virgo-3382302.png';
import libraRaster from '../assets/ui-icons/zodiac-libra-3382292.png';
import scorpioRaster from '../assets/ui-icons/zodiac-scorpio-3382309.png';
import sagittariusRaster from '../assets/ui-icons/zodiac-sagittarius-3382308.png';
import capricornRaster from '../assets/ui-icons/zodiac-capricorn-3382282.png';
import aquariusRaster from '../assets/ui-icons/zodiac-aquarius-3382480.png';
import piscesRaster from '../assets/ui-icons/zodiac-pisces-3382305.png';

/**
 * The twelve signs from one Noun Project collection by monkik, so they read as
 * one family rather than twelve borrowed marks. Each raster ships with its own
 * LICENSE.md beside it recording the source, the credit and the checksum.
 *
 * Drawn as a mask filled with currentColor, the way the other sourced badge
 * icons are, so a sign takes the flat white or gradient finish badges use.
 */
const ZODIAC_RASTERS: Record<string, string> = {
  aries: ariesRaster,
  taurus: taurusRaster,
  gemini: geminiRaster,
  cancer: cancerRaster,
  leo: leoRaster,
  virgo: virgoRaster,
  libra: libraRaster,
  scorpio: scorpioRaster,
  sagittarius: sagittariusRaster,
  capricorn: capricornRaster,
  aquarius: aquariusRaster,
  pisces: piscesRaster,
};

export const ZODIAC_SIGNS = Object.keys(ZODIAC_RASTERS);

export function ZodiacGlyph({ className, sign, ...props }: ImgHTMLAttributes<HTMLSpanElement> & { sign: string }) {
  const source = ZODIAC_RASTERS[sign.trim().toLowerCase()];

  if (!source) {
    return null;
  }

  const maskImage = `url(${source})`;

  return (
    <span
      aria-hidden="true"
      className={className}
      data-zodiac-sign={sign.trim().toLowerCase()}
      style={{
        // An inline span ignores width and height, so a caller passing only
        // sizing classes would render nothing at all.
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
      }}
      {...props}
    />
  );
}

export function zodiacGlyphFor(badgeId: string) {
  const sign = badgeId.trim().toLowerCase().replace(/^zodiac[-\s]+/, '');

  if (!ZODIAC_RASTERS[sign]) {
    return null;
  }

  return function ZodiacBadgeGlyph({ className }: { className?: string }) {
    return <ZodiacGlyph className={className} sign={sign} />;
  };
}
