import { useEffect, useState, type CSSProperties } from 'react';
import './LaunchLoginMapTeaser.css';

type TeaserStyle = CSSProperties & {
  '--x'?: string;
  '--y'?: string;
  '--tx'?: string;
  '--ty'?: string;
  '--h'?: string;
  '--duration'?: string;
  '--drift'?: string;
  '--drift-end'?: string;
  '--w'?: string;
  '--rot'?: string;
  '--delay'?: string;
  '--scale'?: string;
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
const MOBILE_TEASER_VIDEO = '/teasers/launch-login-teaser-mobile.webm';
const MOBILE_VIDEO_QUERY = '(max-width: 640px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const STREETS = [
  { id: 'hudson', kind: 'major', x: '4%', y: '42%', w: '92%', rot: '-17deg' },
  { id: 'canal', kind: 'major', x: '18%', y: '64%', w: '76%', rot: '-9deg' },
  { id: 'broadway', kind: 'major', x: '23%', y: '12%', w: '96%', rot: '31deg' },
  { id: 'houston', kind: 'minor', x: '9%', y: '28%', w: '78%', rot: '7deg' },
  { id: 'bleecker', kind: 'minor', x: '14%', y: '35%', w: '62%', rot: '-3deg' },
  { id: 'christopher', kind: 'minor', x: '5%', y: '52%', w: '72%', rot: '14deg' },
  { id: 'prince', kind: 'minor', x: '29%', y: '75%', w: '58%', rot: '2deg' },
  { id: 'bowery', kind: 'minor', x: '60%', y: '18%', w: '74%', rot: '72deg' },
  { id: 'sixth', kind: 'minor', x: '38%', y: '8%', w: '82%', rot: '79deg' },
  { id: 'eighth', kind: 'minor', x: '18%', y: '10%', w: '72%', rot: '83deg' },
];

const PINS = [
  { id: 'pin-west', variant: 'pink', x: '21%', y: '39%', scale: '0.9', delay: '-2s' },
  { id: 'pin-village', variant: 'blue', x: '37%', y: '54%', scale: '1.04', delay: '-9s' },
  { id: 'pin-soho', variant: 'mutual', x: '59%', y: '45%', scale: '0.82', delay: '-15s' },
  { id: 'pin-east', variant: 'pink', x: '71%', y: '61%', scale: '0.96', delay: '-21s' },
  { id: 'pin-tribeca', variant: 'blue', x: '46%', y: '76%', scale: '0.74', delay: '-26s' },
  { id: 'pin-chelsea', variant: 'mutual', x: '29%', y: '20%', scale: '0.78', delay: '-18s' },
];

const GHOSTS = [
  { id: 'ghost-north', x: '17%', y: '24%', scale: '0.92', delay: '-4s' },
  { id: 'ghost-center', x: '52%', y: '31%', scale: '1.08', delay: '-13s' },
  { id: 'ghost-south', x: '78%', y: '71%', scale: '0.84', delay: '-20s' },
  { id: 'ghost-west', x: '33%', y: '67%', scale: '0.72', delay: '-28s' },
];

const RADIUS_RINGS = [
  { id: 'radius-village', x: '37%', y: '54%', scale: '1', delay: '-5s' },
  { id: 'radius-east', x: '71%', y: '61%', scale: '0.82', delay: '-17s' },
  { id: 'radius-north', x: '52%', y: '31%', scale: '0.94', delay: '-24s' },
];

const ACTIVITY_SIGNALS = [
  { id: 'signal-one', x: '19%', y: '43%', tx: '12rem', ty: '-3rem', scale: '0.9', delay: '-1s' },
  { id: 'signal-two', x: '68%', y: '27%', tx: '-10rem', ty: '7rem', scale: '0.75', delay: '-7s' },
  { id: 'signal-three', x: '43%', y: '73%', tx: '9rem', ty: '-8rem', scale: '1', delay: '-13s' },
  { id: 'signal-four', x: '82%', y: '62%', tx: '-13rem', ty: '-2rem', scale: '0.82', delay: '-19s' },
  { id: 'signal-five', x: '31%', y: '18%', tx: '6rem', ty: '11rem', scale: '0.7', delay: '-25s' },
];

const CLUB_BEAMS = [
  { id: 'club-pink-left', variant: 'pink', x: '-18%', y: '10%', w: '35rem', h: '9rem', rot: '31deg', delay: '-1s' },
  { id: 'club-blue-right', variant: 'blue', x: '44%', y: '6%', w: '38rem', h: '10rem', rot: '143deg', delay: '-8s' },
  { id: 'club-cyan-low', variant: 'cyan', x: '10%', y: '48%', w: '34rem', h: '7rem', rot: '-18deg', delay: '-14s' },
  { id: 'club-violet-mid', variant: 'violet', x: '30%', y: '30%', w: '33rem', h: '8rem', rot: '12deg', delay: '-20s' },
  { id: 'club-pink-floor', variant: 'pink', x: '-8%', y: '68%', w: '30rem', h: '8rem', rot: '-8deg', delay: '-25s' },
];

const DROPLETS = [
  { id: 'drop-one', x: '8%', y: '-18%', w: '0.82rem', h: '8rem', duration: '30s', drift: '0.55rem', driftEnd: '-0.2rem', delay: '-1s' },
  { id: 'drop-two', x: '17%', y: '-26%', w: '1rem', h: '12rem', duration: '30s', drift: '-0.35rem', driftEnd: '0.15rem', delay: '-9s' },
  { id: 'drop-three', x: '29%', y: '-14%', w: '0.68rem', h: '6.5rem', duration: '30s', drift: '0.25rem', driftEnd: '-0.1rem', delay: '-16s' },
  { id: 'drop-four', x: '43%', y: '-32%', w: '1.08rem', h: '15rem', duration: '30s', drift: '0.75rem', driftEnd: '-0.25rem', delay: '-5s' },
  { id: 'drop-five', x: '58%', y: '-20%', w: '0.9rem', h: '9.5rem', duration: '30s', drift: '-0.5rem', driftEnd: '0.2rem', delay: '-21s' },
  { id: 'drop-six', x: '72%', y: '-28%', w: '0.96rem', h: '13rem', duration: '30s', drift: '0.4rem', driftEnd: '-0.15rem', delay: '-12s' },
  { id: 'drop-seven', x: '86%', y: '-16%', w: '0.72rem', h: '7.25rem', duration: '30s', drift: '-0.25rem', driftEnd: '0.1rem', delay: '-25s' },
  { id: 'drop-eight', x: '94%', y: '-34%', w: '0.86rem', h: '11rem', duration: '30s', drift: '0.6rem', driftEnd: '-0.2rem', delay: '-18s' },
  { id: 'drop-nine', x: '35%', y: '-22%', w: '0.48rem', h: '5.6rem', duration: '30s', drift: '-0.22rem', driftEnd: '0.08rem', delay: '-3s' },
  { id: 'drop-ten', x: '64%', y: '-12%', w: '0.54rem', h: '6.2rem', duration: '30s', drift: '0.18rem', driftEnd: '-0.07rem', delay: '-14s' },
  { id: 'drop-eleven', x: '78%', y: '-19%', w: '0.44rem', h: '4.8rem', duration: '30s', drift: '-0.12rem', driftEnd: '0.05rem', delay: '-7s' },
  { id: 'drop-twelve', x: '12%', y: '-9%', w: '0.5rem', h: '5.4rem', duration: '30s', drift: '0.16rem', driftEnd: '-0.05rem', delay: '-23s' },
];

const CLEAR_TRAILS = [
  { id: 'trail-one', x: '8.1%', y: '-4vh', w: '1.18rem', h: '116vh', duration: '30s', drift: '0.42rem', driftEnd: '-0.16rem', rot: '-1.4deg', delay: '-1s', bend: '0.42rem' },
  { id: 'trail-two', x: '17.2%', y: '-8vh', w: '1.34rem', h: '124vh', duration: '30s', drift: '-0.28rem', driftEnd: '0.12rem', rot: '0.8deg', delay: '-9s', bend: '-0.32rem' },
  { id: 'trail-four', x: '43.3%', y: '-10vh', w: '1.52rem', h: '132vh', duration: '30s', drift: '0.62rem', driftEnd: '-0.2rem', rot: '-0.7deg', delay: '-5s', bend: '0.54rem' },
  { id: 'trail-logo', x: '50.4%', y: '-7vh', w: '1.18rem', h: '122vh', duration: '30s', drift: '0.28rem', driftEnd: '-0.14rem', rot: '0.4deg', delay: '-16s', bend: '0.16rem' },
  { id: 'trail-six', x: '72.3%', y: '-9vh', w: '1.26rem', h: '128vh', duration: '30s', drift: '0.36rem', driftEnd: '-0.12rem', rot: '-1deg', delay: '-12s', bend: '0.28rem' },
  { id: 'trail-eight', x: '94.2%', y: '-11vh', w: '1.12rem', h: '122vh', duration: '30s', drift: '0.5rem', driftEnd: '-0.18rem', rot: '-1.5deg', delay: '-18s', bend: '0.42rem' },
];

function makeStyle(item: {
  x?: string;
  y?: string;
  tx?: string;
  ty?: string;
  h?: string;
  duration?: string;
  drift?: string;
  driftEnd?: string;
  w?: string;
  rot?: string;
  delay?: string;
  scale?: string;
  bend?: string;
}): TeaserStyle {
  return {
    '--x': item.x,
    '--y': item.y,
    '--tx': item.tx,
    '--ty': item.ty,
    '--h': item.h,
    '--duration': item.duration,
    '--drift': item.drift,
    '--drift-end': item.driftEnd,
    '--w': item.w,
    '--rot': item.rot,
    '--delay': item.delay,
    '--scale': item.scale,
    '--bend': item.bend,
  };
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
          preload={isMobileRecording ? 'auto' : 'metadata'}
          src={videoSource}
        />
      ) : null}
      <svg className="launch-login-map-teaser__filters" focusable="false">
        <filter id="launch-login-water-shimmer">
          <feTurbulence
            baseFrequency="0.012 0.038"
            numOctaves="2"
            result="waterNoise"
            seed="7"
          >
            <animate
              attributeName="baseFrequency"
              dur="30s"
              repeatCount="indefinite"
              values="0.012 0.038;0.018 0.052;0.01 0.044;0.012 0.038"
            />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="waterNoise" scale="2.8" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="launch-login-map-teaser__phone-glow" />
      <div className="launch-login-map-teaser__club" data-testid="launch-login-club-lights">
        <span className="launch-login-map-teaser__club-stage" />
        {CLUB_BEAMS.map((beam) => (
          <span
            className={`launch-login-map-teaser__club-beam launch-login-map-teaser__club-beam--${beam.variant}`}
            data-testid="launch-login-club-beam"
            key={beam.id}
            style={makeStyle(beam)}
          />
        ))}
        <span className="launch-login-map-teaser__club-laser launch-login-map-teaser__club-laser--pink" />
        <span className="launch-login-map-teaser__club-laser launch-login-map-teaser__club-laser--cyan" />
      </div>
      <div className="launch-login-map-teaser__brand-mark" data-testid="launch-login-brand-mark" />
      <div className="launch-login-map-teaser__map" data-testid="launch-login-map-scene">
        <div className="launch-login-map-teaser__blocks" />
        <div className="launch-login-map-teaser__streets">
          {STREETS.map((street) => (
            <span
              className={`launch-login-map-teaser__street launch-login-map-teaser__street--${street.kind}`}
              data-testid="launch-login-map-street"
              key={street.id}
              style={makeStyle(street)}
            />
          ))}
        </div>

        {RADIUS_RINGS.map((ring) => (
          <span
            className="launch-login-map-teaser__radius-ring"
            data-testid="launch-login-radius-ring"
            key={ring.id}
            style={makeStyle(ring)}
          />
        ))}

        {ACTIVITY_SIGNALS.map((signal) => (
          <span
            className="launch-login-map-teaser__activity-signal"
            data-testid="launch-login-activity-signal"
            key={signal.id}
            style={makeStyle(signal)}
          />
        ))}

        {GHOSTS.map((ghost) => (
          <span
            className="launch-login-map-teaser__ghost"
            data-testid="launch-login-ghost-person"
            key={ghost.id}
            style={makeStyle(ghost)}
          >
            <span className="launch-login-map-teaser__ghost-head" />
            <span className="launch-login-map-teaser__ghost-body" />
          </span>
        ))}

        {PINS.map((pin) => (
          <span
            className={`launch-login-map-teaser__pin launch-login-map-teaser__pin--${pin.variant}`}
            data-testid="launch-login-gradient-pin"
            key={pin.id}
            style={makeStyle(pin)}
          >
            <span className="launch-login-map-teaser__pin-halo" />
            <span className="launch-login-map-teaser__pin-heart">
              <span className="launch-login-map-teaser__pin-heart-shape" />
            </span>
          </span>
        ))}
      </div>

      <div className="launch-login-map-teaser__ui launch-login-map-teaser__ui--left">
        <span className="launch-login-map-teaser__logo-mark">cruush</span>
        <span className="launch-login-map-teaser__pill">NYC beta</span>
      </div>
      <div className="launch-login-map-teaser__ui launch-login-map-teaser__ui--right">
        <span className="launch-login-map-teaser__pill launch-login-map-teaser__pill--ghost">Ghost Mode Active</span>
        <span className="launch-login-map-teaser__pill">Seeking</span>
        <span className="launch-login-map-teaser__pill">Visibility</span>
      </div>

      <div className="launch-login-map-teaser__frost" data-testid="launch-login-frosted-glass" />
      <div className="launch-login-map-teaser__steam" data-testid="launch-login-steamy-glass">
        <span className="launch-login-map-teaser__water-beads" />
        {DROPLETS.map((droplet) => (
          <span
            className="launch-login-map-teaser__droplet"
            data-testid="launch-login-water-droplet"
            key={droplet.id}
            style={makeStyle(droplet)}
          >
            <span className="launch-login-map-teaser__droplet-clear" />
            <span className="launch-login-map-teaser__droplet-bead" />
          </span>
        ))}
      </div>
      <div className="launch-login-map-teaser__shade" />
    </div>
  );
}

export function LaunchLoginWaterPane({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`launch-login-map-teaser__water-pane ${className}`.trim()}
      data-testid="launch-login-foreground-water-pane"
    >
      <span className="launch-login-map-teaser__water-beads" />
      {CLEAR_TRAILS.map((trail) => (
        <span
          className="launch-login-map-teaser__clear-trail"
          data-testid="launch-login-clear-trail"
          key={trail.id}
          style={makeStyle(trail)}
        />
      ))}
      {DROPLETS.map((droplet) => (
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
