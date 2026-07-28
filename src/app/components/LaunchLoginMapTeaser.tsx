import type { CSSProperties } from 'react';
import './LaunchLoginMapTeaser.css';

type TeaserStyle = CSSProperties & {
  '--x'?: string;
  '--y'?: string;
  '--w'?: string;
  '--rot'?: string;
  '--delay'?: string;
  '--scale'?: string;
};

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

function makeStyle(item: {
  x?: string;
  y?: string;
  w?: string;
  rot?: string;
  delay?: string;
  scale?: string;
}): TeaserStyle {
  return {
    '--x': item.x,
    '--y': item.y,
    '--w': item.w,
    '--rot': item.rot,
    '--delay': item.delay,
    '--scale': item.scale,
  };
}

export default function LaunchLoginMapTeaser() {
  return (
    <div
      aria-hidden="true"
      className="launch-login-map-teaser"
      data-testid="launch-login-map-teaser"
    >
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
      <div className="launch-login-map-teaser__shade" />
    </div>
  );
}
