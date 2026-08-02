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

  it('locks page scrolling only while the map shell is mounted', () => {
    expect(themeCss).toContain('@supports selector(body:has(.cruush-map-shell)) {');
    expect(themeCss).toContain('body:has(.cruush-map-shell),');
    expect(themeCss).toContain('#root:has(.cruush-map-shell) {');
    expect(themeCss).toContain('height: 100dvh;');
    expect(themeCss).toContain('overflow: hidden;');
    expect(themeCss).toContain('overscroll-behavior: none;');
  });

  it('keeps map overlays in color instead of desaturating the whole canvas', () => {
    expect(themeCss).toContain('.cruush-map .maplibregl-canvas {');
    expect(themeCss).toContain('filter: brightness(0.86) contrast(1.2) saturate(1);');
    expect(themeCss).not.toContain('filter: grayscale(1)');
    expect(themeCss).not.toContain('saturate(0.08)');
  });

  it('keeps global glass stable while using Apple-style lensing on the bottom dock', () => {
    expect(themeCss).toContain('--cruush-glass-backdrop: blur(22px) saturate(1.48) brightness(1.06) contrast(1.01);');
    expect(themeCss).toContain('--cruush-glass-dock-backdrop: blur(20px) saturate(1.44) brightness(1.06) contrast(1.02);');
    expect(themeCss).toContain('--cruush-glass-current-backdrop: blur(12px) saturate(1.28) brightness(1.05) contrast(1.01);');
    expect(themeCss).toContain('@supports ((backdrop-filter: url("#cruush-liquid-glass-panel")) or (-webkit-backdrop-filter: url("#cruush-liquid-glass-panel"))) {');
    expect(themeCss).toContain('--cruush-glass-backdrop: url("#cruush-liquid-glass-panel") blur(15px) saturate(1.42) brightness(1.06) contrast(1.02);');
    expect(themeCss).toContain('--cruush-glass-backdrop-soft: url("#cruush-liquid-glass-pill") blur(12px) saturate(1.34) brightness(1.05) contrast(1.01);');
    expect(themeCss).toContain('--cruush-glass-dock-backdrop: url("#cruush-liquid-glass-dock") blur(13px) saturate(1.4) brightness(1.06) contrast(1.02);');
    expect(themeCss).toContain('--cruush-glass-current-backdrop: url("#cruush-liquid-glass-bubble") blur(9px) saturate(1.28) brightness(1.05) contrast(1.02);');
    expect(themeCss).toContain('--cruush-glass-material-noise: linear-gradient(180deg, rgba(255, 255, 255, 0.026), rgba(255, 255, 255, 0));');
    expect(themeCss).toContain('--cruush-glass-surface: radial-gradient(circle at 20% -8%, rgba(255, 255, 255, 0.32)');
    expect(themeCss).toContain('--cruush-glass-dock-bg: radial-gradient(circle at 18% -12%, rgba(255, 255, 255, 0.34)');
    expect(themeCss).toContain('--cruush-glass-current-bg: radial-gradient(circle at 34% 8%, rgba(255, 255, 255, 0.42)');
    expect(themeCss).toContain('--cruush-glass-menu-toggle-bg:');
    expect(themeCss).toContain('--cruush-liquid-shadow: 0 0 0 0.65px rgba(255, 255, 255, 0.55) inset');
    expect(themeCss).toContain('.cruush-glass-menu-toggle {');
    expect(themeCss).toContain('.cruush-liquid-glass-filters {');
    expect(themeCss).toContain('.cruush-liquid-glass-dock {');
    expect(themeCss).toContain('.cruush-liquid-glass-dock::before,');
    expect(themeCss).toContain('.fixed.cruush-glass-pill,');
    expect(themeCss).toContain('.absolute.cruush-glass-soft,');
    expect(themeCss).toContain('background: var(--cruush-glass-dock-bg);');
    expect(themeCss).toContain('box-shadow: var(--cruush-glass-dock-shadow);');
    expect(themeCss).toContain('.cruush-bottom-nav-current-page {');
    expect(themeCss).toContain('background: transparent;');
    expect(themeCss).toContain('.cruush-bottom-nav-indicator-surface::before,');
    expect(themeCss).toContain('left: calc(0.375rem + var(--bottom-nav-active-offset));');
    expect(themeCss).toContain('transition: left 520ms cubic-bezier(0.32, 0.72, 0, 1);');
    expect(themeCss).toContain('background: var(--cruush-glass-current-bg);');
    expect(themeCss).toContain('backdrop-filter: var(--cruush-glass-current-backdrop);');
    expect(themeCss).toContain('opacity: 0.52;');
  });

  it('keeps the cruush plus shimmer and recently active rail hooks available', () => {
    expect(themeCss).toContain('.cruush-plus-shimmer-button::before');
    expect(themeCss).toContain('animation: cruush-plus-shimmer 3.4s ease-in-out infinite;');
    expect(themeCss).toContain('.cruush-recently-active-panel {');
    expect(themeCss).toContain('.cruush-recently-active-toggle[data-state="open"] {');
    expect(themeCss).toContain('.cruush-map-3d-toggle[data-state="active"],');
    expect(themeCss).toContain('.cruush-map-heatmap-toggle[data-state="active"] {');
    expect(themeCss).toContain('button.cruush-map-3d-toggle[data-state="active"]:hover:not(:disabled)');
  });

  it('lets heart pin base paths render their gradient fills under the glass rim', () => {
    const fillNoneRule = themeCss.match(/\\.cruush-heart-glass-theme-border,[\\s\\S]*?fill: none;[\\s\\S]*?}/)?.[0] ?? '';

    expect(fillNoneRule).not.toContain('.cruush-heart-glass-base');
    expect(themeCss).toContain('.cruush-heart-glass-base {');
    expect(themeCss).toContain('paint-order: stroke fill;');
  });
});
