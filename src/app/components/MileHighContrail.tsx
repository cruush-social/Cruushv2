import { useLayoutEffect, useMemo, useRef } from 'react';
import { HEART_PIN_PATH } from '../lib/heartPin';
import { shouldReduceMotion } from '../lib/accessibilityPreferences';

const MILE_HIGH_PLANE_PATH = 'M0,-13 C2,-13 3.4,-10 3.4,-6.6 L3.4,-3.4 L13,2.6 L13,6 L3.4,3.8 L3.4,9 L6.6,11.6 L6.6,13.6 L0,11.8 L-6.6,13.6 L-6.6,11.6 L-3.4,9 L-3.4,3.8 L-13,6 L-13,2.6 L-3.4,-3.4 L-3.4,-6.6 C-3.4,-10 -2,-13 0,-13 Z';
const MILE_HIGH_PERIOD_MS = 5_200;
const MILE_HIGH_BANDS = 18;
const MILE_HIGH_REDUCED_MOTION_FRAME = 420;
const MILE_HIGH_MOVING_SPAN = 0.52;
const MILE_HIGH_HANDOVER = 0.26;
const MILE_HIGH_BLEND = 0.20;
const MILE_HIGH_HOLD = 0.55;
const MILE_HIGH_SOFT_START = 0.36;
const MILE_HIGH_HEAVY_SOFT_START = 0.70;
const MILE_HIGH_CONTRAIL_COLORS = [
  [218, 243, 255],
  [169, 220, 243],
  [119, 185, 218],
] as const;

function mileHighContrailColor(position: number) {
  const normalized = Math.max(0, Math.min(1, position));
  const scaled = normalized * (MILE_HIGH_CONTRAIL_COLORS.length - 1);
  const index = Math.min(MILE_HIGH_CONTRAIL_COLORS.length - 2, Math.floor(scaled));
  const amount = scaled - index;
  const from = MILE_HIGH_CONTRAIL_COLORS[index];
  const to = MILE_HIGH_CONTRAIL_COLORS[index + 1];
  const channel = (start: number, end: number) => Math.round(start + ((end - start) * amount));

  return `rgb(${channel(from[0], to[0])} ${channel(from[1], to[1])} ${channel(from[2], to[2])})`;
}

export default function MileHighContrail({
  forceReducedMotion = false,
  gradientId,
  marker,
}: {
  forceReducedMotion?: boolean;
  gradientId: string;
  marker: { id: string };
}) {
  const probeRef = useRef<SVGPathElement | null>(null);
  const planeRef = useRef<SVGGElement | null>(null);
  const bandRefs = useRef<Array<Array<SVGPathElement | null>>>([]);
  const reduceMotion = shouldReduceMotion();
  const staticMotion = reduceMotion || forceReducedMotion;
  const bands = useMemo(() => Array.from({ length: MILE_HIGH_BANDS }, (_, index) => {
    const age = index / (MILE_HIGH_BANDS - 1);
    const alpha = age <= MILE_HIGH_HOLD
      ? 1
      : Math.max(0.12, 1 - ((age - MILE_HIGH_HOLD) / (1 - MILE_HIGH_HOLD)) * 0.88);
    const whiteMix = Math.max(0, Math.min(1, (age - MILE_HIGH_HANDOVER) / MILE_HIGH_BLEND));
    return {
      age,
      alpha,
      filter: age >= MILE_HIGH_HEAVY_SOFT_START
        ? `url(#${gradientId}-soft-2)`
        : age >= MILE_HIGH_SOFT_START
          ? `url(#${gradientId}-soft-1)`
          : undefined,
      phase: whiteMix === 0 ? 'light-blue' : whiteMix === 1 ? 'white-poof' : 'blend',
      skyOpacity: (1 - whiteMix) * alpha,
      skyStroke: mileHighContrailColor(Math.min(1, age / MILE_HIGH_HANDOVER)),
      whiteOpacity: whiteMix * alpha,
      width: 3.2 * (1 + age * 1.15),
    };
  }), [gradientId]);

  useLayoutEffect(() => {
    const probe = probeRef.current;
    const plane = planeRef.current;
    if (!probe || !plane || typeof probe.getTotalLength !== 'function') {
      return;
    }

    const length = probe.getTotalLength();
    const units = 1_000;
    const planeScale = 0.72;
    const clear = (13 * planeScale) / length * units;
    const maxSpan = (units - clear - clear - 30) / units;
    const span = Math.min(MILE_HIGH_MOVING_SPAN, maxSpan) * units;
    const bandLength = span / MILE_HIGH_BANDS;

    const paint = (unit: number) => {
      bands.forEach((_band, index) => {
        const dashOffset = -(unit - clear - ((index + 1) * bandLength));
        const dashArray = `${bandLength} ${units - bandLength}`;
        bandRefs.current[index]?.forEach((element) => {
          if (!element) return;
          element.setAttribute('stroke-dasharray', dashArray);
          element.setAttribute('stroke-dashoffset', String(dashOffset));
        });
      });

      const distance = (((unit % units) + units) % units) / units * length;
      const point = probe.getPointAtLength(distance);
      const behind = probe.getPointAtLength((distance - 0.6 + length) % length);
      const rotation = Math.atan2(point.y - behind.y, point.x - behind.x) * 180 / Math.PI + 90;
      plane.setAttribute('transform', `translate(${point.x},${point.y}) rotate(${rotation}) scale(${planeScale})`);
    };

    paint(MILE_HIGH_REDUCED_MOTION_FRAME);
    if (staticMotion) return;

    let frame = 0;
    let startedAt: number | null = null;
    const step = (now: number) => {
      startedAt ??= now;
      paint(((now - startedAt) % MILE_HIGH_PERIOD_MS) / MILE_HIGH_PERIOD_MS * units);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [bands, staticMotion]);

  const planeFormId = `${gradientId}-plane-form`;
  const planeLengthId = `${gradientId}-plane-length`;

  return (
    <g data-contrail-style={staticMotion ? 'reduced-motion' : 'cluster'} data-testid={`marker-mile-high-${marker.id}`}>
      <defs>
        <linearGradient id={planeFormId} x1="0" x2="1" y1="0.5" y2="0.5">
          <stop offset="0" stopColor="#0d1020" stopOpacity="0.46" />
          <stop offset="24%" stopColor="#0d1020" stopOpacity="0.17" />
          <stop offset="47%" stopColor="#0d1020" stopOpacity="0" />
          <stop offset="72%" stopColor="#0d1020" stopOpacity="0.21" />
          <stop offset="100%" stopColor="#0d1020" stopOpacity="0.48" />
        </linearGradient>
        <linearGradient id={planeLengthId} x1="0.5" x2="0.5" y1="0" y2="1">
          <stop offset="0" stopColor="#0d1020" stopOpacity="0" />
          <stop offset="45%" stopColor="#0d1020" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#0d1020" stopOpacity="0.32" />
        </linearGradient>
        <filter id={`${gradientId}-soft-1`} x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="0.42" />
        </filter>
        <filter id={`${gradientId}-soft-2`} x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="1.05" />
        </filter>
      </defs>
      <path d={HEART_PIN_PATH} fill="none" ref={probeRef} stroke="none" />
      {[...bands].reverse().map((band) => {
        const index = bands.indexOf(band);
        const setBandRef = (inkIndex: number) => (element: SVGPathElement | null) => {
          bandRefs.current[index] ??= [];
          bandRefs.current[index][inkIndex] = element;
        };

        return (
        <g
          data-mile-high-band={index}
          data-mile-high-phase={band.phase}
          key={index}
        >
          <path
            d={HEART_PIN_PATH}
            data-mile-high-ink="light-blue"
            data-testid={index === 0 ? `marker-mile-high-engine-trail-${marker.id}` : undefined}
            fill="none"
            filter={band.filter}
            pathLength={1_000}
            ref={setBandRef(0)}
            stroke={band.skyStroke}
            strokeLinecap="round"
            strokeWidth={band.width}
            style={{ opacity: band.skyOpacity.toFixed(4) }}
          />
          <path
            d={HEART_PIN_PATH}
            data-mile-high-ink="white"
            fill="none"
            filter={band.filter}
            pathLength={1_000}
            ref={setBandRef(1)}
            stroke="#ffffff"
            strokeLinecap="round"
            strokeWidth={band.width}
            style={{ opacity: band.whiteOpacity.toFixed(4) }}
          />
        </g>
        );
      })}
      <g data-testid={`marker-mile-high-plane-${marker.id}`} ref={planeRef}>
        <path d={MILE_HIGH_PLANE_PATH} fill="#ffffff" />
        <path d={MILE_HIGH_PLANE_PATH} fill={`url(#${planeFormId})`} />
        <path d={MILE_HIGH_PLANE_PATH} fill={`url(#${planeLengthId})`} />
      </g>
    </g>
  );
}
