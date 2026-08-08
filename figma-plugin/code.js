/**
 * cruush Kit — Figma plugin main thread.
 *
 * Two jobs:
 *   1. Place generated images (from media/generated) onto the canvas, either into the
 *      current selection or into a fresh grid of frames.
 *   2. Import the colour tokens from src/styles/theme.css as Figma paint styles.
 *
 * The plugin makes no network requests. Files arrive from a picker in the UI iframe,
 * which keeps every API key out of Figma.
 */

const MAX_FRAME_EDGE = 2048;
const GRID_GAP = 64;
const MAX_GRID_COLUMNS = 4;
const STYLE_PREFIX = 'cruush';

/* ------------------------------------------------------------------ colour */

/** sRGB transfer function. Figma paint colours are non-linear sRGB in the 0..1 range. */
function linearToSrgb(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

/** Oklch to sRGB, via Oklab and linear sRGB. Hue is in degrees. */
function oklchToRgb(lightness, chroma, hue) {
  const hueRadians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);

  const longCubeRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mediumCubeRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const shortCubeRoot = lightness - 0.0894841775 * a - 1.291485548 * b;

  const long = longCubeRoot * longCubeRoot * longCubeRoot;
  const medium = mediumCubeRoot * mediumCubeRoot * mediumCubeRoot;
  const short = shortCubeRoot * shortCubeRoot * shortCubeRoot;

  return {
    r: linearToSrgb(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
    g: linearToSrgb(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
    b: linearToSrgb(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/** Reads a number that may be written as a percentage. */
function readNumber(token, percentageBasis) {
  if (typeof token !== 'string') return NaN;
  const trimmed = token.trim();
  if (trimmed.endsWith('%')) return (parseFloat(trimmed) / 100) * percentageBasis;
  return parseFloat(trimmed);
}

/**
 * Parses a CSS colour into { r, g, b, a } with every channel in 0..1.
 * Returns null for anything unrecognised, including var() aliases.
 */
function parseCssColor(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim().replace(/\s+/g, ' ');
  if (!value || value.startsWith('var(')) return null;

  const hex = value.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .split('')
        .map((character) => character + character)
        .join('');
    }
    if (digits.length !== 6 && digits.length !== 8) return null;
    return {
      r: parseInt(digits.slice(0, 2), 16) / 255,
      g: parseInt(digits.slice(2, 4), 16) / 255,
      b: parseInt(digits.slice(4, 6), 16) / 255,
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }

  const functional = value.match(/^(rgba?|oklch)\(([^)]*)\)$/i);
  if (!functional) return null;

  const name = functional[1].toLowerCase();
  const parts = functional[2]
    .replace(/\//g, ' ')
    .split(/[, ]+/)
    .filter(Boolean);

  if (name === 'rgb' || name === 'rgba') {
    if (parts.length < 3) return null;
    const channels = parts.slice(0, 3).map((part) => readNumber(part, 255) / 255);
    if (channels.some(Number.isNaN)) return null;
    const alpha = parts.length > 3 ? readNumber(parts[3], 1) : 1;
    return {
      r: clamp01(channels[0]),
      g: clamp01(channels[1]),
      b: clamp01(channels[2]),
      a: Number.isNaN(alpha) ? 1 : clamp01(alpha),
    };
  }

  if (parts.length < 3) return null;
  const lightness = readNumber(parts[0], 1);
  const chroma = readNumber(parts[1], 0.4);
  const hue = readNumber(parts[2], 360);
  if ([lightness, chroma, hue].some(Number.isNaN)) return null;
  const alpha = parts.length > 3 ? readNumber(parts[3], 1) : 1;
  const rgb = oklchToRgb(lightness, chroma, hue);
  return { r: rgb.r, g: rgb.g, b: rgb.b, a: Number.isNaN(alpha) ? 1 : clamp01(alpha) };
}

/**
 * Pulls custom property declarations out of a stylesheet.
 * Later declarations win, which matches the cascade for a single file read top to bottom.
 * Aliases such as `--color-primary: var(--primary)` resolve to nothing and are dropped.
 */
function parseTokens(css) {
  if (typeof css !== 'string') return [];
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const declaration = /--([a-zA-Z0-9-]+)\s*:\s*([^;}]+)/g;
  const byName = new Map();

  let match = declaration.exec(withoutComments);
  while (match !== null) {
    const color = parseCssColor(match[2]);
    if (color) byName.set(match[1], color);
    match = declaration.exec(withoutComments);
  }

  return Array.from(byName, ([name, color]) => ({ name, color }));
}

/* ------------------------------------------------------------------ images */

function gridPosition(index, columns, cellWidth, cellHeight, origin) {
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: origin.x + column * (cellWidth + GRID_GAP),
    y: origin.y + row * (cellHeight + GRID_GAP),
  };
}

function fitWithin(width, height, maxEdge) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function imagePaint(hash) {
  return [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: hash }];
}

async function placeImages(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('No images selected.');
  }

  const fillable = figma.currentPage.selection.filter(
    (node) => 'fills' in node && node.type !== 'SLICE',
  );

  const prepared = [];
  for (const file of files) {
    const image = figma.createImage(new Uint8Array(file.bytes));
    const size = await image.getSizeAsync();
    prepared.push({ name: file.name, hash: image.hash, size });
  }

  // Selection wins: filling frames the designer already placed is almost always the intent.
  if (fillable.length > 0) {
    prepared.forEach((entry, index) => {
      const target = fillable[index % fillable.length];
      target.fills = imagePaint(entry.hash);
    });
    figma.currentPage.selection = fillable;
    figma.notify(`Filled ${fillable.length} layer${fillable.length === 1 ? '' : 's'}.`);
    return { placed: prepared.length, mode: 'selection' };
  }

  const columns = Math.min(MAX_GRID_COLUMNS, Math.ceil(Math.sqrt(prepared.length)));
  const first = fitWithin(prepared[0].size.width, prepared[0].size.height, MAX_FRAME_EDGE);
  const origin = {
    x: Math.round(figma.viewport.center.x - ((columns * (first.width + GRID_GAP)) / 2)),
    y: Math.round(figma.viewport.center.y - first.height / 2),
  };

  const frames = prepared.map((entry, index) => {
    const size = fitWithin(entry.size.width, entry.size.height, MAX_FRAME_EDGE);
    const frame = figma.createFrame();
    frame.name = entry.name;
    frame.resize(size.width, size.height);
    frame.fills = imagePaint(entry.hash);
    const position = gridPosition(index, columns, first.width, first.height, origin);
    frame.x = position.x;
    frame.y = position.y;
    figma.currentPage.appendChild(frame);
    return frame;
  });

  figma.currentPage.selection = frames;
  figma.viewport.scrollAndZoomIntoView(frames);
  figma.notify(`Placed ${frames.length} image${frames.length === 1 ? '' : 's'}.`);
  return { placed: frames.length, mode: 'grid' };
}

/* ------------------------------------------------------------------ tokens */

async function localPaintStyles() {
  if (typeof figma.getLocalPaintStylesAsync === 'function') {
    return figma.getLocalPaintStylesAsync();
  }
  return figma.getLocalPaintStyles();
}

async function importTokens(css) {
  const tokens = parseTokens(css);
  if (tokens.length === 0) {
    throw new Error('No colour tokens found in that file.');
  }

  const existing = await localPaintStyles();
  const byName = new Map(existing.map((style) => [style.name, style]));

  let created = 0;
  let updated = 0;

  for (const token of tokens) {
    const styleName = `${STYLE_PREFIX}/${token.name}`;
    let style = byName.get(styleName);
    if (style) {
      updated += 1;
    } else {
      style = figma.createPaintStyle();
      style.name = styleName;
      byName.set(styleName, style);
      created += 1;
    }
    style.paints = [
      {
        type: 'SOLID',
        color: { r: token.color.r, g: token.color.g, b: token.color.b },
        opacity: token.color.a,
      },
    ];
  }

  figma.notify(`${created} style${created === 1 ? '' : 's'} created, ${updated} updated.`);
  return { created, updated, total: tokens.length };
}

/* -------------------------------------------------------------------- wire */

if (typeof figma !== 'undefined') {
  figma.showUI(__html__, { width: 380, height: 540, themeColors: true });

  figma.ui.onmessage = async (message) => {
    try {
      if (message.type === 'place-images') {
        const result = await placeImages(message.files);
        figma.ui.postMessage({ type: 'done', action: 'place-images', result });
        return;
      }
      if (message.type === 'import-tokens') {
        const result = await importTokens(message.css);
        figma.ui.postMessage({ type: 'done', action: 'import-tokens', result });
        return;
      }
      if (message.type === 'close') {
        figma.closePlugin();
      }
    } catch (error) {
      const text = String((error && error.message) || error);
      figma.notify(text, { error: true });
      figma.ui.postMessage({ type: 'error', message: text });
    }
  };
}

// Present in Node when the parsing helpers are under test, absent in the Figma sandbox.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseCssColor, parseTokens, oklchToRgb, fitWithin, gridPosition };
}
