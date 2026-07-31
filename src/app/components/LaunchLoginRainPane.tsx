import { useEffect, useState, type CSSProperties } from 'react';
import './LaunchLoginRainPane.css';

type RainStyle = CSSProperties & {
  '--x'?: string;
  '--y'?: string;
  '--h'?: string;
  '--duration'?: string;
  '--drift'?: string;
  '--drift-end'?: string;
  '--w'?: string;
  '--rot'?: string;
  '--delay'?: string;
  '--bend'?: string;
};

const MOBILE_VIDEO_QUERY = '(max-width: 640px)';

const DROPLETS = [
  { id: 'drop-one', x: '8%', y: '-18%', w: '0.62rem', h: '6.4rem', duration: '19s', drift: '0.45rem', driftEnd: '-0.16rem', delay: '-1s' },
  { id: 'drop-two', x: '17%', y: '-26%', w: '0.72rem', h: '8.2rem', duration: '18s', drift: '-0.3rem', driftEnd: '0.12rem', delay: '-6s' },
  { id: 'drop-three', x: '29%', y: '-14%', w: '0.52rem', h: '5.2rem', duration: '20s', drift: '0.2rem', driftEnd: '-0.08rem', delay: '-10s' },
  { id: 'drop-four', x: '43%', y: '-32%', w: '0.78rem', h: '9.4rem', duration: '17s', drift: '0.56rem', driftEnd: '-0.18rem', delay: '-4s' },
  { id: 'drop-five', x: '58%', y: '-20%', w: '0.66rem', h: '7.1rem', duration: '21s', drift: '-0.42rem', driftEnd: '0.18rem', delay: '-12s' },
  { id: 'drop-six', x: '72%', y: '-28%', w: '0.72rem', h: '8.8rem', duration: '18s', drift: '0.35rem', driftEnd: '-0.12rem', delay: '-7s' },
  { id: 'drop-seven', x: '86%', y: '-16%', w: '0.56rem', h: '5.8rem', duration: '20s', drift: '-0.22rem', driftEnd: '0.08rem', delay: '-14s' },
  { id: 'drop-eight', x: '94%', y: '-34%', w: '0.62rem', h: '7.6rem', duration: '19s', drift: '0.46rem', driftEnd: '-0.16rem', delay: '-9s' },
  { id: 'drop-nine', x: '35%', y: '-22%', w: '0.42rem', h: '4.8rem', duration: '16s', drift: '-0.18rem', driftEnd: '0.06rem', delay: '-2s' },
  { id: 'drop-ten', x: '64%', y: '-12%', w: '0.44rem', h: '5.2rem', duration: '17s', drift: '0.16rem', driftEnd: '-0.06rem', delay: '-11s' },
  { id: 'drop-eleven', x: '78%', y: '-19%', w: '0.4rem', h: '4.4rem', duration: '18s', drift: '-0.1rem', driftEnd: '0.04rem', delay: '-5s' },
  { id: 'drop-twelve', x: '12%', y: '-9%', w: '0.42rem', h: '4.8rem', duration: '16s', drift: '0.14rem', driftEnd: '-0.04rem', delay: '-15s' },
];

const CLEAR_TRAILS = [
  { id: 'trail-one', x: '8.1%', y: '-4vh', w: '0.9rem', h: '112vh', duration: '24s', drift: '0.36rem', driftEnd: '-0.12rem', rot: '-1.4deg', delay: '-1s', bend: '0.34rem' },
  { id: 'trail-two', x: '17.2%', y: '-8vh', w: '1.02rem', h: '118vh', duration: '23s', drift: '-0.24rem', driftEnd: '0.1rem', rot: '0.8deg', delay: '-7s', bend: '-0.26rem' },
  { id: 'trail-three', x: '39.3%', y: '-10vh', w: '1.12rem', h: '124vh', duration: '25s', drift: '0.48rem', driftEnd: '-0.16rem', rot: '-0.7deg', delay: '-4s', bend: '0.42rem' },
  { id: 'trail-four', x: '56.4%', y: '-7vh', w: '0.9rem', h: '116vh', duration: '24s', drift: '0.24rem', driftEnd: '-0.12rem', rot: '0.4deg', delay: '-11s', bend: '0.14rem' },
  { id: 'trail-five', x: '72.3%', y: '-9vh', w: '0.96rem', h: '120vh', duration: '23s', drift: '0.3rem', driftEnd: '-0.1rem', rot: '-1deg', delay: '-8s', bend: '0.24rem' },
  { id: 'trail-six', x: '92.2%', y: '-11vh', w: '0.86rem', h: '114vh', duration: '22s', drift: '0.42rem', driftEnd: '-0.14rem', rot: '-1.5deg', delay: '-13s', bend: '0.34rem' },
];

const MOBILE_DROPLET_DURATIONS = ['9s', '8.4s', '9.6s', '8.8s'];
const MOBILE_CLEAR_TRAIL_DURATIONS = ['12s', '10.8s'];
const MOBILE_DROPLETS = DROPLETS
  .filter((_, index) => index % 3 === 0)
  .map((droplet, index) => ({
    ...droplet,
    duration: MOBILE_DROPLET_DURATIONS[index] ?? '9s',
  }));
const MOBILE_CLEAR_TRAILS = CLEAR_TRAILS
  .filter((_, index) => index % 3 === 0)
  .map((trail, index) => ({
    ...trail,
    duration: MOBILE_CLEAR_TRAIL_DURATIONS[index] ?? '12s',
  }));

function makeStyle(item: {
  x?: string;
  y?: string;
  h?: string;
  duration?: string;
  drift?: string;
  driftEnd?: string;
  w?: string;
  rot?: string;
  delay?: string;
  bend?: string;
}): RainStyle {
  return {
    '--x': item.x,
    '--y': item.y,
    '--h': item.h,
    '--duration': item.duration,
    '--drift': item.drift,
    '--drift-end': item.driftEnd,
    '--w': item.w,
    '--rot': item.rot,
    '--delay': item.delay,
    '--bend': item.bend,
  };
}

function getIsMobileViewport() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(MOBILE_VIDEO_QUERY).matches;
}

export default function LaunchLoginRainPane({ className = '' }: { className?: string }) {
  const [isMobileViewport, setIsMobileViewport] = useState(() => getIsMobileViewport());
  const trails = isMobileViewport ? MOBILE_CLEAR_TRAILS : CLEAR_TRAILS;
  const droplets = isMobileViewport ? MOBILE_DROPLETS : DROPLETS;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mobileQuery = window.matchMedia(MOBILE_VIDEO_QUERY);
    const updateMobileViewport = () => setIsMobileViewport(mobileQuery.matches);

    updateMobileViewport();
    mobileQuery.addEventListener?.('change', updateMobileViewport);

    return () => {
      mobileQuery.removeEventListener?.('change', updateMobileViewport);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`launch-login-rain-pane${isMobileViewport ? ' launch-login-rain-pane--mobile-lite' : ''} ${className}`.trim()}
      data-testid="launch-login-foreground-rain-pane"
    >
      <span className="launch-login-rain-pane__water-beads" />
      {trails.map((trail) => (
        <span
          className="launch-login-rain-pane__clear-trail"
          data-testid="launch-login-clear-trail"
          key={trail.id}
          style={makeStyle(trail)}
        />
      ))}
      {droplets.map((droplet) => (
        <span
          className="launch-login-rain-pane__droplet"
          data-testid="launch-login-water-droplet"
          key={`foreground-${droplet.id}`}
          style={makeStyle(droplet)}
        >
          <span className="launch-login-rain-pane__droplet-clear" />
          <span className="launch-login-rain-pane__droplet-bead" />
        </span>
      ))}
    </div>
  );
}
