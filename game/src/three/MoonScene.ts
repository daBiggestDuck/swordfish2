// Rover Run's Moon: one WebGL canvas shared by every screen.
//
// Real data only: LROC WAC colour + LOLA-derived surface normals (NASA SVS CGI Moon Kit), with the
// south polar cap from LOLA's 240 m/px polar DEM (NASA PDS). The globe stays fixed in the
// Moon-fixed frame (see moonFrame.ts); the camera flies between views:
//   home    – the whole Moon, gently turning, front-lit (Canva slide 1)
//   select  – a chosen site turned toward the viewer, Moon on the left (Canva slide 2)
//   surface – low over a horizon (Canva slide 3)
//   drive   – riding behind the rover along the great-circle route, lit by the engine's Sun (slides 4–5)

import * as THREE from "three";
import { DEG, enuAt, headingTo, latLonToVec, slerpDir, type LatLon } from "./moonFrame";

export type SceneMode = "home" | "select" | "surface" | "drive";

export interface SunState {
  /** 0..1 from the engine (0 at sunrise/sunset/night, 1 at local noon) */
  elevation01: number;
  /** 0..1 from the engine: share of the lunar day gone (drives the Sun's azimuth) */
  dayProgress: number;
  isDay: boolean;
  /** 0..1 engine sunlight factor at the rover (0 = permanently shadowed) */
  sunlight: number;
}

export interface Projected {
  x: number;
  y: number;
  visible: boolean;
}

const CAP_LAT = -77; // must match scripts/build-moon-textures.mjs
const R_REF = 1737.4;

const vertexShader = /* glsl */ `
  varying vec3 vObj;
  void main() {
    vObj = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D uColor;
  uniform sampler2D uNormal;
  uniform sampler2D uSouth;
  uniform float uHasSouth;
  uniform float uRhoMax;
  uniform vec3 uSunDir;
  uniform float uSun;
  uniform vec3 uAmbient;
  uniform vec3 uCam;
  uniform float uRelief;
  uniform float uExposure;
  uniform vec3 uHighlight;
  uniform float uHighlightR;
  varying vec3 vObj;
  const float PI = 3.141592653589793;

  void main() {
    vec3 p = normalize(vObj);
    float lat = asin(clamp(p.y, -1.0, 1.0));
    float lon = atan(p.x, p.z);
    vec2 uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
    // Per-pixel lat/lon has a seam at ±180°: wrap the derivatives so mip selection stays sane.
    vec2 dx = dFdx(uv);
    vec2 dy = dFdy(uv);
    dx.x -= floor(dx.x + 0.5);
    dy.x -= floor(dy.x + 0.5);

    vec3 albedo = pow(textureGrad(uColor, uv, dx, dy).rgb, vec3(2.2));
    vec3 n = normalize(textureGrad(uNormal, uv, dx, dy).rgb * 2.0 - 1.0);

    float latDeg = lat * 180.0 / PI;
    if (uHasSouth > 0.5 && latDeg < ${CAP_LAT.toFixed(1)} + 0.6) {
      float rho = 2.0 * ${R_REF.toFixed(1)} * tan(PI / 4.0 + lat / 2.0);
      vec2 suv = vec2(0.5 + 0.5 * rho * sin(lon) / uRhoMax, 0.5 + 0.5 * rho * cos(lon) / uRhoMax);
      vec3 ns = normalize(texture(uSouth, suv).rgb * 2.0 - 1.0);
      float w = smoothstep(${CAP_LAT.toFixed(1)} + 0.6, ${CAP_LAT.toFixed(1)} + 0.05, latDeg);
      n = normalize(mix(n, ns, w));
    }
    n = normalize(mix(p, n, uRelief));

    vec3 v = normalize(uCam - p);
    float mu0 = dot(n, uSunDir);
    float mu = max(dot(n, v), 0.0);
    // Lunar-Lambert: the Moon looks flat-bright at full phase (Lommel–Seeliger) with Lambert falloff mixed in.
    float ls = mu0 > 0.0 ? 2.0 * mu0 / (mu0 + mu + 1e-3) : 0.0;
    float lam = max(mu0, 0.0);
    float shade = mix(lam, ls, 0.55);
    // Terminator: geometric day/night with a soft edge so relief near it reads as long shadows.
    float geo = dot(p, uSunDir);
    shade *= smoothstep(-0.015, 0.035, geo);

    vec3 col = albedo * (shade * uSun + uAmbient);

    // Selection glow ring around a highlighted site.
    if (uHighlightR > 0.0) {
      float d = acos(clamp(dot(p, uHighlight), -1.0, 1.0));
      float ring = smoothstep(uHighlightR * 1.35, uHighlightR, d) * smoothstep(uHighlightR * 0.55, uHighlightR * 0.9, d);
      col += vec3(0.98, 0.45, 0.09) * ring * 0.55;
    }

    col *= uExposure;
    col = col / (1.0 + col * 0.18);
    gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
  }
`;

interface CamPose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  fov: number;
}

export interface MoonSceneOptions {
  colorUrl: string;
  normalUrl: string;
  southNormalUrl?: string;
  onReady?: () => void;
  onError?: (e: unknown) => void;
}

export class MoonScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.001, 50);
  private material: THREE.ShaderMaterial;
  private moon: THREE.Mesh;
  private routeGroup = new THREE.Group();
  private beacon: THREE.Group;
  private roverDot: THREE.Mesh;
  private raf = 0;
  private last = performance.now();
  private width = 1;
  private height = 1;
  private frameListeners = new Set<() => void>();
  private disposed = false;

  // desired vs current camera pose (eased)
  private mode: SceneMode = "home";
  private cur: CamPose;
  private want: CamPose;
  private homeSpin = 0;
  private focus = latLonToVec(-84, 20);
  private routeFrom: THREE.Vector3 | null = null;
  private routeTo: THREE.Vector3 | null = null;
  private progress = 0;
  private shownProgress = 0;
  private heading = new THREE.Vector3(0, 0, 1);
  private sun: SunState = { elevation01: 0.5, dayProgress: 0.3, isDay: true, sunlight: 0.55 };
  private idleOrbit = 0;
  private reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  constructor(canvas: HTMLCanvasElement, opts: MoonSceneOptions) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    const loader = new THREE.TextureLoader();
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const load = (url: string) =>
      new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(
          url,
          (t) => {
            t.colorSpace = THREE.NoColorSpace;
            t.anisotropy = Math.min(8, maxAniso);
            t.minFilter = THREE.LinearMipmapLinearFilter;
            t.generateMipmaps = true;
            resolve(t);
          },
          undefined,
          reject,
        );
      });

    const blank = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    blank.needsUpdate = true;
    const rhoMax = 2 * R_REF * Math.tan(Math.PI / 4 + (CAP_LAT * DEG) / 2);
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uColor: { value: blank },
        uNormal: { value: blank },
        uSouth: { value: blank },
        uHasSouth: { value: 0 },
        uRhoMax: { value: rhoMax },
        uSunDir: { value: new THREE.Vector3(0.3, 0.2, 1).normalize() },
        uSun: { value: 1.25 },
        uAmbient: { value: new THREE.Vector3(0.012, 0.014, 0.02) },
        uCam: { value: new THREE.Vector3(0, 0, 3) },
        uRelief: { value: 0.75 },
        uExposure: { value: 1.25 },
        uHighlight: { value: new THREE.Vector3(0, 0, 1) },
        uHighlightR: { value: 0 },
      },
    });

    const geo = new THREE.SphereGeometry(1, 256, 192);
    this.moon = new THREE.Mesh(geo, this.material);
    this.scene.add(this.moon);
    this.scene.add(this.routeGroup);

    this.beacon = this.makeBeacon();
    this.beacon.visible = false;
    this.scene.add(this.beacon);

    this.roverDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf97316 }),
    );
    this.roverDot.visible = false;
    this.scene.add(this.roverDot);

    const home = this.homePose(0);
    this.cur = clonePose(home);
    this.want = clonePose(home);

    Promise.all([
      load(opts.colorUrl),
      load(opts.normalUrl),
      opts.southNormalUrl ? load(opts.southNormalUrl).catch(() => null) : Promise.resolve(null),
    ])
      .then(([color, normal, south]) => {
        if (this.disposed) return;
        this.material.uniforms.uColor.value = color;
        this.material.uniforms.uNormal.value = normal;
        if (south) {
          south.generateMipmaps = true;
          this.material.uniforms.uSouth.value = south;
          this.material.uniforms.uHasSouth.value = 1;
        }
        opts.onReady?.();
      })
      .catch((e) => opts.onError?.(e));

    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- public API

  setSize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  setMode(mode: SceneMode) {
    this.mode = mode;
  }

  /** Turn a site toward the viewer (select mode) and ring it. */
  setFocus(site: LatLon | null) {
    if (!site) {
      this.material.uniforms.uHighlightR.value = 0;
      return;
    }
    this.focus = latLonToVec(site.lat, site.lon);
    this.material.uniforms.uHighlight.value.copy(this.focus);
    this.material.uniforms.uHighlightR.value = 0.022;
  }

  /** Great-circle route the rover drives (null clears it). */
  setRoute(from: LatLon | null, to: LatLon | null) {
    for (const child of [...this.routeGroup.children]) {
      this.routeGroup.remove(child);
      disposeObject(child);
    }
    if (!from || !to) {
      this.routeFrom = this.routeTo = null;
      this.beacon.visible = false;
      return;
    }
    const a = latLonToVec(from.lat, from.lon);
    const b = latLonToVec(to.lat, to.lon);
    this.routeFrom = a;
    this.routeTo = b;
    this.heading = headingTo(a, b);
    const pts: THREE.Vector3[] = [];
    const steps = 160;
    for (let i = 0; i <= steps; i++) pts.push(slerpDir(a, b, i / steps).multiplyScalar(1.0012));
    const curve = new THREE.CatmullRomCurve3(pts);
    const angle = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
    const radius = Math.max(0.0007, Math.min(0.0035, angle * 0.01));
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 240, radius, 8, false),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    tube.renderOrder = 2;
    this.routeGroup.add(tube);
    this.beacon.position.copy(b);
    this.beacon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b);
    this.beacon.visible = true;
  }

  /** Where the rover is along the route, 0..1 (eased on screen). */
  setProgress(p: number, snap = false) {
    this.progress = Math.max(0, Math.min(1, p));
    if (snap) this.shownProgress = this.progress;
  }

  /** Park the rover at a site (no route). */
  parkAt(site: LatLon, headingToward?: LatLon) {
    const p = latLonToVec(site.lat, site.lon);
    this.routeFrom = p;
    this.routeTo = null;
    this.progress = this.shownProgress = 0;
    if (headingToward) this.heading = headingTo(p, latLonToVec(headingToward.lat, headingToward.lon));
  }

  setSun(s: SunState) {
    this.sun = s;
  }

  /** Screen position (CSS px) of a lat/lon on the surface; visible=false when on the far side or off-screen. */
  project(lat: number, lon: number, altitude = 0.003): Projected {
    const v = latLonToVec(lat, lon, 1 + altitude);
    return this.projectVec(v);
  }

  /** Where the rover is on screen right now. */
  roverScreen(): Projected {
    return this.projectVec(this.roverPos().multiplyScalar(1.0));
  }

  onFrame(fn: () => void): () => void {
    this.frameListeners.add(fn);
    return () => {
      this.frameListeners.delete(fn);
    };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => disposeObject(o));
    for (const u of ["uColor", "uNormal", "uSouth"]) (this.material.uniforms[u].value as THREE.Texture)?.dispose?.();
    this.material.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- internals

  private makeBeacon() {
    const g = new THREE.Group();
    const h = 0.05;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0012, 0.0035, h, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = h / 2;
    g.add(beam);
    const ringGeo = new THREE.RingGeometry(0.006, 0.0085, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.y = 0.0008;
    g.add(ring);
    return g;
  }

  private roverPos() {
    if (this.routeFrom && this.routeTo) return slerpDir(this.routeFrom, this.routeTo, this.shownProgress);
    if (this.routeFrom) return this.routeFrom.clone();
    return this.focus.clone();
  }

  private projectVec(v: THREE.Vector3): Projected {
    const camPos = this.camera.position;
    const normal = v.clone().normalize();
    const facing = normal.dot(camPos.clone().sub(v).normalize()) > 0.02;
    const ndc = v.clone().project(this.camera);
    const x = (ndc.x * 0.5 + 0.5) * this.width;
    const y = (-ndc.y * 0.5 + 0.5) * this.height;
    const onScreen = ndc.z < 1 && x > -40 && x < this.width + 40 && y > -40 && y < this.height + 40;
    return { x, y, visible: facing && onScreen };
  }

  private homePose(spin: number): CamPose {
    // Near side with the south pole tipped toward us a little; Moon on the right (Canva slide 1).
    const dist = 3.35;
    const lon = 10 + spin;
    const dir = latLonToVec(-14, lon);
    const pos = dir.clone().multiplyScalar(dist);
    // camera looks along -dir; screen-right = forward × up. Aim left of the Moon so it sits on the right.
    const right = new THREE.Vector3().crossVectors(dir.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
    const narrow = this.width / this.height < 0.9;
    const target = narrow ? new THREE.Vector3(0, -0.55, 0) : right.clone().multiplyScalar(-0.95).add(new THREE.Vector3(0, -0.05, 0));
    return { pos, target, up: new THREE.Vector3(0, 1, 0), fov: 36 };
  }

  private selectPose(): CamPose {
    // Site toward the viewer, Moon on the left so the callout card fits on the right (Canva slide 2).
    const f = this.focus.clone().normalize();
    const { north } = enuAt(f);
    const dir = f.clone().add(north.clone().multiplyScalar(-0.35)).normalize();
    const pos = dir.clone().multiplyScalar(2.55);
    const up = north.clone();
    const right = new THREE.Vector3().crossVectors(dir.clone().negate(), up).normalize();
    const narrow = this.width / this.height < 0.9;
    const target = narrow ? up.clone().multiplyScalar(-0.45) : right.clone().multiplyScalar(0.62);
    return { pos, target, up, fov: 36 };
  }

  private surfacePose(): CamPose {
    // High above the south-polar terrain looking at a curved horizon (Canva slide 3).
    const p = latLonToVec(-86, 25);
    const { north, up } = enuAt(p);
    const pos = p.clone().multiplyScalar(1.16).add(north.clone().multiplyScalar(-0.2));
    const target = p.clone().add(north.clone().multiplyScalar(0.42)).add(up.clone().multiplyScalar(-0.06));
    return { pos, target, up, fov: 40 };
  }

  private drivePose(): CamPose {
    const p = this.roverPos();
    const up = p.clone().normalize();
    let h = this.heading.clone();
    if (this.routeTo) h = headingTo(up, this.routeTo);
    if (!this.routeTo) {
      // parked: slow orbit around the rover
      const q = new THREE.Quaternion().setFromAxisAngle(up, this.idleOrbit);
      h.applyQuaternion(q);
    }
    h.sub(up.clone().multiplyScalar(h.dot(up))).normalize();
    const pos = up.clone().multiplyScalar(1 + 0.052).add(h.clone().multiplyScalar(-0.085));
    const target = up.clone().multiplyScalar(0.995).add(h.clone().multiplyScalar(0.16));
    return { pos, target, up, fov: 42 };
  }

  private sunDirection(): THREE.Vector3 {
    if (this.mode !== "drive") {
      // Front-lit from upper left of the viewer: a bright, nearly full Moon.
      const cam = this.camera.position.clone().normalize();
      const camUp = this.camera.up.clone();
      const camRight = new THREE.Vector3().crossVectors(cam, camUp).normalize();
      return cam.multiplyScalar(1).add(camRight.multiplyScalar(0.55)).add(camUp.multiplyScalar(0.35)).normalize();
    }
    // Drive: the engine's Sun. Visual elevation = engine elevation × the highest the Sun gets at this latitude.
    const p = this.roverPos();
    const { east, north, up } = enuAt(p);
    const lat = Math.asin(Math.max(-1, Math.min(1, p.y))) / DEG;
    const maxElev = Math.max(1.5, 90 - Math.abs(lat) + 1.5);
    const elev = this.sun.isDay ? Math.max(0.6, this.sun.elevation01 * maxElev) : -4;
    const az = (60 + this.sun.dayProgress * 240) * DEG;
    const e = elev * DEG;
    return east.multiplyScalar(Math.cos(e) * Math.sin(az))
      .add(north.multiplyScalar(Math.cos(e) * Math.cos(az)))
      .add(up.multiplyScalar(Math.sin(e)))
      .normalize();
  }

  private loop(now: number) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    if (!this.reducedMotion) {
      this.homeSpin += dt * 2.2;
      this.idleOrbit += dt * 0.05;
    }
    // ease rover progress (engine updates arrive a few times a second)
    this.shownProgress += (this.progress - this.shownProgress) * (1 - Math.exp(-dt * 6));
    if (Math.abs(this.progress - this.shownProgress) < 1e-5) this.shownProgress = this.progress;

    this.want =
      this.mode === "home" ? this.homePose(this.homeSpin)
      : this.mode === "select" ? this.selectPose()
      : this.mode === "surface" ? this.surfacePose()
      : this.drivePose();

    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * (this.mode === "drive" ? 3.2 : 2.4));
    // Fly along the sphere rather than through it: lerp then push the camera back out to a safe radius.
    this.cur.pos.lerp(this.want.pos, k);
    const minR = this.mode === "drive" || this.mode === "surface" ? 1.03 : 1.6;
    if (this.cur.pos.length() < minR) this.cur.pos.setLength(minR);
    this.cur.target.lerp(this.want.target, k);
    this.cur.up.lerp(this.want.up, k).normalize();
    this.cur.fov += (this.want.fov - this.cur.fov) * k;

    this.camera.position.copy(this.cur.pos);
    this.camera.up.copy(this.cur.up);
    this.camera.lookAt(this.cur.target);
    if (Math.abs(this.camera.fov - this.cur.fov) > 1e-3) {
      this.camera.fov = this.cur.fov;
      this.camera.updateProjectionMatrix();
    }

    // lighting
    const u = this.material.uniforms;
    u.uCam.value.copy(this.camera.position);
    const sunDir = this.sunDirection();
    u.uSunDir.value.lerp(sunDir, this.mode === "drive" ? 1 - Math.exp(-dt * 4) : 1).normalize();
    const night = this.mode === "drive" && !this.sun.isDay;
    const shadowed = this.mode === "drive" && this.sun.sunlight < 0.05;
    const targetSun = night ? 0 : shadowed ? 0.18 : this.mode === "drive" ? 1.35 : 1.2;
    u.uSun.value += (targetSun - u.uSun.value) * (1 - Math.exp(-dt * 3));
    const amb = night || shadowed ? [0.035, 0.042, 0.06] : [0.012, 0.014, 0.02];
    (u.uAmbient.value as THREE.Vector3).lerp(new THREE.Vector3(amb[0], amb[1], amb[2]), 1 - Math.exp(-dt * 3));
    u.uRelief.value = this.mode === "drive" || this.mode === "surface" ? 0.62 : 0.85;
    u.uExposure.value = this.mode === "drive" ? 1.35 : 1.25;

    // rover dot (visible from orbit) and beacon pulse
    const rp = this.roverPos();
    this.roverDot.position.copy(rp.clone().multiplyScalar(1.002));
    this.roverDot.visible = this.mode === "select" && !!this.routeFrom;
    const pulse = 0.75 + 0.25 * Math.sin(now / 320);
    for (const c of this.beacon.children) {
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (m) m.opacity = (c === this.beacon.children[0] ? 0.5 : 0.85) * pulse;
    }

    this.renderer.render(this.scene, this.camera);
    for (const fn of this.frameListeners) fn();
  }
}

function clonePose(p: CamPose): CamPose {
  return { pos: p.pos.clone(), target: p.target.clone(), up: p.up.clone(), fov: p.fov };
}

function disposeObject(o: THREE.Object3D) {
  const m = o as THREE.Mesh;
  m.geometry?.dispose?.();
  const mat = m.material as THREE.Material | THREE.Material[] | undefined;
  if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
  else mat?.dispose?.();
}
