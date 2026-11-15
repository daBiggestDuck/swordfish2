/**
 * Procedural Three.js instrument pets for Payload Pets.
 *
 * Drop-sibling API:
 *   import { renderPet3D, CANONICAL_PETS, resolvePetId } from "./pets3d.js";
 *   const handle = await renderPet3D("lister", "happy", mountEl);
 *   handle.update("cold"); // or phase: "day" | "sunset" | "night"
 *   handle.setPet("retro");
 *   handle.dispose();
 *
 * Ids match demos/js-pets + engine catalog: lister, retro (alias lra/LRA),
 * eds, trident, ln-1. Geometry reads as real hardware, not mascots.
 *
 * Three.js is loaded via ./three-loader.js (CDN mirrors + retry), not a bare
 * import-map-only path, so flakey CDNs and missing import maps fail loudly
 * with Retry UI instead of silent SVG fallbacks.
 */

export {
  ALL_PETS,
  CANONICAL_PETS,
  EXTRA_PETS,
  MOODS,
  PHASES,
  resolveMood,
  resolvePetId,
} from "./api.js";
import {
  ALL_PETS,
  CANONICAL_PETS,
  EXTRA_PETS,
  MOODS,
  resolveMood,
  resolvePetId,
} from "./api.js";
import {
  ensureThree,
  getThreeLoadError,
  getThreeSync,
  loadThree,
  preloadThree,
} from "./three-loader.js";

const MOODS_SET = new Set(MOODS);

/** Cap dedicated WebGL contexts (stage + map pet + surface). Thumbs share one farm. */
const MAX_LIVE_CONTEXTS = 3;
let liveContexts = 0;
/** @type {Array<() => void>} */
const liveWaiters = [];

/** @type {typeof import("three") | null} */
let THREE = getThreeSync();

/** @type {SharedFarm | null} */
let sharedFarm = null;

/** Warm geometry builds keyed by pet id (CPU only). */
const modelWarmCache = new Set();

const PALETTE = Object.freeze({
  happy: { light: 0xffe7ad, ambient: 0x6a7a99, accent: 0xea580c, tint: 1 },
  shivering: { light: 0xe0b15a, ambient: 0x4a5568, accent: 0xffb84d, tint: 0.85 },
  sleeping: { light: 0x9bb0c6, ambient: 0x1a2438, accent: 0xf59e0b, tint: 0.55 },
  cold: { light: 0xa8c4e0, ambient: 0x243448, accent: 0xf59e0b, tint: 0.7 },
});

async function acquireLiveSlot() {
  if (liveContexts < MAX_LIVE_CONTEXTS) {
    liveContexts += 1;
    return;
  }
  await new Promise((resolve) => {
    liveWaiters.push(resolve);
  });
  liveContexts += 1;
}

function releaseLiveSlot() {
  liveContexts = Math.max(0, liveContexts - 1);
  const next = liveWaiters.shift();
  if (next) next();
}

async function bindThree() {
  THREE = await ensureThree();
  return THREE;
}

/**
 * Clear error chrome + show a visible failure with optional Retry.
 * @param {HTMLElement} el
 * @param {string} message
 * @param {{ onRetry?: () => void }} [opts]
 */
export function showPets3DError(el, message, opts = {}) {
  if (!el || !(el instanceof HTMLElement)) return;
  el.classList.add("pets3d-mount", "pets3d-error");
  el.classList.remove("pets3d-ok");
  el.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "pets3d-error-box";
  const p = document.createElement("p");
  p.className = "mount-fallback";
  p.textContent = message;
  wrap.append(p);
  if (typeof opts.onRetry === "function") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pets3d-retry";
    btn.textContent = "Retry 3D";
    btn.addEventListener("click", () => opts.onRetry());
    wrap.append(btn);
  }
  el.append(wrap);
}

/**
 * Preload Three.js (+ optionally warm procedural models). Does not allocate WebGL.
 * @param {string[]} [ids]
 */
export async function preloadPets3D(ids) {
  await bindThree();
  const list =
    Array.isArray(ids) && ids.length
      ? ids.map((id) => resolvePetId(id))
      : ALL_PETS.map((p) => p.id);
  for (const petId of list) {
    if (modelWarmCache.has(petId)) continue;
    const scratch = {
      animables: [],
      dust: [],
      tips: [],
      petId,
      mood: "happy",
      signal: 40,
    };
    const root = buildInstrument(petId, scratch);
    disposeObject(root);
    modelWarmCache.add(petId);
  }
  return { three: THREE, warmed: [...modelWarmCache] };
}

function destroyWebGLRenderer(renderer) {
  if (!renderer) return;
  try {
    renderer.forceContextLoss?.();
  } catch {
    /* ignore */
  }
  try {
    renderer.dispose();
  } catch {
    /* ignore */
  }
  try {
    renderer.domElement?.remove?.();
  } catch {
    /* ignore */
  }
}

function createWebGLRenderer(T, opts = {}) {
  try {
    return new T.WebGLRenderer({
      antialias: opts.antialias !== false,
      alpha: Boolean(opts.alpha),
      premultipliedAlpha: false,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: false,
      preserveDrawingBuffer: Boolean(opts.preserveDrawingBuffer),
    });
  } catch (err) {
    throw new Error(
      `WebGL context unavailable (${err instanceof Error ? err.message : err})`,
    );
  }
}

/**
 * One off-DOM WebGLRenderer that blits animated views into many 2D canvases.
 */
class SharedFarm {
  /** @param {typeof import("three")} T */
  constructor(T) {
    this.T = T;
    this.renderer = createWebGLRenderer(T, {
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.domElement.style.cssText =
      "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    if (typeof document !== "undefined") {
      document.body?.appendChild(this.renderer.domElement);
    }
    /** @type {Map<symbol, object>} */
    this.views = new Map();
    this.clock = new T.Clock();
    this.raf = 0;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      const t = this.clock.getElapsedTime();
      for (const view of this.views.values()) {
        if (view.disposed) continue;
        this.renderView(view, t);
      }
    };
    tick();
  }

  stopIfEmpty() {
    if (this.views.size) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  renderView(view, t) {
    const { state, scene, camera, canvas, autoRotate, reduceMotion, userYaw } =
      view;
    const root = state.root;
    if (root) {
      const spin = autoRotate && !reduceMotion ? t * 0.35 : 0;
      root.rotation.y = userYaw + spin;
      animateMood(root, state, t, reduceMotion);
    }
    const w = Math.max(64, canvas.width || 160);
    const h = Math.max(64, canvas.height || 160);
    this.renderer.setSize(w, h, false);
    // Opaque gallery thumbs keep a filled clear; transparent views use alpha 0.
    if (state.transparent || scene.background == null) {
      this.renderer.setClearColor(0x000000, 0);
    } else {
      this.renderer.setClearColor(0x0B1320, 1);
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    this.renderer.render(scene, camera);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.renderer.domElement, 0, 0, w, h);
  }
}

async function getSharedFarm() {
  await bindThree();
  if (!sharedFarm || !sharedFarm.renderer) {
    sharedFarm = new SharedFarm(THREE);
  }
  return sharedFarm;
}

/** @type {Map<string, { dataUrl: string, petId: string, mood: string, size: number, signal: number }>} */
const spriteCache = new Map();

function spriteCacheKey(petId, mood, signal, powerGlow, signalStress, size) {
  return `${petId}:${mood}:${Math.round(Number(signal) || 0)}:${powerGlow ? 1 : 0}:${signalStress ? 1 : 0}:${size}`;
}

const SURFACE_PET_SCALE = Object.freeze({
  lister: 1,
  retro: 1.22,
  eds: 1,
  trident: 1.04,
  "ln-1": 0.96,
});

function applyInstrumentScale(root, petId, { surface = false } = {}) {
  if (!root) return;
  const scale = surface ? SURFACE_PET_SCALE[petId] || 1 : 1;
  root.scale.setScalar(scale);
}

/**
 * One-shot blit of the procedural instrument into a transparent PNG.
 * Same geometry/mood lighting as renderPet3D — for Flat Map / South Pole SVG markers.
 *
 * @param {string} id
 * @param {string} moodOrPhase
 * @param {{
 *   size?: number,
 *   signal?: number,
 *   powerGlow?: boolean,
 *   signalStress?: boolean,
 *   phaseId?: string,
 *   bust?: boolean,
 * }} [options]
 * @returns {Promise<{ dataUrl: string, petId: string, mood: string, size: number, signal: number }>}
 */
export async function capturePetSprite(id, moodOrPhase, options = {}) {
  const size = Math.max(64, Math.min(512, Math.floor(Number(options.size) || 160)));
  const { petId, mood, signal, powerGlow } = parseMountArgs(id, moodOrPhase, options);
  const signalStress = Boolean(options.signalStress);
  const key = spriteCacheKey(petId, mood, signal, powerGlow, signalStress, size);
  if (!options.bust && spriteCache.has(key)) {
    return spriteCache.get(key);
  }

  const farm = await getSharedFarm();
  const state = {
    petId,
    mood,
    signal,
    root: null,
    animables: [],
    dust: [],
    tips: [],
  };
  const { scene, camera, hemi, key: keyLight, rim } = buildSceneKit({
    surface: true,
    transparent: true,
    shadows: false,
  });
  camera.fov = 36;
  camera.position.set(1.95, 1.42, 2.55);
  camera.lookAt(0, 0.66, 0);
  camera.updateProjectionMatrix();

  state.root = buildInstrument(petId, state);
  applyInstrumentScale(state.root, petId, { surface: true });
  state.root.rotation.y = 0.55;
  scene.add(state.root);
  modelWarmCache.add(petId);

  const palette = PALETTE[mood] || PALETTE.happy;
  keyLight.color.setHex(powerGlow ? 0xffe7ad : palette.light);
  keyLight.intensity = (0.95 + 0.45 * palette.tint) * (powerGlow ? 1.3 : 1);
  hemi.intensity = 0.7 + 0.35 * palette.tint;
  rim.color.setHex(signalStress ? 0xff6b6b : palette.accent);
  rim.intensity = mood === "sleeping" ? 0.18 : signalStress ? 0.75 : 0.5;
  const high = signal >= 70 && mood !== "sleeping";
  for (const tip of state.tips) {
    if (!tip.material) continue;
    tip.material.emissiveIntensity = high ? 1.35 : 0.25;
  }
  // Settled pose (no mid-animation wobble) so map pins stay readable.
  animateMood(state.root, state, 0.35, true);

  const renderer = farm.renderer;
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(size, size, false);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    disposeObject(scene);
    throw new Error("2D canvas unavailable for pet sprite blit");
  }
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(renderer.domElement, 0, 0, size, size);
  const dataUrl = canvas.toDataURL("image/png");
  disposeObject(scene);

  const result = Object.freeze({ dataUrl, petId, mood, size, signal });
  spriteCache.set(key, result);
  return result;
}

/** Drop cached blit frames (tests / pet catalog hot-reload). */
export function clearPetSpriteCache() {
  spriteCache.clear();
}

function parseMountArgs(id, moodOrPhase, options) {
  const petId = resolvePetId(id);
  const moodSource =
    typeof options.phaseId === "string" && options.phaseId
      ? options.phaseId
      : moodOrPhase;
  let mood = resolveMood(moodSource, { petId });
  if (typeof moodOrPhase === "string" && MOODS_SET.has(moodOrPhase)) {
    mood = moodOrPhase;
  }
  let signal =
    typeof options.signal === "number" && Number.isFinite(options.signal)
      ? options.signal
      : options.signalStress
        ? 12
        : mood === "happy"
          ? 85
          : 40;
  const surface = Boolean(options.surface);
  const transparent = surface || Boolean(options.transparent);
  return {
    petId,
    mood,
    signal,
    powerGlow: Boolean(options.powerGlow),
    surface,
    transparent,
  };
}

function buildSceneKit({ surface, transparent, shadows }) {
  const scene = new THREE.Scene();
  scene.background = transparent ? null : new THREE.Color(0x0B1320);

  const camera = new THREE.PerspectiveCamera(surface ? 36 : 38, 1, 0.1, 40);
  if (surface) {
    // Frame tall/wide rigs (EDS, LN-1, LISTER) with comfortable headroom so bob/rotation never clips.
    camera.position.set(1.95, 1.42, 2.55);
    camera.lookAt(0, 0.66, 0);
  } else {
    camera.position.set(2.6, 1.85, 3.4);
    camera.lookAt(0, 0.55, 0);
  }

  const hemi = new THREE.HemisphereLight(0xb8c8e0, 0x1a1420, surface ? 1.05 : 0.85);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffe7ad, 1.35);
  key.position.set(3.2, 5.5, 2.4);
  key.castShadow = Boolean(shadows);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xea580c, 0.35);
  fill.position.set(-3, 2, -2);
  scene.add(fill);
  const rim = new THREE.PointLight(0xf59e0b, 0.4, 12);
  rim.position.set(-1.5, 0.4, 2.2);
  scene.add(rim);

  if (!surface) {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 48),
      new THREE.MeshStandardMaterial({
        color: 0x121826,
        roughness: 0.95,
        metalness: 0.05,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = Boolean(shadows);
    scene.add(ground);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.05, 64),
      new THREE.MeshBasicMaterial({
        color: 0x2a3244,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);
  }

  return { scene, camera, hemi, key, rim };
}

/**
 * Mount a rotating instrument model into `el`.
 * Compatible with web/pet_moon.js → window.PayloadPets3D.renderPet3D(...).
 *
 * @param {string} id
 * @param {string} moodOrPhase  mood id or sun phase
 * @param {HTMLElement} el
 * @param {{
 *   autoRotate?: boolean,
 *   interactive?: boolean,
 *   signal?: number,
 *   powerGlow?: boolean,
 *   signalStress?: boolean,
 *   phaseId?: string,
 *   surface?: boolean,
 *   transparent?: boolean,
 *   mode?: "live" | "shared",
 *   showError?: boolean,
 * }} [options]
 */
export async function renderPet3D(id, moodOrPhase, el, options = {}) {
  if (!el || !(el instanceof HTMLElement)) {
    throw new Error("renderPet3D needs a mount HTMLElement");
  }

  if (el._pets3dHandle && typeof el._pets3dHandle.dispose === "function") {
    try {
      el._pets3dHandle.dispose();
    } catch {
      /* ignore */
    }
    el._pets3dHandle = null;
  }

  // Surface overlays always need a live transparent canvas.
  const mode =
    options.surface || options.transparent
      ? "live"
      : options.mode === "shared"
        ? "shared"
        : "live";
  const showError = options.showError !== false;

  try {
    await bindThree();
    if (mode === "shared") {
      return await mountSharedPet3D(id, moodOrPhase, el, options);
    }
    return await mountLivePet3D(id, moodOrPhase, el, options);
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "3D model failed to load (Three.js / WebGL).";
    console.warn("[pets3d] renderPet3D failed", err);
    if (showError) {
      showPets3DError(el, msg, {
        onRetry: () => {
          void renderPet3D(id, moodOrPhase, el, options);
        },
      });
    }
    throw err;
  }
}

async function mountSharedPet3D(id, moodOrPhase, el, options) {
  const farm = await getSharedFarm();
  const { petId, mood, signal, powerGlow, surface, transparent } = parseMountArgs(
    id,
    moodOrPhase,
    options,
  );
  const state = {
    disposed: false,
    petId,
    mood,
    signal,
    root: null,
    animables: [],
    dust: [],
    tips: [],
    surface,
    transparent,
  };

  const { scene, camera, hemi, key, rim } = buildSceneKit({
    surface: false,
    transparent: false,
    shadows: false,
  });
  const canvas = document.createElement("canvas");
  canvas.className = "pets3d-canvas pets3d-blit";
  canvas.setAttribute("role", "img");
  el.replaceChildren();
  el.classList.add("pets3d-mount", "pets3d-ok");
  el.classList.remove("pets3d-error");
  el.appendChild(canvas);

  const autoRotate = options.autoRotate !== false;
  const reduceMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const viewKey = Symbol("pets3d-view");
  const view = {
    key: viewKey,
    state,
    scene,
    camera,
    canvas,
    autoRotate,
    reduceMotion,
    userYaw: 0.35,
    disposed: false,
    handle: null,
  };

  function rebuildModel() {
    if (state.root) {
      scene.remove(state.root);
      disposeObject(state.root);
    }
    state.animables = [];
    state.dust = [];
    state.tips = [];
    state.root = buildInstrument(state.petId, state);
    scene.add(state.root);
    modelWarmCache.add(state.petId);
    canvas.setAttribute(
      "aria-label",
      `${labelFor(state.petId)} 3D instrument model, ${state.mood}`,
    );
  }

  function applyMoodLighting() {
    const p = PALETTE[state.mood] || PALETTE.happy;
    key.color.setHex(powerGlow ? 0xffe7ad : p.light);
    key.intensity = (0.9 + 0.45 * p.tint) * (powerGlow ? 1.25 : 1);
    hemi.intensity = 0.55 + 0.4 * p.tint;
    rim.color.setHex(options.signalStress ? 0xff6b6b : p.accent);
    rim.intensity =
      state.mood === "sleeping" ? 0.15 : options.signalStress ? 0.7 : 0.45;
    scene.background = new THREE.Color(
      state.mood === "sleeping" || state.mood === "cold" ? 0x070D17 : 0x0B1320,
    );
    syncTipGlow();
  }

  function syncTipGlow() {
    const high = state.signal >= 70 && state.mood !== "sleeping";
    for (const tip of state.tips) {
      if (!tip.material) continue;
      tip.material.emissiveIntensity = high ? 1.4 : 0.25;
      tip.userData.blink = high;
    }
  }

  const resize = () => {
    if (state.disposed) return;
    const rect = el.getBoundingClientRect();
    const w = Math.max(80, Math.floor(rect.width) || 160);
    const h = Math.max(80, Math.floor(rect.height) || 160);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  };
  resize();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(el);

  rebuildModel();
  applyMoodLighting();
  farm.views.set(viewKey, view);
  farm.start();

  const handle = {
    get el() {
      return el;
    },
    get petId() {
      return state.petId;
    },
    get mood() {
      return state.mood;
    },
    get mode() {
      return "shared";
    },
    update(nextMoodOrPhase, opts = {}) {
      if (MOODS_SET.has(nextMoodOrPhase)) state.mood = nextMoodOrPhase;
      else {
        state.mood = resolveMood(nextMoodOrPhase, {
          petId: state.petId,
          ...opts,
        });
      }
      if (typeof opts.signal === "number") state.signal = opts.signal;
      if (opts.signalStress) state.signal = Math.min(state.signal, 20);
      applyMoodLighting();
      syncTipGlow();
      return handle;
    },
    setPet(nextId) {
      state.petId = resolvePetId(nextId);
      rebuildModel();
      applyMoodLighting();
      return handle;
    },
    setSignal(value) {
      state.signal = Number(value) || 0;
      syncTipGlow();
      return handle;
    },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      view.disposed = true;
      farm.views.delete(viewKey);
      farm.stopIfEmpty();
      ro?.disconnect();
      disposeObject(scene);
      el.replaceChildren();
      el.classList.remove("pets3d-mount", "pets3d-ok", "pets3d-error");
      if (el._pets3dHandle === handle) el._pets3dHandle = null;
    },
  };
  view.handle = handle;
  el._pets3dHandle = handle;
  return handle;
}

async function mountLivePet3D(id, moodOrPhase, el, options) {
  await acquireLiveSlot();
  let slotHeld = true;
  const release = () => {
    if (!slotHeld) return;
    slotHeld = false;
    releaseLiveSlot();
  };

  try {
    const { petId, mood, signal, powerGlow, surface, transparent } =
      parseMountArgs(id, moodOrPhase, options);
    const state = {
      disposed: false,
      petId,
      mood,
      signal,
      root: null,
      animables: [],
      dust: [],
      tips: [],
      surface,
      transparent,
    };

    const { scene, camera, hemi, key, rim } = buildSceneKit({
      surface,
      transparent,
      shadows: !surface,
    });

    let renderer;
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        renderer = createWebGLRenderer(THREE, {
          antialias: true,
          alpha: transparent,
        });
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
      }
    }
    if (!renderer) {
      throw lastErr || new Error("WebGLRenderer could not be created");
    }
    if (transparent) renderer.setClearColor(0x000000, 0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !surface;
    el.replaceChildren();
    el.classList.add("pets3d-mount", "pets3d-ok");
    el.classList.remove("pets3d-error");
    if (surface) el.classList.add("pets3d-surface");
    renderer.domElement.className = "pets3d-canvas";
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute(
      "aria-label",
      `${labelFor(petId)} 3D instrument model`,
    );
    el.appendChild(renderer.domElement);

    function rebuildModel() {
      if (state.root) {
        scene.remove(state.root);
        disposeObject(state.root);
      }
      state.animables = [];
      state.dust = [];
      state.tips = [];
      state.root = buildInstrument(state.petId, state);
      applyInstrumentScale(state.root, state.petId, { surface });
      scene.add(state.root);
      modelWarmCache.add(state.petId);
      renderer.domElement.setAttribute(
        "aria-label",
        `${labelFor(state.petId)} 3D instrument model, ${state.mood}`,
      );
    }

    function applyMoodLighting() {
      const p = PALETTE[state.mood] || PALETTE.happy;
      key.color.setHex(powerGlow ? 0xffe7ad : p.light);
      key.intensity = (0.9 + 0.45 * p.tint) * (powerGlow ? 1.25 : 1);
      hemi.intensity = (surface ? 0.75 : 0.55) + 0.4 * p.tint;
      rim.color.setHex(options.signalStress ? 0xff6b6b : p.accent);
      rim.intensity =
        state.mood === "sleeping" ? 0.15 : options.signalStress ? 0.7 : 0.45;
      if (!transparent) {
        scene.background = new THREE.Color(
          state.mood === "night" ||
            state.mood === "sleeping" ||
            state.mood === "cold"
            ? 0x070D17
            : 0x0B1320,
        );
      } else {
        scene.background = null;
      }
      syncTipGlow();
    }

    function syncTipGlow() {
      const high = state.signal >= 70 && state.mood !== "sleeping";
      for (const tip of state.tips) {
        if (!tip.material) continue;
        tip.material.emissiveIntensity = high ? 1.4 : 0.25;
        tip.userData.blink = high;
      }
    }

    rebuildModel();
    applyMoodLighting();

    let width = 0;
    let height = 0;
    const resize = () => {
      if (state.disposed) return;
      const rect = el.getBoundingClientRect();
      const minSize = surface ? 96 : 160;
      width = Math.max(minSize, Math.floor(rect.width) || (surface ? 104 : 320));
      height = Math.max(
        minSize,
        Math.floor(rect.height) || (surface ? 104 : 320),
      );
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(el);

    let dragging = false;
    let lastX = 0;
    const autoRotate = surface
      ? options.autoRotate === true
      : options.autoRotate !== false;
    const interactive = surface
      ? options.interactive === true
      : options.interactive !== false;
    let userYaw = surface ? 0.55 : 0.35;

    const onPointerDown = (event) => {
      if (!interactive) return;
      dragging = true;
      lastX = event.clientX;
      renderer.domElement.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event) => {
      if (!dragging) return;
      userYaw += (event.clientX - lastX) * 0.01;
      lastX = event.clientX;
    };
    const onPointerUp = () => {
      dragging = false;
    };
    if (interactive) {
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("pointercancel", onPointerUp);
    }

    const reduceMotion =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      if (state.disposed) return;
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      const root = state.root;
      if (root) {
        const spin = autoRotate && !dragging && !reduceMotion ? t * 0.35 : 0;
        root.rotation.y = userYaw + spin;
        animateMood(root, state, t, reduceMotion);
      }
      renderer.render(scene, camera);
    };
    tick();

    const handle = {
      get el() {
        return el;
      },
      get petId() {
        return state.petId;
      },
      get mood() {
        return state.mood;
      },
      get mode() {
        return "live";
      },
      update(nextMoodOrPhase, opts = {}) {
        if (MOODS_SET.has(nextMoodOrPhase)) state.mood = nextMoodOrPhase;
        else {
          state.mood = resolveMood(nextMoodOrPhase, {
            petId: state.petId,
            ...opts,
          });
        }
        if (typeof opts.signal === "number") state.signal = opts.signal;
        if (opts.signalStress) state.signal = Math.min(state.signal, 20);
        applyMoodLighting();
        syncTipGlow();
        return handle;
      },
      setPet(nextId) {
        state.petId = resolvePetId(nextId);
        rebuildModel();
        applyMoodLighting();
        return handle;
      },
      setSignal(value) {
        state.signal = Number(value) || 0;
        syncTipGlow();
        return handle;
      },
      dispose() {
        if (state.disposed) return;
        state.disposed = true;
        cancelAnimationFrame(raf);
        ro?.disconnect();
        if (interactive) {
          renderer.domElement.removeEventListener("pointerdown", onPointerDown);
          renderer.domElement.removeEventListener("pointermove", onPointerMove);
          renderer.domElement.removeEventListener("pointerup", onPointerUp);
          renderer.domElement.removeEventListener(
            "pointercancel",
            onPointerUp,
          );
        }
        disposeObject(scene);
        destroyWebGLRenderer(renderer);
        el.replaceChildren();
        el.classList.remove(
          "pets3d-mount",
          "pets3d-surface",
          "pets3d-ok",
          "pets3d-error",
        );
        if (el._pets3dHandle === handle) el._pets3dHandle = null;
        release();
      },
    };

    el._pets3dHandle = handle;
    return handle;
  } catch (err) {
    release();
    throw err;
  }
}

/**
 * Register the global hook moon-drop expects:
 *   window.PayloadPets3D.renderPet3D(id, mood, el, opts)
 */
export function installPayloadPets3D(target = globalThis) {
  const api = {
    renderPet3D,
    capturePetSprite,
    clearPetSpriteCache,
    preloadPets3D,
    showPets3DError,
    resolvePetId,
    resolveMood,
    CANONICAL_PETS,
    EXTRA_PETS,
    ALL_PETS,
    installPayloadPets3D,
    loadThree,
    preloadThree,
    ensureThree,
    getThreeLoadError,
    ready: null,
    loadError: null,
  };
  api.ready = preloadPets3D().catch((err) => {
    api.loadError = err instanceof Error ? err : new Error(String(err));
    throw api.loadError;
  });
  target.PayloadPets3D = api;
  api.ready
    .then(() => {
      try {
        target.dispatchEvent?.(
          new CustomEvent("payloadpets3d:ready", { detail: api }),
        );
      } catch {
        /* ignore */
      }
    })
    .catch(() => {
      try {
        target.dispatchEvent?.(
          new CustomEvent("payloadpets3d:error", {
            detail: api.loadError || getThreeLoadError(),
          }),
        );
      } catch {
        /* ignore */
      }
    });
  return api;
}

/**
 * Wait until window.PayloadPets3D is installed and Three has loaded (or timeout).
 * @param {number} [timeoutMs]
 */
export async function whenPayloadPets3DReady(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const api = globalThis.PayloadPets3D;
    if (api?.ready) {
      try {
        const left = Math.max(0, timeoutMs - (Date.now() - start));
        await Promise.race([
          api.ready,
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error("PayloadPets3D ready timeout")), left),
          ),
        ]);
        return api;
      } catch (err) {
        if (api.loadError) throw api.loadError;
        throw err;
      }
    }
    if (typeof api?.renderPet3D === "function" && getThreeSync()) return api;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error("PayloadPets3D did not become ready in time");
}

function labelFor(id) {
  return ALL_PETS.find((p) => p.id === id)?.name || id;
}

function animateMood(root, state, t, reduceMotion) {
  if (reduceMotion) {
    root.position.y = 0;
    root.rotation.z = 0;
    return;
  }
  const mood = state.mood;
  // Subtle motion amplification on globe-surface billboards without clipping canvas edges.
  const amp = state.surface ? 1.25 : 1;
  if (mood === "happy") {
    root.position.y = Math.sin(t * 2.2) * 0.04 * amp;
    root.rotation.z = 0;
  } else if (mood === "shivering") {
    root.position.y = 0;
    root.rotation.z = Math.sin(t * 28) * 0.035 * amp;
    root.position.x = Math.sin(t * 31) * 0.012 * amp;
  } else if (mood === "sleeping") {
    root.position.x = 0;
    root.position.y = Math.sin(t * 1.1) * 0.018 * amp;
    root.rotation.z = 0;
  } else {
    root.position.x = 0;
    root.position.y = 0.01 + Math.sin(t * 1.6) * 0.012 * amp;
    root.rotation.z = Math.sin(t * 1.4) * 0.01 * amp;
  }

  for (const bit of state.animables) {
    if (bit.userData.spin && (mood === "happy" || mood === "shivering")) {
      bit.rotation.y += bit.userData.spin * (mood === "happy" ? 0.08 : 0.03);
    }
  }
  for (const mote of state.dust) {
    if (mood === "happy") {
      mote.position.y = mote.userData.baseY + Math.sin(t * 2 + mote.userData.phase) * 0.12;
      mote.visible = true;
    } else if (mood === "shivering") {
      mote.position.y = mote.userData.restY;
      mote.visible = true;
    } else {
      mote.position.y = mote.userData.lowY;
      mote.visible = true;
    }
  }
  for (const tip of state.tips) {
    if (tip.userData.blink) {
      tip.material.emissiveIntensity = 0.35 + 0.9 * (0.5 + 0.5 * Math.sin(t * 6));
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Instrument builders                                                        */
/* -------------------------------------------------------------------------- */

function buildInstrument(id, state) {
  if (id === "lister") return buildLister(state);
  if (id === "retro") return buildRetro(state);
  if (id === "eds") return buildEds(state);
  if (id === "trident") return buildTrident(state);
  if (id === "ln-1") return buildNodey(state);
  return buildLister(state);
}

function mat(opts) {
  return new THREE.MeshStandardMaterial({
    roughness: 0.45,
    metalness: 0.35,
    ...opts,
  });
}

function buildLister(state) {
  const g = new THREE.Group();
  g.name = "lister";

  const gold = mat({ color: 0xc9963a, metalness: 0.55, roughness: 0.38 });
  const dark = mat({ color: 0x2a2418, metalness: 0.4, roughness: 0.55 });
  const steel = mat({ color: 0xb8c2cc, metalness: 0.85, roughness: 0.28 });
  const tip = mat({ color: 0x6a7480, metalness: 0.9, roughness: 0.25 });

  // Electronics / thermal housing
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.72, 24), gold);
  body.position.y = 0.95;
  body.castShadow = true;
  g.add(body);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.12, 24), dark);
  cap.position.y = 1.37;
  g.add(cap);

  // Band / connector ring
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 10, 32), steel);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.95;
  g.add(band);

  // Pneumatic mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.55, 16), steel);
  mast.position.y = 0.48;
  mast.castShadow = true;
  g.add(mast);

  // Heat-flow needle / bit
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 12), steel);
  stem.position.y = 0.18;
  g.add(stem);

  const bit = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 10), tip);
  bit.position.y = -0.05;
  bit.castShadow = true;
  g.add(bit);

  // Depth-stop discs (8 stops → show a few)
  for (let i = 0; i < 4; i++) {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16),
      dark,
    );
    disc.position.y = 0.32 - i * 0.08;
    g.add(disc);
  }

  // Foot pad
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 20), dark);
  foot.position.y = 0.03;
  foot.receiveShadow = true;
  g.add(foot);

  // Small sensor cable loop
  const cable = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.018, 8, 20, Math.PI * 1.2),
    steel,
  );
  cable.position.set(0.22, 1.05, 0.1);
  cable.rotation.y = 0.4;
  g.add(cable);

  state.animables.push(bit);
  bit.userData.spin = 1;
  return g;
}

function buildRetro(state) {
  const g = new THREE.Group();
  g.name = "retro";

  const alum = mat({ color: 0xd8dee8, metalness: 0.75, roughness: 0.32 });
  const glass = mat({
    color: 0xc5d4e8,
    metalness: 0.2,
    roughness: 0.12,
    transparent: true,
    opacity: 0.92,
    emissive: 0x8fd0c4,
    emissiveIntensity: 0.08,
  });
  const dark = mat({ color: 0x3a4558, metalness: 0.5, roughness: 0.5 });

  // Hemispherical mount (LRA-style dome)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), alum);
  dome.position.y = 0.08;
  dome.castShadow = true;
  g.add(dome);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.1, 32), dark);
  base.position.y = 0.05;
  g.add(base);

  // Corner-cube cluster (8 reflectors)
  const cluster = new THREE.Group();
  cluster.position.y = 0.42;
  const cubeGeo = new THREE.OctahedronGeometry(0.11, 0);
  const positions = [
    [0, 0.16, 0],
    [0.16, 0.06, 0.1],
    [-0.16, 0.06, 0.1],
    [0.1, 0.06, -0.14],
    [-0.1, 0.06, -0.14],
    [0.2, -0.02, -0.02],
    [-0.2, -0.02, -0.02],
    [0, -0.02, 0.2],
  ];
  for (const [x, y, z] of positions) {
    const cube = new THREE.Mesh(cubeGeo, glass.clone());
    cube.position.set(x, y, z);
    cube.rotation.set(0.3 + x, 0.5 + y, 0.2);
    cube.castShadow = true;
    cluster.add(cube);
  }
  g.add(cluster);

  // Laser glint helper
  const glint = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff8e8 }),
  );
  glint.position.set(0.22, 0.62, 0.18);
  g.add(glint);

  state.animables.push(cluster);
  return g;
}

function buildEds(state) {
  const g = new THREE.Group();
  g.name = "eds";

  const frame = mat({ color: 0xe0b15a, metalness: 0.45, roughness: 0.4 });
  const glass = mat({
    color: 0x1d4a42,
    metalness: 0.15,
    roughness: 0.25,
    transparent: true,
    opacity: 0.85,
    emissive: 0x0a2a24,
    emissiveIntensity: 0.3,
  });
  const electrode = mat({
    color: 0x8fd0c4,
    metalness: 0.6,
    roughness: 0.3,
    emissive: 0x8fd0c4,
    emissiveIntensity: 0.35,
  });
  const dustMat = mat({ color: 0xf3e6cc, metalness: 0.05, roughness: 0.9 });

  // Shield panel
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.9, 0.08), glass);
  panel.position.y = 0.7;
  panel.castShadow = true;
  g.add(panel);

  const border = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.97, 0.05), frame);
  border.position.y = 0.7;
  border.position.z = -0.01;
  g.add(border);

  // Electrode grid
  const grid = new THREE.Group();
  grid.position.set(0, 0.7, 0.045);
  for (let i = -2; i <= 2; i++) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.018, 0.012), electrode);
    h.position.y = i * 0.14;
    grid.add(h);
  }
  for (let i = -2; i <= 2; i++) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.78, 0.012), electrode);
    v.position.x = i * 0.18;
    grid.add(v);
  }
  g.add(grid);

  // Stand
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.06, 0.35, 12),
    frame,
  );
  post.position.y = 0.2;
  g.add(post);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.28), frame);
  foot.position.y = 0.03;
  g.add(foot);

  // Dust motes
  const moteGeo = new THREE.SphereGeometry(0.035, 10, 10);
  const motePos = [
    [-0.4, 1.15, 0.2],
    [-0.15, 1.28, 0.15],
    [0.2, 1.2, 0.22],
    [0.42, 1.32, 0.12],
  ];
  motePos.forEach(([x, y, z], i) => {
    const mote = new THREE.Mesh(moteGeo, dustMat.clone());
    mote.position.set(x, y, z);
    mote.userData.baseY = y;
    mote.userData.restY = 0.95;
    mote.userData.lowY = 0.35;
    mote.userData.phase = i * 0.9;
    g.add(mote);
    state.dust.push(mote);
  });

  state.animables.push(grid);
  return g;
}

function buildTrident(state) {
  const g = new THREE.Group();
  g.name = "trident";

  const ice = mat({ color: 0xc5dcec, metalness: 0.55, roughness: 0.35 });
  const belly = mat({ color: 0xe8f4fc, metalness: 0.25, roughness: 0.45 });
  const steel = mat({ color: 0x9eb4c8, metalness: 0.85, roughness: 0.28 });
  const ink = mat({ color: 0x2a4a62, metalness: 0.4, roughness: 0.5 });

  // Instrument electronics box
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.42), ice);
  box.position.y = 1.15;
  box.castShadow = true;
  g.add(box);

  const face = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, 0.06), belly);
  face.position.set(0, 1.18, 0.22);
  g.add(face);

  // Rotary-percussive stack
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.28, 20), ink);
  stack.position.y = 0.85;
  g.add(stack);

  // Auger flutes
  const auger = new THREE.Group();
  auger.position.y = 0.42;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 12), steel);
  auger.add(shaft);
  for (let i = 0; i < 7; i++) {
    const flight = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.022, 6, 16, Math.PI * 1.4),
      steel,
    );
    flight.position.y = 0.28 - i * 0.09;
    flight.rotation.x = Math.PI / 2;
    flight.rotation.z = i * 0.7;
    auger.add(flight);
  }
  const bit = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 8), ink);
  bit.position.y = -0.4;
  auger.add(bit);
  g.add(auger);
  auger.userData.spin = 1.4;
  state.animables.push(auger);

  // Collar / sample stage
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.08, 16), belly);
  collar.position.y = 0.72;
  g.add(collar);

  // Tripod feet
  for (const angle of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.55, 8), steel);
    leg.position.set(Math.cos(angle) * 0.28, 0.28, Math.sin(angle) * 0.28);
    leg.rotation.z = Math.cos(angle) * 0.35;
    leg.rotation.x = Math.sin(angle) * -0.35;
    g.add(leg);
  }

  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 16), ink);
  pad.position.y = 0.025;
  g.add(pad);

  return g;
}

function buildNodey(state) {
  const g = new THREE.Group();
  g.name = "ln-1";

  const gold = mat({ color: 0xe0b15a, metalness: 0.5, roughness: 0.4 });
  const amber = mat({ color: 0xf4d08a, metalness: 0.35, roughness: 0.45 });
  const dark = mat({ color: 0x3a2a10, metalness: 0.4, roughness: 0.55 });
  const tipMat = mat({
    color: 0x8fd0c4,
    metalness: 0.2,
    roughness: 0.35,
    emissive: 0x8fd0c4,
    emissiveIntensity: 0.8,
  });

  // Radio housing
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.4), gold);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);

  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.04), amber);
  panel.position.set(0, 0.62, 0.22);
  g.add(panel);

  // Side “wings” / solar or RF panels
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.55), amber);
    wing.position.set(side * 0.48, 0.55, 0);
    wing.rotation.z = side * -0.15;
    wing.castShadow = true;
    g.add(wing);
  }

  // Dual antennas
  for (const side of [-1, 1]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.7, 8), dark);
    mast.position.set(side * 0.14, 1.2, 0);
    mast.rotation.z = side * 0.22;
    g.add(mast);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 14), tipMat.clone());
    tip.position.set(side * 0.22, 1.52, 0);
    tip.userData.blink = false;
    g.add(tip);
    state.tips.push(tip);
  }

  // Base / lander interface
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.1, 20), dark);
  base.position.y = 0.05;
  g.add(base);

  return g;
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
}
