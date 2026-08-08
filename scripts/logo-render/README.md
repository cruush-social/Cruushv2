# Spinning logo loop

Regenerates `public/teasers/cruush-logo-login-alpha-{desktop,mobile}.webm`.

The recorded render these replace had two defects that could not be patched in
the frames: a notch — a wedge bitten out of the flame's silhouette where the
"c" of the wordmark meets it — and geometry that clips mid-turn, with the
letters passing through the heart ring. Both are avoided here by construction:
the geometry is extruded from the brand SVG (which has no notch) and every
piece shares one extrusion depth on one axis (so nothing can intersect).

The loop closes because rotation is driven by frame index over the frame count.
Each frame advances 360/FRAMES degrees, so the wrap from the last frame back to
the first is the same step as any other pair — measured at SSIM 0.965 for the
seam versus 0.963-0.965 for its neighbours.

## Running it

    node scripts/logo-render/capture-frames.mjs /tmp/logo-frames 8791
    npx vite            # then open the URL below

    http://localhost:5173/scripts/logo-render/index.html?w=1920&h=1080&frames=180
    http://localhost:5173/scripts/logo-render/index.html?w=720&h=1280&frames=180&sink=http://127.0.0.1:8792

    ffmpeg -framerate 30 -i /tmp/logo-frames/frame-%04d.png \
      -c:v libvpx-vp9 -pix_fmt yuva420p -crf 30 -b:v 0 \
      -auto-alt-ref 0 -lag-in-frames 0 out.webm

`-auto-alt-ref 0 -lag-in-frames 0` are required: VP9 alt-ref frames drop the
alpha channel, and the logo has to composite over the glitter background.

Query params: `w`, `h`, `frames`, `depth`, `svg`, `sink`.
