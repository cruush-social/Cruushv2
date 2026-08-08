"""Add metallic-flake paint shimmer to already-rendered logo frames.

This is a post-process, so it works on any spinning-logo frames — the current
render or the original recorded clip — without touching a 3D scene.

Per frame:
  1. The alpha channel masks everything to the logo itself.
  2. Two sparse flake fields at different scales stand in for the metallic
     suspended in the colour coat. The coarse layer is the flake you can pick
     out; the fine layer fills the gaps so the surface reads as continuous
     shimmer rather than scattered dots.
  3. Every flake carries its own twinkle phase, because real flake does not
     glow steadily — each tiny mirror flashes as its angle sweeps past the
     light. That phase is what turns static speckle into shimmer.
  4. Flakes are modulated by local brightness, so they only fire where light is
     actually hitting; the shadowed side of the flames stays dark.
  5. Sparkle is added and tinted toward the paint underneath, so it reads as
     flake suspended in the colour rather than white glitter sitting on top.

Both the drift and the twinkle complete a whole number of cycles across the
sequence, so frame N lines up with frame 0 and the loop stays seamless.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

DENSITY = 0.19        # fraction of pixels carrying a coarse flake
DUST_DENSITY = 0.34   # finer layer between them
STRENGTH = 1.35       # peak sparkle from the coarse layer, in 0..1 units
DUST_STRENGTH = 0.5   # the fine layer stays subtle
LIGHT_BIAS = 1.9      # how hard flake follows the lit areas
DRIFT_PIXELS = 24     # whole-pixel travel across the loop, so it still loops
TWINKLE_CYCLES = 3    # flashes per flake per loop; integer keeps the loop closed
FLAKE_LIFT = 0.62     # how much brighter a firing flake gets
FLAKE_WASH = 0.45     # how much it desaturates at peak, so it reads as a highlight
SHEEN_ANGLE = 125     # degrees, matching launch-login-glitter-sheen-sweep
SHEEN_WIDTH = 0.19    # band half-width, as a fraction of the sweep axis
SHEEN_GAIN = 3.6      # how much harder flake fires inside the band
SHEEN_FLOOR = 0.05    # away from the band the paint is nearly matte


def build_flake_field(height: int, width: int, density: float, tail: float, seed: int):
    """Sparse flake amplitudes plus a per-flake twinkle phase."""
    rng = np.random.default_rng(seed)
    amplitude = np.zeros((height, width), dtype=np.float32)
    phase = np.zeros((height, width), dtype=np.float32)
    count = int(height * width * density)
    ys = rng.integers(0, height, count)
    xs = rng.integers(0, width, count)
    # Long tail: a few flakes are much brighter than the rest, which is what
    # makes real metallic read as sparkle instead of noise.
    amplitude[ys, xs] = rng.power(tail, count).astype(np.float32)
    phase[ys, xs] = rng.random(count).astype(np.float32)
    return amplitude, phase


def twinkle(phase_field: np.ndarray, t: float) -> np.ndarray:
    """Each flake flashes on its own schedule, looping a whole number of times."""
    return 0.2 + 0.8 * np.sin(np.pi * (TWINKLE_CYCLES * t + phase_field)) ** 2


def build_sweep_axis(height: int, width: int, extent: np.ndarray) -> np.ndarray:
    """Position of every pixel along the sheen's travel, normalised to 0..1.

    Normalised over the logo's own extent rather than the whole frame. The logo
    occupies the middle third or so, so normalising over the frame meant most of
    the band's travel happened on empty space either side of it and the sparkle
    barely moved across the artwork.
    """
    radians = np.deg2rad(SHEEN_ANGLE)
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float32)
    axis = xs * np.cos(radians) + ys * np.sin(radians)
    lo, hi = axis[extent].min(), axis[extent].max()
    return (axis - lo) / max(hi - lo, 1e-6)


def sheen_response(axis: np.ndarray, t: float) -> np.ndarray:
    """A band of hot flake travelling with the background sheen.

    Metallic paint does not sparkle evenly — it lights up where the light is
    actually raking across it. The band tracks the same 0 -> 1 -> 0 cycle as
    launch-login-glitter-sheen-sweep, so the wave of sparkle crossing the logo
    lines up with the sheen crossing the glitter behind it.
    """
    centre = (1 - np.cos(2 * np.pi * t)) / 2
    # The band wraps, so measure distance the short way round.
    distance = np.abs(axis - centre)
    distance = np.minimum(distance, 1 - distance)
    return SHEEN_FLOOR + SHEEN_GAIN * np.exp(-(distance / SHEEN_WIDTH) ** 2)


def apply_flake(path_in: Path, path_out: Path, layers, axis: np.ndarray, t: float) -> None:
    frame = np.array(Image.open(path_in).convert('RGBA'))
    rgb = frame[..., :3].astype(np.float32) / 255
    alpha = frame[..., 3].astype(np.float32) / 255

    # Only where light already falls, and only on the logo.
    luma = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    lit = np.clip(luma * LIGHT_BIAS, 0, 1) ** 1.4

    sparkle = np.zeros_like(luma)
    for amplitude, phase_field, strength, drift in layers:
        shift = int(round(t * DRIFT_PIXELS * drift))
        rolled_amp = np.roll(np.roll(amplitude, shift, axis=0), shift * 2, axis=1)
        rolled_phase = np.roll(np.roll(phase_field, shift, axis=0), shift * 2, axis=1)
        sparkle += rolled_amp * twinkle(rolled_phase, t) * strength

    # Flake only really fires where the light is raking across it.
    sparkle = np.clip(sparkle * lit * alpha * sheen_response(axis, t), 0, 1)

    # Brighten along the paint's own hue rather than adding to each channel.
    #
    # Adding per-channel shifts the hue as soon as a channel clips: on the
    # magenta flames red and blue hit 1.0 first, leaving green to define the
    # colour, so the flake came out green. Decomposing into hue / saturation /
    # value and moving only value (with a little desaturation for the highlight)
    # keeps every flake the colour of the paint it sits in.
    peak = rgb.max(axis=2)
    floor = rgb.min(axis=2)
    chroma = peak - floor

    safe_chroma = np.where(chroma > 1e-6, chroma, 1.0)
    hue_rgb = (rgb - floor[..., None]) / safe_chroma[..., None]
    hue_rgb = np.where(chroma[..., None] > 1e-6, hue_rgb, 0.0)

    saturation = np.where(peak > 1e-6, chroma / np.maximum(peak, 1e-6), 0.0)
    value = np.clip(peak + sparkle * FLAKE_LIFT, 0, 1)
    # A real highlight washes out slightly; too much and it goes white.
    saturation = np.clip(saturation * (1 - FLAKE_WASH * sparkle), 0, 1)

    out = value[..., None] * ((1 - saturation[..., None]) + saturation[..., None] * hue_rgb)

    frame[..., :3] = (np.clip(out, 0, 1) * 255).round().astype(np.uint8)
    Image.fromarray(frame).save(path_out)


def main() -> None:
    src_dir = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    frames = sorted(src_dir.glob('*.png'))
    if not frames:
        raise SystemExit(f'no frames in {src_dir}')

    first = np.array(Image.open(frames[0]))
    height, width = first.shape[0], first.shape[1]

    # Widest silhouette across the loop, so the band is scaled to the artwork.
    extent = np.zeros((height, width), dtype=bool)
    for frame_path in frames[::10]:
        extent |= np.array(Image.open(frame_path).convert('RGBA'))[..., 3] > 24
    layers = [
        (*build_flake_field(height, width, DENSITY, 0.8, 20260804), STRENGTH, 1.0),
        (*build_flake_field(height, width, DUST_DENSITY, 1.6, 99173), DUST_STRENGTH, -0.6),
    ]

    axis = build_sweep_axis(height, width, extent)

    for index, frame_path in enumerate(frames):
        apply_flake(frame_path, out_dir / frame_path.name, layers, axis, index / len(frames))
        if index % 25 == 0:
            print(f'  frame {index}/{len(frames)}', flush=True)

    print(f'flaked {len(frames)} frames')


if __name__ == '__main__':
    main()
