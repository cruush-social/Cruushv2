/** Frame sink: the render page POSTs each canvas here as a PNG. */
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(process.argv[2] ?? 'logo-frames');
const port = Number(process.argv[3] ?? 8791);

mkdirSync(outDir, { recursive: true });
let received = 0;

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const match = /^\/frame\/(\d+)$/.exec(req.url ?? '');
  if (req.method !== 'POST' || !match) {
    res.writeHead(404).end('not a frame');
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    writeFileSync(resolve(outDir, `frame-${match[1].padStart(4, '0')}.png`), Buffer.concat(chunks));
    received += 1;
    process.stdout.write(`\rframes: ${received}`);
    res.writeHead(200).end('ok');
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`frame sink on http://127.0.0.1:${port} -> ${outDir}`);
});
