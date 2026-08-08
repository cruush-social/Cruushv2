# Repo Scripts

## `commit.sh`

Quick commit helper.

Examples:

```bash
scripts/commit.sh "checkpoint: working on auth migration"
scripts/commit.sh --check "pnpm test src/app/App.test.tsx" "test(app): add auth shell smoke test"
```

## `security-check.sh`

Checks for tracked env files, private key material, known token patterns, and secret-like frontend `VITE_*` usage.

```bash
npm run security:check
```

## `release-main-coolify.mjs`

Pushes a reviewed branch to `origin/main`, sets the Coolify app branch to `main`, applies the launch runtime envs, triggers Coolify deployments, and smokes the public URLs.

Required shell envs:

```bash
export COOLIFY_API_BASE_URL="https://<your-coolify-host>/api/v1"
export COOLIFY_API_TOKEN="<coolify-api-token>"
export COOLIFY_STAGING_FRONTEND_UUID="<staging-frontend-uuid>"
export COOLIFY_STAGING_API_UUID="<staging-api-uuid>"
export COOLIFY_PRODUCTION_FRONTEND_UUID="<production-frontend-uuid>"
export COOLIFY_PRODUCTION_API_UUID="<production-api-uuid>"
```

Do not paste the token into chat, docs, screenshots, or commits. The script does not read `.env` files, so set the values in the shell that runs the command.

Dry-run production release to `cruush.app`:

```bash
node scripts/release-main-coolify.mjs --source codex/beta-launch-release-20260731 --target production --confirm-production
```

Live production release to `cruush.app`:

```bash
node scripts/release-main-coolify.mjs --source codex/beta-launch-release-20260731 --target production --confirm-production --no-dry-run
```

Use `--target both` when staging should deploy before production. The worktree must be clean, and checks run by default: server tests, server build, frontend tests, frontend build, and `git diff --check`.

## `generate-image.mjs`

Generates images from a text prompt through one of four interchangeable backends. Output lands in `media/generated/` (gitignored) alongside a sidecar JSON recording the exact request, so any result can be reproduced from its seed and model.

```bash
npm run image -- --status
npm run image -- --provider fal --prompt "neon city skyline at dusk" --count 4
npm run image -- --provider local --prompt "soft gradient background" --seed 7
```

### Backends

| Provider | Env var | Default model | Notes |
| --- | --- | --- | --- |
| `fal` | `FAL_KEY` | `fal-ai/flux/schnell` | Fastest hosted option. Good general quality, cheap per image. |
| `openai` | `OPENAI_API_KEY` | `gpt-image-1` | Best at readable text inside an image. Requires a verified OpenAI org. |
| `replicate` | `REPLICATE_API_TOKEN` | `black-forest-labs/flux-schnell` | Widest model catalogue. Pass `owner/name` or `owner/name:versionhash` to `--model`. |
| `local` | none | `filipstrand/Z-Image-Turbo-mflux-4bit` | Runs on the Mac's GPU through mflux. No key, no per-image cost, works offline. |

Keys are read from the shell environment only. This script does not read `.env` files, for the same reason `release-main-coolify.mjs` does not. Do not paste a key into chat, docs, screenshots, or commits.

```bash
export FAL_KEY="<fal key>"
export OPENAI_API_KEY="<openai key>"
export REPLICATE_API_TOKEN="<replicate token>"
```

With no `--provider`, the script uses `$IMAGE_PROVIDER`, then falls back to the first backend whose key is present.

### Local backend

mflux is installed with uv, with both the tool and the model weights kept off the boot drive:

```bash
UV_TOOL_DIR=/Volumes/Untitled/cruush-ai/uv-tools \
UV_PYTHON_INSTALL_DIR=/Volumes/Untitled/cruush-ai/uv-python \
uv tool install mflux --python 3.12
```

Weights download to `/Volumes/Untitled/cruush-ai/hf-cache` on first use. Set `CRUUSH_IMAGE_LOCAL_HOME` to move that root, `HF_HOME` to move only the weights, or `MFLUX_BIN` to point at a different mflux install.

The default weights are a pre-quantized 4-bit Z-Image-Turbo build. It is ungated, downloads 5.9 GB instead of 58 GB, and fits comfortably in 18 GB of unified memory.

FLUX is not the default because both `FLUX.1-schnell` and `FLUX.1-dev` are gated on HuggingFace. To use them, accept the licence on the model page, create a read token, then:

```bash
export HF_TOKEN="<huggingface read token>"
npm run image -- --provider local --model schnell --steps 4
```

Any other mflux-supported model works too, including `Qwen/Qwen-Image` and `black-forest-labs/FLUX.2-klein-4B`. For a third-party repo the architecture is inferred from the repo name; pass `--base-model` when it cannot be. Models that do not ship pre-quantized are quantized to 4-bit automatically, overridable with `--quantize 8` or `--quantize 0`.

### Options

Run `node scripts/generate-image.mjs --help` for the full list. The ones that matter most:

- `--size` takes `WIDTHxHEIGHT` or a preset: `square`, `portrait`, `landscape`, `story`, `wide`, `avatar`. Each backend maps this to its own nearest supported shape.
- `--seed` fixes the noise. The same seed, model, and prompt give the same image, which is how you keep a set of generated assets visually consistent.
- `--dry-run` prints the request body without calling anything. Useful for checking how a size or model maps before spending credits.
