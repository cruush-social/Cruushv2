import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import './LaunchLoginMapTeaser.css';

export type LaunchLoginMapTeaserPlaybackState = {
  isMobileRecording: boolean;
  isReady: boolean;
};

type LaunchLoginMapTeaserProps = {
  onPlaybackStateChange?: (state: LaunchLoginMapTeaserPlaybackState) => void;
};

const DESKTOP_TEASER_VIDEO = '/teasers/cruush-logo-login-alpha-desktop.webm';
const MOBILE_TEASER_VIDEO = '/teasers/cruush-logo-login-alpha-mobile.webm';
const CODEPEN_BUTTERFLY_TEXTURE = '/teasers/codepen-butterfly-tex.png';
const MOBILE_VIDEO_QUERY = '(max-width: 640px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const CODEPEN_BUTTERFLY_SIZE = 150;
const CODEPEN_BUTTERFLY_COUNT = 9;
const CODEPEN_CAMERA_SIZE_X = 640;
const CODEPEN_CAMERA_SIZE_Y = 480;

const CODEPEN_BUTTERFLY_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float index;
uniform float time;
uniform float size;

varying vec2 vUv;

void main() {
  float flapTime = radians(sin(time * 6.0 - length(position.xy) / size * 2.6 + index * 2.0) * 45.0 + 30.0);
  float hovering = cos(time * 2.0 + index * 3.0) * size / 16.0;
  vec3 updatePosition = vec3(
    cos(flapTime) * position.x,
    position.y + hovering,
    sin(flapTime) * abs(position.x) + hovering
  );

  vec4 mvPosition = modelViewMatrix * vec4(updatePosition, 1.0);
  vUv = uv;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const CODEPEN_BUTTERFLY_FRAGMENT_SHADER = `
precision highp float;

uniform float index;
uniform float time;
uniform sampler2D butterflyTexture;

varying vec2 vUv;

vec3 convertHsvToRgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 texColor = texture2D(butterflyTexture, vUv);
  float shimmer = 0.82 + sin(time * 3.0 + index * 1.7 + vUv.x * 2.0) * 0.18;
  vec3 penColor = convertHsvToRgb(vec3(1.0 + index * 0.7 + sin(time + vUv.y * 3.0) * 0.08, 0.18, 1.0));
  vec3 invertedTexture = mix(vec3(1.0), vec3(0.1), texColor.r);
  vec3 rgb = mix(invertedTexture, penColor, 0.24) * shimmer;

  gl_FragColor = vec4(rgb, texColor.a * 0.94);
}
`;

function getTeaserVideoSource() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return DESKTOP_TEASER_VIDEO;
  }

  if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
    return null;
  }

  return window.matchMedia(MOBILE_VIDEO_QUERY).matches ? MOBILE_TEASER_VIDEO : DESKTOP_TEASER_VIDEO;
}

function CodePenButterflyField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const reducedMotionQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia(REDUCED_MOTION_QUERY)
      : null;

    if (reducedMotionQuery?.matches) {
      return undefined;
    }

    let animationFrame = 0;
    let isDisposed = false;
    let cleanupScene: (() => void) | undefined;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      canvas,
    });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 10000);
    const clock = new THREE.Clock();
    const butterflies: CodePenButterfly[] = [];
    let activeTexture: THREE.Texture | null = null;

    const isSmallScreen = typeof window.matchMedia === 'function'
      && window.matchMedia(MOBILE_VIDEO_QUERY).matches;
    const butterflyCount = isSmallScreen
      ? Math.ceil(CODEPEN_BUTTERFLY_COUNT / 2)
      : CODEPEN_BUTTERFLY_COUNT;

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmallScreen ? 1 : 2));
    camera.position.set(250, 500, 1000);
    camera.lookAt(new THREE.Vector3());

    class CodePenButterfly {
      private readonly uniforms: {
        index: { value: number };
        time: { value: number };
        size: { value: number };
        butterflyTexture: { value: THREE.Texture };
      };

      readonly obj: THREE.Mesh;

      private readonly speed: number;

      constructor(index: number, texture: THREE.Texture) {
        this.uniforms = {
          index: { value: index },
          time: { value: 0 },
          size: { value: CODEPEN_BUTTERFLY_SIZE },
          butterflyTexture: { value: texture },
        };
        this.speed = 3.8 + (index % 3) * 0.72;
        this.obj = this.createObj();
      }

      createObj() {
        const geometry = new THREE.PlaneGeometry(
          CODEPEN_BUTTERFLY_SIZE,
          CODEPEN_BUTTERFLY_SIZE / 2,
          24,
          12,
        );
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.RawShaderMaterial({
            depthWrite: false,
            fragmentShader: CODEPEN_BUTTERFLY_FRAGMENT_SHADER,
            side: THREE.DoubleSide,
            transparent: true,
            uniforms: this.uniforms,
            vertexShader: CODEPEN_BUTTERFLY_VERTEX_SHADER,
          }),
        );

        mesh.rotation.set(-45 * Math.PI / 180, 0, 0);
        return mesh;
      }

      render(delta: number) {
        this.uniforms.time.value += delta;
        this.obj.position.z = this.obj.position.z > -900
          ? this.obj.position.z - this.speed
          : 900;
      }

      dispose() {
        this.obj.geometry.dispose();
        const material = this.obj.material;
        if (Array.isArray(material)) {
          material.forEach((entry) => entry.dispose());
          return;
        }

        material.dispose();
      }
    }

    const resizeCamera = () => {
      const host = canvas.parentElement ?? canvas;
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width || window.innerWidth));
      const height = Math.max(1, Math.floor(bounds.height || window.innerHeight));
      const x = Math.min(
        (width / height) / (CODEPEN_CAMERA_SIZE_X / CODEPEN_CAMERA_SIZE_Y),
        1,
      ) * CODEPEN_CAMERA_SIZE_X;
      const y = Math.min(
        (height / width) / (CODEPEN_CAMERA_SIZE_Y / CODEPEN_CAMERA_SIZE_X),
        1,
      ) * CODEPEN_CAMERA_SIZE_Y;

      camera.left = x * -0.5;
      camera.right = x * 0.5;
      camera.top = y * 0.5;
      camera.bottom = y * -0.5;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const render = () => {
      if (isDisposed) {
        return;
      }

      const delta = clock.getDelta();
      butterflies.forEach((butterfly) => butterfly.render(delta));
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };

    const resizeObserver = 'ResizeObserver' in window
      ? new ResizeObserver(resizeCamera)
      : null;

    if (resizeObserver && canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', resizeCamera);
    }

    cleanupScene = () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resizeCamera);
      butterflies.forEach((butterfly) => {
        scene.remove(butterfly.obj);
        butterfly.dispose();
      });
      activeTexture?.dispose();
      renderer.dispose();
    };

    resizeCamera();

    new THREE.TextureLoader().load(CODEPEN_BUTTERFLY_TEXTURE, (texture) => {
      if (isDisposed) {
        texture.dispose();
        return;
      }

      activeTexture = texture;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.needsUpdate = true;

      for (let index = 0; index < butterflyCount; index += 1) {
        const butterfly = new CodePenButterfly(index, texture);
        const lane = index % 2 === 0 ? -1 : 1;
        const x = lane * (170 + index * 32);
        const y = ((index % 5) - 2) * 20;
        const z = (1800 / butterflyCount) * index;

        butterfly.obj.position.set(x, y, z);
        butterflies.push(butterfly);
        scene.add(butterfly.obj);
      }

      render();
    });

    return () => {
      isDisposed = true;
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      cleanupScene?.();
    };
  }, []);

  return (
    <div className="launch-login-map-teaser__butterfly-field" data-testid="launch-login-butterfly-field">
      <canvas
        aria-hidden="true"
        className="launch-login-map-teaser__codepen-butterfly-canvas"
        data-testid="launch-login-codepen-butterfly-canvas"
        ref={canvasRef}
      />
    </div>
  );
}

export default function LaunchLoginMapTeaser({ onPlaybackStateChange }: LaunchLoginMapTeaserProps = {}) {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoSource, setVideoSource] = useState<string | null>(() => getTeaserVideoSource());
  const isMobileRecording = videoSource === MOBILE_TEASER_VIDEO;
  const teaserClassName = [
    'launch-login-map-teaser',
    isVideoReady ? 'launch-login-map-teaser--video-ready' : '',
    isMobileRecording ? 'launch-login-map-teaser--mobile-recording' : '',
  ].filter(Boolean).join(' ');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mobileQuery = window.matchMedia(MOBILE_VIDEO_QUERY);
    const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const updateVideoSource = () => {
      setIsVideoReady(false);
      setVideoSource(reducedMotionQuery.matches
        ? null
        : mobileQuery.matches
          ? MOBILE_TEASER_VIDEO
          : DESKTOP_TEASER_VIDEO);
    };

    updateVideoSource();
    mobileQuery.addEventListener?.('change', updateVideoSource);
    reducedMotionQuery.addEventListener?.('change', updateVideoSource);

    return () => {
      mobileQuery.removeEventListener?.('change', updateVideoSource);
      reducedMotionQuery.removeEventListener?.('change', updateVideoSource);
    };
  }, []);

  useEffect(() => {
    onPlaybackStateChange?.({
      isMobileRecording,
      isReady: Boolean(videoSource && isVideoReady),
    });
  }, [isMobileRecording, isVideoReady, onPlaybackStateChange, videoSource]);

  return (
    <div
      aria-hidden="true"
      className={teaserClassName}
      data-testid="launch-login-map-teaser"
    >
      <div className="launch-login-map-teaser__realistic-glitter" data-testid="launch-login-realistic-glitter" />
      {videoSource ? (
        <video
          aria-hidden="true"
          autoPlay
          className="launch-login-map-teaser__video"
          data-testid="launch-login-teaser-video"
          disablePictureInPicture
          disableRemotePlayback
          key={videoSource}
          loop
          muted
          onCanPlay={() => setIsVideoReady(true)}
          onError={() => setIsVideoReady(false)}
          playsInline
          preload="auto"
          src={videoSource}
        />
      ) : (
        <div className="launch-login-map-teaser__ambient-fallback" data-testid="launch-login-ambient-fallback" />
      )}
      <CodePenButterflyField />
      <div className="launch-login-map-teaser__video-logo-scrub" data-testid="launch-login-video-logo-scrub" />
      <div className="launch-login-map-teaser__mobile-pulse" data-testid="launch-login-mobile-pulse" />
      <div className="launch-login-map-teaser__shade" data-testid="launch-login-video-shade" />
    </div>
  );
}
