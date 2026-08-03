import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LaunchLoginMapTeaser from './LaunchLoginMapTeaser';
import LaunchLoginRainPane from './LaunchLoginRainPane';

describe('LaunchLoginMapTeaser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a video-first background without the old branded fallback scene', () => {
    const { container } = render(<LaunchLoginMapTeaser />);
    const teaser = screen.getByTestId('launch-login-map-teaser');

    expect(teaser).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('launch-login-teaser-video')).toHaveAttribute(
      'src',
      '/teasers/cruush-logo-login-alpha-desktop.webm',
    );
    expect(screen.getByTestId('launch-login-video-logo-scrub')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-realistic-glitter')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-butterfly-field')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-codepen-butterfly-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-mobile-pulse')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-video-shade')).toBeInTheDocument();
    expect(screen.queryByTestId('launch-login-map-scene')).not.toBeInTheDocument();
    expect(screen.queryByTestId('launch-login-brand-mark')).not.toBeInTheDocument();
    expect(screen.queryByText('cruush')).not.toBeInTheDocument();
    expect(screen.queryByTestId('launch-login-club-lights')).not.toBeInTheDocument();
    expect(screen.queryByTestId('launch-login-frosted-glass')).not.toBeInTheDocument();
    expect(screen.queryByTestId('launch-login-ambient-fallback')).not.toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelectorAll('image')).toHaveLength(0);
  });

  it('uses the portrait loop on phone-sized viewports', () => {
    const handlePlaybackStateChange = vi.fn();
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(max-width: 640px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    render(<LaunchLoginMapTeaser onPlaybackStateChange={handlePlaybackStateChange} />);

    const teaser = screen.getByTestId('launch-login-map-teaser');
    const video = screen.getByTestId('launch-login-teaser-video');

    expect(teaser).toHaveClass('launch-login-map-teaser--mobile-recording');
    expect(screen.getByTestId('launch-login-mobile-pulse')).toHaveClass('launch-login-map-teaser__mobile-pulse');
    expect(video).toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('loop');
    expect((video as HTMLVideoElement).muted).toBe(true);
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).toHaveAttribute(
      'src',
      '/teasers/cruush-logo-login-alpha-mobile.webm',
    );
    expect(screen.queryByTestId('launch-login-map-scene')).not.toBeInTheDocument();
    expect(screen.queryByTestId('launch-login-frosted-glass')).not.toBeInTheDocument();
    expect(screen.queryByTestId('launch-login-ambient-fallback')).not.toBeInTheDocument();
    fireEvent.canPlay(video);

    return waitFor(() => expect(handlePlaybackStateChange).toHaveBeenCalledWith({
      isMobileRecording: true,
      isReady: true,
    }));
  });

  it('falls back to a static ambient background when reduced motion disables video', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    render(<LaunchLoginMapTeaser />);

    expect(screen.queryByTestId('launch-login-teaser-video')).not.toBeInTheDocument();
    expect(screen.getByTestId('launch-login-ambient-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-video-logo-scrub')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-realistic-glitter')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-butterfly-field')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-codepen-butterfly-canvas')).toBeInTheDocument();
  });

  it('keeps the archived rain layer available for later restoration', () => {
    const { container } = render(<LaunchLoginRainPane />);

    expect(screen.getByTestId('launch-login-foreground-rain-pane')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByTestId('launch-login-clear-trail')).toHaveLength(6);
    expect(screen.getAllByTestId('launch-login-water-droplet')).toHaveLength(12);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelectorAll('image')).toHaveLength(0);
  });

  it('keeps the archived rain layer lighter on phone-sized viewports', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(max-width: 640px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    render(<LaunchLoginRainPane />);

    expect(screen.getByTestId('launch-login-foreground-rain-pane')).toHaveClass('launch-login-rain-pane--mobile-lite');
    expect(screen.getAllByTestId('launch-login-clear-trail')).toHaveLength(2);
    expect(screen.getAllByTestId('launch-login-water-droplet')).toHaveLength(4);
    expect(screen.getAllByTestId('launch-login-clear-trail')[0]).toHaveStyle({ '--duration': '12s' });
    expect(screen.getAllByTestId('launch-login-water-droplet')[0]).toHaveStyle({ '--duration': '9s' });
  });
});
