import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LaunchLoginMapTeaser, { LaunchLoginWaterPane } from './LaunchLoginMapTeaser';

describe('LaunchLoginMapTeaser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a decorative frosted map scene without profile imagery', () => {
    const { container } = render(<LaunchLoginMapTeaser />);
    const teaser = screen.getByTestId('launch-login-map-teaser');

    expect(teaser).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('launch-login-teaser-video')).toHaveAttribute(
      'src',
      '/teasers/launch-login-teaser-desktop.webm',
    );
    expect(screen.getByTestId('launch-login-map-scene')).toBeInTheDocument();
    expect(screen.queryByTestId('launch-login-brand-mark')).not.toBeInTheDocument();
    expect(screen.getByTestId('launch-login-club-lights')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-mobile-pulse')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-frosted-glass')).toBeInTheDocument();
    expect(screen.getAllByTestId('launch-login-club-beam')).toHaveLength(5);
    expect(screen.getAllByTestId('launch-login-gradient-pin')).toHaveLength(6);
    expect(screen.getAllByTestId('launch-login-ghost-person')).toHaveLength(4);
    expect(screen.getAllByTestId('launch-login-radius-ring')).toHaveLength(3);
    expect(screen.getAllByTestId('launch-login-activity-signal')).toHaveLength(5);
    expect(screen.getAllByTestId('launch-login-water-droplet')).toHaveLength(24);
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
      '/teasers/launch-login-teaser-mobile.mp4',
    );
    expect(screen.getByTestId('launch-login-mobile-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('launch-login-map-scene')).not.toBeInTheDocument();
    expect(screen.queryByTestId('launch-login-frosted-glass')).not.toBeInTheDocument();
    fireEvent.canPlay(video);

    return waitFor(() => expect(handlePlaybackStateChange).toHaveBeenCalledWith({
      isMobileRecording: true,
      isReady: true,
    }));
  });

  it('renders a foreground water layer with persistent clear trails', () => {
    const { container } = render(<LaunchLoginWaterPane />);

    expect(screen.getByTestId('launch-login-foreground-water-pane')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByTestId('launch-login-clear-trail')).toHaveLength(12);
    expect(screen.getAllByTestId('launch-login-water-droplet')).toHaveLength(24);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelectorAll('image')).toHaveLength(0);
  });

  it('uses a lighter foreground rain layer on phone-sized viewports', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(max-width: 640px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    render(<LaunchLoginWaterPane />);

    expect(screen.getByTestId('launch-login-foreground-water-pane')).toHaveClass('launch-login-map-teaser__water-pane--mobile-lite');
    expect(screen.getAllByTestId('launch-login-clear-trail')).toHaveLength(4);
    expect(screen.getAllByTestId('launch-login-water-droplet')).toHaveLength(8);
  });
});
