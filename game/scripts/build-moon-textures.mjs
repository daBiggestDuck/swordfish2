// Builds the Moon textures Rover Run renders with, from NASA's CGI Moon Kit
// (NASA's Scientific Visualization Studio, https://svs.gsfc.nasa.gov/4720/ — public domain, credit SVS):
//
//   lroc_color_poles_4k.tif  LROC WAC colour, 4096×2048, poles filled      → web/assets/moon/moon_color_4k.jpg
//   ldem_16_uint.tif         LOLA elevation, 16 px/deg (5760×2880, uint16) → web/assets/moon/moon_normal_4k.jpg
//
// The normal map stores object-space surface normals (Moon-fixed frame used by src/three/moonFrame.ts:
// x = east at 0°N 90°E, y = north pole, z = 0°N 0°E facing Earth), computed from LOLA slopes with a
// vertical exaggeration so craters read at a distance. The shader tones relief per view.
//
//   node scripts/build-moon-textures.mjs [cacheDir]
//
// Needs macOS `sips` (TIFF/LZW decode and JPEG encode) and network on first run. Re-run is cached.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const cache = resolve(process.argv[2] || join(here, "../.cache/moonkit"));
const outDir = join(repo, "web/assets/moon");
const BASE = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720";

mkdirSync(cache, { recursive: true });
mkdirSync(outDir, { recursive: true });

function fetchOnce(name) {
  const file = join(cache, name);
  if (!existsSync(file)) {
    console.log(`downloading ${name} …`);
    execFileSync("curl", ["-sS", "-L", "--fail", "-o", file, `${BASE}/${name}`], { stdio: "inherit" });
  }
  return file;
}

// ------------------------------------------------------------------ colour

const colorTif = fetchOnce("lroc_color_poles_4k.tif");
const colorOut = join(outDir, "moon_color_4k.jpg");
execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "84", colorTif, "--out", colorOut], { stdio: "ignore" });
console.log(`wrote ${colorOut}`);

// ------------------------------------------------------------------ elevation → normals

const demTif = fetchOnce("ldem_16_uint.tif");
const buf = readFileSync(demTif);
const le = buf.toString("latin1", 0, 2) === "II";
const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
const ifd = u32(4);
const tags = {};
for (let i = 0, n = u16(ifd); i < n; i++) {
  const e = ifd + 2 + i * 12;
  tags[u16(e)] = { type: u16(e + 2), count: u32(e + 4), value: u16(e + 2) === 3 && u32(e + 4) === 1 ? u16(e + 8) : u32(e + 8) };
}
const W = tags[256].value;
const H = tags[257].value;
if (tags[258].value !== 16 || tags[259].value !== 1) throw new Error("expected uncompressed 16-bit DEM");
const rowsPerStrip = tags[278]?.value ?? H;
const stripOffsets = tags[273];
const stripOffset = (s) => (stripOffsets.count === 1 ? stripOffsets.value : u32(stripOffsets.value + 4 * s));

// Height in km relative to the 1737.4 km sphere: value × 0.5 m − 10 km
// (checked: Malapert A ≈ +2.7 km, Mons Mouton ≈ +5.3 km, Mare Crisium ≈ −3.6 km).
const dem = new Float32Array(W * H);
for (let r = 0; r < H; r++) {
  const s = Math.floor(r / rowsPerStrip);
  const base = stripOffset(s) + (r % rowsPerStrip) * W * 2;
  for (let c = 0; c < W; c++) dem[r * W + c] = (u16(base + c * 2) * 0.5 - 10000) / 1000;
}

const R_KM = 1737.4;
const DEG = Math.PI / 180;
function height(latDeg, lonDeg) {
  // equirectangular, row 0 = +90°, col 0 = −180°; bilinear, longitude wraps, latitude clamps
  const y = Math.min(H - 1, Math.max(0, ((90 - latDeg) / 180) * H - 0.5));
  let x = ((lonDeg + 180) / 360) * W - 0.5;
  x = ((x % W) + W) % W;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = (x0 + 1) % W, y1 = Math.min(H - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const a = dem[y0 * W + x0], b = dem[y0 * W + x1], c = dem[y1 * W + x0], d = dem[y1 * W + x1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

const OUT_W = 4096;
const OUT_H = 2048;
const EXAGGERATION = 6;
const stepDeg = 180 / H; // one DEM pixel of latitude
const stepKm = stepDeg * DEG * R_KM;

// 24-bit BMP, bottom-up rows
const rowBytes = Math.ceil((OUT_W * 3) / 4) * 4;
const bmp = Buffer.alloc(54 + rowBytes * OUT_H);
bmp.write("BM", 0, "latin1");
bmp.writeUInt32LE(bmp.length, 2);
bmp.writeUInt32LE(54, 10);
bmp.writeUInt32LE(40, 14);
bmp.writeInt32LE(OUT_W, 18);
bmp.writeInt32LE(OUT_H, 22);
bmp.writeUInt16LE(1, 26);
bmp.writeUInt16LE(24, 28);
bmp.writeUInt32LE(rowBytes * OUT_H, 34);

for (let j = 0; j < OUT_H; j++) {
  const lat = 90 - ((j + 0.5) / OUT_H) * 180;
  const phi = lat * DEG;
  const cosLat = Math.cos(phi), sinLat = Math.sin(phi);
  // isotropic finite differences: the east step covers about the same ground distance as the north step
  const lonStep = Math.min(90, stepDeg / Math.max(cosLat, 1e-4));
  const eastKm = lonStep * DEG * R_KM * Math.max(cosLat, 1e-4);
  const row = 54 + (OUT_H - 1 - j) * rowBytes;
  for (let i = 0; i < OUT_W; i++) {
    const lon = -180 + ((i + 0.5) / OUT_W) * 360;
    const lam = lon * DEG;
    const gN = (height(Math.min(90, lat + stepDeg), lon) - height(Math.max(-90, lat - stepDeg), lon)) / (2 * stepKm);
    const gE = (height(lat, lon + lonStep) - height(lat, lon - lonStep)) / (2 * eastKm);
    const sinLon = Math.sin(lam), cosLon = Math.cos(lam);
    // unit vectors in the Moon-fixed frame
    const up = [cosLat * sinLon, sinLat, cosLat * cosLon];
    const east = [cosLon, 0, -sinLon];
    const north = [-sinLat * sinLon, cosLat, -sinLat * cosLon];
    let nx = up[0] - EXAGGERATION * (gE * east[0] + gN * north[0]);
    let ny = up[1] - EXAGGERATION * (gE * east[1] + gN * north[1]);
    let nz = up[2] - EXAGGERATION * (gE * east[2] + gN * north[2]);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const o = row + i * 3;
    bmp[o] = Math.round((nz * 0.5 + 0.5) * 255); // B
    bmp[o + 1] = Math.round((ny * 0.5 + 0.5) * 255); // G
    bmp[o + 2] = Math.round((nx * 0.5 + 0.5) * 255); // R
  }
}

const tmpBmp = join(cache, "moon_normal_4k.bmp");
writeFileSync(tmpBmp, bmp);
const normalOut = join(outDir, "moon_normal_4k.jpg");
execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "80", tmpBmp, "--out", normalOut], { stdio: "ignore" });
rmSync(tmpBmp);
console.log(`wrote ${normalOut}`);

// ------------------------------------------------------------------ south pole, LOLA 240 m/px

// LDEM_75S_240M (NASA PDS, LRO LOLA GDR): 3812×3812 int16 LE, height = DN × 0.5 m, polar stereographic
// centred on the south pole, 240 m/px, projection offset 1905.5 px. Orientation checked against the
// global map: sample = 1905.5 + x/240, line = 1905.5 − y/240 with x = ρ·sin λ, y = ρ·cos λ (r = 0.9992).
const POLAR_URL = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_75s_240m.img";
const polarImg = join(cache, "ldem_75s_240m.img");
if (!existsSync(polarImg)) {
  console.log("downloading ldem_75s_240m.img …");
  execFileSync("curl", ["-sS", "-L", "--fail", "-o", polarImg, POLAR_URL], { stdio: "inherit" });
}
const pbuf = readFileSync(polarImg);
const PN = 3812;
const P_SCALE_M = 240;
const P_OFF = 1905.5;
const R_M = 1737400;
const pdem = new Float32Array(PN * PN);
for (let i = 0; i < PN * PN; i++) pdem[i] = pbuf.readInt16LE(2 * i) * 0.5;
const pAt = (s, l) => pdem[Math.min(PN - 1, Math.max(0, l)) * PN + Math.min(PN - 1, Math.max(0, s))];
function pSample(sx, ly) {
  const s0 = Math.floor(sx), l0 = Math.floor(ly), fs = sx - s0, fl = ly - l0;
  return pAt(s0, l0) * (1 - fs) * (1 - fl) + pAt(s0 + 1, l0) * fs * (1 - fl) + pAt(s0, l0 + 1) * (1 - fs) * fl + pAt(s0 + 1, l0 + 1) * fs * fl;
}

// Output covers latitudes ≤ CAP_LAT (shader blends to the global map just outside it).
export const CAP_LAT = -77;
const rhoMax = 2 * R_M * Math.tan(Math.PI / 4 + (CAP_LAT * DEG) / 2);
const CAP_N = 3072;
const POLAR_EXAGGERATION = 6;
const cRow = Math.ceil((CAP_N * 3) / 4) * 4;
const cap = Buffer.alloc(54 + cRow * CAP_N);
bmp.copy(cap, 0, 0, 54);
cap.writeUInt32LE(cap.length, 2);
cap.writeInt32LE(CAP_N, 18);
cap.writeInt32LE(CAP_N, 22);
cap.writeUInt32LE(cRow * CAP_N, 34);
for (let j = 0; j < CAP_N; j++) {
  const y = (1 - ((j + 0.5) / CAP_N) * 2) * rhoMax; // image top = +y
  const out = 54 + (CAP_N - 1 - j) * cRow;
  for (let i = 0; i < CAP_N; i++) {
    const x = (((i + 0.5) / CAP_N) * 2 - 1) * rhoMax;
    const rho = Math.hypot(x, y);
    const lam = Math.atan2(x, y);
    const phi = 2 * Math.atan(rho / (2 * R_M)) - Math.PI / 2; // inverse of ρ = 2R·tan(π/4 + φ/2)
    const sx = P_OFF + x / P_SCALE_M - 0.5;
    const ly = P_OFF - y / P_SCALE_M - 0.5;
    const dhdx = (pSample(sx + 1, ly) - pSample(sx - 1, ly)) / (2 * P_SCALE_M);
    const dhdy = -(pSample(sx, ly + 1) - pSample(sx, ly - 1)) / (2 * P_SCALE_M);
    const k = 2 / (1 - Math.sin(phi)); // stereographic scale factor: ground slope = map slope × k
    const sinL = Math.sin(lam), cosL = Math.cos(lam);
    const gN = (dhdx * sinL + dhdy * cosL) * k; // away from the pole = north
    const gE = (dhdx * cosL - dhdy * sinL) * k;
    const cosP = Math.cos(phi), sinP = Math.sin(phi);
    const up = [cosP * sinL, sinP, cosP * cosL];
    const east = [cosL, 0, -sinL];
    const north = [-sinP * sinL, cosP, -sinP * cosL];
    let nx = up[0] - POLAR_EXAGGERATION * (gE * east[0] + gN * north[0]);
    let ny = up[1] - POLAR_EXAGGERATION * (gE * east[1] + gN * north[1]);
    let nz = up[2] - POLAR_EXAGGERATION * (gE * east[2] + gN * north[2]);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const o = out + i * 3;
    cap[o] = Math.round((nz * 0.5 + 0.5) * 255);
    cap[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    cap[o + 2] = Math.round((nx * 0.5 + 0.5) * 255);
  }
}
const capBmp = join(cache, "moon_south_normal.bmp");
writeFileSync(capBmp, cap);
const capOut = join(outDir, "moon_south_normal.jpg");
execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "80", capBmp, "--out", capOut], { stdio: "ignore" });
rmSync(capBmp);
console.log(`wrote ${capOut} (lat ≤ ${CAP_LAT}°, ${((2 * rhoMax) / CAP_N).toFixed(0)} m/px)`);
