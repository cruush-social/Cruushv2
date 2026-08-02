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

  it('allows glass heart bases to keep their gradient fill', () => {
    const heartBaseRule = themeCss.match(/\.cruush-heart-glass-base\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body ?? '';
    const heartLineRule = themeCss.match(/\.cruush-heart-glass-theme-border,[\s\S]*?\.cruush-heart-glass-specular\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body ?? '';

    expect(heartBaseRule).not.toContain('fill: none;');
    expect(heartLineRule).toContain('fill: none;');
  });

  it('keeps heart glass edge strokes neutral instead of neon', () => {
    const heartEdgeRules = themeCss.match(
      /\.cruush-heart-glass-edge-magenta\s*\{(?<magenta>[\s\S]*?)\}\s*\.cruush-heart-glass-edge-cyan\s*\{(?<cyan>[\s\S]*?)\}/,
    )?.groups;

    expect(heartEdgeRules?.magenta).toContain('stroke: rgba(255, 255, 255, 0.58);');
    expect(heartEdgeRules?.cyan).toContain('stroke: rgba(232, 252, 255, 0.62);');
    expect(`${heartEdgeRules?.magenta ?? ''}${heartEdgeRules?.cyan ?? ''}`).not.toMatch(/255,\s*(0|196),\s*(114|230)|193,\s*246,\s*255/i);
  });
});
