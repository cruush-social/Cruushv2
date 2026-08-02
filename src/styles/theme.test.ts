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
});
