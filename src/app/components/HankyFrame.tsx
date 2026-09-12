import paisley515105 from '../assets/ui-icons/paisley-515105.png';
import { HEART_PIN_THEMES } from '../lib/heartPin';

export type HankyColor = {
  id: string;
  label: string;
  /** What the colour means in the code, said plainly. */
  meaning: string;
  color: string;
};

export const HANKY_COLORS: HankyColor[] = [
  { id: 'black', label: 'black', meaning: 'S&M', color: '#1A1A1E' },
  { id: 'grey', label: 'white', meaning: 'bondage', color: '#FFFFFF' },
  { id: 'lime', label: 'lime', meaning: 'mutual masturbation', color: '#B8FF2C' },
  { id: 'dark-blue', label: 'light blue', meaning: 'oral', color: '#62B6FF' },
  { id: 'orange', label: 'orange', meaning: 'anytime/anywhere', color: '#FF7A00' },
  { id: 'indigo', label: 'dark blue', meaning: 'fucking', color: '#1F3A93' },
  { id: 'red', label: 'red', meaning: 'fisting', color: '#E30613' },
  { id: 'yellow', label: 'yellow', meaning: 'watersports', color: '#F2C230' },
  { id: 'purple', label: 'purple', meaning: 'toys', color: '#7A3CB8' },
  { id: 'pink', label: 'light pink', meaning: 'mommy', color: '#F06AA8' },
  { id: 'fuchsia', label: 'dark pink', meaning: 'nipple play', color: '#C2185B' },
  { id: 'teal', label: 'teal', meaning: 'tribbing/frotting', color: '#00C2B8' },
  { id: 'tan', label: 'tan', meaning: 'heavy petting', color: '#D2B48C' },
  { id: 'lavender', label: 'lavender', meaning: 'crossdressing', color: '#B57EDC' },
  { id: 'mint-green', label: 'mint green', meaning: 'discreet', color: '#98FF98' },
  { id: 'gold', label: 'gold', meaning: 'threesomes/groups', color: '#D4AF37' },
  { id: 'magenta', label: 'magenta', meaning: 'pits', color: '#B5179E' },
  { id: 'hunter-green', label: 'hunter green', meaning: 'daddy', color: '#2F5D3A' },
];

function hankyDetailColor(color: string) {
  return color.toUpperCase() === '#1A1A1E' ? '#FFFFFF' : '#05050A';
}
export function HankyPaisleyIcon({
  className,
  color,
  label,
}: {
  className?: string;
  color: string;
  label: string;
}) {
  const maskImage = `url(${paisley515105})`;

  return (
    <span
      aria-label={label}
      className={`relative inline-block shrink-0 overflow-hidden ${className ?? ''}`}
      role="img"
    >
      <span
        className="absolute inset-0"
        style={{ backgroundColor: hankyDetailColor(color) }}
      />
      <span
        className="absolute inset-0 scale-[1.12]"
        style={{
          backgroundColor: color,
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
    </span>
  );
}

/**
 * Exact selected source: "Paisley" by Wes Breazell from Noun Project.
 * https://thenounproject.com/icon/paisley-515105/
 *
 * Every Hanky icon uses this one source image, size, and rotation. The source
 * image's transparent ornament reads black, its black fill changes to the
 * selected Hanky color, and its own diamond edge uses the pin unit color. The
 * source's 25px transparent margin is scaled beyond the inner square so the
 * paisley uses the available space without creating a second white border.
 */
export function HankyFrame({
  className,
  color = '#D62828',
  unitColor = HEART_PIN_THEMES.current.border,
}: {
  className?: string;
  color?: string;
  unitColor?: string;
}) {
  const maskImage = `url(${paisley515105})`;
  const detailColor = hankyDetailColor(color);

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center ${className ?? ''}`}
    >
      <span
        className="relative block h-full w-full rotate-45"
        style={{ backgroundColor: unitColor }}
      >
        <span className="absolute inset-[3.2px] overflow-hidden">
          <span className="absolute inset-[0.5px]" style={{ backgroundColor: detailColor }} />
          <span
            className="absolute inset-0 scale-[1.12]"
            style={{
              backgroundColor: color,
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
        </span>
      </span>
    </span>
  );
}
