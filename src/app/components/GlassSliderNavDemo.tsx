import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import cruushIconColored from '../assets/ui-icons/cruush-colored.png';
import cruushIconWhite from '../assets/ui-icons/cruush-white.png';
import feedIconColored from '../assets/ui-icons/feed-colored.png';
import feedIconWhite from '../assets/ui-icons/feed-white.png';
import mapIconColored from '../assets/ui-icons/map-colored.png';
import mapIconWhite from '../assets/ui-icons/map-white.png';
import messagesIconColored from '../assets/ui-icons/messages-colored.png';
import messagesIconWhite from '../assets/ui-icons/messages-white.png';
import profileIconColored from '../assets/ui-icons/profile-colored.png';
import profileIconWhite from '../assets/ui-icons/profile-white.png';

const navItems = [
  { icon: mapIconWhite, activeIcon: mapIconColored, label: 'Map' },
  { icon: feedIconWhite, activeIcon: feedIconColored, label: 'Feed' },
  { icon: cruushIconWhite, activeIcon: cruushIconColored, label: 'cruush' },
  { icon: messagesIconWhite, activeIcon: messagesIconColored, label: 'Messages' },
  { icon: profileIconWhite, activeIcon: profileIconColored, label: 'Profile' },
];

const BUBBLE_SIZE = 66;
const LENS_FILTER_ID = 'cruush-liquid-lens';
const PILL_FILTER_ID = 'cruush-liquid-pill';
const PILL_RESTING_SCALE = 150;

/**
 * Encodes a refraction field for a stadium (fully-rounded pill) as an
 * feDisplacementMap image: red = X displacement, green = Y displacement,
 * 128 = neutral. Vectors point inward and grow toward the rim following a
 * convex-squircle height profile, so the backdrop magnifies at the center of
 * the rim band and bends hard at the edge — the thick-glass-slab look.
 * A square size with rim = radius degenerates to a full convex lens (the
 * bubble). Chrome is the only engine that applies SVG filters via
 * backdrop-filter; elsewhere callers fall back to plain blur.
 */
function makeStadiumDisplacementMap(width: number, height: number, rim: number) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(width, height);
  const radius = height / 2;
  const innerHalfWidth = Math.max(width / 2 - radius, 0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5 - width / 2;
      const py = y + 0.5 - height / 2;
      const i = (y * width + x) * 4;

      // Distance to the stadium edge and the outward normal at the nearest
      // edge point: straight section above/below the core rect, circular caps
      // beyond it.
      const qx = Math.max(Math.abs(px) - innerHalfWidth, 0);
      let edgeDistance: number;
      let normalX = 0;
      let normalY = 0;

      if (qx === 0) {
        edgeDistance = radius - Math.abs(py);
        normalY = py === 0 ? 0 : Math.sign(py);
      } else {
        const capDistance = Math.hypot(qx, py);
        edgeDistance = radius - capDistance;
        if (capDistance > 0) {
          normalX = (Math.sign(px) * qx) / capDistance;
          normalY = py / capDistance;
        }
      }

      let vx = 0;
      let vy = 0;

      if (edgeDistance >= 0 && edgeDistance <= rim) {
        const t = edgeDistance / rim;
        const heightProfile = Math.pow(1 - Math.pow(1 - t, 4), 0.25);
        const magnitude = 1 - heightProfile;
        vx = -normalX * magnitude;
        vy = -normalY * magnitude;
      }

      image.data[i] = Math.round(128 + vx * 127);
      image.data[i + 1] = Math.round(128 + vy * 127);
      image.data[i + 2] = 128;
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

/**
 * jh3y's exact displacement map (codepen EajLxJV, dock defaults): red ramps
 * right-to-left, blue top-to-bottom (difference blend), then a blurred
 * mid-gray block-out neutralizes the center — leaving a soft nonlinear rim
 * band where the ramps bite. With his default scale -180 / x=R / y=B this is
 * the pen's strong liquid edge warp. Built as the same SVG markup he
 * serializes, just sized to our stadium pill.
 */
function makeCodepenDisplacementMap(width: number, height: number) {
  const radius = height / 2;
  const border = Math.min(width, height) * (0.07 * 0.5);
  const svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="red" x1="100%" y1="0%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#000"/>
      <stop offset="100%" stop-color="red"/>
    </linearGradient>
    <linearGradient id="blue" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000"/>
      <stop offset="100%" stop-color="blue"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="black"/>
  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#red)"/>
  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="url(#blue)" style="mix-blend-mode: difference"/>
  <rect x="${border}" y="${border}" width="${width - border * 2}" height="${height - border * 2}" rx="${radius}" fill="hsl(0 0% 50% / 0.96)" style="filter:blur(11px)"/>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

type BackdropMode = 'aurora' | 'stripes' | 'grid' | 'solid';

function DemoBackdrop({ mode, color }: { mode: BackdropMode; color: string }) {
  if (mode === 'solid') {
    return <div className="fixed inset-0" style={{ background: color }} />;
  }

  if (mode === 'stripes') {
    return (
      <div
        className="fixed inset-0"
        style={{
          background: `repeating-linear-gradient(90deg, ${color} 0 26px, #0b0b12 26px 52px)`,
        }}
      />
    );
  }

  if (mode === 'grid') {
    return (
      <div
        className="fixed inset-0"
        style={{
          backgroundColor: '#0b0b12',
          backgroundImage: `linear-gradient(${color} 1.5px, transparent 1.5px), linear-gradient(90deg, ${color} 1.5px, transparent 1.5px)`,
          backgroundSize: '34px 34px',
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0" style={{ backgroundColor: '#07070d' }}>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(38% 34% at 22% 78%, ${color} 0%, transparent 60%),
            radial-gradient(42% 38% at 78% 72%, #2563eb 0%, transparent 62%),
            radial-gradient(30% 26% at 52% 88%, #a21caf 0%, transparent 58%),
            radial-gradient(36% 30% at 50% 24%, #155e75 0%, transparent 60%)`,
          filter: 'saturate(1.3)',
        }}
      />
    </div>
  );
}

// Neon treatment from .launch-login-auth-submit (Auth.css), retuned to the
// cruush brand ramp: --primary #ff0072, --ring #6f00ff, --chart-3 #004bff.
// The halos sit outside the pill only — an inner wash would fight the icons'
// own colored/white swap for legibility.
const NEON_PILL_SHADOW =
  'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -8px 16px rgba(255,255,255,0.04), 0 0 2px 1px rgba(255,255,255,0.12), 0 20px 60px rgba(0,0,0,0.42), 0 0 1.8rem rgba(255,0,114,0.42), 0 0 2.6rem rgba(111,0,255,0.34), 0 0 3.4rem rgba(0,75,255,0.28)';
const NEON_BUBBLE_SHADOW =
  'inset 0.5px 1px 0.5px rgba(232,242,255,0.5), inset 0 -1px 1px rgba(214,232,255,0.14), 0 10px 18px -6px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.4), 0 0 1.1rem rgba(255,0,114,0.5), 0 0 1.7rem rgba(111,0,255,0.4)';

export default function GlassSliderNavDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [backdropMode, setBackdropMode] = useState<BackdropMode>('aurora');
  const [backdropColor, setBackdropColor] = useState('#ec4899');
  const [neon, setNeon] = useState(true);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [offsets, setOffsets] = useState<number[]>([]);
  const [pillSize, setPillSize] = useState<{ width: number; height: number } | null>(null);

  const lensMap = useMemo(
    () => makeStadiumDisplacementMap(BUBBLE_SIZE, BUBBLE_SIZE, BUBBLE_SIZE / 2),
    []
  );
  // Full-slab convex field: the whole bar is one lens, so the backdrop
  // scatters hard under it — no chromatic split, one displacement pass.
  const pillMap = useMemo(
    () => (pillSize
      ? makeStadiumDisplacementMap(pillSize.width, pillSize.height, pillSize.height / 2)
      : null),
    [pillSize]
  );

  useLayoutEffect(() => {
    const measure = () => {
      setOffsets(buttonRefs.current.map((el) => {
        if (!el) return 0;
        return el.offsetLeft + el.offsetWidth / 2 - BUBBLE_SIZE / 2;
      }));
      const pill = pillRef.current;
      if (pill) {
        setPillSize({
          width: Math.round(pill.offsetWidth),
          height: Math.round(pill.offsetHeight),
        });
      }
    };
    measure();
    const pill = pillRef.current;
    if (!pill) return;
    const observer = new ResizeObserver(measure);
    observer.observe(pill);
    return () => observer.disconnect();
  }, []);

  // Stim drag: grab anywhere on the bar and scrub the lens along it. The lens
  // follows the pointer directly (no spring), stretches with velocity, and the
  // bar's displacement deepens the faster you scrub. Release snaps to the
  // nearest icon with the usual spring + pulse.
  const [dragX, setDragX] = useState<number | null>(null);
  const [stretch, setStretch] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const downXRef = useRef(0);
  const lastMoveRef = useRef<{ x: number; t: number } | null>(null);
  const velocityRef = useRef(0);
  const suppressClickRef = useRef(false);

  const trackMin = offsets[0] ?? 0;
  const trackMax = offsets[offsets.length - 1] ?? 0;
  const clampToTrack = (x: number) => Math.min(Math.max(x, trackMin), trackMax);
  const nearestIndex = (x: number) =>
    offsets.reduce((best, offset, index) =>
      Math.abs(offset - x) < Math.abs(offsets[best] - x) ? index : best, 0);

  const setBarScaleBoost = (boost: number) => {
    const nodes = document.querySelectorAll(`#${PILL_FILTER_ID} feDisplacementMap`);
    nodes.forEach((node) => {
      // Sign-aware: boost always deepens the warp regardless of scale direction.
      node.setAttribute('scale', String(PILL_RESTING_SCALE + boost * Math.sign(PILL_RESTING_SCALE)));
    });
  };

  const pointerTrackX = (clientX: number) => {
    const pill = pillRef.current;
    if (!pill) return 0;
    return clampToTrack(clientX - pill.getBoundingClientRect().left - BUBBLE_SIZE / 2);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!offsets.length) return;
    draggingRef.current = true;
    movedRef.current = false;
    downXRef.current = event.clientX;
    velocityRef.current = 0;
    lastMoveRef.current = { x: event.clientX, t: performance.now() };
    // Deliberately no pointer capture here: capture retargets pointerup to the
    // pill, which kills the button's click on a plain tap. It engages below,
    // once the gesture is unambiguously a drag.
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    if (!movedRef.current && Math.abs(event.clientX - downXRef.current) < 6) return;
    if (!movedRef.current) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    movedRef.current = true;

    const now = performance.now();
    const last = lastMoveRef.current;
    if (last) {
      const dt = Math.max(now - last.t, 1);
      const rawVelocity = (event.clientX - last.x) / dt;
      velocityRef.current = velocityRef.current * 0.7 + rawVelocity * 0.3;
    }
    lastMoveRef.current = { x: event.clientX, t: now };

    const x = pointerTrackX(event.clientX);
    const speed = Math.abs(velocityRef.current);
    setDragX(x);
    setActiveIndex(nearestIndex(x));
    setStretch({
      x: 1 + Math.min(speed * 0.18, 0.3),
      y: 1 - Math.min(speed * 0.12, 0.18),
    });
    setBarScaleBoost(Math.min(speed * 90, 55));
  };

  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (!movedRef.current) return;
    suppressClickRef.current = true;
    // The synthetic click (if any) fires synchronously after pointerup; clear
    // the flag on the next task so a release outside any button cannot leave
    // it stuck and swallow the following genuine tap.
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    if (dragX !== null) setActiveIndex(nearestIndex(dragX));
    setDragX(null);
    setStretch(null);
    pulseDisplacement();
  };

  const bubbleX = dragX ?? offsets[activeIndex] ?? 0;
  const dragging = dragX !== null;
  const pulseFrame = useRef<number | null>(null);

  // Liquid press: momentarily deepen the bar's displacement as the lens lands,
  // then relax back to the resting scales.
  const pulseDisplacement = () => {
    const nodes = document.querySelectorAll(`#${PILL_FILTER_ID} feDisplacementMap`);
    if (!nodes.length) return;
    if (pulseFrame.current !== null) cancelAnimationFrame(pulseFrame.current);
    const startedAt = performance.now();
    const durationMs = 280;
    const tick = (now: number) => {
      const t = Math.min((now - startedAt) / durationMs, 1);
      const wave = Math.sin(t * Math.PI);
      nodes.forEach((node) => {
        node.setAttribute(
          'scale',
          String(PILL_RESTING_SCALE + 24 * wave * Math.sign(PILL_RESTING_SCALE))
        );
      });
      pulseFrame.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    pulseFrame.current = requestAnimationFrame(tick);
  };

  const backdropButtons: Array<{ mode: BackdropMode; label: string }> = [
    { mode: 'aurora', label: 'Aurora' },
    { mode: 'stripes', label: 'Stripes' },
    { mode: 'grid', label: 'Grid' },
    { mode: 'solid', label: 'Solid' },
  ];

  return (
    <div className="min-h-screen">
      <style>{`
        .glass-demo-gel-button {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.05);
          box-shadow:
            0 1.15rem 2.7rem rgba(0, 0, 0, 0.46),
            inset 0 1px 0 rgba(255, 255, 255, 0.3);
          backdrop-filter: blur(16px) saturate(1.4);
          -webkit-backdrop-filter: blur(16px) saturate(1.4);
          filter: saturate(1.32) brightness(1.16) contrast(1.04);
          text-shadow: 0 1px 0 rgba(0, 0, 0, 0.34), 0 0 1.2rem rgba(255, 255, 255, 0.3);
          transition:
            transform 180ms ease,
            filter 180ms ease,
            box-shadow 180ms ease;
        }

        .glass-demo-gel-button::before {
          position: absolute;
          inset: 0.45rem;
          z-index: 0;
          content: '';
          pointer-events: none;
          border-radius: inherit;
          background-image: var(--cruush-gradient);
          filter: blur(0.72rem) saturate(1.45);
          opacity: 0.88;
          transition:
            opacity 180ms ease,
            filter 180ms ease,
            inset 180ms ease;
        }

        .glass-demo-gel-button::after {
          position: absolute;
          inset: 0;
          z-index: 1;
          content: '';
          border-radius: inherit;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.26) 0%, transparent 26%);
          box-shadow:
            inset 0 1px 0 0 rgba(255, 255, 255, 0.4),
            inset 0 -1px 0 0 rgba(255, 255, 255, 0.16);
          mix-blend-mode: screen;
          opacity: 0.8;
          transition:
            opacity 220ms ease,
            transform 620ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .glass-demo-gel-button-gleam {
          position: absolute;
          inset: 0;
          z-index: 2;
          border-radius: inherit;
          background: linear-gradient(96deg, transparent 0 38%, rgba(255, 255, 255, 0.5) 47%, rgba(255, 255, 255, 0.1) 53%, transparent 62% 100%);
          background-size: 260% 100%;
          background-repeat: no-repeat;
          mix-blend-mode: screen;
          pointer-events: none;
          animation: glass-demo-gel-gleam 3.6s cubic-bezier(0.66, 0, 0.34, 1) infinite;
        }

        @keyframes glass-demo-gel-gleam {
          0% {
            background-position: -60% 0;
          }
          60%, 100% {
            background-position: 190% 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .glass-demo-gel-button-gleam {
            animation: none;
          }
        }

        .glass-demo-gel-button:hover,
        .glass-demo-gel-button:focus-visible {
          transform: translateY(-1px);
          box-shadow:
            0 1.2rem 2.8rem rgba(0, 0, 0, 0.48),
            0 0 2rem rgba(255, 0, 114, 0.58),
            0 0 2.8rem rgba(17, 129, 255, 0.46);
          filter: saturate(1.42) brightness(1.2) contrast(1.06);
        }

        .glass-demo-gel-button:hover::before,
        .glass-demo-gel-button:focus-visible::before {
          inset: 0.06rem;
          filter: blur(0.2rem) saturate(2.4) brightness(1.5);
          opacity: 0.48;
        }

        .glass-demo-gel-button:hover::after,
        .glass-demo-gel-button:focus-visible::after {
          transform: translateX(72%) rotate(18deg);
          opacity: 1;
        }

        .glass-demo-gel-button:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.7);
          outline-offset: 3px;
        }
      `}</style>
      <DemoBackdrop mode={backdropMode} color={backdropColor} />
      <svg aria-hidden="true" className="absolute h-0 w-0" colorInterpolationFilters="sRGB">
        <defs>
          {lensMap ? (
            <filter id={LENS_FILTER_ID} x="0" y="0" width="100%" height="100%">
              <feImage href={lensMap} x="0" y="0" width={BUBBLE_SIZE} height={BUBBLE_SIZE} result="map" />
              {/* Sharp base refraction plus a restrained cruush-color fringe:
                  pink, purple, blue. No blur pass; the split stays rim-thin. */}
              <feDisplacementMap in="SourceGraphic" in2="map" scale="52" xChannelSelector="R" yChannelSelector="G" result="baseGlass" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale="58" xChannelSelector="R" yChannelSelector="G" result="pinkDisp" />
              <feColorMatrix in="pinkDisp" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0.45 0 0 0 0  0 0 0 0.18 0" result="pinkFringe" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale="52" xChannelSelector="R" yChannelSelector="G" result="purpleDisp" />
              <feColorMatrix in="purpleDisp" type="matrix" values="0.42 0 0.28 0 0  0 0 0 0 0  0.75 0 0.35 0 0  0 0 0 0.14 0" result="purpleFringe" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale="46" xChannelSelector="R" yChannelSelector="G" result="blueDisp" />
              <feColorMatrix in="blueDisp" type="matrix" values="0 0 0 0 0  0 0.25 0.28 0 0  0 0.4 1 0 0  0 0 0 0.16 0" result="blueFringe" />
              <feBlend in="baseGlass" in2="pinkFringe" mode="screen" result="withPink" />
              <feBlend in="withPink" in2="purpleFringe" mode="screen" result="withPurple" />
              <feBlend in="withPurple" in2="blueFringe" mode="screen" />
            </filter>
          ) : null}
          {pillMap && pillSize ? (
            <filter id={PILL_FILTER_ID} x="0" y="0" width="100%" height="100%">
              <feImage href={pillMap} x="0" y="0" width={pillSize.width} height={pillSize.height} result="map" />
              {/* One hard convex pass, no chromatic split — scatters the
                  backdrop across the whole slab. */}
              <feDisplacementMap in="SourceGraphic" in2="map" scale={PILL_RESTING_SCALE} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          ) : null}
        </defs>
      </svg>
      <div className="relative z-10 flex flex-col items-center gap-4 pt-16">
        <p className="text-center text-sm text-white/60">
          Tap an icon — liquid glass. Swap the backdrop to stress the refraction.
        </p>
        <div className="flex items-center gap-2">
          {backdropButtons.map((option) => (
            <button
              key={option.mode}
              onClick={() => setBackdropMode(option.mode)}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                backdropMode === option.mode
                  ? 'bg-white/20 text-white'
                  : 'bg-white/[0.07] text-white/55 hover:bg-white/[0.12] hover:text-white/80'
              }`}
            >
              {option.label}
            </button>
          ))}
          <input
            aria-label="Backdrop color"
            type="color"
            value={backdropColor}
            onChange={(event) => setBackdropColor(event.target.value)}
            className="h-7 w-9 cursor-pointer rounded-md border border-white/20 bg-transparent"
          />
          <button
            onClick={() => setNeon((on) => !on)}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
              neon
                ? 'bg-[rgba(255,0,114,0.28)] text-white shadow-[0_0_1rem_rgba(255,0,114,0.5),0_0_1.4rem_rgba(111,0,255,0.4)]'
                : 'bg-white/[0.07] text-white/55 hover:bg-white/[0.12] hover:text-white/80'
            }`}
          >
            Neon
          </button>
        </div>
      </div>
      <div className="pointer-events-none fixed bottom-[6.9rem] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2">
        <button
          type="button"
          aria-pressed="true"
          className="glass-demo-gel-button pointer-events-auto h-11 min-h-11 w-32 px-4 text-sm font-bold text-white transition-transform active:scale-[0.98]"
        >
          <span aria-hidden="true" className="glass-demo-gel-button-gleam" />
          <span className="relative z-10">sign in</span>
        </button>
        <button
          type="button"
          aria-pressed="false"
          className="glass-demo-gel-button pointer-events-auto h-11 min-h-11 w-32 px-4 text-sm font-bold text-white transition-transform active:scale-[0.98]"
        >
          <span aria-hidden="true" className="glass-demo-gel-button-gleam" />
          <span className="relative z-10">sign up</span>
        </button>
      </div>
      <nav className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
        <div
          ref={pillRef}
          data-testid="glass-slider-pill"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="pointer-events-auto relative z-10 mx-auto flex w-full max-w-[23rem] touch-none select-none items-center justify-between overflow-hidden rounded-full border border-white/15 bg-background/10 px-1.5 pb-1.5 pt-2"
          style={{
            backdropFilter: pillMap
              ? `url(#${PILL_FILTER_ID}) brightness(1.06) saturate(1.4)`
              : 'blur(4px) saturate(1.4)',
            boxShadow: neon
              ? NEON_PILL_SHADOW
              : 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -8px 16px rgba(255,255,255,0.04), 0 0 2px 1px rgba(255,255,255,0.12), 0 20px 60px rgba(0,0,0,0.42)',
          }}
        >
          {neon ? (
            <>
              {/* Auth-button wash: white/blue/pink radials plus faint diagonal
                  scanlines. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full opacity-[0.3]"
                style={{
                  background:
                    'radial-gradient(ellipse at 22% 18%, rgba(255,255,255,0.14), transparent 4.2rem), radial-gradient(ellipse at 76% 78%, rgba(111,0,255,0.18), transparent 4rem), radial-gradient(ellipse at 18% 70%, rgba(255,0,114,0.16), transparent 3.6rem), repeating-linear-gradient(96deg, transparent 0 0.72rem, rgba(255,255,255,0.05) 0.78rem 0.84rem)',
                }}
              />
            </>
          ) : null}
          {/* Slab lighting: crisp top catch-light arc, dark exit line along the
              bottom rim (thickness), soft specular streak down the upper face. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_1.5px_0.5px_rgba(235,244,255,0.5),inset_0_-1px_1px_rgba(0,0,0,0.35)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-3 top-0 h-1/2 rounded-t-full opacity-60"
            style={{
              background:
                'linear-gradient(180deg, rgba(230,240,255,0.2) 0%, rgba(230,240,255,0.04) 55%, rgba(230,240,255,0) 100%)',
            }}
          />
          <div
            aria-hidden="true"
            data-testid="glass-slider-bubble"
            className="pointer-events-none absolute top-1/2 left-0 z-20 -translate-y-1/2 rounded-full [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]"
            style={{
              width: BUBBLE_SIZE,
              height: BUBBLE_SIZE,
              transform: `translateX(${bubbleX}px) scaleX(${stretch?.x ?? 1}) scaleY(${stretch?.y ?? 1})`,
              transition: dragging ? 'none' : 'transform 500ms',
              opacity: offsets.length ? 1 : 0,
              backdropFilter: lensMap ? `url(#${LENS_FILTER_ID})` : 'blur(2px)',
            }}
          >
            {/* Clear glass: no frost sheet — only a crisp top rim catch-light,
                a whisper of inner refraction at the bottom, and the contact
                shadow that seats the puck on the bar. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                boxShadow: neon
                  ? NEON_BUBBLE_SHADOW
                  : 'inset 0.5px 1px 0.5px rgba(232,242,255,0.5), inset 0 -1px 1px rgba(214,232,255,0.14), 0 10px 18px -6px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.4)',
              }}
            />
          </div>
          {navItems.map((item, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={item.label}
                ref={(el) => {
                  buttonRefs.current[index] = el;
                }}
                aria-pressed={active}
                aria-label={item.label}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  setActiveIndex(index);
                  pulseDisplacement();
                }}
                className={`relative flex h-[3.75rem] w-[3.75rem] min-w-0 shrink-0 items-center justify-center rounded-full transition-colors ${
                  active ? 'text-primary' : 'text-white/52 hover:text-white/78'
                }`}
              >
                <img
                  alt=""
                  aria-hidden="true"
                  className={`h-[3.6rem] w-[3.6rem] object-contain transition-transform duration-500 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] ${
                    active ? 'scale-[1.12]' : 'scale-100'
                  }`}
                  draggable={false}
                  src={active ? item.activeIcon : item.icon}
                />
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
