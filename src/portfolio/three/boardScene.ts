/**
 * The "living chalkboard" WebGL scene: drifting chalk dust + a few faint wireframe
 * geometry doodles. Imported dynamically by chrome/Background so `three` is code-split.
 *
 * All particle motion runs in the vertex shader (no per-frame buffer uploads); the CPU
 * only eases the camera toward the pointer, smooths the scroll offset and spins 3 shapes.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  NormalBlending,
  OctahedronGeometry,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  TorusKnotGeometry,
  WebGLRenderer,
  type BufferGeometry as BG,
} from 'three';

export interface BoardSceneOptions {
  /** Element the canvas is appended to (the scene owns its canvas). */
  container: HTMLElement;
  mobile: boolean;
  /** Reduced motion: render one static frame, never animate. */
  reduced: boolean;
  /** CSS color of the chalk (from var(--chalk)). */
  chalk: string;
  /** Max width of the content column in CSS px (var(--container)); doodles stay outside it. */
  contentMax?: number;
}

export interface BoardScene {
  canvas: HTMLCanvasElement;
  /** Normalised pointer, -1..1 (x right, y down). */
  setPointer(nx: number, ny: number): void;
  setScroll(y: number): void;
  /** The page scrolled: window.scrollY is read once, inside the next animation frame. */
  markScroll(): void;
  resize(): void;
  start(): void;
  stop(): void;
  renderOnce(): void;
  dispose(): void;
}

const FOV = 50;
const CAM_Z = 10;
const TAN_HALF = Math.tan(((FOV / 2) * Math.PI) / 180);

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSpeed;
  attribute float aPhase;
  uniform float uTime;
  uniform float uScroll;      // scroll offset in viewport heights
  uniform float uAspect;
  uniform float uPixelRatio;
  varying float vAlpha;

  void main() {
    float z = position.z;
    float dist = ${CAM_Z.toFixed(1)} - z;
    float halfH = ${TAN_HALF.toFixed(6)} * dist * 1.22;
    float halfW = halfH * uAspect;
    // nearer motes parallax more with scroll
    float near = clamp((z + 8.0) / 12.0, 0.0, 1.0);
    float ny = position.y + uTime * aSpeed + uScroll * mix(0.05, 0.3, near);
    ny = mod(ny + 1.0, 2.0) - 1.0;
    float nx = position.x + sin(uTime * (0.08 + aSpeed * 4.0) + aPhase * 6.2831) * 0.035
             + uTime * aSpeed * 0.25 * (aPhase - 0.5);
    nx = mod(nx + 1.0, 2.0) - 1.0;
    vec4 mv = modelViewMatrix * vec4(nx * halfW, ny * halfH, z, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (${CAM_Z.toFixed(1)} / -mv.z);
    float twinkle = 0.72 + 0.28 * sin(uTime * (0.6 + aPhase * 1.4) + aPhase * 40.0);
    vAlpha = aAlpha * twinkle;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

/** Soft round chalk-dust sprite drawn on a 2D canvas. */
function makeDustTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeDust(count: number, color: Color, pixelRatio: number, aspect: number) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const alpha = new Float32Array(count);
  const speed = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * 2 - 1;
    pos[i * 3 + 1] = Math.random() * 2 - 1;
    pos[i * 3 + 2] = -8 + Math.random() * 12; // z in [-8, 4]
    const mote = Math.random() < 0.05; // a few large, blurry motes
    size[i] = mote ? 14 + Math.random() * 22 : 1.6 + Math.random() * Math.random() * 4.2;
    alpha[i] = mote ? 0.06 + Math.random() * 0.08 : 0.15 + Math.random() * 0.2;
    speed[i] = (mote ? 0.004 : 0.006) + Math.random() * 0.014; // normalised units / s (upward)
    phase[i] = Math.random();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new BufferAttribute(alpha, 1));
  geo.setAttribute('aSpeed', new BufferAttribute(speed, 1));
  geo.setAttribute('aPhase', new BufferAttribute(phase, 1));
  const map = makeDustTexture();
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uAspect: { value: aspect },
      uPixelRatio: { value: pixelRatio },
      uMap: { value: map },
      uColor: { value: color },
    },
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  return { points, geo, mat, map };
}

interface Doodle {
  group: Group;
  /** Anchor in fractions of the half-frustum at the doodle's depth (-1..1). */
  fx: number;
  /** Bounding radius in world units at scale 1 (to keep it inside the gutter). */
  radius: number;
  baseScale: number;
  fy: number;
  z: number;
  spin: [number, number, number];
  bob: number;
  parallax: number;
}

/** A wireframe doodle: the edges drawn twice, slightly offset, like a sketchy chalk line. */
function makeDoodle(geo: BG, color: Color, opacity: number): { group: Group; dispose: () => void } {
  const edges = new EdgesGeometry(geo, 20);
  geo.dispose();
  const mat = new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false });
  const mat2 = new LineBasicMaterial({ color, transparent: true, opacity: opacity * 0.6, depthWrite: false, depthTest: false });
  const a = new LineSegments(edges, mat);
  const b = new LineSegments(edges, mat2);
  b.scale.setScalar(1.025);
  b.rotation.set(0.035, -0.03, 0.02);
  const group = new Group();
  group.add(a, b);
  return {
    group,
    dispose: () => {
      edges.dispose();
      mat.dispose();
      mat2.dispose();
    },
  };
}

export function createBoardScene(opts: BoardSceneOptions): BoardScene | null {
  const { container, mobile, reduced } = opts;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
  } catch {
    return null;
  }
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(canvas);

  let w = Math.max(1, container.clientWidth || window.innerWidth);
  let h = Math.max(1, container.clientHeight || window.innerHeight);
  renderer.setSize(w, h, false);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, w / h, 0.1, 60);
  camera.position.set(0, 0, CAM_Z);

  const chalk = new Color();
  try {
    chalk.setStyle(opts.chalk || '#ece8df');
  } catch {
    chalk.set('#ece8df');
  }

  const dust = makeDust(mobile ? 250 : 600, chalk, pixelRatio, w / h);
  scene.add(dust.points);

  // ── wireframe geometry doodles near the edges ──────────────────────────────
  const disposers: (() => void)[] = [];
  const doodles: Doodle[] = [];
  const addDoodle = (geo: BG, d: Omit<Doodle, 'group' | 'baseScale'>, scale: number, opacity: number) => {
    const { group, dispose } = makeDoodle(geo, chalk, opacity);
    group.scale.setScalar(scale);
    group.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    scene.add(group);
    disposers.push(dispose);
    doodles.push({ ...d, group, baseScale: scale });
  };
  addDoodle(new IcosahedronGeometry(1.25, 0), { fx: 0.84, fy: -0.3, z: -2, radius: 1.25, spin: [0.05, 0.09, 0.01], bob: 0.3, parallax: 0.22 }, mobile ? 0.8 : 1, 0.11);
  addDoodle(new OctahedronGeometry(1.1, 0), { fx: -0.86, fy: 0.16, z: -3, radius: 1.1, spin: [0.07, -0.05, 0.03], bob: 0.5, parallax: 0.16 }, mobile ? 0.75 : 1, 0.1);
  if (!mobile) {
    // lives in the left gutter only (never behind headings / the tag sphere), and fainter
    addDoodle(
      new TorusKnotGeometry(0.85, 0.07, 90, 3, 2, 3),
      { fx: -0.9, fy: -0.85, z: -4, radius: 0.92, spin: [0.03, 0.06, -0.02], bob: 0.9, parallax: 0.12 },
      1,
      0.055,
    );
  }

  // ── state ─────────────────────────────────────────────────────────────────
  let raf = 0;
  let running = false;
  let disposed = false;
  let time = Math.random() * 100; // start mid-drift so frame one isn't a grid of spawn points
  let last = 0;
  let lastDraw = 0;
  // Full rate only while something is actually moving (pointer / scroll easing);
  // the slow dust drift alone renders at a relaxed idle rate.
  const activeInterval = mobile ? 1000 / 30 : 0;
  const idleInterval = mobile ? 1000 / 20 : 1000 / 24;
  let wakeUntil = 0;
  let scrollDirty = false;
  const pointer = { x: 0, y: 0 };
  const cam = { x: 0, y: 0 };
  let scrollTarget = window.scrollY || 0;
  let scroll = scrollTarget;
  const contentMax = opts.contentMax || 1160;

  const halfHAt = (z: number) => TAN_HALF * (CAM_Z - z);
  const wrap = (v: number, min: number, max: number) => {
    const r = max - min;
    return ((((v - min) % r) + r) % r) + min;
  };

  /** Gutter width in px (viewport edge → content column), mirroring `.container`. */
  function gutterPx() {
    const pad = Math.min(40, Math.max(16, w * 0.04));
    return (w - Math.min(w, contentMax)) / 2 + pad;
  }

  function layout(t: number) {
    const aspect = w / h;
    const screens = scroll / h;
    dust.mat.uniforms.uScroll.value = screens;
    dust.mat.uniforms.uTime.value = t;
    const g = gutterPx();
    for (const d of doodles) {
      const hh = halfHAt(d.z);
      const hw = hh * aspect;
      const span = hh + 2;
      let fx = d.fx;
      if (!mobile) {
        // keep the doodle's inner edge out of the content column: centre it in the gutter,
        // let it bleed off the viewport edge a little, shrink it (or hide it) if it can't fit
        const pxPerUnit = w / 2 / hw;
        const rPx = d.radius * d.baseScale * pxPerUnit;
        const maxR = (g - 10) / 0.7; // ≤ 30% of the doodle may hang off-screen
        const k = Math.min(1, maxR / rPx);
        d.group.visible = maxR >= 26;
        d.group.scale.setScalar(d.baseScale * k);
        const r = rPx * k;
        const fromEdge = Math.min(g / 2, g - 10 - r); // centre distance from the viewport edge
        fx = Math.sign(d.fx) * (1 - (2 * fromEdge) / w);
      }
      d.group.position.x = fx * hw;
      d.group.position.y = wrap(d.fy * hh + screens * hh * 2 * d.parallax + Math.sin(t * 0.25 + d.bob * 7) * 0.12, -span, span);
      d.group.position.z = d.z;
    }
  }

  function update(dt: number) {
    const k = 1 - Math.exp(-dt * 2.2);
    cam.x += (pointer.x * 0.38 - cam.x) * k;
    cam.y += (-pointer.y * 0.26 - cam.y) * k;
    camera.position.x = cam.x;
    camera.position.y = cam.y;
    camera.lookAt(0, 0, 0);
    scroll += (scrollTarget - scroll) * (1 - Math.exp(-dt * 5));
    for (const d of doodles) {
      d.group.rotation.x += d.spin[0] * dt;
      d.group.rotation.y += d.spin[1] * dt;
      d.group.rotation.z += d.spin[2] * dt;
    }
    layout(time);
  }

  function draw() {
    renderer.render(scene, camera);
  }

  const settled = () =>
    Math.abs(scrollTarget - scroll) < 0.5 &&
    Math.abs(pointer.x * 0.38 - cam.x) < 0.002 &&
    Math.abs(-pointer.y * 0.26 - cam.y) < 0.002;

  function tick(now: number) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (scrollDirty) {
      scrollDirty = false;
      scrollTarget = window.scrollY || 0; // one read per frame, never per scroll event
    }
    const busy = now < wakeUntil || !settled();
    const interval = busy ? activeInterval : idleInterval;
    if (interval && now - lastDraw < interval - 2) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    lastDraw = now;
    time += dt;
    update(dt);
    draw();
  }

  function renderOnce() {
    if (disposed) return;
    scroll = scrollTarget;
    camera.position.set(cam.x, cam.y, CAM_Z);
    camera.lookAt(0, 0, 0);
    layout(time);
    draw();
  }

  function resize() {
    if (disposed) return;
    w = Math.max(1, container.clientWidth || window.innerWidth);
    h = Math.max(1, container.clientHeight || window.innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dust.mat.uniforms.uAspect.value = w / h;
    if (reduced || !running) renderOnce();
  }

  const onLost = (e: Event) => {
    e.preventDefault();
    running = false;
    cancelAnimationFrame(raf);
    canvas.style.opacity = '0';
  };
  canvas.addEventListener('webglcontextlost', onLost);

  return {
    canvas,
    setPointer(nx, ny) {
      pointer.x = nx;
      pointer.y = ny;
      wakeUntil = performance.now() + 300;
    },
    setScroll(y) {
      scrollTarget = y;
      wakeUntil = performance.now() + 300;
    },
    markScroll() {
      scrollDirty = true;
      wakeUntil = performance.now() + 300;
    },
    resize,
    start() {
      if (reduced || running || disposed) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    renderOnce,
    dispose() {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onLost);
      dust.geo.dispose();
      dust.mat.dispose();
      dust.map.dispose();
      disposers.forEach((d) => d());
      scene.clear();
      renderer.dispose();
      canvas.remove();
    },
  };
}
