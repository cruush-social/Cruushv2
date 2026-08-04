import { useEffect, useState } from 'react';
import './LaunchLoginMapTeaser.css';

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
