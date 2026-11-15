/**
 * 3D WebGL (OpenGL ES) Lunar Globe Renderer with:
 *  - Real NASA Moon Trek / LROC WAC & LOLA selenographic topography + crater/basin catalog
 *  - Radial LOLA elevation vertex displacement on high-density sphere mesh
 *  - Steep Parallax Occlusion Mapping (POM) + horizon ray-marched crater self-shadowing
 *  - Hapke / Lommel-Seeliger lunar regolith reflectance + Earthshine + opposition surge
 *  - Interactive mouse/cursor 3D parallax + multi-layer deep-space starfield, phase-lit Earth & Solar corona
 *  - Real-time JPL Horizons solar vector & ray-sphere cursor drop picking
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const TEX_W = 2048;
const TEX_H = 1024;

export function latLonToVec3(latDeg, lonDeg) {
  const phi = latDeg * DEG2RAD;
  const lam = lonDeg * DEG2RAD;
  const c = Math.cos(phi);
  return [c * Math.sin(lam), Math.sin(phi), c * Math.cos(lam)];
}

export function vec3ToLatLon([x, y, z]) {
  const r = Math.hypot(x, y, z) || 1;
  const lat = Math.asin(Math.max(-1, Math.min(1, y / r))) * RAD2DEG;
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

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbmNoise(x, y) {
  return (
    smoothNoise(x, y) * 0.55 +
    smoothNoise(x * 2.03 + 7.1, y * 2.03 - 3.4) * 0.28 +
    smoothNoise(x * 4.07 - 2.3, y * 4.07 + 5.9) * 0.17
  );
}

function wrapLon(lon) {
  let l = lon % 360;
  if (l > 180) l -= 360;
  if (l < -180) l += 360;
  return l;
}

/**
 * Draw an ellipse or circle across the +-180 deg selenographic seam with spherical cos(lat) scaling.
 */
function stampWrapped(ctx, lonDeg, latDeg, drawFn) {
  const lon = wrapLon(lonDeg);
  const cx = ((lon + 180) / 360) * TEX_W;
  const cy = ((90 - latDeg) / 180) * TEX_H;
  const cosLat = Math.max(0.16, Math.cos(latDeg * DEG2RAD));
  for (const offset of [-TEX_W, 0, TEX_W]) {
    const x = cx + offset;
    if (x < -TEX_W * 0.45 || x > TEX_W * 1.45) continue;
    ctx.save();
    ctx.translate(x, cy);
    ctx.scale(1 / cosLat, 1);
    drawFn(ctx);
    ctx.restore();
  }
}

/**
 * Compute height canvas (R=elev, G=Sobel dU, B=Sobel dV, A=roughness) from scalar grayscale elevation data.
 */
function buildNormalSlopeCanvas(elevCanvas, mareMaskData) {
  const w = elevCanvas.width;
  const h = elevCanvas.height;
  const eCtx = elevCanvas.getContext('2d');
  const src = eCtx.getImageData(0, 0, w, h).data;

  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = w;
  heightCanvas.height = h;
  const hCtx = heightCanvas.getContext('2d');
  const outImg = hCtx.createImageData(w, h);
  const dst = outImg.data;

  const rawElev = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    rawElev[i] = src[i * 4] / 255;
  }

  // Two separable 3-tap binomial passes (H wrap + V clamp) to remove 8-bit JPEG block steps
  const horizElev = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      const xm1 = (x - 1 + w) % w;
      const xp1 = (x + 1) % w;
      horizElev[rowOff + x] =
        0.25 * rawElev[rowOff + xm1] + 0.5 * rawElev[rowOff + x] + 0.25 * rawElev[rowOff + xp1];
    }
  }

  const elevFloat = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const ym1 = Math.max(0, y - 1) * w;
    const y0 = y * w;
    const yp1 = Math.min(h - 1, y + 1) * w;
    for (let x = 0; x < w; x++) {
      elevFloat[y0 + x] =
        0.25 * horizElev[ym1 + x] + 0.5 * horizElev[y0 + x] + 0.25 * horizElev[yp1 + x];
    }
  }

  const at = (x, y) => {
    const wx = ((x % w) + w) % w;
    const wy = Math.max(0, Math.min(h - 1, y));
    return elevFloat[wy * w + wx];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const pIdx = idx * 4;
      const c = elevFloat[idx];

      // Wide 2-px Sobel finite-difference tangent slopes
      const tl = at(x - 2, y - 2);
      const t = at(x, y - 2);
      const tr = at(x + 2, y - 2);
      const l = at(x - 2, y);
      const r = at(x + 2, y);
      const bl = at(x - 2, y + 2);
      const b = at(x, y + 2);
      const br = at(x + 2, y + 2);

      const dU = (tr + 2 * r + br - (tl + 2 * l + bl)) * 0.78;
      const dV = (bl + 2 * b + br - (tl + 2 * t + tr)) * 0.78;

      const mareFactor = mareMaskData ? mareMaskData[pIdx] / 255 : 0;
      const roughness = Math.max(40, Math.min(255, Math.round(185 - mareFactor * 95 + Math.abs(dU + dV) * 80)));

      dst[pIdx] = Math.round(c * 255);
      dst[pIdx + 1] = Math.max(0, Math.min(255, Math.round(128 + dU * 127)));
      dst[pIdx + 2] = Math.max(0, Math.min(255, Math.round(128 + dV * 127)));
      dst[pIdx + 3] = roughness;
    }
  }
  hCtx.putImageData(outImg, 0, 0);

  const heightSampler = (u, v) => {
    const wrappedU = ((u % 1) + 1) % 1;
    const clampedV = Math.max(0, Math.min(1, v));
    const x = Math.min(w - 1, Math.floor(wrappedU * w));
    const y = Math.min(h - 1, Math.floor(clampedV * (h - 1)));
    return elevFloat[y * w + x];
  };

  return { heightCanvas, heightSampler };
}

/**
 * Generate dual 2048x1024 NASA selenographic Albedo + LOLA Elevation/Slope maps.
 */
export function createRealisticMoonMaps(quickmap = {}, psrZones = [], sites = []) {
  const features = quickmap.notableAlbedoFeatures || [];
  const craters = quickmap.cratersAndMassifs || [];
  const pxPerDeg = TEX_H / 180;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = TEX_W;
  albedoCanvas.height = TEX_H;
  const aCtx = albedoCanvas.getContext('2d');

  const elevCanvas = document.createElement('canvas');
  elevCanvas.width = TEX_W;
  elevCanvas.height = TEX_H;
  const eCtx = elevCanvas.getContext('2d');

  // Track where smooth dark basaltic mare lava flooded the crust (used for roughness modulation)
  const mareMaskCanvas = document.createElement('canvas');
  mareMaskCanvas.width = TEX_W;
  mareMaskCanvas.height = TEX_H;
  const mCtx = mareMaskCanvas.getContext('2d');

  // 1. Base highland anorthositic crust + global regolith fBm
  aCtx.fillStyle = '#9aa0aa';
  aCtx.fillRect(0, 0, TEX_W, TEX_H);
  eCtx.fillStyle = 'rgb(138, 138, 138)'; // ~ +1.0 km highland datum
  eCtx.fillRect(0, 0, TEX_W, TEX_H);
  mCtx.fillStyle = '#000';
  mCtx.fillRect(0, 0, TEX_W, TEX_H);

  // 2. Paint all 22 NASA Lunar Maria & Impact Basins (South Pole-Aitken, Orientale, Procellarum, Imbrium...)
  for (const f of features) {
    const rx = (f.rxDeg || f.radiusDeg || 8) * pxPerDeg;
    const ry = (f.ryDeg || f.radiusDeg || 8) * pxPerDeg;
    const ang = ((f.angleDeg || 0) * Math.PI) / 180;
    const isBasin = String(f.albedo || '').includes('basin');
    const isMare = String(f.albedo || '').includes('mare');
    const isMultiRing = String(f.albedo || '').includes('multi-ring');
    const elevNorm = Math.max(18, Math.min(240, Math.round(128 + (f.elevKm ?? -2.0) * 14)));

    stampWrapped(aCtx, f.lon, f.lat, (ctx) => {
      ctx.rotate(ang);
      ctx.scale(1, ry / Math.max(1, rx));
      const g = ctx.createRadialGradient(0, 0, rx * 0.08, 0, 0, rx);
      if (isMultiRing) {
        g.addColorStop(0, 'rgba(54, 58, 67, 0.92)');
        g.addColorStop(0.32, 'rgba(72, 77, 87, 0.72)');
        g.addColorStop(0.55, 'rgba(168, 174, 184, 0.45)');
        g.addColorStop(0.75, 'rgba(84, 89, 100, 0.45)');
        g.addColorStop(0.92, 'rgba(164, 170, 180, 0.35)');
        g.addColorStop(1, 'rgba(145, 150, 160, 0)');
      } else if (isBasin) {
        g.addColorStop(0, 'rgba(78, 83, 94, 0.72)');
        g.addColorStop(0.7, 'rgba(102, 108, 119, 0.42)');
        g.addColorStop(1, 'rgba(150, 156, 166, 0)');
      } else if (isMare) {
        g.addColorStop(0, 'rgba(56, 61, 71, 0.88)');
        g.addColorStop(0.68, 'rgba(69, 75, 86, 0.74)');
        g.addColorStop(0.9, 'rgba(104, 110, 121, 0.34)');
        g.addColorStop(1, 'rgba(145, 150, 160, 0)');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
    });

    stampWrapped(eCtx, f.lon, f.lat, (ctx) => {
      ctx.rotate(ang);
      ctx.scale(1, ry / Math.max(1, rx));
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.15);
      const rimVal = Math.max(130, Math.min(250, Math.round(138 + (f.rimKm ?? 1.0) * 18)));
      g.addColorStop(0, `rgba(${elevNorm},${elevNorm},${elevNorm},0.88)`);
      g.addColorStop(0.72, `rgba(${elevNorm},${elevNorm},${elevNorm},0.72)`);
      g.addColorStop(0.88, `rgba(${rimVal},${rimVal},${rimVal},0.55)`);
      g.addColorStop(1, 'rgba(138,138,138,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx * 1.15, 0, Math.PI * 2);
      ctx.fill();
    });

    if (isMare) {
      stampWrapped(mCtx, f.lon, f.lat, (ctx) => {
        ctx.rotate(ang);
        ctx.scale(1, ry / Math.max(1, rx));
        const g = ctx.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
        g.addColorStop(0, 'rgba(255,255,255,0.92)');
        g.addColorStop(0.8, 'rgba(200,200,200,0.6)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  // 3. Paint all 43+ NASA IAU Craters, Ejecta Ray Systems, Massifs & Swirls
  craters.forEach((c, idx) => {
    const r = Math.max(2.2, (c.radiusDeg || 1.2) * pxPerDeg);
    const kind = c.type || 'crater';

    // Anisotropic bright ejecta rays (Tycho, Copernicus, Kepler, Aristarchus, Proclus, Giordano Bruno)
    if (c.rayCount && c.rayLengthDeg) {
      const rayLen = c.rayLengthDeg * pxPerDeg;
      stampWrapped(aCtx, c.lon, c.lat, (ctx) => {
        for (let k = 0; k < c.rayCount; k++) {
          const theta = (k / c.rayCount) * Math.PI * 2 + hash2(idx, k) * 0.45;
          const len = rayLen * (0.45 + 0.65 * hash2(k, idx + 3));
          const spread = (0.045 + hash2(idx + 5, k) * 0.06) * len;
          ctx.save();
          ctx.rotate(theta);
          const rg = ctx.createLinearGradient(r * 0.8, 0, len, 0);
          rg.addColorStop(0, 'rgba(232, 236, 242, 0.56)');
          rg.addColorStop(0.35, 'rgba(218, 223, 232, 0.25)');
          rg.addColorStop(1, 'rgba(200, 206, 215, 0)');
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.moveTo(r * 0.7, -r * 0.35);
          ctx.lineTo(len, -spread);
          ctx.lineTo(len, spread);
          ctx.lineTo(r * 0.7, r * 0.35);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      });
    }

    if (kind === 'magnetic-swirl') {
      const rx = (c.rxDeg || 1.9) * pxPerDeg;
      const ry = (c.ryDeg || 0.75) * pxPerDeg;
      stampWrapped(aCtx, c.lon, c.lat, (ctx) => {
        ctx.rotate(((c.angleDeg || 32) * Math.PI) / 180);
        const sg = ctx.createRadialGradient(0, 0, rx * 0.08, 0, 0, rx);
        sg.addColorStop(0, 'rgba(240, 244, 250, 0.88)');
        sg.addColorStop(0.45, 'rgba(220, 226, 238, 0.52)');
        sg.addColorStop(1, 'rgba(180, 186, 196, 0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      return;
    }

    if (kind === 'massif-arc' || kind === 'polar-massif' || kind === 'plateau' || kind === 'volcanic-dome') {
      const rx = (c.rxDeg || c.radiusDeg || 2.0) * pxPerDeg;
      const ry = (c.ryDeg || c.radiusDeg || 2.0) * pxPerDeg;
      const peakVal = Math.max(165, Math.min(254, Math.round(140 + (c.elevKm || c.rimKm || 3.0) * 19)));
      stampWrapped(aCtx, c.lon, c.lat, (ctx) => {
        ctx.rotate(((c.angleDeg || 0) * Math.PI) / 180);
        const mg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        mg.addColorStop(0, 'rgba(210, 214, 222, 0.68)');
        mg.addColorStop(0.7, 'rgba(180, 185, 195, 0.35)');
        mg.addColorStop(1, 'rgba(155, 160, 170, 0)');
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      stampWrapped(eCtx, c.lon, c.lat, (ctx) => {
        ctx.rotate(((c.angleDeg || 0) * Math.PI) / 180);
        const mg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        mg.addColorStop(0, `rgba(${peakVal},${peakVal},${peakVal},0.92)`);
        mg.addColorStop(0.65, `rgba(${Math.round((peakVal + 138) / 2)},${Math.round((peakVal + 138) / 2)},${Math.round((peakVal + 138) / 2)},0.6)`);
        mg.addColorStop(1, 'rgba(138,138,138,0)');
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      return;
    }

    // Standard, Dark-Floor, Multi-Ring, and Polar Craters
    const isDarkFloor = kind === 'dark-floor-crater';
    const isBright = String(c.albedo || '').includes('bright');
    const floorDepth = Math.max(14, Math.min(115, Math.round(126 - (c.depthKm ?? 3.0) * 19)));
    const rimPeak = Math.max(150, Math.min(252, Math.round(138 + (c.rimKm ?? 1.4) * 24)));

    stampWrapped(aCtx, c.lon, c.lat, (ctx) => {
      // Ejecta blanket / bright rim halo
      const rim = ctx.createRadialGradient(0, 0, r * 0.72, 0, 0, r * 1.45);
      rim.addColorStop(0, isBright ? 'rgba(232, 236, 244, 0.72)' : 'rgba(202, 208, 218, 0.42)');
      rim.addColorStop(0.55, isBright ? 'rgba(212, 218, 228, 0.28)' : 'rgba(175, 181, 192, 0.16)');
      rim.addColorStop(1, 'rgba(155, 160, 170, 0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
      ctx.fill();

      // Crater floor
      const floor = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.92);
      if (isDarkFloor) {
        floor.addColorStop(0, 'rgba(48, 52, 62, 0.9)');
        floor.addColorStop(0.84, 'rgba(62, 67, 78, 0.8)');
        floor.addColorStop(1, 'rgba(130, 136, 146, 0)');
      } else {
        floor.addColorStop(0, isBright ? 'rgba(190, 195, 205, 0.35)' : 'rgba(128, 134, 145, 0.35)');
        floor.addColorStop(1, 'rgba(150, 155, 165, 0)');
      }
      ctx.fillStyle = floor;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      ctx.fill();

      if (c.hasPeak) {
        ctx.fillStyle = isDarkFloor ? 'rgba(232, 236, 244, 0.92)' : 'rgba(218, 222, 232, 0.72)';
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1.2, r * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }
    });

    stampWrapped(eCtx, c.lon, c.lat, (ctx) => {
      const cg = ctx.createRadialGradient(0, 0, r * 0.08, 0, 0, r * 1.45);
      cg.addColorStop(0, `rgba(${floorDepth},${floorDepth},${floorDepth},0.92)`);
      cg.addColorStop(0.55, `rgba(${floorDepth + 18},${floorDepth + 18},${floorDepth + 18},0.85)`);
      cg.addColorStop(0.74, `rgba(${rimPeak},${rimPeak},${rimPeak},0.92)`);
      cg.addColorStop(1, 'rgba(138,138,138,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
      ctx.fill();

      if (c.hasPeak) {
        const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1.8, r * 0.28));
        pg.addColorStop(0, 'rgba(210, 210, 210, 0.9)');
        pg.addColorStop(1, 'rgba(138, 138, 138, 0)');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1.8, r * 0.28), 0, Math.PI * 2);
        ctx.fill();
      }
    });
  });

  // 4. Anchor real CLPS Landing Site LOLA elevations & South Pole PSR depressions
  for (const s of sites) {
    if (typeof s.elevationMeters !== 'number') continue;
    const val = Math.max(16, Math.min(242, Math.round(128 + (s.elevationMeters / 1000) * 14)));
    stampWrapped(eCtx, s.lon, s.lat, (ctx) => {
      const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 2.2 * pxPerDeg);
      sg.addColorStop(0, `rgba(${val},${val},${val},0.85)`);
      sg.addColorStop(1, 'rgba(138,138,138,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(0, 0, 2.2 * pxPerDeg, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  for (const psr of psrZones) {
    const degR = Math.max(0.35, (psr.radiusKm || 10) / 30.32);
    const pr = degR * pxPerDeg;
    stampWrapped(eCtx, psr.centerLon, psr.centerLat, (ctx) => {
      const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, pr * 1.35);
      pg.addColorStop(0, 'rgba(28,28,28,0.92)');
      pg.addColorStop(0.75, 'rgba(55,55,55,0.7)');
      pg.addColorStop(0.9, 'rgba(190,190,190,0.65)');
      pg.addColorStop(1, 'rgba(138,138,138,0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(0, 0, pr * 1.35, 0, Math.PI * 2);
      ctx.fill();
    });
    stampWrapped(aCtx, psr.centerLon, psr.centerLat, (ctx) => {
      ctx.fillStyle = 'rgba(28, 48, 62, 0.52)';
      ctx.beginPath();
      ctx.arc(0, 0, pr, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // 5. Regolith micro-grain on albedo + elevation before Sobel slope extraction
  const aImg = aCtx.getImageData(0, 0, TEX_W, TEX_H);
  const ad = aImg.data;
  const eImg = eCtx.getImageData(0, 0, TEX_W, TEX_H);
  const ed = eImg.data;
  const mData = mCtx.getImageData(0, 0, TEX_W, TEX_H).data;

  for (let py = 0; py < TEX_H; py++) {
    for (let px = 0; px < TEX_W; px++) {
      const pIdx = (py * TEX_W + px) * 4;
      const g1 = hash2(px * 0.75, py * 0.75) - 0.5;
      const g2 = fbmNoise(px * 0.045, py * 0.045) - 0.5;
      const deltaA = g1 * 12 + g2 * 18;
      ad[pIdx] = Math.max(24, Math.min(242, ad[pIdx] + deltaA));
      ad[pIdx + 1] = Math.max(24, Math.min(242, ad[pIdx + 1] + deltaA));
      ad[pIdx + 2] = Math.max(26, Math.min(245, ad[pIdx + 2] + deltaA + 1.5));

      const mareSmooth = 1.0 - (mData[pIdx] / 255) * 0.6;
      const deltaE = (g1 * 14 + g2 * 26) * mareSmooth;
      const ev = Math.max(0, Math.min(255, ed[pIdx] + deltaE));
      ed[pIdx] = ev;
      ed[pIdx + 1] = ev;
      ed[pIdx + 2] = ev;
    }
  }
  aCtx.putImageData(aImg, 0, 0);
  eCtx.putImageData(eImg, 0, 0);

  const { heightCanvas, heightSampler } = buildNormalSlopeCanvas(elevCanvas, mData);
  return { albedoCanvas, heightCanvas, elevCanvas, heightSampler, mareMaskData: mData };
}

/**
 * Build high-density 3D LOLA-displaced sphere mesh (96x192 = 18,721 vertices < 65,535 Uint16 limit).
 */
function buildSphereMesh(latBands = 96, lonBands = 192, heightSampler = null) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= latBands; i++) {
    const v = i / latBands;
    const lat = 90 - v * 180;
    for (let j = 0; j <= lonBands; j++) {
      const wrappedJ = j % lonBands;
      const u = j / lonBands;
      const lon = -180 + u * 360;
      const [nx, ny, nz] = latLonToVec3(lat, lon);
      let radius = 1.0;
      if (heightSampler && i > 0 && i < latBands) {
        const hVal = heightSampler(wrappedJ / lonBands, v);
        radius = 1.0 + (hVal - 0.5) * 0.028; // Balanced LOLA + crater silhouette relief
      }
      positions.push(nx * radius, ny * radius, nz * radius);
      normals.push(nx, ny, nz);
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

// ---- Background Space, 3-Tier Parallax Starfield, Phase-Lit Earth & Solar Corona ----
const BG_VERT_SHADER = `
  attribute vec2 aQuad;
  varying vec2 vNdc;
  void main() {
    vNdc = aQuad;
    gl_Position = vec4(aQuad, 0.9999, 1.0);
  }
`;

const BG_FRAG_SHADER = `
  precision highp float;

  varying vec2 vNdc;

  uniform vec3 uCamForward;
  uniform vec3 uCamRight;
  uniform vec3 uCamUp;
  uniform float uTanHalfFov;
  uniform float uAspect;
  uniform vec2 uParallax;
  uniform vec3 uSunDir;
  uniform vec3 uEarthDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float starLayer(vec3 dir, float scale, float density, float brightness) {
    float theta = atan(dir.x, dir.z);
    float phi = asin(clamp(dir.y, -1.0, 1.0));
    vec2 gridUv = vec2(theta * 0.31831 * scale, (phi * 0.63662 + 0.5) * scale * 0.5);
    vec2 cell = floor(gridUv);
    vec2 f = fract(gridUv) - 0.5;
    float rnd = hash21(cell);
    if (rnd < density) return 0.0;
    vec2 jitter = (vec2(hash21(cell + 17.3), hash21(cell + 43.7)) - 0.5) * 0.65;
    float d = length(f - jitter);
    float size = 0.03 + 0.09 * fract(rnd * 37.0);
    return smoothstep(size, 0.0, d) * brightness * (0.45 + 0.55 * fract(rnd * 91.0));
  }

  void main() {
    vec3 ray = normalize(
      uCamForward +
      uCamRight * (vNdc.x * uTanHalfFov * uAspect) +
      uCamUp * (vNdc.y * uTanHalfFov)
    );

    // Subtle deep-space Milky Way dust glow
    float galacticPlane = exp(-pow((ray.y * 0.72 + ray.x * 0.55 - ray.z * 0.35) / 0.24, 2.0));
    vec3 spaceCol = vec3(0.008, 0.014, 0.032) + vec3(0.018, 0.028, 0.055) * galacticPlane;

    // 3-tier deep-space starfield with depth-scaled parallax shifts
    vec3 dirFar = normalize(ray + uCamRight * (uParallax.x * 0.004) + uCamUp * (uParallax.y * 0.004));
    vec3 dirMid = normalize(ray + uCamRight * (uParallax.x * 0.012) + uCamUp * (uParallax.y * 0.012));
    vec3 dirNear = normalize(ray + uCamRight * (uParallax.x * 0.025) + uCamUp * (uParallax.y * 0.025));

    float sFar = starLayer(dirFar, 95.0, 0.86, 0.65);
    float sMid = starLayer(dirMid, 48.0, 0.91, 1.05);
    float sNear = starLayer(dirNear, 22.0, 0.955, 1.55);

    spaceCol += vec3(0.75, 0.84, 1.0) * sFar;
    spaceCol += vec3(0.95, 0.92, 0.88) * sMid;
    spaceCol += vec3(0.88, 0.95, 1.0) * sNear;

    // Solar disk + corona scattering along real-time JPL Horizons Sun direction
    vec3 S = normalize(uSunDir);
    float sunCos = max(0.0, dot(ray, S));
    float sunAng = acos(clamp(dot(ray, S), -1.0, 1.0));
    float sunDisk = smoothstep(0.026, 0.017, sunAng);
    float corona = exp(-sunAng * 14.0) * 0.55 + exp(-sunAng * 4.5) * 0.14;
    spaceCol += vec3(1.0, 0.94, 0.78) * (sunDisk * 1.5) + vec3(1.0, 0.74, 0.38) * corona;

    // 3D Phase-Lit Earth suspended along JPL Horizons sub-Earth vector
    vec3 E = normalize(uEarthDir);
    float earthCos = dot(ray, E);
    float earthAngularRadius = 0.052;
    float cosR = cos(earthAngularRadius);
    if (earthCos > cosR) {
      vec3 eUp = normalize(cross(E, vec3(0.0, 1.0, 0.01)));
      vec3 eRight = normalize(cross(eUp, E));
      vec2 eLocal = vec2(dot(ray, eRight), dot(ray, eUp)) / sin(earthAngularRadius);
      float r2 = dot(eLocal, eLocal);
      if (r2 < 1.0) {
        vec3 eNorm = normalize(eRight * eLocal.x + eUp * eLocal.y + E * sqrt(max(0.0, 1.0 - r2)));
        float phase = max(0.02, dot(eNorm, S));
        float latN = asin(clamp(eNorm.y, -1.0, 1.0));
        float lonN = atan(eNorm.x, eNorm.z);
        float cloud = smoothstep(0.45, 0.85, hash21(floor(vec2(lonN * 6.0, latN * 6.0))));
        vec3 earthAlbedo = mix(vec3(0.09, 0.28, 0.68), vec3(0.86, 0.92, 0.98), cloud * 0.55);
        float rim = pow(1.0 - max(0.0, dot(eNorm, -ray)), 2.4);
        vec3 earthCol = earthAlbedo * phase * 1.15 + vec3(0.32, 0.68, 1.0) * rim * (0.2 + 0.8 * phase);
        spaceCol = mix(spaceCol, earthCol, smoothstep(1.0, 0.92, r2));
      }
    }

    gl_FragColor = vec4(clamp(spaceCol, 0.0, 1.0), 1.0);
  }
`;

// ---- Lunar Globe Surface Shader with Steep POM + Horizon Self-Shadowing + Hapke Regolith BRDF ----
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
  uniform sampler2D uHeightTex;
  uniform vec3 uCamPos;
  uniform vec3 uSunDir;
  uniform vec3 uEarthDir;
  uniform vec3 uHoverDir;
  uniform float uHasHover;
  uniform vec3 uStagedDir;
  uniform float uHasStaged;
  uniform float uShowGraticule;
  uniform float uShowTerminator;

  float hash31(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
  }

  float fbm3(vec3 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * noise3(p);
      p = p * 2.17 + vec3(13.7, 29.3, 7.1);
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 Vw = normalize(uCamPos - vWorldPos);
    vec3 Lw = normalize(uSunDir);

    // Local selenographic tangent frame (+T = East/u, +B = South/v, +N = Up)
    float horizLen = length(vec2(N.x, N.z));
    vec3 T = horizLen > 0.002 ? normalize(vec3(N.z, 0.0, -N.x)) : vec3(1.0, 0.0, 0.0);
    vec3 B = normalize(cross(T, N));

    // ---- 14-step Steep Parallax Occlusion Mapping (POM) with secant refinement ----
    vec3 Vt = vec3(dot(Vw, T), dot(Vw, B), max(0.26, dot(Vw, N)));
    float heightScale = 0.0155;
    vec2 maxDeltaUv = (Vt.xy / Vt.z) * vec2(heightScale * 0.5, heightScale);

    const float POM_STEPS = 14.0;
    float layerDepth = 1.0 / POM_STEPS;
    vec2 deltaUv = maxDeltaUv / POM_STEPS;

    vec2 currUv = vUv;
    float currDepthMap = 1.0 - texture2D(uHeightTex, currUv).r;
    float currLayerDepth = 0.0;

    for (int i = 0; i < 14; i++) {
      if (currLayerDepth < currDepthMap) {
        currUv -= deltaUv;
        currDepthMap = 1.0 - texture2D(uHeightTex, currUv).r;
        currLayerDepth += layerDepth;
      }
    }

    vec2 prevUv = currUv + deltaUv;
    float afterDepth = currDepthMap - currLayerDepth;
    float beforeDepth = (1.0 - texture2D(uHeightTex, prevUv).r) - (currLayerDepth - layerDepth);
    float denom = afterDepth - beforeDepth;
    float weight = abs(denom) > 0.0001 ? clamp(afterDepth / denom, 0.0, 1.0) : 0.5;
    vec2 parallaxUv = mix(currUv, prevUv, weight);
    parallaxUv.y = clamp(parallaxUv.y, 0.001, 0.999);

    vec4 albedoTex = texture2D(uTex, parallaxUv);
    vec4 hSample = texture2D(uHeightTex, parallaxUv);
    float baseElev = hSample.r;
    float roughness = hSample.a;

    // Seamless 3D multi-octave regolith micro-relief & soil grain across all zoom levels
    float camDist = length(uCamPos - vWorldPos);
    float zoomDetail = clamp((2.6 - camDist) / 1.4, 0.25, 1.0);
    vec3 pMed = N * 75.0;
    vec3 pFine = N * 280.0;
    float nCenter = fbm3(pMed) * 0.65 + fbm3(pFine) * 0.35;
    float nEast = fbm3((N + T * 0.0025) * 75.0) * 0.65 + fbm3((N + T * 0.0025) * 280.0) * 0.35;
    float nSouth = fbm3((N + B * 0.0025) * 75.0) * 0.65 + fbm3((N + B * 0.0025) * 280.0) * 0.35;
    float detailU = (nEast - nCenter) * (1.8 + 1.4 * zoomDetail);
    float detailV = (nSouth - nCenter) * (1.8 + 1.4 * zoomDetail);
    float microGrain = (noise3(N * 820.0) - 0.5) * 0.08 * zoomDetail + (nCenter - 0.5) * 0.09;

    // Combine smoothed LOLA/crater Sobel macro slopes with seamless 3D regolith micro-normals
    float slopeU = (hSample.g - 0.5) * 2.0;
    float slopeV = (hSample.b - 0.5) * 2.0;
    vec3 bumpedN = normalize(N - T * (slopeU * 2.15 + detailU * 0.65) - B * (slopeV * 2.15 + detailV * 0.65));

    // ---- 6-step Horizon Ray-Marching Crater Rim Self-Shadowing (grazing terminator angles only) ----
    float rawSunDot = dot(N, Lw);
    float selfShadow = 1.0;
    if (uShowTerminator > 0.5 && rawSunDot > -0.04) {
      vec3 Lt = vec3(dot(Lw, T), dot(Lw, B), max(0.08, dot(Lw, N)));
      vec2 shadowDirUv = vec2(Lt.x * 0.5, Lt.y) / Lt.z * 0.012;
      float occ = 0.0;
      for (int s = 1; s <= 6; s++) {
        float t = float(s) / 6.0;
        vec2 sUv = parallaxUv + shadowDirUv * t;
        sUv.y = clamp(sUv.y, 0.001, 0.999);
        float targetH = texture2D(uHeightTex, sUv).r;
        float rayH = baseElev + t * 0.22 * clamp(Lt.z * 4.5, 0.15, 2.5);
        occ = max(occ, clamp((targetH - rayH) * 5.2, 0.0, 1.0));
      }
      float grazingMask = smoothstep(0.38, 0.02, rawSunDot);
      selfShadow = 1.0 - occ * 0.48 * grazingMask;
    }

    // ---- Sculpted Cavity Lighting + Hapke / Lommel-Seeliger Regolith BRDF ----
    float shadowMask = smoothstep(-0.022, 0.036, rawSunDot);
    float nDotL = clamp((dot(bumpedN, Lw) + 0.22) / 1.22, 0.0, 1.0);
    float craterBounce = 0.26 * smoothstep(-0.05, 0.25, rawSunDot);
    float mu0 = max(nDotL * selfShadow, craterBounce) * shadowMask;
    float mu = max(0.08, dot(bumpedN, Vw));
    float lommel = mu0 / (mu0 + mu * 0.52 + 0.08);
    float cavityAo = clamp(0.80 + (baseElev - 0.46) * 0.48, 0.74, 1.06);
    vec3 H = normalize(Lw + Vw);
    float rimSpec = pow(max(0.0, dot(bumpedN, H)), 14.0) * 0.11 * shadowMask * selfShadow;

    // Zero-phase opposition surge (authentic Apollo/Clementine retroreflection peak)
    float phaseCos = max(0.0, dot(Vw, Lw));
    float oppSurge = pow(phaseCos, 10.0) * 0.28 * (0.5 + 0.5 * roughness);

    // Subtle terminator edge contrast without atmospheric scattering haze
    float termCrisp = exp(-pow(rawSunDot / 0.024, 2.0)) * 0.08 * uShowTerminator;

    // Cool blue Earthshine on the near-side lunar night hemisphere
    float earthDot = max(0.0, dot(N, normalize(uEarthDir)));
    vec3 earthshine = vec3(0.045, 0.082, 0.16) * (0.22 + 0.78 * earthDot);

    vec3 rawAlbedo = albedoTex.rgb;
    float luma = dot(rawAlbedo, vec3(0.299, 0.587, 0.114));
    float liftedLuma = mix(0.34 + 0.50 * pow(clamp(luma, 0.0, 1.0), 0.65), luma, 0.22);
    vec3 chroma = mix(vec3(1.0), rawAlbedo / max(0.05, luma), 0.45);
    vec3 baseColor = clamp(chroma * (liftedLuma + microGrain), 0.15, 0.88);
    vec3 litColor;
    if (uShowTerminator > 0.5) {
      float solarGain = pow(clamp(lommel * (1.32 + oppSurge), 0.0, 1.65), 0.90) * cavityAo;
      litColor = baseColor * (solarGain + 0.02) + vec3(rimSpec) + baseColor * earthshine * (1.0 - shadowMask * 0.9);
      litColor += baseColor * vec3(1.0, 0.86, 0.65) * termCrisp;
    } else {
      float unshadowedShade = clamp(0.78 + dot(bumpedN, Vw) * 0.22, 0.45, 1.12);
      litColor = baseColor * unshadowedShade;
    }

    // 30-degree selenographic lat/lon graticule lines
    if (uShowGraticule > 0.5) {
      float latDeg = asin(clamp(N.y, -1.0, 1.0)) * 57.29578;
      float lonDeg = atan(N.x, N.z) * 57.29578;
      float latGrid = abs(fract((latDeg + 180.0) / 30.0 + 0.5) - 0.5) * 30.0;
      float lonGrid = abs(fract((lonDeg + 180.0) / 30.0 + 0.5) - 0.5) * 30.0 * max(0.18, cos(latDeg * 0.017453));
      float lineMask = 1.0 - min(smoothstep(0.0, 0.38, latGrid), smoothstep(0.0, 0.38, lonGrid));
      float isPrime = (abs(latDeg) < 0.35 || abs(lonDeg) < 0.35) ? 1.0 : 0.0;
      vec3 gridCol = mix(vec3(0.28, 0.44, 0.72), vec3(0.45, 0.74, 1.0), isPrime);
      litColor = mix(litColor, gridCol, lineMask * (0.22 + 0.22 * isPrime));
    }

    // Cursor hover ring
    if (uHasHover > 0.5) {
      float ang = acos(clamp(dot(N, normalize(uHoverDir)), -1.0, 1.0));
      float ring = smoothstep(0.030, 0.022, ang) * (1.0 - smoothstep(0.020, 0.012, ang));
      litColor = mix(litColor, vec3(0.38, 0.85, 1.0), ring * 0.88);
    }

    // Staged drop crosshair ring
    if (uHasStaged > 0.5) {
      float ang = acos(clamp(dot(N, normalize(uStagedDir)), -1.0, 1.0));
      float ring = smoothstep(0.042, 0.032, ang) * (1.0 - smoothstep(0.028, 0.018, ang));
      float dotC = smoothstep(0.013, 0.007, ang);
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

function linkProgram(gl, vertSrc, fragSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
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

// Fast-out, slow-in ease curve matching CSS cubic-bezier(0.22, 1, 0.36, 1)
function easeOutCubicBezier(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3.4);
}

export class LunarGlobeGL {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.onHover = options.onHover || (() => {});
    this.onSelectPoint = options.onSelectPoint || (() => {});
    this.onViewChange = options.onViewChange || (() => {});
    this.onTextureLoad = options.onTextureLoad || (() => {});

    this.quickmap = options.quickmap || { notableAlbedoFeatures: options.quickmapFeatures || [] };
    this.psrZones = options.psrZones || [];
    this.sites = options.sites || [];

    // Camera starts angled to show South Pole + Near Side CLPS sites nicely
    this.yaw = 0.35;
    this.pitch = -0.62;
    this.distance = 2.68;
    this.fovYDeg = 42;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.targetParallaxX = 0;
    this.targetParallaxY = 0;
    this.sunVec = latLonToVec3(-1.35, 121.2);
    this.earthVec = latLonToVec3(-5.9, -4.2);
    this.hoverVec = null;
    this.stagedVec = null;
    this.showTerminator = true;
    this.showGraticule = true;

    this.dragging = false;
    this.movedDuringDrag = false;
    this.lastMouse = null;
    this.velYaw = 0;
    this.velPitch = 0;
    this._lastDragMoveTime = 0;
    this._pressedSite = null;
    this._animRaf = null;
    this._lastFrameTime = 0;
    this._cameraTween = null;
    this._cachedDataUrl = null;
    this._cachedSouthPoleDataUrl = null;

    this.maps = createRealisticMoonMaps(this.quickmap, this.psrZones, this.sites);

    this.gl = canvas.getContext('webgl', { antialias: true, alpha: true }) ||
              canvas.getContext('experimental-webgl', { antialias: true, alpha: true });

    if (this.gl) {
      this._initWebGL();
      this._tryLoadNasaRasters();
    } else {
      this.ctx2d = canvas.getContext('2d');
    }

    this._bindEvents();
    this.resize();
    this.render();
  }

  getAlbedoCanvas() {
    return this.maps.albedoCanvas;
  }

  getAlbedoDataUrl() {
    if (!this._cachedDataUrl) {
      this._cachedDataUrl = this.maps.albedoCanvas.toDataURL('image/jpeg', 0.86);
    }
    return this._cachedDataUrl;
  }

  /**
   * Project the South Pole region (-90S to -73.5S) onto a stereographic polar disc (424x424)
   * matching projectSouthPole(): center = 90S, radius 212px = 73.5S, top = 0 deg Near Side, right = 90E.
   */
  getSouthPoleDataUrl() {
    if (this._cachedSouthPoleDataUrl) return this._cachedSouthPoleDataUrl;
    const size = 424;
    const half = size * 0.5;
    const maxColat = 16.5;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const outImg = ctx.createImageData(size, size);
    const dst = outImg.data;

    const aCanvas = this.maps.albedoCanvas;
    const aw = aCanvas.width;
    const ah = aCanvas.height;
    const aData = aCanvas.getContext('2d').getImageData(0, 0, aw, ah).data;

    const hCanvas = this.maps.heightCanvas;
    const hw = hCanvas.width;
    const hh = hCanvas.height;
    const hData = hCanvas.getContext('2d').getImageData(0, 0, hw, hh).data;

    const elevGrid = new Float32Array(size * size);

    const sampleBilinear = (data, w, h, u, v, chOffset) => {
      const fx = (((u % 1) + 1) % 1) * w;
      const fy = Math.max(0, Math.min(1, v)) * (h - 1);
      const x0 = Math.floor(fx) % w;
      const x1 = (x0 + 1) % w;
      const y0 = Math.min(h - 1, Math.floor(fy));
      const y1 = Math.min(h - 1, y0 + 1);
      const tx = fx - Math.floor(fx);
      const ty = fy - y0;
      const idx00 = (y0 * w + x0) * 4 + chOffset;
      const idx10 = (y0 * w + x1) * 4 + chOffset;
      const idx01 = (y1 * w + x0) * 4 + chOffset;
      const idx11 = (y1 * w + x1) * 4 + chOffset;
      const top = data[idx00] * (1 - tx) + data[idx10] * tx;
      const bot = data[idx01] * (1 - tx) + data[idx11] * tx;
      return top * (1 - ty) + bot * ty;
    };

    for (let sy = 0; sy < size; sy++) {
      for (let sx = 0; sx < size; sx++) {
        const dx = sx - half;
        const dy = half - sy;
        const r = Math.hypot(dx, dy);
        const idx = sy * size + sx;
        const pIdx = idx * 4;
        if (r > half + 1) {
          dst[pIdx + 3] = 0;
          continue;
        }
        const colat = (r / half) * maxColat;
        const lat = -90 + colat;
        const lonDeg = Math.atan2(dx, dy) * RAD2DEG;
        const u = (lonDeg + 180) / 360;
        const v = (90 - lat) / 180;

        const rCol = sampleBilinear(aData, aw, ah, u, v, 0);
        const gCol = sampleBilinear(aData, aw, ah, u, v, 1);
        const bCol = sampleBilinear(aData, aw, ah, u, v, 2);
        const elev = sampleBilinear(hData, hw, hh, u, v, 0);
        elevGrid[idx] = elev;

        dst[pIdx] = Math.round(rCol);
        dst[pIdx + 1] = Math.round(gCol);
        dst[pIdx + 2] = Math.round(bCol);
        dst[pIdx + 3] = 255;
      }
    }

    // Apply clean isotropic topographic hillshade directly in polar grid coordinates
    for (let sy = 1; sy < size - 1; sy++) {
      for (let sx = 1; sx < size - 1; sx++) {
        const pIdx = (sy * size + sx) * 4;
        if (dst[pIdx + 3] === 0) continue;
        const gx = elevGrid[sy * size + (sx + 1)] - elevGrid[sy * size + (sx - 1)];
        const gy = elevGrid[(sy + 1) * size + sx] - elevGrid[(sy - 1) * size + sx];
        const shade = (-gx * 0.85 - gy * 0.85) * 0.9 + (elevGrid[sy * size + sx] - 128) * 0.24;
        dst[pIdx] = Math.max(18, Math.min(242, Math.round(dst[pIdx] + shade)));
        dst[pIdx + 1] = Math.max(18, Math.min(244, Math.round(dst[pIdx + 1] + shade)));
        dst[pIdx + 2] = Math.max(22, Math.min(248, Math.round(dst[pIdx + 2] + shade + 3)));
      }
    }

    ctx.putImageData(outImg, 0, 0);
    this._cachedSouthPoleDataUrl = canvas.toDataURL('image/png');
    return this._cachedSouthPoleDataUrl;
  }

  _uploadMoonBuffers(mesh) {
    const gl = this.gl;
    this.indexCount = mesh.indices.length;
    const upload = (buf, target, data) => {
      gl.bindBuffer(target, buf);
      gl.bufferData(target, data, gl.STATIC_DRAW);
    };
    upload(this.posBuf, gl.ARRAY_BUFFER, mesh.positions);
    upload(this.normBuf, gl.ARRAY_BUFFER, mesh.normals);
    upload(this.uvBuf, gl.ARRAY_BUFFER, mesh.uvs);
    upload(this.idxBuf, gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
  }

  _uploadTexture2D(tex, canvasOrImage) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasOrImage);
  }

  _initWebGL() {
    const gl = this.gl;

    // 1. Background sky + starfield + Earth/Sun shader program
    this.bgProg = linkProgram(gl, BG_VERT_SHADER, BG_FRAG_SHADER);
    this.bgQuadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bgQuadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.bgLoc = {
      aQuad: gl.getAttribLocation(this.bgProg, 'aQuad'),
      uCamForward: gl.getUniformLocation(this.bgProg, 'uCamForward'),
      uCamRight: gl.getUniformLocation(this.bgProg, 'uCamRight'),
      uCamUp: gl.getUniformLocation(this.bgProg, 'uCamUp'),
      uTanHalfFov: gl.getUniformLocation(this.bgProg, 'uTanHalfFov'),
      uAspect: gl.getUniformLocation(this.bgProg, 'uAspect'),
      uParallax: gl.getUniformLocation(this.bgProg, 'uParallax'),
      uSunDir: gl.getUniformLocation(this.bgProg, 'uSunDir'),
      uEarthDir: gl.getUniformLocation(this.bgProg, 'uEarthDir'),
    };

    // 2. Lunar globe POM + Hapke reflectance shader program
    this.prog = linkProgram(gl, VERT_SHADER, FRAG_SHADER);
    this.posBuf = gl.createBuffer();
    this.normBuf = gl.createBuffer();
    this.uvBuf = gl.createBuffer();
    this.idxBuf = gl.createBuffer();
    this._uploadMoonBuffers(buildSphereMesh(96, 192, this.maps.heightSampler));

    this.tex = gl.createTexture();
    this._uploadTexture2D(this.tex, this.maps.albedoCanvas);

    this.heightTex = gl.createTexture();
    this._uploadTexture2D(this.heightTex, this.maps.heightCanvas);

    this.loc = {
      aPos: gl.getAttribLocation(this.prog, 'aPos'),
      aNormal: gl.getAttribLocation(this.prog, 'aNormal'),
      aUv: gl.getAttribLocation(this.prog, 'aUv'),
      uMvp: gl.getUniformLocation(this.prog, 'uMvp'),
      uCamPos: gl.getUniformLocation(this.prog, 'uCamPos'),
      uTex: gl.getUniformLocation(this.prog, 'uTex'),
      uHeightTex: gl.getUniformLocation(this.prog, 'uHeightTex'),
      uSunDir: gl.getUniformLocation(this.prog, 'uSunDir'),
      uEarthDir: gl.getUniformLocation(this.prog, 'uEarthDir'),
      uHoverDir: gl.getUniformLocation(this.prog, 'uHoverDir'),
      uHasHover: gl.getUniformLocation(this.prog, 'uHasHover'),
      uStagedDir: gl.getUniformLocation(this.prog, 'uStagedDir'),
      uHasStaged: gl.getUniformLocation(this.prog, 'uHasStaged'),
      uShowGraticule: gl.getUniformLocation(this.prog, 'uShowGraticule'),
      uShowTerminator: gl.getUniformLocation(this.prog, 'uShowTerminator'),
    };
  }

  _tryLoadNasaRasters() {
    const loadImg = (urls, onLoaded) => {
      if (!urls.length || typeof Image === 'undefined') return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => onLoaded(img);
      img.onerror = () => loadImg(urls.slice(1), onLoaded);
      img.src = urls[0];
    };

    const wacUrls = ['./assets/lroc_wac_global.jpg'];
    if (this.quickmap?.trekRasterEndpoints?.svsWacGlobal) {
      wacUrls.push(this.quickmap.trekRasterEndpoints.svsWacGlobal);
    }
    if (this.quickmap?.trekRasterEndpoints?.wacGlobal) {
      wacUrls.push(this.quickmap.trekRasterEndpoints.wacGlobal);
    }

    const demUrls = ['./assets/lola_dem_global.jpg', './assets/lola_dem_global.png'];
    if (this.quickmap?.trekRasterEndpoints?.svsLolaDemGlobal) {
      demUrls.push(this.quickmap.trekRasterEndpoints.svsLolaDemGlobal);
    }
    if (this.quickmap?.trekRasterEndpoints?.lolaDemGlobal) {
      demUrls.push(this.quickmap.trekRasterEndpoints.lolaDemGlobal);
    }

    loadImg(wacUrls, (img) => {
      try {
        const ctx = this.maps.albedoCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, TEX_W, TEX_H);
        // Verify canvas was not CORS-tainted before uploading to WebGL
        ctx.getImageData(0, 0, 1, 1);
        this._cachedDataUrl = null;
        this._cachedSouthPoleDataUrl = null;
        this._uploadTexture2D(this.tex, this.maps.albedoCanvas);
        this.render();
        this.onViewChange();
        this.onTextureLoad();
      } catch {
        // Keep offline NASA-calibrated map if remote server lacks CORS headers
      }
    });

    loadImg(demUrls, (img) => {
      try {
        const tmp = document.createElement('canvas');
        tmp.width = TEX_W;
        tmp.height = TEX_H;
        const tCtx = tmp.getContext('2d');
        tCtx.drawImage(img, 0, 0, TEX_W, TEX_H);
        // Verify canvas is not CORS-tainted, then merge 72% NASA LOLA DEM + 28% cataloged NASA crater/rim relief
        tCtx.getImageData(0, 0, 1, 1);
        if (this.maps.elevCanvas) {
          tCtx.save();
          tCtx.globalAlpha = 0.28;
          tCtx.drawImage(this.maps.elevCanvas, 0, 0, TEX_W, TEX_H);
          tCtx.restore();
        }
        const { heightCanvas, heightSampler } = buildNormalSlopeCanvas(tmp, this.maps.mareMaskData);
        this.maps.heightCanvas = heightCanvas;
        this.maps.heightSampler = heightSampler;
        this._cachedSouthPoleDataUrl = null;
        this._uploadTexture2D(this.heightTex, heightCanvas);
        this._uploadMoonBuffers(buildSphereMesh(96, 192, heightSampler));
        this.render();
        this.onViewChange();
        this.onTextureLoad();
      } catch {
        // Keep offline LOLA-calibrated heightmap cleanly
      }
    });
  }

  getViewportSize() {
    const w = this.canvas.clientWidth || this.canvas.width || 960;
    const h = this.canvas.clientHeight || this.canvas.height || 480;
    return { width: Math.max(1, w), height: Math.max(1, h) };
  }

  resize() {
    if (!this.canvas || typeof this.canvas.getBoundingClientRect !== 'function') return false;
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.round(this.canvas.clientWidth || rect.width);
    const cssH = Math.round(this.canvas.clientHeight || rect.height);
    if (cssW <= 0 || cssH <= 0) return false;
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    const targetW = Math.max(1, Math.round(cssW * dpr));
    const targetH = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
      if (this.gl) {
        this.gl.viewport(0, 0, targetW, targetH);
      }
      return true;
    }
    return false;
  }

  _cameraBasis() {
    // Apply smoothed cursor micro-parallax directly to the orbited camera basis so
    // the 3D Moon, Steep POM surface relief, deep-space stars, and 2D overlay stay pixel-locked.
    const effYaw = this.yaw - this.parallaxX * 0.062;
    const effPitch = Math.max(-1.46, Math.min(1.46, this.pitch + this.parallaxY * 0.048));
    const cp = Math.cos(effPitch);
    const camPos = [
      this.distance * cp * Math.sin(effYaw),
      this.distance * Math.sin(effPitch),
      this.distance * cp * Math.cos(effYaw),
    ];
    const forward = normalize([-camPos[0], -camPos[1], -camPos[2]]);
    const worldUp = [0, 1, 0];
    const right = normalize(cross(forward, worldUp));
    const up = cross(right, forward);
    const { width, height } = this.getViewportSize();
    const aspect = width / height;
    const tanHalfFov = Math.tan((this.fovYDeg * 0.5) * DEG2RAD);
    return { camPos, forward, right, up, aspect, tanHalfFov };
  }

  _mvpMatrix(basis) {
    const { camPos, forward, right, up, aspect, tanHalfFov } = basis;
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

  _startAnimLoop() {
    if (this._animRaf !== null || typeof requestAnimationFrame !== 'function') return;
    this._lastFrameTime = performance.now();
    const tick = (now) => {
      this._animRaf = null;
      this._stepAnim(now);
    };
    this._animRaf = requestAnimationFrame(tick);
  }

  _stepAnim(now) {
    const dt = Math.min(48, Math.max(4, now - (this._lastFrameTime || now)));
    this._lastFrameTime = now;
    const stepScale = dt / 16.67;
    let keepRunning = false;
    let needsRender = false;

    if (this._cameraTween) {
      const tw = this._cameraTween;
      const t = Math.min(1, (now - tw.startTime) / Math.max(1, tw.duration));
      const k = easeOutCubicBezier(t);
      this.yaw = tw.startYaw + tw.deltaYaw * k;
      this.pitch = tw.startPitch + tw.deltaPitch * k;
      needsRender = true;
      if (t >= 1) {
        this._cameraTween = null;
        if (tw.onComplete) tw.onComplete();
      } else {
        keepRunning = true;
      }
    } else if (!this.dragging && Math.hypot(this.velYaw, this.velPitch) > 0.00015) {
      this.yaw += this.velYaw * stepScale;
      const nextPitch = this.pitch + this.velPitch * stepScale;
      if (nextPitch >= 1.46 || nextPitch <= -1.46) {
        this.pitch = Math.max(-1.46, Math.min(1.46, nextPitch));
        this.velPitch = 0;
      } else {
        this.pitch = nextPitch;
      }
      // ~1s medium space inertia coasting decay at 60fps
      const friction = Math.pow(0.925, stepScale);
      this.velYaw *= friction;
      this.velPitch *= friction;
      needsRender = true;
      if (Math.hypot(this.velYaw, this.velPitch) > 0.00015) {
        keepRunning = true;
      } else {
        this.velYaw = 0;
        this.velPitch = 0;
      }
    }

    // Smooth exponential damping for mouse micro-parallax (eases to & from origin)
    const pDx = this.targetParallaxX - this.parallaxX;
    const pDy = this.targetParallaxY - this.parallaxY;
    if (Math.hypot(pDx, pDy) > 0.0006) {
      const ease = 1 - Math.pow(1 - 0.14, stepScale);
      this.parallaxX += pDx * ease;
      this.parallaxY += pDy * ease;
      needsRender = true;
      if (Math.hypot(this.targetParallaxX - this.parallaxX, this.targetParallaxY - this.parallaxY) > 0.0006) {
        keepRunning = true;
      } else {
        this.parallaxX = this.targetParallaxX;
        this.parallaxY = this.targetParallaxY;
      }
    }

    if (needsRender) {
      this.render();
      this.onViewChange();
    }

    if (keepRunning && typeof requestAnimationFrame === 'function') {
      this._animRaf = requestAnimationFrame((t) => {
        this._animRaf = null;
        this._stepAnim(t);
      });
    }
  }

  focusLatLon(lat, lon, options = {}) {
    const targetYaw = lon * DEG2RAD + (options.yawOffsetRad || 0);
    const targetPitch = Math.max(-1.42, Math.min(1.42, lat * DEG2RAD));
    this.velYaw = 0;
    this.velPitch = 0;

    if (options.animate !== false && typeof requestAnimationFrame === 'function') {
      if (this._cameraTween && this._cameraTween.onComplete) {
        this._cameraTween.onComplete();
      }
      const deltaYaw = ((targetYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const deltaPitch = targetPitch - this.pitch;
      if (Math.hypot(deltaYaw, deltaPitch) < 0.008) {
        this.yaw = targetYaw;
        this.pitch = targetPitch;
        this.render();
        this.onViewChange();
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        this._cameraTween = {
          startYaw: this.yaw,
          startPitch: this.pitch,
          deltaYaw,
          deltaPitch,
          startTime: performance.now(),
          duration: options.duration ?? 260,
          onComplete: () => {
            if (options.onComplete) options.onComplete();
            resolve();
          },
        };
        this._startAnimLoop();
      });
    }

    this._cameraTween = null;
    this.yaw = targetYaw;
    this.pitch = targetPitch;
    this.render();
    this.onViewChange();
    return Promise.resolve();
  }

  resetView() {
    this._cameraTween = null;
    this.velYaw = 0;
    this.velPitch = 0;
    this.yaw = 0.35;
    this.pitch = -0.62;
    this.distance = 2.68;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.targetParallaxX = 0;
    this.targetParallaxY = 0;
    this.render();
    this.onViewChange();
  }

  _surfaceRadius(latDeg, lonDeg) {
    const heightSampler = this.maps?.heightSampler;
    if (!heightSampler) return 1.0;
    const v = (90 - latDeg) / 180;
    if (v <= 0.0001 || v >= 0.9999) return 1.0;
    const u = (lonDeg + 180) / 360;
    const hVal = heightSampler(u, v);
    return 1.0 + (hVal - 0.5) * 0.028;
  }

  latLonToScreen(latDeg, lonDeg) {
    const unitP = latLonToVec3(latDeg, lonDeg);
    const radius = this._surfaceRadius(latDeg, lonDeg);
    const P = [unitP[0] * radius, unitP[1] * radius, unitP[2] * radius];
    const basis = this._cameraBasis();
    const visible = dot(unitP, basis.camPos) > 1.0;
    const rel = sub(P, basis.camPos);
    const cx = dot(rel, basis.right);
    const cy = dot(rel, basis.up);
    const cz = dot(rel, basis.forward);
    if (cz <= 0.05) return { x: -999, y: -999, visible: false };
    const ndcX = cx / (cz * basis.tanHalfFov * basis.aspect);
    const ndcY = cy / (cz * basis.tanHalfFov);
    const { width, height } = this.getViewportSize();
    return {
      x: (ndcX * 0.5 + 0.5) * width,
      y: (0.5 - ndcY * 0.5) * height,
      visible,
    };
  }

  findNearestVisibleSite(clientX, clientY, maxPx = 16) {
    if (!this.sites || !this.sites.length) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best = null;
    let bestDist = maxPx;
    for (const s of this.sites) {
      const p = this.latLonToScreen(s.lat, s.lon);
      if (!p.visible) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
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
    const host = this.canvas.parentElement || this.canvas;
    host.addEventListener('mousedown', (e) => {
      if (this.canvas.hidden) return;
      if (e.target !== this.canvas && !e.target?.closest?.('#globe-overlay')) return;
      if (e.target?.closest?.('.predrop-card')) return;
      this._cameraTween = null;
      this.velYaw = 0;
      this.velPitch = 0;
      this.targetParallaxX = 0;
      this.targetParallaxY = 0;
      this._lastDragMoveTime = performance.now();
      this.dragging = true;
      this.movedDuringDrag = false;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      const targetSiteEl = e.target?.closest?.('[data-site-id]');
      const targetSiteId = targetSiteEl?.dataset?.siteId || targetSiteEl?.getAttribute?.('data-site-id');
      this._pressedSite = targetSiteId
        ? (this.sites.find((s) => s.id === targetSiteId) || this.findNearestVisibleSite(e.clientX, e.clientY, 18))
        : this.findNearestVisibleSite(e.clientX, e.clientY, 18);
      if (Math.hypot(this.parallaxX, this.parallaxY) > 0.0006) {
        this._startAnimLoop();
      }
    });

    const resetHoverParallax = () => {
      const hadHover = this.hoverVec !== null;
      this.hoverVec = null;
      this.targetParallaxX = 0;
      this.targetParallaxY = 0;
      if (hadHover) {
        this.render();
        this.onViewChange();
        this.onHover(null);
      }
      if (Math.hypot(this.parallaxX, this.parallaxY) > 0.0006) {
        this._startAnimLoop();
      }
    };

    window.addEventListener('mousemove', (e) => {
      if (this.dragging && this.lastMouse) {
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        if (Math.hypot(dx, dy) > 3) this.movedDuringDrag = true;
        const stepYaw = -dx * 0.0065;
        const stepPitch = dy * 0.0065;
        this.yaw += stepYaw;
        this.pitch = Math.max(-1.46, Math.min(1.46, this.pitch + stepPitch));
        this.velYaw = Math.max(-0.14, Math.min(0.14, this.velYaw * 0.4 + stepYaw * 0.6));
        this.velPitch = Math.max(-0.14, Math.min(0.14, this.velPitch * 0.4 + stepPitch * 0.6));
        this._lastDragMoveTime = performance.now();
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.render();
        this.onViewChange();
        return;
      }

      const inPredrop = Boolean(e.target?.closest && e.target.closest('.predrop-card'));
      const overGlobe =
        !this.canvas.hidden &&
        (e.target === this.canvas ||
          (host && host.contains(e.target) && !inPredrop));

      if (overGlobe) {
        const rect = this.canvas.getBoundingClientRect();
        this.targetParallaxX = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1));
        this.targetParallaxY = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1));
        const targetSiteEl = e.target?.closest?.('[data-site-id]');
        const targetSiteId = targetSiteEl?.dataset?.siteId || targetSiteEl?.getAttribute?.('data-site-id');
        const siteHit = targetSiteId
          ? this.sites.find((s) => s.id === targetSiteId)
          : this.findNearestVisibleSite(e.clientX, e.clientY, 16);
        let hit;
        if (siteHit) {
          hit = { lat: siteHit.lat, lon: siteHit.lon, siteId: siteHit.id };
          this.hoverVec = latLonToVec3(siteHit.lat, siteHit.lon);
          this.canvas.style.cursor = 'pointer';
        } else {
          hit = this.screenToLatLon(e.clientX, e.clientY);
          this.hoverVec = hit ? latLonToVec3(hit.lat, hit.lon) : null;
          this.canvas.style.cursor = hit ? 'crosshair' : 'grab';
        }
        this.render();
        this.onViewChange();
        this.onHover(hit);
        this._startAnimLoop();
      } else if (this.hoverVec !== null || Math.hypot(this.targetParallaxX, this.targetParallaxY) > 0.0006) {
        resetHoverParallax();
      }
    });

    window.addEventListener('mouseup', (e) => {
      const wasClick = this.dragging && !this.movedDuringDrag && !this.canvas.hidden;
      const sinceMove = performance.now() - this._lastDragMoveTime;
      const pressedSite = this._pressedSite;
      this._pressedSite = null;
      this.dragging = false;
      this.lastMouse = null;
      if (wasClick) {
        this.velYaw = 0;
        this.velPitch = 0;
        const targetSiteEl = e.target?.closest?.('[data-site-id]');
        const targetSiteId = targetSiteEl?.dataset?.siteId || targetSiteEl?.getAttribute?.('data-site-id');
        const siteHit = pressedSite
          || (targetSiteId ? this.sites.find((s) => s.id === targetSiteId) : null)
          || this.findNearestVisibleSite(e.clientX, e.clientY, 18);
        if (siteHit) {
          this.onSelectPoint({ lat: siteHit.lat, lon: siteHit.lon, siteId: siteHit.id });
        } else {
          const hit = this.screenToLatLon(e.clientX, e.clientY);
          if (hit) {
            this.onSelectPoint(hit);
          }
        }
      } else if (sinceMove > 85) {
        this.velYaw = 0;
        this.velPitch = 0;
      } else if (Math.hypot(this.velYaw, this.velPitch) > 0.0002) {
        this._startAnimLoop();
      }
    });

    host.addEventListener('mouseleave', resetHoverParallax);
    if (host !== this.canvas) {
      this.canvas.addEventListener('mouseleave', (e) => {
        if (!e.relatedTarget || !host.contains(e.relatedTarget)) {
          resetHoverParallax();
        }
      });
    }

    host.addEventListener('wheel', (e) => {
      if (this.canvas.hidden) return;
      if (e.target !== this.canvas && !e.target?.closest?.('#globe-overlay')) return;
      e.preventDefault();
      this.distance = Math.max(1.38, Math.min(4.6, this.distance + e.deltaY * 0.0018));
      this.render();
      this.onViewChange();
    }, { passive: false });

    const handleResize = () => {
      if (this.resize()) {
        this.render();
        this.onViewChange();
      }
    };
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(handleResize);
      this._resizeObserver.observe(this.canvas);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
    }
  }

  render() {
    if (this.gl) {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.008, 0.014, 0.032, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const basis = this._cameraBasis();

      // Pass 1: Deep-Space Starfield, Phase-Lit Earth & Solar Corona Parallax
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(this.bgProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bgQuadBuf);
      gl.enableVertexAttribArray(this.bgLoc.aQuad);
      gl.vertexAttribPointer(this.bgLoc.aQuad, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(this.bgLoc.uCamForward, basis.forward);
      gl.uniform3fv(this.bgLoc.uCamRight, basis.right);
      gl.uniform3fv(this.bgLoc.uCamUp, basis.up);
      gl.uniform1f(this.bgLoc.uTanHalfFov, basis.tanHalfFov);
      gl.uniform1f(this.bgLoc.uAspect, basis.aspect);
      gl.uniform2f(this.bgLoc.uParallax, this.parallaxX, this.parallaxY);
      gl.uniform3fv(this.bgLoc.uSunDir, this.sunVec);
      gl.uniform3fv(this.bgLoc.uEarthDir, this.earthVec);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 2: 3D LOLA-Displaced Moon with Steep POM + Horizon Self-Shadowing
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

      gl.uniformMatrix4fv(this.loc.uMvp, false, this._mvpMatrix(basis));
      gl.uniform3fv(this.loc.uCamPos, basis.camPos);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(this.loc.uTex, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
      gl.uniform1i(this.loc.uHeightTex, 1);

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
      const ctx = this.ctx2d;
      const W = this.canvas.width;
      const H = this.canvas.height;
      ctx.fillStyle = '#050811';
      ctx.fillRect(0, 0, W, H);
      const r = Math.min(W, H) * 0.42;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = '#6c727d';
      ctx.fill();
      ctx.strokeStyle = '#62b0ff';
      ctx.stroke();
    }
  }
}
