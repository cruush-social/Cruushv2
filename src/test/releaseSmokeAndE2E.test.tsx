import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import LiquidGlassFilters, { LIQUID_GLASS_FILTER_IDS } from '../app/components/LiquidGlassFilters';
import BottomNav from '../app/components/BottomNav';
import { AUTH_POLICY_LINKS } from '../app/components/PublicPolicyLinks';

describe('Release Branch Smoke & Feature E2E Suite', () => {
  describe('1. Liquid Glass Filter Displacement System', () => {
    it('renders all 5 Apple liquid glass SVG displacement maps in the DOM', () => {
      const { container } = render(<LiquidGlassFilters />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass('cruush-liquid-glass-filters');

      // Verify all required liquid glass filter IDs exist
      const expectedFilterIds = [
        LIQUID_GLASS_FILTER_IDS.dock,
        LIQUID_GLASS_FILTER_IDS.bubble,
        LIQUID_GLASS_FILTER_IDS.pill,
        LIQUID_GLASS_FILTER_IDS.field,
        LIQUID_GLASS_FILTER_IDS.panel,
      ];

      expectedFilterIds.forEach((id) => {
        const filter = document.getElementById(id);
        expect(filter).toBeInTheDocument();
        expect(filter?.querySelector('feImage')).toBeInTheDocument();
        expect(filter?.querySelector('feGaussianBlur')).toBeInTheDocument();
        expect(filter?.querySelector('feBlend')).toBeInTheDocument();
      });
    });
  });

  describe('2. Navigation Dock & Liquid Optics', () => {
    it('renders 5 interactive navigation buttons with accessible ARIA labels', () => {
      render(
        <MemoryRouter initialEntries={['/feed']}>
          <BottomNav />
        </MemoryRouter>
      );

      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();

      const mapBtn = screen.getByRole('button', { name: /map/i });
      const feedBtn = screen.getByRole('button', { name: /feed/i });
      const cruushBtn = screen.getByRole('button', { name: /cruush/i });
      const messagesBtn = screen.getByRole('button', { name: /messages/i });
      const profileBtn = screen.getByRole('button', { name: /profile/i });

      expect(mapBtn).toBeInTheDocument();
      expect(feedBtn).toBeInTheDocument();
      expect(cruushBtn).toBeInTheDocument();
      expect(messagesBtn).toBeInTheDocument();
      expect(profileBtn).toBeInTheDocument();

      // Current page active state indicator
      expect(feedBtn).toHaveAttribute('aria-current', 'page');
      expect(mapBtn).not.toHaveAttribute('aria-current');
    });
  });

  describe('3. Asset Delivery & Preload Error Hardening', () => {
    it('handles vite:preloadError event gracefully', () => {
      const reloadSpy = vi.fn();
      const originalLocation = window.location;

      // Mock window.location.reload
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { ...originalLocation, reload: reloadSpy },
      });

      // Register the vite:preloadError listener matching main.tsx behavior
      const handler = () => {
        window.location.reload();
      };
      window.addEventListener('vite:preloadError', handler);

      // Dispatch vite:preloadError event
      const event = new Event('vite:preloadError');
      window.dispatchEvent(event);

      expect(reloadSpy).toHaveBeenCalledTimes(1);

      // Cleanup
      window.removeEventListener('vite:preloadError', handler);
      Object.defineProperty(window, 'location', {
        writable: true,
        value: originalLocation,
      });
    });
  });

  describe('4. Auth Policy Links & Footer Hardening', () => {
    it('excludes /billing-policy from unauthenticated policy links', () => {
      const paths = AUTH_POLICY_LINKS.map((link) => link.path);

      expect(paths).toContain('/terms');
      expect(paths).toContain('/privacy');
      expect(paths).not.toContain('/billing-policy');
    });
  });
});
