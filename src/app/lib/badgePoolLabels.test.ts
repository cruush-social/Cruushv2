import { describe, expect, it } from 'vitest';
import vibes from '../../../public/badge-icons/vibe-icon-pool-data.json';
import kinks from '../../../public/badge-icons/kink-icon-pool-data.json';
import { createSavedMapMarkerBadge } from './mapMarkers';

const badge = (id: string, meaning?: string) => createSavedMapMarkerBadge({ badge_id: id, intent: 'none', frame: 'circle', meaning }, null);

describe('saved pool badge labels', () => {
  it('resolves the reported paw badges without leaking IDs', () => {
    expect(badge('vibes-icon-vibe-icon-4c3fdd0ef63d3cd5')?.label).toBe('Cat paw');
    expect(badge('vibes-icon-vibe-icon-456a9bf1e7d0a5e0')?.label).toBe('Dog paw');
  });
  it('keeps the compact label catalog aligned with both icon manifests', () => {
    for (const [group, manifest] of [['vibes', vibes], ['kinks', kinks]] as const) {
      for (const entry of manifest.icons) {
        const label = group === 'kinks'
          ? ({ Penis: 'Cock', Breast: 'Boobs' } as Record<string, string>)[entry.label] ?? entry.label
          : entry.label === 'Handcuffs sex police' ? 'Handcuffs' : entry.label;
        expect(badge(`${group}-icon-${entry.id}`)?.label).toBe(label);
      }
    }
  });
  it('preserves member labels and hides unknown pool identifiers', () => {
    expect(badge('vibes-icon-vibe-icon-4c3fdd0ef63d3cd5', 'My label')?.meaning).toBe('My label');
    expect(badge('vibes-icon-vibe-icon-unknown')?.label).toBe('Vibe badge');
    expect(badge('kinks-icon-unknown')?.label).toBe('Kink badge');
    expect(badge('top')?.label).toBe('top');
  });
});
