import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LaunchLoginMapTeaser, { LaunchLoginWaterPane } from './LaunchLoginMapTeaser';

describe('LaunchLoginMapTeaser', () => {
  it('renders a decorative frosted map scene without profile imagery', () => {
    const { container } = render(<LaunchLoginMapTeaser />);
    const teaser = screen.getByTestId('launch-login-map-teaser');

    expect(teaser).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('launch-login-teaser-video')).toHaveAttribute('src', '/teasers/launch-login-teaser.webm');
    expect(screen.getByTestId('launch-login-map-scene')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-brand-mark')).toBeInTheDocument();
    expect(screen.getByTestId('launch-login-frosted-glass')).toBeInTheDocument();
    expect(screen.getAllByTestId('launch-login-gradient-pin')).toHaveLength(6);
    expect(screen.getAllByTestId('launch-login-ghost-person')).toHaveLength(4);
    expect(screen.getAllByTestId('launch-login-radius-ring')).toHaveLength(3);
    expect(screen.getAllByTestId('launch-login-activity-signal')).toHaveLength(5);
    expect(screen.getAllByTestId('launch-login-water-droplet')).toHaveLength(12);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelectorAll('image')).toHaveLength(0);
  });

  it('renders a foreground water layer with persistent clear trails', () => {
    const { container } = render(<LaunchLoginWaterPane />);

    expect(screen.getByTestId('launch-login-foreground-water-pane')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByTestId('launch-login-clear-trail')).toHaveLength(6);
    expect(screen.getAllByTestId('launch-login-water-droplet')).toHaveLength(12);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelectorAll('image')).toHaveLength(0);
  });
});
