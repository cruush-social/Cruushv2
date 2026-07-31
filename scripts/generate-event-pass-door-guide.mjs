import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requireFromServer = createRequire(new URL('../server/package.json', import.meta.url));
const sharp = requireFromServer('sharp');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, 'docs');
const pngOutput = path.join(outputDir, 'the-chocolate-factory-door-pass-hourly-guide.png');
const jpgOutput = path.join(outputDir, 'the-chocolate-factory-door-pass-hourly-guide.jpg');

const event = {
  venueName: 'The Chocolate Factory',
  address: '70 Scott Ave, Brooklyn, NY 11237',
  startsAt: process.env.LAUNCH_PARTY_STARTS_AT ?? '2026-07-31T22:00:00-04:00',
  endsAt: process.env.LAUNCH_PARTY_ENDS_AT ?? '2026-08-01T05:00:00-04:00',
  timeZone: process.env.LAUNCH_PARTY_TIME_ZONE ?? 'America/New_York',
};

const iconNames = [
  'camera',
  'cruush',
  'crowds',
  'feed',
  'ghost',
  'lucky',
  'map',
  'messages',
  'notifications',
  'profile',
  'safety',
  'send',
  'settings',
  'visibility',
];

const width = 2480;
const height = 3508;
const margin = 170;
const tableTop = 760;
const tableWidth = width - margin * 2;
const tableHeaderHeight = 92;
const rowHeight = 300;
const maxRowCount = 8;
const footerTop = 3180;
const iconSize = 148;
const hourMs = 60 * 60 * 1000;

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function formatShortTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: event.timeZone,
  }).format(value);
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    timeZone: event.timeZone,
  }).format(value);
}

function formatFullDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: event.timeZone,
    timeZoneName: 'short',
  }).format(value);
}

function formatWindowLines(start, end) {
  const showStartDate = formatShortDate(start);
  const showEndDate = formatShortDate(end);
  const startLine = `${showStartDate}, ${formatShortTime(start)}`;
  const endLine = showStartDate === showEndDate
    ? `to ${formatShortTime(end)}`
    : `to ${showEndDate}, ${formatShortTime(end)}`;

  return { startLine, endLine };
}

function getWindows() {
  const startsAtMs = Date.parse(event.startsAt);
  const endsAtMs = Date.parse(event.endsAt);

  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs) || startsAtMs >= endsAtMs) {
    throw new Error('Invalid launch party start/end time.');
  }

  const windows = [];
  for (let cursor = startsAtMs, index = 0; cursor < endsAtMs; cursor += hourMs, index += 1) {
    const validFrom = new Date(cursor);
    const validUntil = new Date(Math.min(cursor + hourMs, endsAtMs));
    windows.push({
      hourNumber: index + 1,
      iconName: iconNames[index % iconNames.length],
      validFrom,
      validUntil,
    });
  }

  return windows;
}

function rowPosition(index) {
  return {
    x: margin,
    y: tableTop + tableHeaderHeight + index * rowHeight,
  };
}

function iconPath(iconName) {
  const pngPath = path.join(repoRoot, 'src', 'app', 'assets', 'ui-icons', `${iconName}-colored.png`);
  const svgPath = path.join(repoRoot, 'src', 'app', 'assets', 'ui-icons', `${iconName}-colored.svg`);
  return iconName === 'crowds' || iconName === 'ghost' ? svgPath : pngPath;
}

async function buildIconComposite(iconName, left, top) {
  const input = await readFile(iconPath(iconName));
  const icon = await sharp(input, { density: 288 })
    .resize(iconSize, iconSize, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  return {
    input: icon,
    left,
    top,
  };
}

function buildSvg(windows) {
  const timeColumnX = margin + 70;
  const hourColumnX = margin + 900;
  const iconBoxX = margin + 1220;
  const iconNameX = margin + 1420;
  const tableBottom = tableTop + tableHeaderHeight + windows.length * rowHeight;
  const rows = windows.map((window, index) => {
    const { x, y } = rowPosition(index);
    const rowFill = index % 2 === 0 ? '#ffffff' : '#f7f7f8';
    const { startLine, endLine } = formatWindowLines(window.validFrom, window.validUntil);

    return `
      <g>
        <rect x="${x}" y="${y}" width="${tableWidth}" height="${rowHeight}" fill="${rowFill}"/>
        <line x1="${x}" y1="${y + rowHeight}" x2="${x + tableWidth}" y2="${y + rowHeight}" stroke="#d8d8dc" stroke-width="3"/>
        <text x="${timeColumnX}" y="${y + 100}" fill="#111111" font-family="Arial, sans-serif" font-size="42" font-weight="700">${escapeXml(startLine)}</text>
        <text x="${timeColumnX}" y="${y + 154}" fill="#333333" font-family="Arial, sans-serif" font-size="38">${escapeXml(endLine)}</text>
        <text x="${hourColumnX}" y="${y + 118}" fill="#111111" font-family="Arial, sans-serif" font-size="44">Hour ${window.hourNumber}</text>
        <rect x="${iconBoxX}" y="${y + 58}" width="${iconSize + 34}" height="${iconSize + 34}" rx="18" fill="#f0f0f2" stroke="#d0d0d4" stroke-width="3"/>
        <text x="${iconNameX}" y="${y + 118}" fill="#111111" font-family="Arial, sans-serif" font-size="54" font-weight="700">${escapeXml(window.iconName)}</text>
        <text x="${iconNameX}" y="${y + 174}" fill="#555555" font-family="Arial, sans-serif" font-size="32">Match this icon in the app</text>
      </g>
    `;
  }).join('\n');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#ffffff"/>
    <line x1="${margin}" y1="150" x2="${width - margin}" y2="150" stroke="#111111" stroke-width="8"/>
    <text x="${margin}" y="260" fill="#111111" font-family="Arial, sans-serif" font-size="42" font-weight="700" letter-spacing="7">DOOR PASS GUIDE</text>
    <text x="${margin}" y="390" fill="#111111" font-family="Arial, sans-serif" font-size="86" font-weight="700">${escapeXml(event.venueName)}</text>
    <text x="${margin}" y="475" fill="#333333" font-family="Arial, sans-serif" font-size="43">${escapeXml(event.address)}</text>
    <text x="${margin}" y="555" fill="#333333" font-family="Arial, sans-serif" font-size="40">${escapeXml(formatFullDate(new Date(event.startsAt)))} - ${escapeXml(formatFullDate(new Date(event.endsAt)))}</text>
    <text x="${margin}" y="640" fill="#111111" font-family="Arial, sans-serif" font-size="34" font-weight="700">Use the attendee's in-app door pass icon for the current hour.</text>

    <rect x="${margin}" y="${tableTop}" width="${tableWidth}" height="${tableHeaderHeight}" fill="#111111"/>
    <text x="${timeColumnX}" y="${tableTop + 60}" fill="#ffffff" font-family="Arial, sans-serif" font-size="34" font-weight="700">TIME</text>
    <text x="${hourColumnX}" y="${tableTop + 60}" fill="#ffffff" font-family="Arial, sans-serif" font-size="34" font-weight="700">HOUR</text>
    <text x="${iconBoxX}" y="${tableTop + 60}" fill="#ffffff" font-family="Arial, sans-serif" font-size="34" font-weight="700">ICON TO CHECK</text>
    ${rows}
    <rect x="${margin}" y="${tableTop}" width="${tableWidth}" height="${tableBottom - tableTop}" fill="none" stroke="#111111" stroke-width="4"/>
    <line x1="${margin + 820}" y1="${tableTop}" x2="${margin + 820}" y2="${tableBottom}" stroke="#111111" stroke-width="3"/>
    <line x1="${margin + 1135}" y1="${tableTop}" x2="${margin + 1135}" y2="${tableBottom}" stroke="#111111" stroke-width="3"/>

    <rect x="${margin}" y="${footerTop}" width="${tableWidth}" height="150" fill="#f7f7f8" stroke="#d8d8dc" stroke-width="3"/>
    <text x="${margin + 48}" y="${footerTop + 62}" fill="#111111" font-family="Arial, sans-serif" font-size="34" font-weight="700">Staff note</text>
    <text x="${margin + 48}" y="${footerTop + 112}" fill="#333333" font-family="Arial, sans-serif" font-size="32">Only the current-hour icon is valid. The in-app icon changes hourly.</text>
    <text x="${width - margin}" y="${height - 130}" text-anchor="end" fill="#555555" font-family="Arial, sans-serif" font-size="28">A4 portrait reference sheet</text>
  </svg>`;
}

async function main() {
  const windows = getWindows();
  if (windows.length > maxRowCount) {
    throw new Error(`Guide layout supports ${maxRowCount} windows, got ${windows.length}.`);
  }

  await mkdir(outputDir, { recursive: true });
  const svg = buildSvg(windows);
  const iconComposites = await Promise.all(windows.map((window, index) => {
    const { y } = rowPosition(index);
    return buildIconComposite(window.iconName, margin + 1237, y + 75);
  }));

  const png = await sharp(Buffer.from(svg))
    .composite(iconComposites)
    .png()
    .toBuffer();
  const jpg = await sharp(png)
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  await writeFile(pngOutput, png);
  await writeFile(jpgOutput, jpg);

  console.log(`Wrote ${path.relative(repoRoot, pngOutput)}`);
  console.log(`Wrote ${path.relative(repoRoot, jpgOutput)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
