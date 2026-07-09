import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(
  ROOT,
  'src/app/assets/generated-icons/gradient-black-square',
);
const SOURCE_DIRS = [
  { prefix: 'nav', dir: path.join(ROOT, 'src/app/assets/nav-icons') },
  { prefix: 'ui', dir: path.join(ROOT, 'src/app/assets/ui-icons') },
];
const PUBLIC_ICON_DIR = path.join(ROOT, 'public/icons');

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const CRC_TABLE = makeCrcTable();

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function assertPngSignature(buffer, filePath) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${filePath} is not a PNG file`);
  }
}

function readPng(buffer, filePath) {
  assertPngSignature(buffer, filePath);
  let offset = 8;
  let width;
  let height;
  let colorType;
  let bitDepth;
  let interlace;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      `${filePath} must be an 8-bit, RGBA, non-interlaced PNG. Found bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}.`,
    );
  }

  const inflated = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(width * height * bytesPerPixel);
  let inputOffset = 0;
  let previousRow = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const row = Buffer.from(inflated.subarray(inputOffset, inputOffset + stride));
    inputOffset += stride;

    unfilterRow(row, previousRow, filter, bytesPerPixel);
    row.copy(pixels, y * stride);
    previousRow = row;
  }

  return { width, height, pixels };
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterRow(row, previousRow, filter, bytesPerPixel) {
  for (let x = 0; x < row.length; x += 1) {
    const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
    const up = previousRow[x] ?? 0;
    const upLeft = x >= bytesPerPixel ? previousRow[x - bytesPerPixel] : 0;

    if (filter === 1) {
      row[x] = (row[x] + left) & 0xff;
    } else if (filter === 2) {
      row[x] = (row[x] + up) & 0xff;
    } else if (filter === 3) {
      row[x] = (row[x] + Math.floor((left + up) / 2)) & 0xff;
    } else if (filter === 4) {
      row[x] = (row[x] + paethPredictor(left, up, upLeft)) & 0xff;
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter: ${filter}`);
    }
  }
}

function writePng({ width, height, pixels }) {
  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const targetOffset = y * (stride + 1);
    scanlines[targetOffset] = 0;
    pixels.copy(scanlines, targetOffset + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND'),
  ]);
}

function compositeOverBlack(image) {
  const pixels = Buffer.alloc(image.pixels.length);
  for (let index = 0; index < image.pixels.length; index += 4) {
    const alpha = image.pixels[index + 3] / 255;
    pixels[index] = Math.round(image.pixels[index] * alpha);
    pixels[index + 1] = Math.round(image.pixels[index + 1] * alpha);
    pixels[index + 2] = Math.round(image.pixels[index + 2] * alpha);
    pixels[index + 3] = 255;
  }
  return { ...image, pixels };
}

function assetName(prefix, filePath) {
  const parsed = path.parse(filePath);
  return `${prefix}-${parsed.name.replace(/-colored$/, '')}-gradient-black-square`;
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function findSources() {
  const pngSources = [];
  const svgSources = [];

  for (const sourceDir of SOURCE_DIRS) {
    const files = await fs.readdir(sourceDir.dir);
    for (const file of files.sort()) {
      const fullPath = path.join(sourceDir.dir, file);
      if (file.endsWith('-colored.png')) {
        pngSources.push({
          prefix: sourceDir.prefix,
          source: fullPath,
          outputName: `${assetName(sourceDir.prefix, fullPath)}.png`,
        });
      } else if (file.endsWith('-colored.svg')) {
        svgSources.push({
          prefix: sourceDir.prefix,
          source: fullPath,
          outputName: `${assetName(sourceDir.prefix, fullPath)}.svg`,
        });
      }
    }
  }

  if (await pathExists(PUBLIC_ICON_DIR)) {
    const files = await fs.readdir(PUBLIC_ICON_DIR);
    for (const file of files.sort()) {
      if (!file.endsWith('.png')) continue;
      pngSources.push({
        prefix: 'public',
        source: path.join(PUBLIC_ICON_DIR, file),
        outputName: `public-${path.parse(file).name}-gradient-black-square.png`,
      });
    }
  }

  return { pngSources, svgSources };
}

async function generatePng(source) {
  const input = await fs.readFile(source.source);
  const png = readPng(input, source.source);
  const flattened = compositeOverBlack(png);
  const output = path.join(OUTPUT_DIR, source.outputName);
  await fs.writeFile(output, writePng(flattened));
  return {
    kind: 'png',
    source: path.relative(ROOT, source.source),
    output: path.relative(ROOT, output),
    width: png.width,
    height: png.height,
  };
}

function squareSvgFromSource(sourceSvg) {
  const viewBoxMatch = sourceSvg.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch?.[1] ?? '0 0 256 256';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#000"/>
  <svg x="0" y="0" width="256" height="256" viewBox="${escapeHtml(viewBox)}" preserveAspectRatio="xMidYMid meet">
${sourceSvg
  .replace(/<\?xml[^>]*>\s*/g, '')
  .replace(/<!DOCTYPE[^>]*>\s*/g, '')
  .replace(/<svg\b[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .trim()}
  </svg>
</svg>
`;
}

async function generateSvg(source) {
  const input = await fs.readFile(source.source, 'utf8');
  const output = path.join(OUTPUT_DIR, source.outputName);
  await fs.writeFile(output, squareSvgFromSource(input));
  return {
    kind: 'svg',
    source: path.relative(ROOT, source.source),
    output: path.relative(ROOT, output),
    width: 256,
    height: 256,
  };
}

function generateIndex(results) {
  const cards = results
    .map((result) => {
      const filename = path.basename(result.output);
      return `    <figure>
      <img src="./${escapeHtml(filename)}" alt="${escapeHtml(filename)}" />
      <figcaption>${escapeHtml(filename)}</figcaption>
    </figure>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gradient black square icons</title>
    <style>
      :root {
        color: #f7f2ff;
        background: #101012;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        padding: 32px;
      }
      h1 {
        font-size: 20px;
        font-weight: 700;
        margin: 0 0 20px;
      }
      main {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
        gap: 18px;
      }
      figure {
        margin: 0;
      }
      img {
        display: block;
        width: 128px;
        height: 128px;
        background: #000;
        border: 1px solid rgba(255, 255, 255, 0.14);
      }
      figcaption {
        margin-top: 8px;
        color: rgba(247, 242, 255, 0.72);
        font-size: 11px;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }
    </style>
  </head>
  <body>
    <h1>Gradient black square icons</h1>
    <main>
${cards}
    </main>
  </body>
</html>
`;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const { pngSources, svgSources } = await findSources();
  const results = [
    ...(await Promise.all(pngSources.map(generatePng))),
    ...(await Promise.all(svgSources.map(generateSvg))),
  ].sort((a, b) => a.output.localeCompare(b.output));

  await fs.writeFile(
    path.join(OUTPUT_DIR, 'index.html'),
    generateIndex(results),
  );
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'manifest.json'),
    `${JSON.stringify(results, null, 2)}\n`,
  );

  for (const result of results) {
    console.log(`${result.output} (${result.width}x${result.height})`);
  }
  console.log(`Generated ${results.length} icons.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
