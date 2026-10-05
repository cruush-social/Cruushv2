import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const themeCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'theme.css'), 'utf8');

describe('global text selection policy', () => {
  it('disables page text selection while keeping editable fields selectable', () => {
    expect(themeCss).toContain('body, body * {');
    expect(themeCss).toContain('-webkit-user-select: none;');
    expect(themeCss).toContain('user-select: none;');
    expect(themeCss).toContain('input, textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"] {');
    expect(themeCss).toContain('-webkit-user-select: text;');
    expect(themeCss).toContain('user-select: text;');
  });

  it('prevents page-level horizontal overflow from narrow mobile controls', () => {
    expect(themeCss).toContain('html, body, #root {');
    expect(themeCss).toContain('max-width: 100%;');
    expect(themeCss).toContain('overflow-x: hidden;');
  });
});

describe('shared app header typography', () => {
  it('uses the responsive line-height tokens so serif descenders are not clipped', () => {
    expect(themeCss).toContain('line-height: var(--text-2xl--line-height);');
    expect(themeCss).toContain('line-height: var(--text-3xl--line-height);');
    expect(themeCss).toContain('transform: translateY(-2px);');
  });
});

describe('account deletion dialog viewport', () => {
  it('lets the keyboard-constrained dialog override fullscreen framing', () => {
    const fullscreenRules = themeCss.match(/html\[data-cruush-page-framing="fullscreen"\][^{]+\{[^}]+\}/g) ?? [];
    const genericDialogRules = fullscreenRules.filter((rule) => (
      rule.includes('[data-slot="alert-dialog-content"]')
      && rule.includes('cruush-profile-safety-dialog')
    ));

    expect(genericDialogRules.length).toBeGreaterThanOrEqual(2);
    expect(genericDialogRules.every((rule) => (
      rule.includes(':not(.cruush-settings-delete-dialog-constrained)')
    ))).toBe(true);
    expect(themeCss).toContain(
      'height: var(--settings-delete-dialog-height, calc(100dvh - var(--cruush-nav-clearance, 6rem))) !important;',
    );
    expect(themeCss).toContain('.cruush-settings-delete-dialog-constrained .cruush-settings-delete-fields');
    expect(themeCss).toContain('.cruush-settings-delete-dialog-constrained .cruush-settings-delete-footer');
  });
});

describe('cruush+ map button sheen', () => {
  it('keeps the v2 sweep and reduced-motion fallback available', () => {
    expect(themeCss).toContain('.cruush-plus-shimmer-button::before');
    expect(themeCss).toContain('animation: cruush-plus-shimmer 3.4s ease-in-out infinite;');
    expect(themeCss).toContain('@keyframes cruush-plus-shimmer');
    expect(themeCss).toContain('.cruush-plus-shimmer-button > *');
    expect(themeCss).toContain('.cruush-plus-shimmer-button::before {\n      animation: none;');
  });
});
