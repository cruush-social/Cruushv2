import { useEffect, useRef, useState } from 'react';
import './LaunchLoginMapTeaser.css';

export type LaunchLoginMapTeaserPlaybackState = {
  isMobileRecording: boolean;
  isReady: boolean;
};

type LaunchLoginMapTeaserProps = {
  onPlaybackStateChange?: (state: LaunchLoginMapTeaserPlaybackState) => void;
};

const DESKTOP_TEASER_VIDEO = '/teasers/cruush-logo-login-alpha-desktop.webm';
const MOBILE_TEASER_VIDEO = '/teasers/cruush-logo-login-alpha-mobile.webm';
const BUTTERFLY_TEXTURE = '/teasers/codepen-butterfly-tex.png';
const MOBILE_VIDEO_QUERY = '(max-width: 640px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function getTeaserVideoSource() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return DESKTOP_TEASER_VIDEO;
  }

  if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
    return null;
  }

  return window.matchMedia(MOBILE_VIDEO_QUERY).matches ? MOBILE_TEASER_VIDEO : DESKTOP_TEASER_VIDEO;
}

function ButterflyField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let animId = 0;
    let isDisposed = false;

    const img = new Image();
    img.src = BUTTERFLY_TEXTURE;

    type Butterfly = {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      flapSpeed: number;
      flapPhase: number;
      angle: number;
      opacity: number;
    };

    let butterflies: Butterfly[] = [];

    const initButterflies = (w: number, h: number) => {
      const count = w < 640 ? 6 : 10;
      butterflies = Array.from({ length: count }, (_, i) => ({
        x: (w / (count + 1)) * (i + 1) + (Math.random() - 0.5) * 80,
        y: Math.random() * h,
        size: 32 + Math.random() * 24,
        speedX: (Math.random() - 0.5) * 0.8,
        speedY: 0.6 + Math.random() * 0.9,
        flapSpeed: 0.12 + Math.random() * 0.08,
        flapPhase: Math.random() * Math.PI * 2,
        angle: (Math.random() - 0.5) * 0.3,
        opacity: 0.7 + Math.random() * 0.3,
      }));
    };

    const resize = () => {
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : window.innerWidth;
      const h = parent ? parent.clientHeight : window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      if (butterflies.length === 0) {
        initButterflies(w, h);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    let time = 0;

    const render = () => {
      if (isDisposed) return;

      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : window.innerWidth;
      const h = parent ? parent.clientHeight : window.innerHeight;

      ctx.clearRect(0, 0, w, h);
      time += 0.016;

      butterflies.forEach((b) => {
        b.y -= b.speedY;
        b.x += Math.sin(time * 1.5 + b.flapPhase) * 0.7 + b.speedX;

        if (b.y < -60) {
          b.y = h + 40;
          b.x = Math.random() * w;
        }

        if (b.x < -60) b.x = w + 40;
        if (b.x > w + 60) b.x = -40;

        const flap = Math.abs(Math.sin(time * b.flapSpeed * 60 + b.flapPhase));
        const wingWidth = Math.max(0.15, flap) * b.size;

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle + Math.sin(time * 2 + b.flapPhase) * 0.1);
        ctx.globalAlpha = b.opacity;

        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, -wingWidth / 2, -b.size / 2, wingWidth, b.size);
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.beginPath();
          ctx.ellipse(0, 0, wingWidth / 2, b.size / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      });

      animId = requestAnimationFrame(render);
    };

    img.onload = () => {
      if (!isDisposed && animId === 0) {
        render();
      }
    };

    render();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="launch-login-map-teaser__butterfly-field" data-testid="launch-login-butterfly-field">
      <canvas
        aria-hidden="true"
        className="launch-login-map-teaser__codepen-butterfly-canvas"
        data-testid="launch-login-codepen-butterfly-canvas"
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
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
      <div className="launch-login-map-teaser__realistic-glitter" data-testid="launch-login-realistic-glitter" />
      {videoSource ? (
        <video
          aria-hidden="true"
          autoPlay
          className="launch-login-map-teaser__video"
          data-testid="launch-login-teaser-video"
          disablePictureInPicture
          disableRemotePlayback
          key={videoSource}
          loop
          muted
          onCanPlay={() => setIsVideoReady(true)}
          onError={() => setIsVideoReady(false)}
          playsInline
          preload="auto"
          src={videoSource}
        />
      ) : (
        <div className="launch-login-map-teaser__ambient-fallback" data-testid="launch-login-ambient-fallback" />
      )}
      <ButterflyField />
      <div className="launch-login-map-teaser__video-logo-scrub" data-testid="launch-login-video-logo-scrub" />
      <div className="launch-login-map-teaser__mobile-pulse" data-testid="launch-login-mobile-pulse" />
      <div className="launch-login-map-teaser__shade" data-testid="launch-login-video-shade" />
    </div>
  );
}
