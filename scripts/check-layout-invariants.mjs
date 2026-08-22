#!/usr/bin/env node
// Enforces the CRUUSH-RULES section D layout invariants against a real  // ai-contract-allow-product-example
// rendered page. jsdom cannot do this: it has no layout, so every rect is
// zero and every overlap check silently passes. This drives the Chrome that
// is already on the machine over the DevTools Protocol, with no dependencies
// (Node 22 ships a global WebSocket).
//
//   node scripts/check-layout-invariants.mjs                      # localhost:5173
//   node scripts/check-layout-invariants.mjs --url https://cruush.app
//   node scripts/check-layout-invariants.mjs --path / --path /login --json
//
// Invariants checked (see docs/CRUUSH-RULES.md section D):  // ai-contract-allow-product-example
//   D1  bug-report button never intersects an interactive element or the logo
//   D2  logo not clipped, >=50px clearance to the top of the page
//   D5  bottom links fill the width and sit flush to the bottom
//   D6  markers are circles, never ovals
//   D7  nothing overlaps anything (butterflies excepted)
//   plus: no horizontal page overflow

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const DEFAULT_VIEWPORTS = [
  { label: 'mobile', width: 375, height: 812 },
  { label: 'tablet', width: 768, height: 1024 },
  { label: 'desktop', width: 1280, height: 800 },
];

function parseArgs(argv) {
  const args = {
    url: 'http://localhost:5173',
    paths: [],
    viewports: [],
    json: false,
    settleMs: 2500,
    // How long to wait for the app to render before measuring it.
    readyTimeoutMs: 15000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--url') args.url = argv[++index];
    else if (arg === '--path') args.paths.push(argv[++index]);
    else if (arg === '--viewport') {
      const [width, height] = String(argv[++index]).split('x').map(Number);
      args.viewports.push({ label: `${width}x${height}`, width, height });
    } else if (arg === '--settle') args.settleMs = Number(argv[++index]);
    else if (arg === '--ready-timeout') args.readyTimeoutMs = Number(argv[++index]);
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 20).join('\n'));
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.paths.length === 0) args.paths = ['/'];
  if (args.viewports.length === 0) args.viewports = DEFAULT_VIEWPORTS;
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `No Chrome found. Looked in:\n  ${CHROME_CANDIDATES.join('\n  ')}\nSet CHROME_PATH to override.`,
    );
  }
  return found;
}

async function launchChrome() {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'cruush-layout-'));
  const child = spawn(findChrome(), [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
      if (port) {
        return {
          port,
          close() {
            try { child.kill('SIGKILL'); } catch { /* already gone */ }
            try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* best effort */ }
          },
        };
      }
    }
    await sleep(100);
  }
  child.kill('SIGKILL');
  throw new Error('Chrome did not expose a DevTools port within 20s.');
}

async function openPageSession(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('Chrome exposed no page target.');

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  const waiters = [];
  let nextId = 1;

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} (${JSON.stringify(message.error.data ?? {})})`));
      else resolve(message.result);
      return;
    }
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      if (waiters[index].method === message.method) {
        waiters[index].resolve(message.params);
        waiters.splice(index, 1);
      }
    }
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('DevTools socket failed to open.')), { once: true });
  });

  return {
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    once(method, timeoutMs = 30_000) {
      return new Promise((resolve, reject) => {
        const waiter = { method, resolve };
        waiters.push(waiter);
        setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) {
            waiters.splice(index, 1);
            reject(new Error(`Timed out waiting for ${method}`));
          }
        }, timeoutMs);
      });
    },
    close() { socket.close(); },
  };
}

// Runs inside the page. Returns { violations, skipped, measured }.
const CHECKER = `(() => {
  const SELECTORS = {
    logo: '[data-testid="launch-login-auth-logo"], [data-testid="reset-password-logo"]',
    tagline: '[data-testid="launch-login-auth-tagline"]',
    capsule: '[data-testid="launch-login-auth-beta-capsule"]',
    panel: '[data-testid="launch-login-auth-panel"]',
    footer: '[data-testid="launch-login-auth-footer"], [data-testid="reset-password-footer"]',
    bugButton: '[aria-label="Report bug"]',
    bottomNav: '[data-testid="bottom-nav-pill"]',
    markers: '.maplibregl-marker, [data-testid*="heart-pin"], [data-testid*="map-pin"]',
  };

  const violations = [];
  const skipped = [];
  const measured = {};

  const box = (el) => {
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top), left: Math.round(r.left),
      right: Math.round(r.right), bottom: Math.round(r.bottom),
      width: Math.round(r.width), height: Math.round(r.height),
    };
  };
  const visible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const pick = (key) => {
    const el = document.querySelector(SELECTORS[key]);
    if (!el || !visible(el)) { skipped.push(key); return null; }
    measured[key] = box(el);
    return el;
  };
  // Tolerance absorbs sub-pixel rounding and the 1px hairlines borders draw.
  const intersects = (a, b, tolerance = 2) =>
    a.left < b.right - tolerance && b.left < a.right - tolerance &&
    a.top < b.bottom - tolerance && b.top < a.bottom - tolerance;

  const logo = pick('logo');
  const tagline = pick('tagline');
  const capsule = pick('capsule');
  const panel = pick('panel');
  const footer = pick('footer');
  const bugButton = pick('bugButton');

  // D2 — the logo is never cut off and keeps its clearance to the top.
  if (logo) {
    const r = measured.logo;
    if (r.top < 0) violations.push({ rule: 'D2', detail: 'logo is clipped by the top edge', rect: r });
    if (r.left < 0 || r.right > window.innerWidth) {
      violations.push({ rule: 'D2', detail: 'logo is clipped horizontally', rect: r, viewportWidth: window.innerWidth });
    }
    const pageTopOffset = r.top + window.scrollY;
    if (pageTopOffset < 50) {
      violations.push({ rule: 'D2', detail: 'logo has less than 50px clearance to the top of the page', clearance: pageTopOffset });
    }
  } else {
    violations.push({ rule: 'D2', detail: 'no logo found on this page — selector drifted or the page did not render' });
  }

  // D7 — nothing overlaps anything.
  const pairs = [['logo', logo], ['tagline', tagline], ['capsule', capsule], ['panel', panel], ['footer', footer]]
    .filter(([, el]) => el);
  for (let i = 0; i < pairs.length; i += 1) {
    for (let j = i + 1; j < pairs.length; j += 1) {
      const [nameA, elA] = pairs[i];
      const [nameB, elB] = pairs[j];
      // A parent legitimately contains its child; only siblings can collide.
      if (elA.contains(elB) || elB.contains(elA)) continue;
      if (intersects(box(elA), box(elB))) {
        violations.push({ rule: 'D7', detail: nameA + ' overlaps ' + nameB, a: box(elA), b: box(elB) });
      }
    }
  }

  // D1 — the bug-report button never sits on top of anything interactive.
  if (bugButton) {
    const bugRect = box(bugButton);
    const others = [...document.querySelectorAll('button, a, [role="button"], input, select')]
      .filter((el) => el !== bugButton && !bugButton.contains(el) && !el.contains(bugButton) && visible(el));
    for (const el of others) {
      if (intersects(bugRect, box(el))) {
        violations.push({
          rule: 'D1',
          detail: 'bug-report button intersects ' + (el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.tagName.toLowerCase()),
          a: bugRect, b: box(el),
        });
      }
    }
    if (logo && intersects(bugRect, box(logo))) {
      violations.push({ rule: 'D1', detail: 'bug-report button intersects the logo', a: bugRect, b: box(logo) });
    }
  }

  // D5 — bottom links fill the width and sit flush to the bottom.
  // "Fill the width" means the content column, not the viewport: on the login
  // page the column is the auth card, so a 320px footer under a 320px card is
  // correct and a viewport-wide footer would be wrong.
  if (footer) {
    const r = measured.footer;
    const column = panel ? box(panel) : (footer.parentElement ? box(footer.parentElement) : null);
    if (column && column.width > 0 && r.width < column.width * 0.9) {
      violations.push({ rule: 'D5', detail: 'footer does not fill the content column', footerWidth: r.width, columnWidth: column.width });
    }
    const contentBottom = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const gap = Math.round(contentBottom - (r.bottom + window.scrollY));
    if (gap > 64) violations.push({ rule: 'D5', detail: 'footer is not flush to the bottom', gapPx: gap });
  }

  // D6 — markers are circles, never ovals.
  for (const marker of document.querySelectorAll(SELECTORS.markers)) {
    if (!visible(marker)) continue;
    const r = box(marker);
    if (Math.abs(r.width - r.height) > 2) {
      violations.push({ rule: 'D6', detail: 'marker is an oval', rect: r });
    }
  }

  // No horizontal overflow — the page body must never scroll sideways.
  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    violations.push({
      rule: 'overflow',
      detail: 'page scrolls horizontally',
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    });
  }

  return { violations, skipped, measured };
})()`;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  try {
    const probe = await fetch(args.url, { redirect: 'manual' });
    if (probe.status >= 500) throw new Error(`${args.url} returned ${probe.status}`);
  } catch (error) {
    console.error(`Cannot reach ${args.url}: ${error.message}`);
    console.error('Start the dev server (pnpm dev) or pass --url https://cruush.app');
    process.exit(2);
  }

  const chrome = await launchChrome();
  const results = [];
  let failures = 0;

  try {
    const session = await openPageSession(chrome.port);
    await session.send('Page.enable');
    await session.send('Runtime.enable');

    for (const viewport of args.viewports) {
      await session.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.width < 768,
      });

      for (const pagePath of args.paths) {
        const url = new URL(pagePath, args.url).toString();
        const loaded = session.once('Page.loadEventFired');
        await session.send('Page.navigate', { url });
        await loaded.catch(() => { /* SPA routes can resolve before the event lands */ });

        // Wait for the app to actually be on screen rather than sleeping a
        // fixed time and hoping. The first viewport runs on a cold browser and
        // loses that race often enough to fail a release for no reason, and a
        // gate that cries wolf stops being read.
        //
        // This never weakens the check. If the page genuinely has nothing on it
        // once the deadline passes, the checker still runs and still reports it.
        const readyDeadline = Date.now() + args.readyTimeoutMs;
        for (;;) {
          const probe = await session.send('Runtime.evaluate', {
            expression: "Boolean(document.querySelector('[data-testid], main, #root > *'))",
            returnByValue: true,
          });

          if (probe.result?.value === true || Date.now() > readyDeadline) {
            break;
          }

          await sleep(100);
        }

        await sleep(args.settleMs);

        const evaluated = await session.send('Runtime.evaluate', {
          expression: CHECKER,
          returnByValue: true,
          awaitPromise: true,
        });
        if (evaluated.exceptionDetails) {
          throw new Error(`Checker threw on ${url} at ${viewport.label}: ${evaluated.exceptionDetails.text}`);
        }
        const result = evaluated.result.value;
        failures += result.violations.length;
        results.push({ url, viewport: viewport.label, ...result });
      }
    }
    session.close();
  } finally {
    chrome.close();
  }

  if (args.json) {
    console.log(JSON.stringify({ ok: failures === 0, results }, null, 2));
    process.exit(failures === 0 ? 0 : 1);
  }

  for (const result of results) {
    const header = `${result.viewport.padEnd(8)} ${result.url}`;
    if (result.violations.length === 0) {
      const skippedNote = result.skipped.length ? `  (not present: ${result.skipped.join(', ')})` : '';
      console.log(`  PASS  ${header}${skippedNote}`);
      continue;
    }
    console.log(`  FAIL  ${header}`);
    for (const violation of result.violations) {
      const { rule, detail, ...rest } = violation;
      console.log(`          ${rule}: ${detail}  ${JSON.stringify(rest)}`);
    }
  }

  if (failures > 0) {
    console.error(`\nlayout-invariants: ${failures} violation(s). See docs/CRUUSH-RULES.md section D.`);  // ai-contract-allow-product-example
    process.exit(1);
  }
  console.log('\nlayout-invariants: clean');
}

main().catch((error) => {
  console.error(`layout-invariants: ${error.message}`);
  process.exit(2);
});
