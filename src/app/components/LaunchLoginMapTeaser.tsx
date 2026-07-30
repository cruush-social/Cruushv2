import { useEffect, useState, type CSSProperties } from 'react';
import './LaunchLoginMapTeaser.css';

type TeaserStyle = CSSProperties & {
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

export type LaunchLoginMapTeaserPlaybackState = {
  isMobileRecording: boolean;
  isReady: boolean;
};

type LaunchLoginMapTeaserProps = {
  onPlaybackStateChange?: (state: LaunchLoginMapTeaserPlaybackState) => void;
};

const DESKTOP_TEASER_VIDEO = '/teasers/launch-login-teaser-desktop.webm';
const MOBILE_TEASER_VIDEO = '/teasers/launch-login-teaser-mobile.mp4';
const MOBILE_VIDEO_QUERY = '(max-width: 640px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

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

const MOBILE_DROPLETS = DROPLETS.filter((_, index) => index % 2 === 0);
const MOBILE_CLEAR_TRAILS = CLEAR_TRAILS.filter((_, index) => index % 2 === 0);

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
}): TeaserStyle {
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

function getTeaserVideoSource() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return DESKTOP_TEASER_VIDEO;
  }

  if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
    return null;
  }

  return window.matchMedia(MOBILE_VIDEO_QUERY).matches ? MOBILE_TEASER_VIDEO : DESKTOP_TEASER_VIDEO;
}

export default function LaunchLoginMapTeaser({ onPlaybackStateChange }: LaunchLoginMapTeaserProps = {}) {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoSource, setVideoSource] = useState<string | null>(() => getTeaserVideoSource());
  const isMobileRecording = videoSource === MOBILE_TEASER_VIDEO;
  const teaserClassName = [
    'launch-login-map-teaser',
    isVideoReady ? 'launch-login-map-teaser--video-ready' : '',
    isMobileRecording ? 'launch-login-map-teaser--mobile-recording' : '',
  ].filter(Boolean).join(' ');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mobileQuery = window.matchMedia(MOBILE_VIDEO_QUERY);
    const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const updateVideoSource = () => {
      setIsVideoReady(false);
      setVideoSource(reducedMotionQuery.matches
        ? null
        : mobileQuery.matches
          ? MOBILE_TEASER_VIDEO
          : DESKTOP_TEASER_VIDEO);
    };

    updateVideoSource();
    mobileQuery.addEventListener?.('change', updateVideoSource);
    reducedMotionQuery.addEventListener?.('change', updateVideoSource);

    return () => {
      mobileQuery.removeEventListener?.('change', updateVideoSource);
      reducedMotionQuery.removeEventListener?.('change', updateVideoSource);
    };
  }, []);

  useEffect(() => {
    onPlaybackStateChange?.({
      isMobileRecording,
      isReady: Boolean(videoSource && isVideoReady),
    });
  }, [isMobileRecording, isVideoReady, onPlaybackStateChange, videoSource]);

  return (
    <div
      aria-hidden="true"
      className={teaserClassName}
      data-testid="launch-login-map-teaser"
    >
      {videoSource ? (
        <video
          aria-hidden="true"
          autoPlay
          className="launch-login-map-teaser__video"
          data-testid="launch-login-teaser-video"
          key={videoSource}
          loop
          muted
          onCanPlay={() => setIsVideoReady(true)}
          onError={() => setIsVideoReady(false)}
          playsInline
          preload="metadata"
          src={videoSource}
        />
      ) : (
        <div className="launch-login-map-teaser__ambient-fallback" data-testid="launch-login-ambient-fallback" />
      )}
      <div className="launch-login-map-teaser__video-logo-scrub" data-testid="launch-login-video-logo-scrub" />
      <div className="launch-login-map-teaser__mobile-pulse" data-testid="launch-login-mobile-pulse" />
      <div className="launch-login-map-teaser__shade" data-testid="launch-login-video-shade" />
    </div>
  );
}

export function LaunchLoginWaterPane({ className = '' }: { className?: string }) {
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
      className={`launch-login-map-teaser__water-pane${isMobileViewport ? ' launch-login-map-teaser__water-pane--mobile-lite' : ''} ${className}`.trim()}
      data-testid="launch-login-foreground-water-pane"
    >
      <span className="launch-login-map-teaser__water-beads" />
      {trails.map((trail) => (
        <span
          className="launch-login-map-teaser__clear-trail"
          data-testid="launch-login-clear-trail"
          key={trail.id}
          style={makeStyle(trail)}
        />
      ))}
      {droplets.map((droplet) => (
        <span
          className="launch-login-map-teaser__droplet"
          data-testid="launch-login-water-droplet"
          key={`foreground-${droplet.id}`}
          style={makeStyle(droplet)}
        >
          <span className="launch-login-map-teaser__droplet-clear" />
          <span className="launch-login-map-teaser__droplet-bead" />
        </span>
      ))}
    </div>
  );
}
