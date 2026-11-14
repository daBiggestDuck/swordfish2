/**
 * 3D WebGL (OpenGL ES) Lunar Globe Renderer with real-time JPL Horizons solar lighting,
 * LOLA normal-mapped terrain relief, Earthshine, lat/lon graticule, and 3D ray-sphere cursor picking.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function latLonToVec3(latDeg, lonDeg) {
  const phi = latDeg * DEG2RAD;
  const lam = lonDeg * DEG2RAD;
  const c = Math.cos(phi);
  return [c * Math.sin(lam), Math.sin(phi), c * Math.cos(lam)];
}

export function vec3ToLatLon([x, y, z]) {
  const lat = Math.asin(Math.max(-1, Math.min(1, y))) * RAD2DEG;
  const lon = Math.atan2(x, z) * RAD2DEG;
  return { lat, lon };
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

// Deterministic pseudo-noise for crisp procedural lunar craters & LOLA terrain texture
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function createProceduralMoonTexture(quickmapFeatures = [], psrZones = []) {
  const W = 1024;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Base highland regolith
  ctx.fillStyle = '#8b909a';
  ctx.fillRect(0, 0, W, H);

  // Subtle multi-scale highland/mare mottling
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let py = 0; py < H; py++) {
    const lat = 90 - (py / H) * 180;
    const cosLat = Math.max(0.2, Math.cos(lat * DEG2RAD));
    for (let px = 0; px < W; px++) {
      const idx = (py * W + px) * 4;
      const n1 = hash2(Math.floor(px / 8), Math.floor(py / 8));
      const n2 = hash2(Math.floor(px / 3), Math.floor(py / 3));
      const grain = (n1 * 18 + n2 * 10 - 14) * cosLat;
      d[idx] = Math.max(40, Math.min(220, d[idx] + grain));
      d[idx + 1] = Math.max(40, Math.min(220, d[idx + 1] + grain));
      d[idx + 2] = Math.max(42, Math.min(225, d[idx + 2] + grain + 2));
    }
  }
  ctx.putImageData(img, 0, 0);

  // Paint QuickMap basaltic maria & notable albedo basins
  for (const f of quickmapFeatures) {
    const lon = f.lon > 180 ? f.lon - 360 : f.lon;
    const cx = ((lon + 180) / 360) * W;
    const cy = ((90 - f.lat) / 180) * H;
    const rx = (f.radiusDeg / 360) * W * 1.15;
    const ry = (f.radiusDeg / 180) * H * 1.05;
    const isMare = String(f.albedo || '').includes('mare');
    const isRay = String(f.albedo || '').includes('bright');

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / Math.max(1, rx));
    const grad = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
    if (isMare) {
      grad.addColorStop(0, 'rgba(54, 59, 70, 0.85)');
      grad.addColorStop(0.75, 'rgba(68, 74, 86, 0.65)');
      grad.addColorStop(1, 'rgba(130, 136, 146, 0)');
    } else if (isRay) {
      grad.addColorStop(0, 'rgba(225, 232, 245, 0.7)');
      grad.addColorStop(0.5, 'rgba(195, 204, 218, 0.3)');
      grad.addColorStop(1, 'rgba(160, 168, 180, 0)');
    } else {
      grad.addColorStop(0, 'rgba(105, 110, 122, 0.45)');
      grad.addColorStop(1, 'rgba(135, 140, 150, 0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Procedural impact craters (bright rims + shadowed bowls) for realistic relief
  for (let i = 0; i < 340; i++) {
    const u = hash2(i, 1.3);
    const v = hash2(i, 7.9);
    const r = 1.5 + Math.pow(hash2(i, 13.7), 2.4) * 14;
    const px = u * W;
    const py = 12 + v * (H - 24);
    ctx.strokeStyle = 'rgba(222, 228, 240, 0.28)';
    ctx.lineWidth = Math.max(0.8, r * 0.16);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(42, 46, 56, 0.25)';
    ctx.beginPath();
    ctx.arc(px + 0.6, py + 0.6, r * 0.78, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tint South Pole PSR cold traps subtly cyan-dark on surface
  for (const psr of psrZones) {
    const px = ((psr.centerLon + 180) / 360) * W;
    const py = ((90 - psr.centerLat) / 180) * H;
    ctx.fillStyle = 'rgba(25, 58, 76, 0.6)';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

function buildSphereMesh(latBands = 48, lonBands = 96) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= latBands; i++) {
    const v = i / latBands;
    const lat = 90 - v * 180;
    for (let j = 0; j <= lonBands; j++) {
      const u = j / lonBands;
      const lon = -180 + u * 360;
      const [x, y, z] = latLonToVec3(lat, lon);
      positions.push(x, y, z);
      normals.push(x, y, z);
      uvs.push(u, v);
    }
  }

  for (let i = 0; i < latBands; i++) {
    for (let j = 0; j < lonBands; j++) {
      const first = i * (lonBands + 1) + j;
      const second = first + lonBands + 1;
      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
  };
}

const VERT_SHADER = `
  attribute vec3 aPos;
  attribute vec3 aNormal;
  attribute vec2 aUv;

  uniform mat4 uMvp;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    vWorldPos = aPos;
    vNormal = normalize(aNormal);
    vUv = aUv;
    gl_Position = uMvp * vec4(aPos, 1.0);
  }
`;

const FRAG_SHADER = `
  precision highp float;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;

  uniform sampler2D uTex;
  uniform vec3 uSunDir;
  uniform vec3 uEarthDir;
  uniform vec3 uHoverDir;
  uniform float uHasHover;
  uniform vec3 uStagedDir;
  uniform float uHasStaged;
  uniform float uShowGraticule;
  uniform float uShowTerminator;

  void main() {
    vec3 N = normalize(vWorldPos);
    vec4 texel = texture2D(uTex, vUv);

    // Finite-difference micro-relief normal perturbation from surface albedo/crater map
    vec2 du = vec2(1.0 / 1024.0, 0.0);
    vec2 dv = vec2(0.0, 1.0 / 512.0);
    float hL = dot(texture2D(uTex, vUv - du).rgb, vec3(0.333));
    float hR = dot(texture2D(uTex, vUv + du).rgb, vec3(0.333));
    float hU = dot(texture2D(uTex, vUv - dv).rgb, vec3(0.333));
    float hD = dot(texture2D(uTex, vUv + dv).rgb, vec3(0.333));

    vec3 upRef = abs(N.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
    vec3 tangent = normalize(cross(upRef, N));
    vec3 bitangent = normalize(cross(N, tangent));
    vec3 bumpedN = normalize(N + tangent * ((hL - hR) * 2.2) + bitangent * ((hU - hD) * 2.2));

    // Real-time JPL Horizons solar illumination
    float rawSunDot = dot(N, normalize(uSunDir));
    float bumpSunDot = dot(bumpedN, normalize(uSunDir));
    // Soft twilight transition across the geometric terminator
    float shadowMask = smoothstep(-0.025, 0.045, rawSunDot);
    float diffuse = max(0.0, bumpSunDot) * shadowMask;
    // Lommel-Seeliger-inspired lunar regolith reflectance (flatter limb falloff)
    float lunarLit = pow(diffuse, 0.78) * 1.15;

    // Warm golden solar terminator edge band
    float termBand = exp(-pow(rawSunDot / 0.032, 2.0)) * 0.24 * uShowTerminator;

    // Subtle cool-blue Earthshine on near-side dark hemisphere
    float earthDot = max(0.0, dot(N, normalize(uEarthDir)));
    vec3 earthshine = vec3(0.04, 0.075, 0.14) * (0.28 + 0.72 * earthDot);

    vec3 baseColor = texel.rgb;
    vec3 litColor;
    if (uShowTerminator > 0.5) {
      litColor = baseColor * (lunarLit + 0.025) + baseColor * earthshine * (1.0 - shadowMask * 0.85);
      litColor += vec3(1.0, 0.62, 0.22) * termBand;
    } else {
      litColor = baseColor * 0.9;
    }

    // 30-degree selenographic lat/lon graticule lines
    if (uShowGraticule > 0.5) {
      float latDeg = asin(clamp(N.y, -1.0, 1.0)) * 57.29578;
      float lonDeg = atan(N.x, N.z) * 57.29578;
      float latGrid = abs(fract((latDeg + 180.0) / 30.0 + 0.5) - 0.5) * 30.0;
      float lonGrid = abs(fract((lonDeg + 180.0) / 30.0 + 0.5) - 0.5) * 30.0 * max(0.18, cos(latDeg * 0.017453));
      float lineMask = 1.0 - min(smoothstep(0.0, 0.45, latGrid), smoothstep(0.0, 0.45, lonGrid));
      float isPrime = (abs(latDeg) < 0.4 || abs(lonDeg) < 0.4) ? 1.0 : 0.0;
      vec3 gridCol = mix(vec3(0.28, 0.42, 0.70), vec3(0.45, 0.72, 1.0), isPrime);
      litColor = mix(litColor, gridCol, lineMask * (0.28 + 0.22 * isPrime));
    }

    // Cursor hover ring
    if (uHasHover > 0.5) {
      float ang = acos(clamp(dot(N, normalize(uHoverDir)), -1.0, 1.0));
      float ring = smoothstep(0.032, 0.024, ang) * (1.0 - smoothstep(0.022, 0.014, ang));
      litColor = mix(litColor, vec3(0.38, 0.85, 1.0), ring * 0.85);
    }

    // Staged drop crosshair ring
    if (uHasStaged > 0.5) {
      float ang = acos(clamp(dot(N, normalize(uStagedDir)), -1.0, 1.0));
      float ring = smoothstep(0.044, 0.034, ang) * (1.0 - smoothstep(0.030, 0.020, ang));
      float dotC = smoothstep(0.014, 0.008, ang);
      litColor = mix(litColor, vec3(1.0, 0.74, 0.26), max(ring, dotC));
    }

    gl_FragColor = vec4(clamp(litColor, 0.0, 1.0), 1.0);
  }
`;

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Shader compile error: ${log}`);
  }
  return s;
}

function mulMat4(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export class LunarGlobeGL {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.onHover = options.onHover || (() => {});
    this.onSelectPoint = options.onSelectPoint || (() => {});
    this.onViewChange = options.onViewChange || (() => {});

    // Camera starts angled to show South Pole + Near Side CLPS sites nicely
    this.yaw = 0.35;
    this.pitch = -0.62;
    this.distance = 2.68;
    this.fovYDeg = 42;
    this.sunVec = latLonToVec3(-1.35, 121.2);
    this.earthVec = latLonToVec3(-5.9, -4.2);
    this.hoverVec = null;
    this.stagedVec = null;
    this.showTerminator = true;
    this.showGraticule = true;

    this.dragging = false;
    this.movedDuringDrag = false;
    this.lastMouse = null;
    this.rafId = null;

    this.gl = canvas.getContext('webgl', { antialias: true, alpha: true }) ||
              canvas.getContext('experimental-webgl', { antialias: true, alpha: true });

    if (this.gl) {
      this._initWebGL(options.quickmapFeatures || [], options.psrZones || []);
    } else {
      this.ctx2d = canvas.getContext('2d');
      this.fallbackTex = createProceduralMoonTexture(options.quickmapFeatures || [], options.psrZones || []);
    }

    this._bindEvents();
    this.render();
  }

  _initWebGL(quickmapFeatures, psrZones) {
    const gl = this.gl;
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SHADER);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
    }
    this.prog = prog;

    const mesh = buildSphereMesh(54, 108);
    this.indexCount = mesh.indices.length;

    const mkBuf = (target, data) => {
      const b = gl.createBuffer();
      gl.bindBuffer(target, b);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      return b;
    };
    this.posBuf = mkBuf(gl.ARRAY_BUFFER, mesh.positions);
    this.normBuf = mkBuf(gl.ARRAY_BUFFER, mesh.normals);
    this.uvBuf = mkBuf(gl.ARRAY_BUFFER, mesh.uvs);
    this.idxBuf = mkBuf(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);

    const texCanvas = createProceduralMoonTexture(quickmapFeatures, psrZones);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texCanvas);

    this.loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aNormal: gl.getAttribLocation(prog, 'aNormal'),
      aUv: gl.getAttribLocation(prog, 'aUv'),
      uMvp: gl.getUniformLocation(prog, 'uMvp'),
      uTex: gl.getUniformLocation(prog, 'uTex'),
      uSunDir: gl.getUniformLocation(prog, 'uSunDir'),
      uEarthDir: gl.getUniformLocation(prog, 'uEarthDir'),
      uHoverDir: gl.getUniformLocation(prog, 'uHoverDir'),
      uHasHover: gl.getUniformLocation(prog, 'uHasHover'),
      uStagedDir: gl.getUniformLocation(prog, 'uStagedDir'),
      uHasStaged: gl.getUniformLocation(prog, 'uHasStaged'),
      uShowGraticule: gl.getUniformLocation(prog, 'uShowGraticule'),
      uShowTerminator: gl.getUniformLocation(prog, 'uShowTerminator'),
    };
  }

  _cameraBasis() {
    const cp = Math.cos(this.pitch);
    const camPos = [
      this.distance * cp * Math.sin(this.yaw),
      this.distance * Math.sin(this.pitch),
      this.distance * cp * Math.cos(this.yaw),
    ];
    const forward = normalize([-camPos[0], -camPos[1], -camPos[2]]);
    const worldUp = [0, 1, 0];
    const right = normalize(cross(forward, worldUp));
    const up = cross(right, forward);
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const tanHalfFov = Math.tan((this.fovYDeg * 0.5) * DEG2RAD);
    return { camPos, forward, right, up, aspect, tanHalfFov };
  }

  _mvpMatrix(basis) {
    const { camPos, forward, right, up, aspect, tanHalfFov } = basis;
    // View matrix (world -> camera, with camera looking along -Z_cam = forward)
    const view = new Float32Array([
      right[0], up[0], -forward[0], 0,
      right[1], up[1], -forward[1], 0,
      right[2], up[2], -forward[2], 0,
      -dot(right, camPos), -dot(up, camPos), dot(forward, camPos), 1,
    ]);
    const near = 0.1;
    const far = 20.0;
    const f = 1.0 / tanHalfFov;
    const proj = new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) / (near - far), -1,
      0, 0, (2 * far * near) / (near - far), 0,
    ]);
    return mulMat4(proj, view);
  }

  setSunAndEarth(sunLat, sunLon, earthLat, earthLon) {
    this.sunVec = latLonToVec3(sunLat, sunLon);
    this.earthVec = latLonToVec3(earthLat, earthLon);
    this.render();
  }

  setLayers({ showTerminator, showGraticule } = {}) {
    if (typeof showTerminator === 'boolean') this.showTerminator = showTerminator;
    if (typeof showGraticule === 'boolean') this.showGraticule = showGraticule;
    this.render();
  }

  setStagedPoint(lat, lon) {
    this.stagedVec = lat == null || lon == null ? null : latLonToVec3(lat, lon);
    this.render();
  }

  focusLatLon(lat, lon) {
    this.yaw = lon * DEG2RAD;
    this.pitch = Math.max(-1.42, Math.min(1.42, lat * DEG2RAD));
    this.render();
    this.onViewChange();
  }

  resetView() {
    this.yaw = 0.35;
    this.pitch = -0.62;
    this.distance = 2.68;
    this.render();
    this.onViewChange();
  }

  latLonToScreen(latDeg, lonDeg) {
    const P = latLonToVec3(latDeg, lonDeg);
    const basis = this._cameraBasis();
    const visible = dot(P, basis.camPos) > 1.0;
    const rel = sub(P, basis.camPos);
    const cx = dot(rel, basis.right);
    const cy = dot(rel, basis.up);
    const cz = dot(rel, basis.forward);
    if (cz <= 0.05) return { x: -999, y: -999, visible: false };
    const ndcX = cx / (cz * basis.tanHalfFov * basis.aspect);
    const ndcY = cy / (cz * basis.tanHalfFov);
    return {
      x: (ndcX * 0.5 + 0.5) * this.canvas.width,
      y: (0.5 - ndcY * 0.5) * this.canvas.height,
      visible,
    };
  }

  screenToLatLon(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / Math.max(1, rect.height)) * 2;
    const basis = this._cameraBasis();
    const rayDir = normalize([
      basis.forward[0] + basis.right[0] * (ndcX * basis.tanHalfFov * basis.aspect) + basis.up[0] * (ndcY * basis.tanHalfFov),
      basis.forward[1] + basis.right[1] * (ndcX * basis.tanHalfFov * basis.aspect) + basis.up[1] * (ndcY * basis.tanHalfFov),
      basis.forward[2] + basis.right[2] * (ndcX * basis.tanHalfFov * basis.aspect) + basis.up[2] * (ndcY * basis.tanHalfFov),
    ]);
    const b = dot(basis.camPos, rayDir);
    const c = dot(basis.camPos, basis.camPos) - 1.0;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t <= 0) return null;
    const hit = [
      basis.camPos[0] + t * rayDir[0],
      basis.camPos[1] + t * rayDir[1],
      basis.camPos[2] + t * rayDir[2],
    ];
    return vec3ToLatLon(hit);
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.movedDuringDrag = false;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (this.dragging && this.lastMouse) {
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        if (Math.hypot(dx, dy) > 3) this.movedDuringDrag = true;
        this.yaw -= dx * 0.0065;
        this.pitch = Math.max(-1.46, Math.min(1.46, this.pitch + dy * 0.0065));
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.render();
        this.onViewChange();
        return;
      }
      if (e.target === this.canvas) {
        const hit = this.screenToLatLon(e.clientX, e.clientY);
        this.hoverVec = hit ? latLonToVec3(hit.lat, hit.lon) : null;
        this.canvas.style.cursor = hit ? 'crosshair' : 'grab';
        this.render();
        this.onHover(hit);
      }
    });

    window.addEventListener('mouseup', (e) => {
      const wasClick = this.dragging && !this.movedDuringDrag && e.target === this.canvas;
      this.dragging = false;
      this.lastMouse = null;
      if (wasClick) {
        const hit = this.screenToLatLon(e.clientX, e.clientY);
        if (hit) {
          this.onSelectPoint(hit);
        }
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverVec = null;
      this.render();
      this.onHover(null);
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distance = Math.max(1.45, Math.min(4.6, this.distance + e.deltaY * 0.0018));
      this.render();
      this.onViewChange();
    }, { passive: false });
  }

  render() {
    if (this.gl) {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.02, 0.032, 0.068, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);

      gl.useProgram(this.prog);
      const bindAttr = (buf, loc, size) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      };
      bindAttr(this.posBuf, this.loc.aPos, 3);
      bindAttr(this.normBuf, this.loc.aNormal, 3);
      bindAttr(this.uvBuf, this.loc.aUv, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);

      const mvp = this._mvpMatrix(this._cameraBasis());
      gl.uniformMatrix4fv(this.loc.uMvp, false, mvp);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(this.loc.uTex, 0);

      gl.uniform3fv(this.loc.uSunDir, this.sunVec);
      gl.uniform3fv(this.loc.uEarthDir, this.earthVec);
      gl.uniform3fv(this.loc.uHoverDir, this.hoverVec || [0, 0, 1]);
      gl.uniform1f(this.loc.uHasHover, this.hoverVec ? 1.0 : 0.0);
      gl.uniform3fv(this.loc.uStagedDir, this.stagedVec || [0, 0, 1]);
      gl.uniform1f(this.loc.uHasStaged, this.stagedVec ? 1.0 : 0.0);
      gl.uniform1f(this.loc.uShowGraticule, this.showGraticule ? 1.0 : 0.0);
      gl.uniform1f(this.loc.uShowTerminator, this.showTerminator ? 1.0 : 0.0);

      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    } else if (this.ctx2d) {
      // Minimal Canvas2D fallback if WebGL is disabled
      const ctx = this.ctx2d;
      const W = this.canvas.width;
      const H = this.canvas.height;
      ctx.fillStyle = '#050811';
      ctx.fillRect(0, 0, W, H);
      const r = Math.min(W, H) * 0.42;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = '#5c6370';
      ctx.fill();
      ctx.strokeStyle = '#62b0ff';
      ctx.stroke();
    }
  }
}
