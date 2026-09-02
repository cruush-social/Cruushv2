import { shouldReduceMotion } from './accessibilityPreferences';

// Canvas, confetti, and tilt ported from the supplied 2026-08-29 scratch-card
// prototype. Only lifecycle cleanup and element ownership differ from the demo.
export function attachCruushScratchInteraction(root: HTMLElement, onReveal: () => void) {
  const foil = root.querySelector<HTMLCanvasElement>('.scratch')!;
  const canvas = root.querySelector<HTMLCanvasElement>('.confetti')!;
  const scene = root.querySelector<HTMLElement>('.beta-launch-plus-card-scene')!;
  const tilt = root.querySelector<HTMLElement>('.card-tilt')!;
  const context = foil.getContext('2d', { willReadFrequently: true });
  const confettiContext = canvas.getContext('2d');
  let disposed = false;
  let revealed = false;
  let painting: number | null = null;
  let last: { x: number; y: number } | null = null;
  let strokes = 0;
  let frame = 0;
  const listeners: Array<() => void> = [];
  function listen(target: EventTarget, event: string, handler: EventListener) {
    target.addEventListener(event, handler);
    listeners.push(() => target.removeEventListener(event, handler));
  }

  function paintFoil() {
    if (disposed || revealed || !context) return;
    const box = foil.getBoundingClientRect();
    if (!box.width || !box.height) return;
    // Preserve cleared paint during a resize, including phone orientation changes.
    const previous = document.createElement('canvas');
    previous.width = foil.width;
    previous.height = foil.height;
    if (strokes > 0) previous.getContext('2d')?.drawImage(foil, 0, 0);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    foil.width = Math.round(box.width * dpr);
    foil.height = Math.round(box.height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, box.width, box.height);
    if (strokes > 0 && previous.width && previous.height) {
      context.drawImage(previous, 0, 0, box.width, box.height);
      return;
    }
    const base = context.createLinearGradient(0, 0, box.width, box.height);
    for (const [stop, color] of [[0, '#d8d2e2'], [.22, '#f2eef8'], [.44, '#a99fbd'], [.62, '#e6dff0'], [.82, '#9b90b0'], [1, '#cfc7dd']] as const) {
      base.addColorStop(stop, color);
    }
    context.fillStyle = base;
    context.fillRect(0, 0, box.width, box.height);
    context.globalAlpha = .12;
    for (let s = 0; s < 70; s++) {
      const y = s / 70 * box.height + (s * 37) % 5 - 2;
      context.strokeStyle = s % 2 ? '#ffffff' : '#6f6480';
      context.lineWidth = .6 + s % 3 * .35;
      context.beginPath();
      context.moveTo(-4, y);
      context.lineTo(box.width + 4, y + (s % 7 - 3) * .6);
      context.stroke();
    }
    context.globalAlpha = .09;
    for (let d = 0; d < 380; d++) {
      context.fillStyle = d % 3 ? '#5c5270' : '#ffffff';
      context.fillRect((d * 97 % 1000) / 1000 * box.width, (d * 313 % 997) / 997 * box.height, 1.4, 1.4);
    }
    context.globalAlpha = 1;
    context.save();
    context.translate(box.width / 2, box.height / 2 - 6);
    context.rotate(-.06);
    context.fillStyle = 'rgba(32, 18, 40, 0.42)';
    context.font = '600 11px "IBM Plex Mono", monospace';
    context.textAlign = 'center';
    context.fillText('S C R A T C H   H E R E', 0, 0);
    context.restore();
  }

  function throwConfetti() {
    if (!confettiContext || shouldReduceMotion()) return;
    const context = confettiContext;
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ['#FF0072', '#6F00FF', '#3826FF', '#004BFF', '#1181FF', '#ffffff'];
    const bits = Array.from({ length: 110 }, (_, i) => {
      const angle = Math.PI * 2 * i / 110 + i % 7 * .09;
      const speed = 3.2 + i % 11 * .55;
      return {
        x: box.width / 2, y: box.height * .3,
        vx: Math.cos(angle) * speed * 1.25, vy: Math.sin(angle) * speed - 4.2,
        w: 4 + i % 5, h: 7 + i % 6, rot: i * .7,
        vr: (i % 2 ? 1 : -1) * (.12 + i % 5 * .03), color: colors[i % colors.length],
        life: 0, ttl: 120 + i % 40,
      };
    });
    function step() {
      context.clearRect(0, 0, box.width, box.height);
      if (disposed || shouldReduceMotion()) return;
      let alive = 0;
      for (const p of bits) {
        if (p.life > p.ttl) continue;
        alive++;
        p.life++;
        p.vy += .17;
        p.vx *= .992;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.rot);
        context.globalAlpha = Math.max(0, 1 - p.life / p.ttl);
        context.fillStyle = p.color;
        context.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot)));
        context.restore();
      }
      if (alive) frame = requestAnimationFrame(step);
      else context.clearRect(0, 0, box.width, box.height);
    }
    frame = requestAnimationFrame(step);
  }

  function reveal() {
    if (revealed || disposed) return;
    revealed = true;
    onReveal();
    throwConfetti();
  }
  function clearedFraction() {
    if (!context || !foil.width || !foil.height) return 0;
    const data = context.getImageData(0, 0, foil.width, foil.height).data;
    let seen = 0, gone = 0;
    for (let i = 3; i < data.length; i += 64) {
      seen++;
      if (data[i] < 40) gone++;
    }
    return seen ? gone / seen : 0;
  }
  function scratchAt(event: PointerEvent) {
    if (!context) { reveal(); return; }
    const box = foil.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    context.globalCompositeOperation = 'destination-out';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 30;
    context.beginPath();
    context.moveTo(last?.x ?? x - .1, last?.y ?? y - .1);
    context.lineTo(x, y);
    context.stroke();
    last = { x, y };
    strokes++;
  }
  listen(foil, 'pointerdown', event => {
    const pointer = event as PointerEvent;
    if (revealed || painting !== null || pointer.button !== 0) return;
    painting = pointer.pointerId;
    last = null;
    foil.setPointerCapture(pointer.pointerId);
    scratchAt(pointer);
  });
  listen(foil, 'pointermove', event => {
    const pointer = event as PointerEvent;
    if (painting !== pointer.pointerId || revealed) return;
    scratchAt(pointer);
    if (strokes % 9 === 0 && clearedFraction() > .52) reveal();
  });
  const endStroke = (event: Event) => {
    const pointer = event as PointerEvent;
    if (painting !== pointer.pointerId) return;
    painting = null;
    last = null;
    if (foil.hasPointerCapture(pointer.pointerId)) foil.releasePointerCapture(pointer.pointerId);
    if (!revealed && clearedFraction() > .42) reveal();
  };
  listen(foil, 'pointerup', endStroke);
  listen(foil, 'pointercancel', endStroke);
  listen(foil, 'lostpointercapture', endStroke);
  listen(foil, 'keydown', event => {
    if (['Enter', ' '].includes((event as KeyboardEvent).key)) { event.preventDefault(); reveal(); }
  });
  listen(scene, 'pointermove', event => {
    if (!revealed || shouldReduceMotion()) return;
    const pointer = event as PointerEvent;
    const box = scene.getBoundingClientRect();
    const px = (pointer.clientX - box.left) / box.width - .5;
    const py = (pointer.clientY - box.top) / box.height - .5;
    tilt.dataset.grabbing = 'true';
    tilt.style.setProperty('--tilt-y', `${(px * 26 * 2).toFixed(2)}deg`);
    tilt.style.setProperty('--tilt-x', `${(-py * 26 * 1.4).toFixed(2)}deg`);
  });
  listen(scene, 'pointerleave', () => {
    tilt.dataset.grabbing = 'false';
    tilt.style.setProperty('--tilt-y', '0deg');
    tilt.style.setProperty('--tilt-x', '0deg');
  });
  const resize = new ResizeObserver(paintFoil);
  resize.observe(foil);
  void document.fonts?.ready.then(paintFoil);
  paintFoil();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    listeners.forEach(remove => remove());
  };
}
