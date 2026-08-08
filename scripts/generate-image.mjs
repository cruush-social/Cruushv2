#!/usr/bin/env node
/**
 * Multi-provider image generator.
 *
 * Backends: fal (FLUX), openai (gpt-image-1), replicate (any image model), local (mflux on Apple Silicon).
 *
 * Credentials are read from the shell environment only. This script never reads
 * `.env` files, matching `release-main-coolify.mjs`, so keys stay out of the repo.
 *
 *   FAL_KEY               fal.ai
 *   OPENAI_API_KEY        OpenAI
 *   REPLICATE_API_TOKEN   Replicate
 *   (local needs no key)
 *
 * Every run writes the images plus a sidecar JSON holding the exact request, so a
 * result can be reproduced later by replaying the recorded seed and model.
 */

import { constants, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'media/generated');

/** Where local model weights and the mflux install live. Overridable for a different drive. */
const LOCAL_HOME = process.env.CRUUSH_IMAGE_LOCAL_HOME ?? '/Volumes/Untitled/cruush-ai';

/** Weight quantization used by the local backend when --quantize is not passed. */
const LOCAL_DEFAULT_QUANTIZE = 4;

/**
 * Default local weights. Both FLUX.1-schnell and FLUX.1-dev are gated on HuggingFace and
 * need an accepted licence plus HF_TOKEN, so the default is an ungated, pre-quantized
 * Z-Image-Turbo build: 5.9 GB to download instead of 58 GB, and it fits in 18 GB of RAM.
 * Pass --model schnell --base-model schnell once HF_TOKEN is set to use FLUX instead.
 */
const LOCAL_DEFAULT_MODEL = 'filipstrand/Z-Image-Turbo-mflux-4bit';

/** Base architectures mflux understands, longest match first so turbo variants win. */
const LOCAL_BASE_MODELS = [
  'z-image-turbo',
  'z-image',
  'flux2-klein-base-9b',
  'flux2-klein-base-4b',
  'flux2-klein-9b-kv',
  'flux2-klein-9b',
  'flux2-klein-4b',
  'ernie-image-turbo',
  'ernie-image',
  'ideogram4',
  'fibo-edit-rmbg',
  'fibo-edit',
  'fibo-lite',
  'fibo',
  'qwen',
  'krea-dev',
  'dev-krea',
  'schnell',
  'dev',
];

const SIZE_PRESETS = {
  square: { width: 1024, height: 1024 },
  portrait: { width: 1024, height: 1536 },
  landscape: { width: 1536, height: 1024 },
  story: { width: 1080, height: 1920 },
  wide: { width: 1920, height: 1080 },
  avatar: { width: 768, height: 768 },
};

const REPLICATE_ASPECT_RATIOS = [
  ['1:1', 1],
  ['4:5', 0.8],
  ['2:3', 2 / 3],
  ['3:4', 0.75],
  ['9:16', 0.5625],
  ['9:21', 9 / 21],
  ['5:4', 1.25],
  ['3:2', 1.5],
  ['4:3', 4 / 3],
  ['16:9', 16 / 9],
  ['21:9', 21 / 9],
];

const OPENAI_SIZES = [
  ['1024x1024', 1],
  ['1024x1536', 1024 / 1536],
  ['1536x1024', 1536 / 1024],
];

const USAGE = `
Generate images from a prompt.

Usage:
  node scripts/generate-image.mjs --provider <codex|local|pollinations|fal|openai|replicate> --prompt "<text>" [options]

Backends that cost no extra money: codex (your ChatGPT plan), local (this Mac), pollinations (hosted).

Options:
  --provider <name>   Backend to use. Defaults to $IMAGE_PROVIDER, then a backend with a key set,
                      then local.
  --import <paths>    Skip generation. File one or more existing images (comma separated) into the
                      output directory with the usual naming and sidecar. For ChatGPT downloads.
  --prompt <text>     Required. The image description.
  --negative <text>   Things to avoid. Ignored by providers that do not support it.
  --count <n>         Number of images. Default 1.
  --size <spec>       WIDTHxHEIGHT or a preset: ${Object.keys(SIZE_PRESETS).join(', ')}. Default square.
  --seed <n>          Fixed seed. Reuse the same seed and model for a consistent look across a set.
  --model <id>        Override the provider's default model.
  --steps <n>         Denoising steps. Higher is slower and usually sharper.
  --out <dir>         Output directory. Default media/generated (gitignored).
  --name <slug>       Filename prefix. Defaults to a slug of the prompt.
  --quality <level>   OpenAI only: low | medium | high.
  --base-model <id>   local only: architecture for a third-party HuggingFace repo. Usually inferred.
  --quantize <bits>   local only: 3, 4, 5, 6 or 8. Lower uses less memory. 0 disables quantization.
  --timeout <seconds> Per-request timeout. Default 300, or 900 for codex and local.
  --reference <paths> codex only: existing image(s) to match the style of, comma separated.
  --verbose           codex only: stream the agent's output instead of hiding it.
  --dry-run           Print the request that would be sent, call nothing.
  --status            Show each provider and whether its key is present.
  --help              Show this message.

Examples:
  node scripts/generate-image.mjs --prompt "soft gradient abstract background" --seed 7
  node scripts/generate-image.mjs --provider pollinations --prompt "neon city skyline at dusk" --count 4
  node scripts/generate-image.mjs --provider openai --prompt "app store screenshot frame" --size portrait --quality high
  node scripts/generate-image.mjs --import ~/Downloads/chatgpt-image.png --name onboarding-hero
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const equals = token.indexOf('=');
    if (equals !== -1) {
      args[token.slice(2, equals)] = token.slice(equals + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function fail(message) {
  const error = new Error(message);
  error.expected = true;
  throw error;
}

function requireEnv(name, provider) {
  const value = process.env[name];
  if (!value) {
    fail(
      `${provider} needs ${name}. Set it in the shell that runs this command:\n` +
        `  export ${name}="<your key>"\n` +
        'Do not put it in a committed file.',
    );
  }
  return value;
}

function parseSize(raw) {
  if (!raw) return SIZE_PRESETS.square;
  const preset = SIZE_PRESETS[String(raw).toLowerCase()];
  if (preset) return preset;
  const match = String(raw).match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!match) {
    fail(`Bad --size "${raw}". Use WIDTHxHEIGHT or one of: ${Object.keys(SIZE_PRESETS).join(', ')}`);
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parseInteger(raw, label) {
  if (raw === undefined || raw === true) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value)) fail(`--${label} must be a whole number, got "${raw}"`);
  return value;
}

function closestByRatio(candidates, ratio) {
  let best = candidates[0];
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.abs(Math.log(candidate[1] / ratio));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best[0];
}

function slugify(text) {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'image';
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
}

function extensionFor(contentType, fallback = 'png') {
  if (!contentType) return fallback;
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('png')) return 'png';
  return fallback;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** POST/GET with a timeout, one retry ladder for 429 and 5xx, and no header logging. */
async function request(url, init, timeoutMs, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      fail(`Request to ${new URL(url).host} timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  }
  clearTimeout(timer);

  if ((response.status === 429 || response.status >= 500) && attempt < 3) {
    const retryAfter = Number(response.headers.get('retry-after'));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 2000;
    process.stderr.write(`  ${response.status} from ${new URL(url).host}, retrying in ${backoff / 1000}s\n`);
    await sleep(backoff);
    return request(url, init, timeoutMs, attempt + 1);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    fail(`${new URL(url).host} returned ${response.status} ${response.statusText}\n${body.slice(0, 1200)}`);
  }
  return response;
}

async function requestJson(url, init, timeoutMs) {
  const response = await request(url, init, timeoutMs);
  return response.json();
}

async function downloadImage(url, timeoutMs) {
  const response = await request(url, { method: 'GET' }, timeoutMs);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, extension: extensionFor(response.headers.get('content-type')) };
}

const providers = {
  fal: {
    label: 'fal.ai',
    envKey: 'FAL_KEY',
    defaultModel: 'fal-ai/flux/schnell',
    describe: (options) => ({
      endpoint: `https://fal.run/${options.model}`,
      body: falBody(options),
    }),
    async generate(options) {
      const key = requireEnv('FAL_KEY', 'fal.ai');
      const payload = await requestJson(
        `https://fal.run/${options.model}`,
        {
          method: 'POST',
          headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(falBody(options)),
        },
        options.timeoutMs,
      );
      const images = payload.images ?? payload.image ?? [];
      const list = Array.isArray(images) ? images : [images];
      if (list.length === 0) fail(`fal.ai returned no images.\n${JSON.stringify(payload).slice(0, 800)}`);
      const results = [];
      for (const image of list) {
        const { buffer, extension } = await downloadImage(image.url, options.timeoutMs);
        results.push({ buffer, extension });
      }
      return { images: results, meta: { seed: payload.seed, has_nsfw_concepts: payload.has_nsfw_concepts } };
    },
  },

  openai: {
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-image-1',
    describe: (options) => ({
      endpoint: 'https://api.openai.com/v1/images/generations',
      body: openaiBody(options),
    }),
    async generate(options) {
      const key = requireEnv('OPENAI_API_KEY', 'OpenAI');
      const payload = await requestJson(
        'https://api.openai.com/v1/images/generations',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(openaiBody(options)),
        },
        options.timeoutMs,
      );
      const data = payload.data ?? [];
      if (data.length === 0) fail(`OpenAI returned no images.\n${JSON.stringify(payload).slice(0, 800)}`);
      const results = [];
      for (const item of data) {
        if (item.b64_json) {
          results.push({ buffer: Buffer.from(item.b64_json, 'base64'), extension: 'png' });
          continue;
        }
        if (item.url) {
          results.push(await downloadImage(item.url, options.timeoutMs));
          continue;
        }
        fail('OpenAI response item had neither b64_json nor url.');
      }
      return { images: results, meta: { usage: payload.usage, revised_prompt: data[0]?.revised_prompt } };
    },
  },

  replicate: {
    label: 'Replicate',
    envKey: 'REPLICATE_API_TOKEN',
    defaultModel: 'black-forest-labs/flux-schnell',
    describe: (options) => ({
      endpoint: replicateEndpoint(options.model),
      body: replicateBody(options),
    }),
    async generate(options) {
      const token = requireEnv('REPLICATE_API_TOKEN', 'Replicate');
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      };
      let prediction = await requestJson(
        replicateEndpoint(options.model),
        { method: 'POST', headers, body: JSON.stringify(replicateBody(options)) },
        options.timeoutMs,
      );

      const deadline = Date.now() + options.timeoutMs;
      while (['starting', 'processing'].includes(prediction.status)) {
        if (Date.now() > deadline) fail(`Replicate prediction ${prediction.id} still ${prediction.status} at timeout.`);
        await sleep(2000);
        prediction = await requestJson(prediction.urls.get, { method: 'GET', headers }, options.timeoutMs);
      }

      if (prediction.status !== 'succeeded') {
        fail(`Replicate prediction ${prediction.status}: ${prediction.error ?? 'no error detail'}`);
      }

      const output = Array.isArray(prediction.output) ? prediction.output : [prediction.output];
      const urls = output.filter((entry) => typeof entry === 'string' && entry.startsWith('http'));
      if (urls.length === 0) fail(`Replicate returned no image URLs.\n${JSON.stringify(prediction.output).slice(0, 800)}`);

      const results = [];
      for (const url of urls) {
        results.push(await downloadImage(url, options.timeoutMs));
      }
      return { images: results, meta: { id: prediction.id, metrics: prediction.metrics } };
    },
  },

  codex: {
    label: 'Codex (ChatGPT plan)',
    envKey: null,
    defaultModel: 'gpt-5.5',
    describe: (options) => ({
      endpoint: 'codex exec (subprocess, billed to the signed-in ChatGPT plan)',
      body: codexPrompt(options),
    }),
    async generate(options) {
      const binary = await codexBinary();
      const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-image-'));
      // A second of slack, because the tool can stamp a file just before the process starts.
      const since = Date.now() - 1000;

      // `-i` is variadic, so a positional prompt after it gets read as another file path.
      // Feeding the prompt over stdin sidesteps that entirely.
      const commandArguments = ['exec', '--skip-git-repo-check'];
      if (options.modelExplicit) commandArguments.push('-m', options.model);
      for (const reference of options.references) commandArguments.push('-i', reference);

      try {
        await runProcess(binary, commandArguments, options.timeoutMs, {
          label: 'Codex',
          cwd: workingDirectory,
          quiet: !options.verbose,
          stdin: codexPrompt(options),
          notFound:
            `Could not find the Codex binary at "${binary}".\n` +
            'It ships inside the ChatGPT app at /Applications/ChatGPT.app/Contents/Resources/codex.\n' +
            'Set CODEX_BIN to point at it if it lives somewhere else.',
        });
      } finally {
        await fs.rm(workingDirectory, { recursive: true, force: true });
      }

      const produced = await collectCodexImages(since);
      if (produced.length === 0) {
        fail(
          `Codex ran but wrote no image to ${CODEX_IMAGE_DIR}.\n` +
            'Check that you are signed in (codex login) and that the image_generation feature is on:\n' +
            '  codex features list | grep image_generation',
        );
      }

      // Take the newest, not the oldest. Codex sometimes emits a warm-up image from its own
      // prompt scaffolding before the real one, and that stray lands first.
      const chosen = produced.slice(-options.count);

      const results = [];
      for (const entry of chosen) {
        results.push({
          buffer: await fs.readFile(entry.path),
          extension: path.extname(entry.path).slice(1).toLowerCase() || 'png',
        });
      }
      return {
        images: results,
        meta: {
          sources: chosen.map((entry) => entry.path),
          discarded: produced.slice(0, -options.count).map((entry) => entry.path),
        },
      };
    },
  },

  pollinations: {
    label: 'Pollinations',
    envKey: null,
    defaultModel: 'flux',
    describe: (options) => ({
      endpoint: pollinationsUrl(options, options.seed ?? 0),
      body: null,
    }),
    async generate(options) {
      const results = [];
      const seeds = [];
      for (let index = 0; index < options.count; index += 1) {
        // Responses are cached per URL, so a fixed prompt with no seed would return the same
        // picture every time. Vary the seed and record it so any result stays reproducible.
        const seed = options.seed === undefined ? randomSeed() : options.seed + index;
        seeds.push(seed);
        results.push(await downloadImage(pollinationsUrl(options, seed), options.timeoutMs));
      }
      return { images: results, meta: { seeds } };
    },
  },

  local: {
    label: 'local mflux',
    envKey: null,
    defaultModel: LOCAL_DEFAULT_MODEL,
    describe: (options) => ({
      endpoint: `${localBinary(options)} (subprocess)`,
      body: localArguments(options, '<output path>'),
    }),
    async generate(options) {
      const binary = localBinary(options);
      const results = [];
      for (let index = 0; index < options.count; index += 1) {
        const temporary = path.join(options.outputDir, `.mflux-${process.pid}-${index}.png`);
        const seed = options.seed === undefined ? undefined : options.seed + index;
        const commandArguments = localArguments({ ...options, seed }, temporary);
        await runLocal(binary, commandArguments, options.timeoutMs);
        const buffer = await fs.readFile(temporary);
        await fs.rm(temporary, { force: true });
        results.push({ buffer, extension: 'png' });
      }
      return { images: results, meta: { home: LOCAL_HOME } };
    },
  },
};

function falBody(options) {
  const body = {
    prompt: options.prompt,
    image_size: { width: options.width, height: options.height },
    num_images: options.count,
  };
  if (options.seed !== undefined) body.seed = options.seed;
  if (options.steps !== undefined) body.num_inference_steps = options.steps;
  if (options.negative) body.negative_prompt = options.negative;
  return body;
}

function openaiBody(options) {
  const size = closestByRatio(OPENAI_SIZES, options.width / options.height);
  const body = {
    model: options.model,
    prompt: options.negative ? `${options.prompt}\n\nAvoid: ${options.negative}` : options.prompt,
    n: options.count,
    size,
  };
  if (options.quality) body.quality = options.quality;
  return body;
}

function replicateEndpoint(model) {
  return model.includes(':')
    ? 'https://api.replicate.com/v1/predictions'
    : `https://api.replicate.com/v1/models/${model}/predictions`;
}

function replicateBody(options) {
  const input = {
    prompt: options.prompt,
    aspect_ratio: closestByRatio(REPLICATE_ASPECT_RATIOS, options.width / options.height),
    num_outputs: options.count,
    output_format: 'png',
  };
  if (options.seed !== undefined) input.seed = options.seed;
  if (options.steps !== undefined) input.num_inference_steps = options.steps;
  return options.model.includes(':')
    ? { version: options.model.split(':').pop(), input }
    : { input };
}

/**
 * mflux ships one executable per architecture. `mflux-generate` is the FLUX.1 entrypoint and
 * fails on other model layouts, so the base model decides which binary to run.
 */
const LOCAL_BINARIES = {
  'z-image-turbo': 'mflux-generate-z-image-turbo',
  'z-image': 'mflux-generate-z-image',
  qwen: 'mflux-generate-qwen',
  fibo: 'mflux-generate-fibo',
  'fibo-lite': 'mflux-generate-fibo',
  'fibo-edit': 'mflux-generate-fibo-edit',
  'fibo-edit-rmbg': 'mflux-generate-fibo-edit',
  'ernie-image': 'mflux-generate-ernie-image',
  'ernie-image-turbo': 'mflux-generate-ernie-image-turbo',
  ideogram4: 'mflux-generate-ideogram4',
  'flux2-klein-4b': 'mflux-generate-flux2',
  'flux2-klein-9b': 'mflux-generate-flux2',
  'flux2-klein-9b-kv': 'mflux-generate-flux2',
  'flux2-klein-base-4b': 'mflux-generate-flux2',
  'flux2-klein-base-9b': 'mflux-generate-flux2',
};

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000);
}

/**
 * Pollinations serves images straight off a GET, with no account and no key.
 * `private=true` keeps the prompt off their public feed. The prompt still leaves this
 * machine, so treat it as a public service and keep anything sensitive on the local backend.
 */
function pollinationsUrl(options, seed) {
  const params = new URLSearchParams({
    width: String(options.width),
    height: String(options.height),
    model: options.model,
    nologo: 'true',
    private: 'true',
  });
  if (seed !== undefined) params.set('seed', String(seed));
  if (options.negative) params.set('negative_prompt', options.negative);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(options.prompt)}?${params}`;
}

function localBinary(options) {
  if (process.env.MFLUX_BIN) return process.env.MFLUX_BIN;
  const architecture = options ? localArchitecture(options) : undefined;
  return LOCAL_BINARIES[architecture] ?? 'mflux-generate';
}

/** Which mflux architecture the requested weights are, inferred from the model or repo name. */
function localArchitecture(options) {
  if (options.baseModel) return options.baseModel;
  const lower = options.model.toLowerCase();
  return LOCAL_BASE_MODELS.find((base) => lower.includes(base));
}

/** mflux only needs the architecture spelled out when the weights come from a third-party repo. */
function localBaseModel(options) {
  if (!options.model.includes('/')) return options.baseModel;
  return localArchitecture(options);
}

function localArguments(options, outputPath) {
  const commandArguments = [
    '--model',
    options.model,
    '--prompt',
    options.prompt,
    '--width',
    String(options.width),
    '--height',
    String(options.height),
    '--output',
    outputPath,
  ];

  const baseModel = localBaseModel(options);
  if (baseModel) commandArguments.push('--base-model', baseModel);
  if (options.seed !== undefined) commandArguments.push('--seed', String(options.seed));
  if (options.steps !== undefined) commandArguments.push('--steps', String(options.steps));
  if (options.negative) commandArguments.push('--negative-prompt', options.negative);

  // Full-precision weights need roughly 24 GB of unified memory, so quantize by default to
  // keep an 18 GB machine off swap. Repos that ship already quantized must not be re-quantized.
  const preQuantized = /[-_](3|4|5|6|8)bit/.test(options.model.toLowerCase());
  const quantize = options.quantize ?? (preQuantized ? 0 : LOCAL_DEFAULT_QUANTIZE);
  if (quantize) commandArguments.push('-q', String(quantize));

  return commandArguments;
}

function runProcess(binary, commandArguments, timeoutMs, settings = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, commandArguments, {
      stdio: [
        settings.stdin === undefined ? 'ignore' : 'pipe',
        settings.quiet ? 'ignore' : 'inherit',
        'inherit',
      ],
      cwd: settings.cwd,
      env: settings.env ?? process.env,
    });

    if (settings.stdin !== undefined) {
      child.stdin.on('error', () => {
        // The child can exit before the prompt is flushed; the close handler reports that.
      });
      child.stdin.end(settings.stdin);
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${settings.label ?? 'Generation'} timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      if (error.code === 'ENOENT' && settings.notFound) {
        const notFound = new Error(settings.notFound);
        notFound.expected = true;
        reject(notFound);
        return;
      }
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${settings.label ?? 'Generation'} exited with code ${code}.`));
    });
  });
}

function runLocal(binary, commandArguments, timeoutMs) {
  return runProcess(binary, commandArguments, timeoutMs, {
    label: 'Local generation',
    env: {
      ...process.env,
      HF_HOME: process.env.HF_HOME ?? path.join(LOCAL_HOME, 'hf-cache'),
    },
    notFound:
      `Could not find "${binary}". Install the local backend:\n` +
      `  UV_TOOL_DIR=${path.join(LOCAL_HOME, 'uv-tools')} uv tool install mflux --python 3.12\n` +
      'Or point MFLUX_BIN at an existing install.',
  });
}

/* -------------------------------------------------------------------- codex */

/** Where the Codex image tool drops what it makes, one directory per session. */
const CODEX_IMAGE_DIR = path.join(os.homedir(), '.codex', 'generated_images');

const CODEX_CANDIDATES = [
  '/Applications/ChatGPT.app/Contents/Resources/codex',
  path.join(os.homedir(), '.local/bin/codex'),
  '/opt/homebrew/bin/codex',
  '/usr/local/bin/codex',
];

async function codexBinary() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  for (const candidate of CODEX_CANDIDATES) {
    try {
      await fs.access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // try the next one, then fall back to whatever is on PATH
    }
  }
  return 'codex';
}

/**
 * Codex bills against the signed-in ChatGPT plan, so the instructions keep it on the image tool
 * and off everything else. Every shell command it decides to run costs tokens from that plan.
 */
function codexPrompt(options) {
  const lines = [
    `Use your built-in image generation tool to create ${options.count} image${options.count === 1 ? '' : 's'}.`,
    `Subject: ${options.prompt}`,
    `Dimensions: ${options.width}x${options.height}.`,
  ];
  if (options.references.length > 0) {
    lines.push(
      'The attached image is a style reference. Match its palette, lighting, materials and composition.',
      'Do not copy it exactly, produce a new variation.',
    );
  }
  if (options.negative) lines.push(`Avoid: ${options.negative}`);
  lines.push(
    'Leave each image exactly where the tool saves it.',
    'Do not run shell commands. Do not move, copy, rename or delete files. Do not write or edit code.',
    'When the images exist, reply with only the word DONE.',
  );
  return lines.join('\n');
}

async function collectCodexImages(since) {
  const found = [];

  async function walk(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.(png|jpe?g|webp)$/i.test(entry.name)) continue;
      const stats = await fs.stat(full);
      if (stats.mtimeMs >= since) found.push({ path: full, mtime: stats.mtimeMs });
    }
  }

  await walk(CODEX_IMAGE_DIR);
  return found.sort((first, second) => first.mtime - second.mtime);
}

async function codexInstalled() {
  const binary = await codexBinary();
  try {
    await fs.access(binary, constants.X_OK);
    return binary;
  } catch {
    return null;
  }
}

async function pickProvider(requested) {
  const name = requested ?? process.env.IMAGE_PROVIDER;
  if (name) {
    if (!providers[name]) {
      fail(`Unknown provider "${name}". Choose one of: ${Object.keys(providers).join(', ')}`);
    }
    return name;
  }
  // Prefer a paid backend when its key is set, then Codex on the existing ChatGPT plan,
  // then the local model. The last two cost nothing beyond what is already being paid.
  const configured = Object.keys(providers).find(
    (key) => providers[key].envKey && process.env[providers[key].envKey],
  );
  if (configured) return configured;
  return (await codexInstalled()) ? 'codex' : 'local';
}

async function printStatus() {
  const codexPath = await codexInstalled();

  process.stdout.write('Providers:\n');
  for (const [name, provider] of Object.entries(providers)) {
    let ready = true;
    let detail;

    if (provider.envKey) {
      ready = Boolean(process.env[provider.envKey]);
      detail = `${provider.envKey} ${ready ? 'set' : 'missing'}`;
    } else if (name === 'codex') {
      ready = Boolean(codexPath);
      detail = codexPath ?? 'codex binary not found';
    } else if (name === 'local') {
      detail = `${provider.defaultModel}, weights under ${path.join(LOCAL_HOME, 'hf-cache')}`;
    } else {
      detail = `${provider.defaultModel}, no account needed`;
    }

    process.stdout.write(
      `  ${ready ? 'ready  ' : 'not set'} ${name.padEnd(12)} ${provider.label.padEnd(22)} ${detail}\n`,
    );
  }

  process.stdout.write(`\nDefault: ${await pickProvider(undefined)}\n`);
  process.stdout.write(`Output directory: ${DEFAULT_OUTPUT_DIR}\n`);
}

const IMPORT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);

function expandHome(target) {
  return target.startsWith('~/') ? path.join(os.homedir(), target.slice(2)) : target;
}

/**
 * Files an image that was made somewhere else, such as a download from the ChatGPT app, into
 * media/generated with the same naming and sidecar as a generated one, so everything
 * downstream treats it identically.
 */
async function importFiles(args) {
  const sources = String(args.import)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .concat(args._.filter((entry) => typeof entry === 'string'));

  if (sources.length === 0) fail('--import needs at least one file path.');

  const outputDir = path.resolve(ROOT, typeof args.out === 'string' ? args.out : DEFAULT_OUTPUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });

  const stamp = timestamp();
  const note = typeof args.prompt === 'string' ? args.prompt.trim() : '';
  const slug =
    typeof args.name === 'string'
      ? slugify(args.name)
      : slugify(note || path.parse(expandHome(sources[0])).name);

  const written = [];
  for (const [index, source] of sources.entries()) {
    const resolved = path.resolve(ROOT, expandHome(source));
    const extension = path.extname(resolved).toLowerCase();
    if (!IMPORT_EXTENSIONS.has(extension)) {
      fail(`${source} is not an image this script imports (${[...IMPORT_EXTENSIONS].join(', ')}).`);
    }
    const buffer = await fs.readFile(resolved).catch(() => {
      fail(`Could not read ${source}.`);
    });
    const suffix = sources.length > 1 ? `-${String(index + 1).padStart(2, '0')}` : '';
    const target = path.join(outputDir, `${slug}-${stamp}${suffix}${extension}`);
    await fs.writeFile(target, buffer);
    written.push({ target, source: resolved, bytes: buffer.length });
    process.stdout.write(
      `  ${path.relative(ROOT, target)}  ${(buffer.length / 1024).toFixed(0)} KB\n`,
    );
  }

  const sidecarPath = path.join(outputDir, `${slug}-${stamp}.json`);
  await fs.writeFile(
    sidecarPath,
    `${JSON.stringify(
      {
        provider: 'import',
        model: typeof args.model === 'string' ? args.model : null,
        prompt: note || null,
        importedAt: new Date().toISOString(),
        sources: written.map((entry) => entry.source),
        files: written.map((entry) => path.relative(ROOT, entry.target)),
      },
      null,
      2,
    )}\n`,
  );

  process.stdout.write(`  ${path.relative(ROOT, sidecarPath)}\nimported ${written.length}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (args.status) {
    await printStatus();
    return;
  }

  if (typeof args.import === 'string') {
    await importFiles(args);
    return;
  }

  const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
  if (!prompt) fail('--prompt is required. Run with --help for usage.');

  const providerName = await pickProvider(typeof args.provider === 'string' ? args.provider : undefined);
  const provider = providers[providerName];
  const { width, height } = parseSize(args.size);
  const count = parseInteger(args.count, 'count') ?? 1;
  if (count < 1 || count > 10) fail('--count must be between 1 and 10.');

  const options = {
    prompt,
    negative: typeof args.negative === 'string' ? args.negative : undefined,
    width,
    height,
    count,
    seed: parseInteger(args.seed, 'seed'),
    steps: parseInteger(args.steps, 'steps'),
    model: typeof args.model === 'string' ? args.model : provider.defaultModel,
    modelExplicit: typeof args.model === 'string',
    baseModel: typeof args['base-model'] === 'string' ? args['base-model'] : undefined,
    quality: typeof args.quality === 'string' ? args.quality : undefined,
    quantize: parseInteger(args.quantize, 'quantize'),
    verbose: Boolean(args.verbose),
    references:
      typeof args.reference === 'string'
        ? args.reference
            .split(',')
            .map((entry) => path.resolve(ROOT, expandHome(entry.trim())))
            .filter(Boolean)
        : [],
    // Backends that drive a subprocess take far longer than a single HTTP call.
    timeoutMs:
      (parseInteger(args.timeout, 'timeout') ??
        (providerName === 'codex' || providerName === 'local' ? 900 : 300)) * 1000,
    outputDir: path.resolve(ROOT, typeof args.out === 'string' ? args.out : DEFAULT_OUTPUT_DIR),
  };

  if (args['dry-run']) {
    const described = provider.describe(options);
    process.stdout.write(
      `${provider.label} / ${options.model}\n` +
        `${described.endpoint}\n` +
        `${JSON.stringify(described.body, null, 2)}\n`,
    );
    return;
  }

  await fs.mkdir(options.outputDir, { recursive: true });

  const stamp = timestamp();
  const slug = typeof args.name === 'string' ? slugify(args.name) : slugify(prompt);
  const startedAt = Date.now();

  process.stdout.write(
    `${provider.label} / ${options.model} / ${width}x${height} / ${count} image${count === 1 ? '' : 's'}\n`,
  );

  const { images, meta } = await provider.generate(options);

  const written = [];
  for (const [index, image] of images.entries()) {
    const suffix = images.length > 1 ? `-${String(index + 1).padStart(2, '0')}` : '';
    const filePath = path.join(options.outputDir, `${slug}-${stamp}${suffix}.${image.extension}`);
    await fs.writeFile(filePath, image.buffer);
    written.push(filePath);
    process.stdout.write(`  ${path.relative(ROOT, filePath)}  ${(image.buffer.length / 1024).toFixed(0)} KB\n`);
  }

  const sidecarPath = path.join(options.outputDir, `${slug}-${stamp}.json`);
  await fs.writeFile(
    sidecarPath,
    `${JSON.stringify(
      {
        provider: providerName,
        model: options.model,
        prompt: options.prompt,
        negative: options.negative ?? null,
        width,
        height,
        count,
        seed: options.seed ?? null,
        steps: options.steps ?? null,
        quality: options.quality ?? null,
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        files: written.map((file) => path.relative(ROOT, file)),
        providerMeta: meta ?? null,
      },
      null,
      2,
    )}\n`,
  );

  process.stdout.write(
    `  ${path.relative(ROOT, sidecarPath)}\ndone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`,
  );
}

main().catch((error) => {
  if (error.expected) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exit(1);
});
