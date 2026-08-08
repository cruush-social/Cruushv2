/**
 * Spins the brand logo through exactly one revolution and posts every frame to
 * the capture sink, so the resulting clip loops with no seam by construction:
 * frame FRAME_COUNT would be identical to frame 0, so the cut is invisible.
 *
 * Geometry comes from the brand SVG, which does not have the wedge bitten out
 * of the flame where the "c" meets it, and every piece shares one extrusion
 * depth, so the letters cannot pass through the heart mid-turn.
 */
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

const params = new URLSearchParams(window.location.search);
const WIDTH = Number(params.get('w') ?? 1920);
const HEIGHT = Number(params.get('h') ?? 1080);
const FRAME_COUNT = Number(params.get('frames') ?? 180);
const SINK = params.get('sink') ?? 'http://127.0.0.1:8791';
const SVG_URL = params.get('svg') ?? '/teasers/cruush-logo-brand.svg';
const EXTRUDE_DEPTH = Number(params.get('depth') ?? 58);

const status = document.getElementById('status') as HTMLElement;
const canvas = document.getElementById('stage') as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT, false);
renderer.setClearColor(0x000000, 0);
// ACES pulls saturation out of strong primaries, which is what turned the
// brand pink and blue into pastels. No tone mapping keeps them exact.
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, WIDTH / HEIGHT, 1, 6000);

/** Studio-ish surroundings so the metal has something to reflect. */
function buildEnvironment() {
  const size = 512;
  const envCanvas = document.createElement('canvas');
  envCanvas.width = size;
  envCanvas.height = size;
  const ctx = envCanvas.getContext('2d')!;

  // Bright surround. The previous version fell to near-black below the
  // horizon, which is what made the metal read as lit from one odd angle with
  // dead shadows on the other side.
  const sky = ctx.createLinearGradient(0, 0, 0, size);
  sky.addColorStop(0, '#ffffff');
  sky.addColorStop(0.4, '#b9bdcc');
  sky.addColorStop(0.56, '#3a3d4c');
  sky.addColorStop(1, '#0b0c12');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, size, size);

  // Two bright strips read as softboxes in the specular highlights.
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fillRect(size * 0.02, size * 0.08, size * 0.34, size * 0.34);
  ctx.fillRect(size * 0.62, size * 0.12, size * 0.32, size * 0.3);
  ctx.fillRect(size * 0.3, size * 0.0, size * 0.4, size * 0.16);

  const texture = new THREE.CanvasTexture(envCanvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(texture).texture;
  pmrem.dispose();
  texture.dispose();
  return env;
}

/**
 * Metallic flake, the way car paint actually works: a dense field of tiny
 * mirrors suspended in the colour coat, each tilted a different way, under a
 * smooth clear coat. Rendering that as a high-frequency normal map means every
 * flake catches the key light at a slightly different angle, so the surface
 * sparkles as it turns instead of shading like flat plastic.
 */
function buildFlakeNormalMap(size = 2048, flakes = 240000) {
  const flakeCanvas = document.createElement('canvas');
  flakeCanvas.width = size;
  flakeCanvas.height = size;
  const ctx = flakeCanvas.getContext('2d')!;

  // Flat normal (pointing straight out) is the neutral background.
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);

  // Deterministic scatter: the loop has to be identical every render.
  let seed = 20260804;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let i = 0; i < flakes; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 0.5 + random() * 1.1;
    // Random tilt encoded as a normal; the clear coat softens the rest.
    const angle = random() * Math.PI * 2;
    const tilt = 0.35 + random() * 0.5;
    const nx = Math.cos(angle) * tilt;
    const ny = Math.sin(angle) * tilt;
    ctx.fillStyle = `rgb(${Math.round((nx * 0.5 + 0.5) * 255)},${Math.round((ny * 0.5 + 0.5) * 255)},255)`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(flakeCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.012, 0.012);
  texture.anisotropy = 8;
  return texture;
}

const flakeNormalMap = buildFlakeNormalMap();

scene.environment = buildEnvironment();
// Low ambient on purpose: the reference keeps the extruded side faces well
// darker than the front faces, and ambient is what flattens that out.
// Just enough that the shadowed sides read as dark colour, not black.
scene.add(new THREE.AmbientLight(0xffffff, 0.07));

const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(-140, 340, 1100);
scene.add(key);

const rim = new THREE.DirectionalLight(0xdce6ff, 0.38);
rim.position.set(520, 120, -420);
scene.add(rim);

// Fill from below so the underside of the flames is never a dead shadow.
const fill = new THREE.DirectionalLight(0xffffff, 0.16);
fill.position.set(160, -420, 520);
scene.add(fill);

/**
 * The glitter behind the logo has a white band sweeping across it on a 6.66s
 * there-and-back cycle (launch-login-glitter-sheen-sweep). This light travels
 * with it, so the logo catches a highlight as the band passes over rather than
 * sitting under fixed studio lighting while the background moves.
 */
const sheen = new THREE.DirectionalLight(0xffffff, 0);
scene.add(sheen);

/** `phase` is 0..1 through the loop. Matches the CSS keyframes' 0 -> 1 -> 0. */
function positionSheen(phase: number) {
  const travel = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  // The CSS gradient runs at 125deg, so the band crosses down-left to up-right.
  sheen.position.set(
    THREE.MathUtils.lerp(-1500, 1500, travel),
    THREE.MathUtils.lerp(900, -900, travel),
    820,
  );
  // Brightest as the band crosses the middle of the logo.
  const proximity = Math.exp(-((travel - 0.5) ** 2) / 0.045);
  sheen.intensity = 1.8 * proximity;
}

const group = new THREE.Group();
scene.add(group);

function postFrame(index: number) {
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(`frame ${index} produced no blob`));
        return;
      }

      fetch(`${SINK}/frame/${index}`, { method: 'POST', body: blob })
        .then(() => resolve())
        .catch(reject);
    }, 'image/png');
  });
}

async function main() {
  status.textContent = 'loading svg…';

  const svg = await new SVGLoader().loadAsync(SVG_URL);
  const bounds = new THREE.Box3();

  // SVGLoader cannot resolve `fill: url(#linear-gradient)`, so the flames come
  // back colourless. Rebuild the brand ramp as a texture and map it across the
  // logo's full width; the wordmark keeps its own polished silver.
  const rampCanvas = document.createElement('canvas');
  rampCanvas.width = 512;
  rampCanvas.height = 1;
  const rampCtx = rampCanvas.getContext('2d')!;
  const ramp = rampCtx.createLinearGradient(0, 0, rampCanvas.width, 0);
  ramp.addColorStop(0.06, '#ff0072');
  ramp.addColorStop(0.53, '#6f00ff');
  ramp.addColorStop(0.81, '#3826ff');
  ramp.addColorStop(1, '#1181ff');
  rampCtx.fillStyle = ramp;
  rampCtx.fillRect(0, 0, rampCanvas.width, rampCanvas.height);
  const rampTexture = new THREE.CanvasTexture(rampCanvas);
  rampTexture.colorSpace = THREE.SRGBColorSpace;
  rampTexture.wrapS = THREE.ClampToEdgeWrapping;
  rampTexture.wrapT = THREE.ClampToEdgeWrapping;

  const flameMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    // Shade multiplicatively, not additively. Diffuse light scales the ramp
    // (#ff0072 at half light is #800039 — still fully saturated), whereas
    // ambient, image-based lighting, specular and emissive all ADD white,
    // which lifts the zeroed channel of a saturated primary and washes it out.
    // So: no emissive, minimal ambient and env, and a key strong enough that
    // lit faces reach the full brand value while unlit sides fall away.
    color: 0xffffff,
    // Flake suspended in the colour coat, then a smooth clear coat over the
    // top. The clear coat is what makes it read as automotive paint rather
    // than glitter glued to a surface: sharp reflections that ignore the
    // flake normals, sitting above a sparkling colour layer.
    normalMap: flakeNormalMap,
    normalScale: new THREE.Vector2(0.62, 0.62),
    envMapIntensity: 0.55,
    metalness: 0.55,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    // Slight thin-film shift, so the colour travels toward the edges the way
    // a candy coat flops from magenta to violet or blue to teal.
    iridescence: 0.22,
    iridescenceIOR: 1.6,
    side: THREE.DoubleSide,
  });
  const wordmarkMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    // Near-white and only semi-metallic: fully metallic chrome takes all of
    // its value from reflections, which is what made the wordmark read grey.
    // A little emissive keeps the face reading white rather than light grey.
    color: 0xffffff,
    metalness: 0.25,
    roughness: 0.26,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    side: THREE.DoubleSide,
  });

  type Piece = { geometry: THREE.ExtrudeGeometry; material: THREE.Material };
  const pieces: Piece[] = [];

  svg.paths.forEach((path) => {
    const node = path.userData?.node as SVGElement | undefined;
    const className = node?.getAttribute('class') ?? '';
    // cls-2 is the white wordmark in the brand file; everything else is the
    // gradient-filled flame and heart.
    const isWordmark = className.includes('cls-2');
    const material = isWordmark ? wordmarkMaterial : flameMaterial;

    SVGLoader.createShapes(path).forEach((shape) => {
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: EXTRUDE_DEPTH,
        bevelEnabled: true,
        bevelThickness: 4.5,
        bevelSize: 3.2,
        bevelSegments: 3,
        curveSegments: 14,
      });
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox!);
      pieces.push({ geometry, material });
    });
  });

  // The brand ramp is baked into vertex colours rather than sampled from a
  // texture. Mapping it through UVs meant overwriting the geometry's own UVs
  // with a constant v, which left the flake normal map sampling a single row of
  // its texture — the flake smeared into vertical streaks that slid over the
  // surface as it turned instead of sitting on it. Vertex colours leave the
  // UVs alone, so the flake stays locked to the mesh.
  const spanX = bounds.max.x - bounds.min.x || 1;
  const rampStops = [
    { at: 0.06, color: new THREE.Color(0xff0072) },
    { at: 0.53, color: new THREE.Color(0x6f00ff) },
    { at: 0.81, color: new THREE.Color(0x3826ff) },
    { at: 1, color: new THREE.Color(0x1181ff) },
  ];

  const sampleRamp = (t: number, out: THREE.Color) => {
    if (t <= rampStops[0].at) return out.copy(rampStops[0].color);
    for (let i = 1; i < rampStops.length; i += 1) {
      const prev = rampStops[i - 1];
      const next = rampStops[i];
      if (t <= next.at) {
        const k = (t - prev.at) / (next.at - prev.at);
        return out.copy(prev.color).lerp(next.color, k);
      }
    }
    return out.copy(rampStops[rampStops.length - 1].color);
  };

  const scratch = new THREE.Color();
  pieces.forEach(({ geometry, material }) => {
    const position = geometry.getAttribute('position');
    const colors = new Float32Array(position.count * 3);
    const isWordmark = material === wordmarkMaterial;

    for (let i = 0; i < position.count; i += 1) {
      if (isWordmark) {
        colors[i * 3] = 1;
        colors[i * 3 + 1] = 1;
        colors[i * 3 + 2] = 1;
        continue;
      }

      sampleRamp((position.getX(i) - bounds.min.x) / spanX, scratch);
      colors[i * 3] = scratch.r;
      colors[i * 3 + 1] = scratch.g;
      colors[i * 3 + 2] = scratch.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    group.add(new THREE.Mesh(geometry, material));
  });

  // SVG space is y-down; flip it, then centre the art on the origin so the
  // spin is about the logo's own axis rather than a corner.
  const centre = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  group.children.forEach((child) => {
    child.position.set(-centre.x, -centre.y, -EXTRUDE_DEPTH / 2);
  });
  group.scale.y = -1;

  // Fit whichever axis needs more room, so a portrait frame does not crop the
  // flames off the sides, and leave headroom for the widest point of the spin.
  const halfFov = (camera.fov * Math.PI) / 360;
  const fitForHeight = (size.y / 2) / Math.tan(halfFov);
  const fitForWidth = (size.x / 2) / (Math.tan(halfFov) * camera.aspect);
  // 1.53 lands the logo at the same fraction of the frame as the recorded clip
  // it replaces (36% wide / 67% tall on desktop, 60% / 35% on portrait), so the
  // teaser's object-fit: cover crop frames it identically.
  const margin = Number(params.get('margin') ?? 1.04);
  camera.position.set(0, 0, Math.max(fitForHeight, fitForWidth) * margin);
  camera.lookAt(0, 0, 0);

  status.textContent = `rendering ${FRAME_COUNT} frames…`;

  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const phase = index / FRAME_COUNT;
    group.rotation.y = phase * Math.PI * 2;
    positionSheen(phase);
    renderer.render(scene, camera);
    await postFrame(index);
    if (index % 10 === 0) {
      status.textContent = `frame ${index}/${FRAME_COUNT}`;
    }
  }

  status.textContent = `done: ${FRAME_COUNT} frames`;
  (window as unknown as { __logoRenderDone?: boolean }).__logoRenderDone = true;
}

main().catch((error) => {
  status.textContent = `failed: ${error instanceof Error ? error.message : String(error)}`;
});
