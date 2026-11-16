// Payload Pets: the lunar day, in 3D. Akshay's slide lands on the Moon and Pranav's slide picks
// the pets; this page is the game: drive the rover with your two pets through one 14-day lunar day.
// Pets and site come from the URL: rover.html?pets=lister,ln-1&site=MARE_CRISIUM
import { createStoryClient } from './story-client.js';
import { getThree, buildPetModel } from './pets-3d/pets3d.js';

const $ = (s) => document.querySelector(s);
const DAY_SECS = 354;         // lunar daylight lasts about 354 hours: 1 second = 1 hour
const NIGHT_SECS = 177;       // the 14-day lunar night, time-lapsed at 2 hours per second
const PET_COLORS = { lister: '#ffb84d', retro: '#62b0ff', eds: '#a9b6ff', 'ln-1': '#45d48a' };

let THREE, renderer, scene, camera, sun, sunSprite, hemi, fill, rover, wheels = [], beacon, dust;
const petRigs = [];
let pets = [], sites = [], chosen = [], site = null;
const story = [createStoryClient(), createStoryClient()];
const seen = new Set(), found = [], toastQueue = [];
let phase = 'loading', t = 0, phaseT = 0, dayP = 0, power = 80, warmth = 70;
let toastUntil = 0, lastPoll = 0, polling = false, lastChapter = '';
const car = { x: 0, z: 0, heading: 0, speed: 0, wheel: 0, quat: null };
const keys = new Set();
let edgeWarned = false, earthSprite = null, earthGlow = null, earthUp = true;
const care = { tracking: false, heater: false };
const rv = { odo: 0, sent: 0, maxSun: 0, hull: 100, hits: 0 };
let lastSend = -1, sleepReady = false, survived = null, epi = -1;
let ROCKS = [], shake = 0;
const cam = { yaw: 0, pitch: 0.32, dist: 8.5, dragging: false, lx: 0, ly: 0, mode: 'fp', lookYaw: 0, lookPitch: -0.2 };
const WORLD = 650; // half-size of the block world, in blocks

// ---------------------------------------------------------------- terrain (same formula for mesh + rover)
let SUN_MAX = 60 * Math.PI / 180; // highest the Sun gets at this site: 90 - |latitude| (set at boot)
let CRATERS = makeCraters(7);
function makeCraters(seed) {
  let s = seed;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // many small craters, a few big ones (like the real Moon)
  return Array.from({ length: 900 }, () => { const k = r(); return { x: (r() - .5) * 1340, z: (r() - .5) * 1340, r: 1.2 + Math.pow(k, 3) * 30, d: .25 + r() * .5 }; })
    .map((c) => ({ ...c, d: c.d * Math.min(4, c.r * .22) }));
}
function heightAt(x, z) {
  let h = Math.sin(x * .018) * 2.2 + Math.cos(z * .015) * 1.8 + Math.sin((x + z) * .043) * .7
    + Math.sin(x * .11 + 1.7) * Math.cos(z * .09) * .25 + Math.sin(x * .37) * Math.sin(z * .41) * .05;
  for (const c of CRATERS) {
    const dx = x - c.x, dz = z - c.z;
    if (Math.abs(dx) > c.r * 1.7 || Math.abs(dz) > c.r * 1.7) continue;
    const q = Math.hypot(dx, dz) / c.r;
    if (q < 1) h -= c.d * (1 - q * q);
    h += c.d * .32 * Math.exp(-((q - 1) ** 2) / .045);
  }
  return h;
}
const blockTop = heightAt; // (kept name) ground height at x, z

/** Fractal value-noise texture: used as a bump map for fine regolith detail. */
function noiseTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const octave = (cells, amp, out) => {
    const grid = Array.from({ length: (cells + 1) * (cells + 1) }, () => Math.random());
    const at = (i, j) => grid[(j % cells) * (cells + 1) + (i % cells)];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x / size * cells, fy = y / size * cells, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
      const a = at(i, j) * (1 - u) + at(i + 1, j) * u, b = at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u;
      out[y * size + x] += (a * (1 - v) + b * v) * amp;
    }
  };
  const acc = new Float32Array(size * size);
  [[8, .45], [16, .25], [32, .15], [64, .1], [128, .05]].forEach(([c2, a]) => octave(c2, a, acc));
  for (let i = 0; i < acc.length; i++) { const v = Math.max(0, Math.min(255, acc[i] * 255)); img.data.set([v, v, v, 255], i * 4); }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function buildTerrain() {
  const SIZE = 1400, SEG = 340;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const bump = noiseTexture();
  bump.repeat.set(230, 230);
  const mat = new THREE.MeshStandardMaterial({ color: 0xb9b8b6, roughness: 1, metalness: 0, bumpMap: bump, bumpScale: 2.2 });
  // real lunar surface photo (NASA LROC WAC, from the map branch's assets)
  new THREE.TextureLoader().load('../assets/lroc_wac_global.jpg', (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(9, 9);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    mat.map = tex;
    mat.color.set(0xd6d4d0);
    mat.needsUpdate = true;
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // boulders: lumpy rocks of many sizes, partly buried
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(rp, i);
    const n = 1 + .22 * Math.sin(v.x * 3.1 + v.y * 2.3) + .12 * Math.cos(v.z * 4.7 + v.x) + (Math.random() - .5) * .08;
    v.multiplyScalar(n);
    v.y *= .65;
    rp.setXYZ(i, v.x, v.y, v.z);
  }
  rockGeo.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8e8c89, roughness: .96, bumpMap: bump, bumpScale: 3 });
  const N = 1500, hitRocks = [];
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let rs = 99;
  const r = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < N; i++) {
    let x = (r() - .5) * 1260, z = (r() - .5) * 1260;
    if (Math.hypot(x, z) < 6) x += 12;
    const size = .06 + Math.pow(r(), 4) * 1.6;
    sc.set(size * (.8 + r() * .5), size * (.7 + r() * .5), size * (.8 + r() * .5));
    p.set(x, heightAt(x, z) + size * .15, z);
    q.setFromEuler(e.set(r() * 6, r() * 6, r() * 6));
    rocks.setMatrixAt(i, m.compose(p, q, sc));
    if (size > .35) hitRocks.push({ x, z, r: Math.max(sc.x, sc.z) * .95 });
  }
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);
  ROCKS = hitRocks;
}

// ---------------------------------------------------------------- sky
function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function buildSky() {
  scene.background = new THREE.Color(0x000004);
  const n = 4000, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 900;
    const s = Math.sqrt(1 - u * u);
    arr.set([r * s * Math.cos(a), Math.abs(r * u) + 20, r * s * Math.sin(a)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false })));
  // Earth hangs in the lunar sky: NASA Blue Marble photo (black background blends away)
  const earthMat = new THREE.SpriteMaterial({ map: new THREE.TextureLoader().load('img/earth.jpg', (tx) => { tx.colorSpace = THREE.SRGBColorSpace; }), blending: THREE.AdditiveBlending, depthWrite: false });
  earthSprite = new THREE.Sprite(earthMat);
  earthSprite.scale.set(60, 60, 1);
  earthSprite.position.set(-240, 190, -520);
  scene.add(earthSprite);
  const ec = document.createElement('canvas');
  ec.width = 256; ec.height = 128;
  const eg = ec.getContext('2d');
  eg.fillStyle = '#1d58c4'; eg.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 60; i++) { eg.fillStyle = i % 3 ? '#3f9b5a' : '#f2f5ff'; eg.beginPath(); eg.ellipse(Math.random() * 256, Math.random() * 128, 6 + Math.random() * 22, 3 + Math.random() * 9, Math.random(), 0, Math.PI * 2); eg.fill(); }
  const etex = new THREE.CanvasTexture(ec);
  etex.colorSpace = THREE.SRGBColorSpace;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(22, 48, 32), new THREE.MeshStandardMaterial({ map: etex, emissive: 0x0b2a66, emissiveIntensity: .35, roughness: .8 }));
  earth.position.set(-240, 190, -520);
  earth.visible = false; // replaced by the photo above
  const glow = earthGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture([[0, 'rgba(120,180,255,.55)'], [1, 'rgba(120,180,255,0)']]), depthWrite: false }));
  glow.scale.set(74, 74, 1);
  glow.position.copy(earth.position);
  scene.add(glow);
  // Sun disc
  sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture([[0, '#ffffff'], [.12, '#fff3c4'], [.3, 'rgba(255,214,120,.55)'], [1, 'rgba(255,200,90,0)']]), depthWrite: false }));
  sunSprite.scale.set(170, 170, 1);
  sunSprite.material.blending = THREE.AdditiveBlending;
  scene.add(sunSprite);
}

// ---------------------------------------------------------------- rover
function wireTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#7d7f86'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#c9ccd4'; g.lineWidth = 2;
  for (let i = -64; i < 128; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke(); }
  g.fillStyle = '#3c3e45'; for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 5, 64); // chevron treads
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let solarPanel = null;
function buildRover() {
  rover = new THREE.Group();
  const alu = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: .32, metalness: .85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2e35, roughness: .6, metalness: .4 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc8962c, roughness: .22, metalness: 1 });
  const fender = new THREE.MeshStandardMaterial({ color: 0xa7814a, roughness: .4, metalness: .7, side: THREE.DoubleSide });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x5d6270, roughness: .9 });
  const add = (geo, mat, x, y, z, parent = rover) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const tube = (len, x, y, z, rx = 0, ry = 0, rz = 0, r = .03, mat = alu) => { const m = add(new THREE.CylinderGeometry(r, r, len, 10), mat, x, y, z); m.rotation.set(rx, ry, rz); return m; };

  // chassis: floor pan + tube frame
  add(new THREE.BoxGeometry(2.7, .05, 1.25), dark, 0, .62, 0);
  for (const z of [-.66, .66]) tube(2.9, 0, .66, z, 0, 0, Math.PI / 2, .035);
  for (const x of [-1.25, -.4, .45, 1.25]) tube(1.32, x, .66, 0, Math.PI / 2, 0, 0, .03);
  // fenders over each wheel
  for (const [x, z] of [[-1.05, .78], [1.05, .78], [-1.05, -.78], [1.05, -.78]]) {
    const f = add(new THREE.CylinderGeometry(.5, .5, .3, 24, 1, true, 0, Math.PI), fender, x, .48, z);
    f.rotation.set(Math.PI / 2, 0, 0);
  }
  // wheels: wire-mesh tyres with chevrons + hubs
  const wire = new THREE.MeshStandardMaterial({ map: wireTexture(), roughness: .6, metalness: .75 });
  for (const [x, z] of [[-1.05, .78], [1.05, .78], [-1.05, -.78], [1.05, -.78]]) {
    const w = new THREE.Group();
    w.position.set(x, .42, z);
    add(new THREE.CylinderGeometry(.41, .41, .23, 32, 1, true), wire, 0, 0, 0, w).rotation.x = Math.PI / 2;
    const hubDisc = add(new THREE.CylinderGeometry(.2, .2, .2, 20), alu, 0, 0, 0, w);
    hubDisc.rotation.x = Math.PI / 2;
    for (let k = 0; k < 6; k++) { const sp = add(new THREE.BoxGeometry(.78, .025, .025), alu, 0, 0, 0, w); sp.rotation.z = k * Math.PI / 6; }
    rover.add(w);
    wheels.push(w);
    tube(.38, x, .55, z * .82, 0, 0, 0, .025, dark); // suspension strut
  }
  // two seats (the pets ride here)
  for (const z of [-.33, .33]) {
    add(new THREE.BoxGeometry(.5, .05, .46), fabric, -.15, .78, z);
    const back = add(new THREE.BoxGeometry(.05, .5, .46), fabric, -.42, 1.02, z);
    back.rotation.z = -.15;
    back.userData.fpHide = true;
    tube(.5, -.42, .9, z + .22, 0, 0, -.15, .015);
    tube(.5, -.42, .9, z - .22, 0, 0, -.15, .015);
  }
  // control console with glowing readouts
  const con = add(new THREE.BoxGeometry(.18, .32, .5), dark, .62, .98, 0);
  con.rotation.z = .35;
  beacon = add(new THREE.BoxGeometry(.02, .05, .3), new THREE.MeshStandardMaterial({ color: 0x9fe0ff, emissive: 0x4fb8ff, emissiveIntensity: 1.6 }), .56, 1.05, 0);
  beacon.rotation.z = .35;
  // rear pallet: tool boxes in gold foil + fold-out solar panel
  add(new THREE.BoxGeometry(.5, .32, 1.0), gold, -1.05, .84, 0).userData.fpHide = true;
  add(new THREE.BoxGeometry(.32, .22, .34), alu, -1.0, 1.08, .28).userData.fpHide = true;
  solarPanel = new THREE.Group();
  solarPanel.position.set(-1.1, 1.18, -.25);
  const cells = add(new THREE.BoxGeometry(.04, .55, .8), new THREE.MeshStandardMaterial({ color: 0x1a3a8f, roughness: .2, metalness: .7, emissive: 0x081a40, emissiveIntensity: .5 }), 0, .3, 0, solarPanel);
  cells.userData.fpHide = true;
  solarPanel.userData.fpHide = true;
  rover.add(solarPanel);
  // high-gain "umbrella" antenna on a mast + TV camera, front left
  tube(1.0, .95, 1.15, -.62, 0, 0, 0, .02);
  const dish = add(new THREE.ConeGeometry(.3, .12, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: .5, metalness: .3, side: THREE.DoubleSide }), .95, 1.68, -.62);
  dish.rotation.set(.5, 0, -.6);
  add(new THREE.BoxGeometry(.16, .12, .12), gold, 1.05, 1.0, .45);
  // headlight
  const lamp = new THREE.SpotLight(0xdfe9ff, 5, 24, .55, .6, 1.4);
  lamp.position.set(1.35, .95, 0);
  lamp.target.position.set(6, 0, 0);
  rover.add(lamp, lamp.target);
  scene.add(rover);
}

async function addPets() {
  const slots = [[-.12, .33], [-.12, -.33]];
  for (let i = 0; i < chosen.length; i++) {
    const p = await buildPetModel(chosen[i].id, 'happy');
    const holder = new THREE.Group();
    holder.add(p.root);
    // scale every model to the same size so both fit on the deck
    const box = new THREE.Box3().setFromObject(p.root);
    const size = box.getSize(new THREE.Vector3());
    const s = 0.62 / Math.max(size.x, size.y, size.z, .001);
    holder.scale.setScalar(s);
    holder.position.set(slots[i][0], .81 - box.min.y * s, slots[i][1]);
    holder.rotation.y = -Math.PI / 2 + (i ? .2 : -.2);
    holder.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    rover.add(holder);
    petRigs.push({ ...p, holder, id: chosen[i].id, mood: 'happy' });
  }
}

// ---------------------------------------------------------------- dust
function buildDust() {
  const N = 260;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8d8de, size: .16, transparent: true, opacity: .7, depthWrite: false }));
  dust.userData = { vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0, N };
  dust.frustumCulled = false;
  scene.add(dust);
}
function emitDust(x, y, z) {
  const d = dust.userData, i = d.next = (d.next + 1) % d.N;
  dust.geometry.attributes.position.setXYZ(i, x, y, z);
  d.vel.set([(Math.random() - .5) * 1.2, 1 + Math.random() * 1.4, (Math.random() - .5) * 1.2], i * 3);
  d.life[i] = 1.4;
}
function stepDust(dt) {
  const d = dust.userData, pos = dust.geometry.attributes.position;
  for (let i = 0; i < d.N; i++) {
    if (d.life[i] <= 0) { pos.setY(i, -999); continue; }
    d.life[i] -= dt;
    d.vel[i * 3 + 1] -= 1.62 * dt;   // lunar gravity
    pos.setXYZ(i, pos.getX(i) + d.vel[i * 3] * dt, pos.getY(i) + d.vel[i * 3 + 1] * dt, pos.getZ(i) + d.vel[i * 3 + 2] * dt);
  }
  pos.needsUpdate = true;
}

// ---------------------------------------------------------------- HUD (CSS transition hooks)
function enter(el) { el.classList.add('is-entering'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-entering'))); }
function log(text, strong) {
  const li = document.createElement('li');
  if (strong) { const b = document.createElement('b'); b.textContent = strong; li.append(b); }
  li.append(document.createTextNode(text));
  $('#log').append(li);
  enter(li);
  while ($('#log').childElementCount > 7) $('#log').firstElementChild.remove();
}
function setChapter(text) {
  if (text === lastChapter) return;
  lastChapter = text;
  const el = $('#chapter');
  el.textContent = text;
  enter(el);
}
function banner(title, text, secs = 3) {
  $('#banner-title').textContent = title;
  $('#banner-text').textContent = text;
  $('#banner').classList.add('is-visible');
  setTimeout(() => $('#banner').classList.remove('is-visible'), secs * 1000);
}
function showToast(m) {
  $('#toast-title').textContent = m.title;
  $('#toast-text').textContent = m.text;
  $('#toast-src').href = m.sourceUrl;
  $('#toast').classList.add('is-visible');
  toastUntil = t + 6.5;
}
function renderCrew() {
  $('#crew').replaceChildren(...petRigs.map((r) => {
    const p = chosen.find((c) => c.id === r.id);
    const chip = document.createElement('div');
    chip.className = 'pet-chip';
    chip.style.setProperty('--c', PET_COLORS[r.id] || '#62b0ff');
    chip.innerHTML = '<i class="pet-dot"></i><div><b></b><span></span></div>';
    chip.querySelector('b').textContent = p.name;
    chip.querySelector('span').innerHTML = `${p.instrument || ''} · <span class="mood"></span>`;
    chip.querySelector('.mood').textContent = r.mood;
    return chip;
  }));
}
function sendData() {
  if (phase !== 'day' && phase !== 'night') return;
  if (!earthUp) { banner('No signal', 'Earth is below the horizon here', 1.8); return; }
  if (power < 12) { banner('Low power', 'Charge up before sending data', 1.8); return; }
  power -= 8;
  rv.sent++;
  lastSend = t;
  petDo('hop', 1.2, `${who('ln-1', 'retro')} beams the data home`);
  log('Science data sent home to Earth.', `Day ${Math.max(1, Math.ceil(dayP * 14))}`);
  renderMeters();
}
function renderCare() {
  for (const [id, on, text] of [['#opt-track', care.tracking, care.tracking ? 'Solar panel: tracking the Sun' : 'Solar panel: stowed'], ['#opt-heat', care.heater, care.heater ? 'Heater: on' : 'Heater: off']]) {
    const b = $(id);
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('span').textContent = text;
  }
}
function renderMeters() {
  for (const [id, v] of [['power', power], ['warmth', warmth]]) {
    const bar = $(`#m-${id}`);
    bar.style.width = `${v}%`;
    bar.classList.toggle('low', v < 25);
    $(`#v-${id}`).textContent = Math.round(v);
  }
}

// ---------------------------------------------------------------- activities, flag, minimap
const NASA_BG1 = 'https://www.nasa.gov/news-release/touchdown-carrying-nasa-science-fireflys-blue-ghost-lands-on-moon/';
const NASA_PRIME1 = 'https://www.nasa.gov/centers-and-facilities/kennedy/nasas-polar-ice-experiment-paves-way-for-future-moon-missions/';
const NASA_LN1 = 'https://www.nasa.gov/centers-and-facilities/marshall/nasa-lights-beacon-on-moon-with-autonomous-navigation-system-test/';
const FLAG = { x: 5, z: 3 };
const ACTS = [];
let mapT = 0;

function marker(x, z, color, radius) {
  const g = new THREE.Group();
  g.position.set(x, heightAt(x, z), z);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 70, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 35;
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - .35, radius, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .2;
  g.add(beam, ring);
  scene.add(g);
  return { group: g, beam, ring };
}
function markDone(m) {
  m.beam.material.color.set(0x45d48a); m.beam.material.opacity = .12;
  m.ring.material.color.set(0x45d48a);
}

function buildActivities() {
  // 1. three regolith samples near the landing site
  const samples = [[46, .6], [72, 2.4], [98, 4.3]].map(([d, a]) => ({ x: Math.cos(a) * d, z: Math.sin(a) * d }));
  ACTS.push({ id: 'samples', name: 'Collect 3 regolith samples', radius: 3.5,
    targets: samples.map((p) => ({ ...p, done: false, m: marker(p.x, p.z, 0xF97316, 3.5) })),
    story: { title: 'Samples collected!', text: "Your pets bagged 3 regolith samples. Blue Ghost 1 carried NASA's Lunar PlanetVac to test a new way of picking up Moon soil.", sourceUrl: NASA_BG1 } });
  // 2. ice scan in the nearest large crater (cold and dark inside)
  const crater = CRATERS.filter((c) => c.r > 7 && Math.hypot(c.x, c.z) > 60 && Math.hypot(c.x, c.z) < WORLD - 120)
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0] || { x: 120, z: -80, r: 10 };
  ACTS.push({ id: 'ice', name: 'Scan for water ice in a crater', radius: Math.min(9, crater.r * .55), hold: 0, need: 6,
    targets: [{ x: crater.x, z: crater.z, done: false, m: marker(crater.x, crater.z, 0x44e2ff, Math.min(9, crater.r * .55)) }],
    story: { title: 'Ice scan complete!', text: "You scanned the crater floor for ice. NASA's PRIME-1 drill hunted for ice near the south pole, because ice could one day give astronauts water.", sourceUrl: NASA_PRIME1 } });
  // 3. navigation beacon on the highest nearby hilltop (needs Earth in view)
  let best = { x: 150, z: 150, h: -1e9 };
  for (let a = 0; a < Math.PI * 2; a += .15) for (let d = 90; d < 280; d += 15) {
    const x = Math.cos(a) * d, z = Math.sin(a) * d, h = heightAt(x, z);
    if (h > best.h) best = { x, z, h };
  }
  ACTS.push({ id: 'beacon', name: 'Plant a nav beacon on the hilltop', radius: 5, hold: 0, need: 4, needsEarth: true,
    targets: [{ x: best.x, z: best.z, done: false, m: marker(best.x, best.z, 0x8e9bff, 5) }],
    story: { title: 'Beacon online!', text: 'Your beacon now helps future explorers find their way. NASA tested the same idea with LN-1, a navigation beacon on IM-1.', sourceUrl: NASA_LN1 } });
  // 4. back to the flag before night
  ACTS.push({ id: 'home', name: 'Return to your landing flag', radius: 9, hold: 0, need: 2,
    targets: [{ x: FLAG.x, z: FLAG.z, done: false, m: marker(FLAG.x, FLAG.z, 0xffffff, 9) }],
    story: { title: 'Safe at base', text: 'Your pets are parked by the flag, powered down and ready for the two-week lunar night.', sourceUrl: NASA_BG1 } });
}

function resetActivities() {
  for (const a of ACTS) {
    a.hold = 0; a.step = 0; a.stepAt = 0; a.targetsAt = 0; a.completed = false; a.warned = false;
    for (const tg of a.targets) {
      tg.done = false;
      const col = actColor(a);
      tg.m.beam.material.color.set(col); tg.m.beam.material.opacity = .32; tg.m.ring.material.color.set(col);
    }
  }
}
const targetsDone = (a) => a.targets.every((tg) => tg.done);
const actDone = (a) => targetsDone(a) && (a.step || 0) >= (a.extra ? a.extra.length : 0);
function setupSteps() {
  const by = (id) => ACTS.find((a) => a.id === id);
  by('samples').extra = [{ label: 'Send the sample data to Earth', hint: 'Press F while Earth is in view. Sending costs some power.', test: (a) => lastSend > a.stepAt }];
  const ice = by('ice');
  ice.needsHeater = true;
  ice.extra = [{ label: 'Drive out of the crater and send the results', hint: 'Leave the crater, then press F with Earth in view.', test: (a) => lastSend > a.stepAt && Math.hypot(car.x - ice.targets[0].x, car.z - ice.targets[0].z) > ice.radius }];
  const b = by('beacon');
  b.needsPower = 50;
  b.extra = [{ label: 'Test the beacon: send a ping home', hint: 'Press F to ping Earth through your new beacon.', test: (a) => lastSend > a.stepAt }];
  by('home').extra = [{ label: 'Sleep mode: stow the solar panel and turn the heater on', hint: 'Panel off (P) and heater on (H). Sleep mode halves the power you use at night.', test: () => !care.tracking && care.heater }];
  for (const a of ACTS) { a.step = 0; a.stepAt = 0; }
  const lat = Math.abs(site.lat || 0), id = site.id || '';
  if (id.startsWith('MARE_CRISIUM')) {
    Object.assign(ice, { name: 'Drill a heat-flow probe into the crater floor', needsHeater: false,
      story: { title: 'Heat flow measured!', text: 'Your probe measured heat flowing up from inside the Moon. LISTER did this for real at Mare Crisium on Blue Ghost 1.', sourceUrl: NASA_BG1 } });
    Object.assign(CHAPTERS.ice, { title: 'Heat From Below', text: 'How hot is the inside of the Moon? Drill a probe into the crater floor and find out.', hint: 'Drive into the crater, park and hold still while the drill runs.' });
  } else if (id.startsWith('REINER_GAMMA')) {
    Object.assign(ice, { name: 'Map the magnetic swirl', needsHeater: false,
      story: { title: 'Swirl mapped!', text: "You measured Reiner Gamma's mysterious magnetic field. NASA's IM-3 mission is headed here to study it.", sourceUrl: 'https://science.nasa.gov/lunar-science/clps-deliveries/' } });
    Object.assign(CHAPTERS.ice, { title: 'The Magnetic Swirl', text: 'The bright swirls here sit on a patch of magnetic field. Nobody knows exactly why.', hint: 'Drive into the marked swirl, park and hold still while you measure.' });
  } else if (lat < 60) {
    ice.needsHeater = false;
  }
}

// The story: one objective at a time, each its own chapter.
const CHAPTERS = {
  samples: { n: 1, title: 'Touchdown', text: 'Your pets made it to the Moon. First job: collect soil samples around the landing site.', hint: 'Drive onto each glowing orange beam. Follow the dot on your minimap.' },
  ice: { n: 2, title: 'Into the Dark', text: 'Scientists want to know if ice hides in the cold shadows of craters.', hint: 'Drive into the crater and hold still while you scan. It is cold in there: watch your warmth.' },
  beacon: { n: 3, title: 'Phone Home', text: 'Climb the highest hill and plant a beacon where Earth can see it.', hint: 'Park on the hilltop and hold still. Earth must be above the horizon.' },
  home: { n: 4, title: 'Race the Sunset', text: 'The Sun is going down. Get your pets back to the flag before the long night.', hint: 'Drive back to your flag and park.' },
};
function actColor(a) { return a.id === 'samples' ? 0xF97316 : a.id === 'ice' ? 0x44e2ff : a.id === 'beacon' ? 0x8e9bff : 0xffffff; }
const current = () => ACTS.find((a) => !actDone(a)) || null;
let shownChapter = null, cineUntil = 0;

function cutscene(kicker, title, text, secs = 3.6) {
  $('#cine-kicker').textContent = kicker;
  $('#cine-title').textContent = title;
  $('#cine-text').textContent = text;
  $('#cine').classList.add('is-on');
  document.body.classList.add('cinematic');
  cineUntil = t + secs;
}
function endCutscene() { $('#cine').classList.remove('is-on'); document.body.classList.remove('cinematic'); }

function startChapter(a) {
  shownChapter = a ? a.id : 'done';
  if (!a) { cutscene('Mission complete', 'All objectives done', 'Enjoy the view until sunset.'); return; }
  const c = CHAPTERS[a.id];
  setChapter(`Chapter ${c.n} · ${c.title}`);
  cutscene(`Chapter ${c.n} of 4`, c.title, c.text);
  const card = document.querySelector('.hud-obj');
  card.classList.add('is-new');
  setTimeout(() => card.classList.remove('is-new'), 600);
}

let petAct = { kind: '', until: 0 };
const who = (...ids) => (chosen.find((c) => ids.includes(c.id)) || chosen[0]).name;
/** Make the pets act: 'work' = spinning/jittering at a job, 'hop' = a happy jump. */
function petDo(kind, secs, line) {
  petAct = { kind, until: t + secs };
  if (line) banner(line, '', Math.min(2, secs + .4));
}
function completeActivity(a) {
  petDo('hop', 1.6);
  toastQueue.push({ title: a.story.title, text: a.story.text, sourceUrl: a.story.sourceUrl, short: true });
  log(a.name + ': done', `Day ${Math.max(1, Math.ceil(dayP * 14))}`);
  shake = .15;
}

function updateActivities(dt) {
  if (phase !== 'day' && phase !== 'night') return;
  const a = current();
  // only the current objective's marker glows; finished ones fade, later ones stay hidden
  for (const x of ACTS) for (const tg of x.targets) tg.m.group.visible = x === a ? !tg.done : false;
  if ((a ? a.id : 'done') !== shownChapter && t > cineUntil + .5) startChapter(a);
  if (!a) return;
  const still = Math.abs(car.speed) < .9;
  for (const tg of a.targets) {
    if (tg.done) continue;
    const inside = Math.hypot(car.x - tg.x, car.z - tg.z) < a.radius;
    if (a.id === 'samples') {
      if (inside) { tg.done = true; markDone(tg.m); petDo('work', 1.4, `${who('lister', 'eds')} drills sample ${a.targets.filter((x) => x.done).length} of 3`); }
    } else if (inside && still && (!a.needsEarth || earthUp) && (!a.needsHeater || care.heater) && (!a.needsPower || power >= a.needsPower)) {
      a.hold += dt;
      if (petAct.until < t + .2) petDo('work', .4); // pets busy while scanning or deploying
      if (a.id === 'ice') warmth = Math.max(0, warmth - dt * 1.4); // cold in the crater shadow
      if (a.hold >= a.need) { tg.done = true; markDone(tg.m); }
    } else {
      a.hold = Math.max(0, a.hold - dt * 2);
      if (inside && a.needsEarth && !earthUp && !a.warned) { a.warned = true; banner('No Earth in view', 'The beacon needs a line of sight to Earth', 2); }
    }
  }
  if (targetsDone(a)) {
    if (!a.targetsAt) { a.targetsAt = t; a.stepAt = t; if (a.extra && a.extra.length) banner('Next step', a.extra[0].label, 2.4); }
    const st = a.extra && a.extra[a.step];
    if (st && st.test(a)) { a.step++; a.stepAt = t; if (a.id === 'home') sleepReady = true; }
    if (actDone(a) && !a.completed) { a.completed = true; completeActivity(a); }
  }
}

function renderObjective() {
  const a = current();
  if (!a) {
    $('#obj-kicker').textContent = 'All objectives done';
    $('#obj-title').textContent = 'Explore until sunset';
    $('#obj-status').textContent = '';
    $('#obj-bar').style.width = '100%';
    $('#obj-hint').textContent = 'Your pets did great. Night falls at the end of Day 14.';
    return;
  }
  const c = CHAPTERS[a.id];
  if (targetsDone(a) && a.extra && a.extra[a.step]) {
    const st = a.extra[a.step];
    $('#obj-kicker').textContent = `Chapter ${c.n} · ${c.title} · step 2 of 2`;
    $('#obj-title').textContent = st.label;
    $('#obj-status').textContent = '';
    $('#obj-bar').style.width = '60%';
    $('#obj-hint').textContent = st.hint;
    return;
  }
  const next = a.targets.find((tg) => !tg.done);
  const dist = next ? Math.round(Math.hypot(car.x - next.x, car.z - next.z)) : 0;
  const got = a.targets.filter((x) => x.done).length;
  const pct = a.id === 'samples' ? got / 3 : a.hold / a.need;
  $('#obj-kicker').textContent = `Chapter ${c.n} · ${c.title}`;
  $('#obj-title').textContent = a.id === 'samples' ? `${a.name} (${got}/3)` : a.name;
  $('#obj-status').textContent = a.hold > 0 ? `${Math.round(pct * 100)}%` : `${dist} m`;
  $('#obj-bar').style.width = `${Math.min(100, pct * 100)}%`;
  const near = next && dist < a.radius;
  $('#obj-hint').textContent = near && a.needsHeater && !care.heater ? 'Too cold to scan: turn the heater on (H).'
    : near && a.needsPower && power < a.needsPower ? `The beacon needs ${a.needsPower}% power: track the Sun (P) to charge.`
    : a.hold > 0 ? 'Hold still…' : dayP > .8 && a.id !== 'home' ? 'The Sun is setting soon: hurry!' : c.hint;
}

function buildFlag() {
  const g = new THREE.Group();
  g.position.set(FLAG.x, heightAt(FLAG.x, FLAG.z), FLAG.z);
  const metal = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: .8, roughness: .3 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 2.6, 10), metal);
  pole.position.y = 1.3;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1.3, 8), metal); // top rod, like the Apollo flags (no wind on the Moon)
  rod.rotation.z = Math.PI / 2; rod.position.set(.65, 2.55, 0);
  const c = document.createElement('canvas'); c.width = 320; c.height = 200;
  const x = c.getContext('2d');
  x.fillStyle = '#0B1320'; x.fillRect(0, 0, 320, 200);
  x.fillStyle = '#F97316'; x.fillRect(0, 0, 320, 34); x.fillRect(0, 166, 320, 34);
  x.fillStyle = '#D1D5DB'; x.font = 'bold 34px Inter, sans-serif'; x.textAlign = 'center'; x.fillText('PAYLOAD PETS', 160, 100);
  x.font = '20px Inter, sans-serif'; x.fillStyle = '#94A3B8'; x.fillText((site && site.name || 'Moon').slice(0, 26), 160, 136);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .82, 12, 4), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: .8 }));
  const cp = cloth.geometry.attributes.position; // a gentle permanent ripple, as the Apollo flags had
  for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 7) * .04);
  cloth.geometry.computeVertexNormals();
  cloth.position.set(.65, 2.13, 0);
  [pole, rod, cloth].forEach((m) => { m.castShadow = true; g.add(m); });
  scene.add(g);
}

function drawMinimap() {
  const c = $('#minimap'), g = c.getContext('2d'), W = c.width, H = c.height, R = 140; // metres shown from centre to edge
  const k = (W / 2) / R;
  g.clearRect(0, 0, W, H);
  g.save();
  g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#0B1320'; g.fillRect(0, 0, W, H);
  g.translate(W / 2, H / 2);
  g.rotate(car.heading - Math.PI / 2); // heading-up map
  const P = (wx, wz) => [(wx - car.x) * k, (wz - car.z) * k];
  g.strokeStyle = 'rgba(100,116,139,.6)'; g.lineWidth = 1;
  for (const cr of CRATERS) { const [x, y] = P(cr.x, cr.z); if (Math.abs(x) < W && Math.abs(y) < H) { g.beginPath(); g.arc(x, y, cr.r * k, 0, Math.PI * 2); g.stroke(); } }
  g.fillStyle = 'rgba(209,213,219,.75)';
  for (const rk of ROCKS) { const [x, y] = P(rk.x, rk.z); if (Math.abs(x) < W && Math.abs(y) < H) { g.beginPath(); g.arc(x, y, Math.max(1.2, rk.r * k), 0, Math.PI * 2); g.fill(); } }
  g.strokeStyle = 'rgba(249,115,22,.6)'; { const [x, y] = P(0, 0); g.beginPath(); g.arc(x, y, (WORLD - 48) * k, 0, Math.PI * 2); g.stroke(); }
  for (const a of ACTS) for (const tg of a.targets) {
    const [x, y] = P(tg.x, tg.z);
    if (!tg.done && a !== current()) continue;
    g.fillStyle = tg.done ? 'rgba(69,212,138,.7)' : '#' + actColor(a).toString(16).padStart(6, '0');
    g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
  }
  { const [x, y] = P(FLAG.x, FLAG.z); g.fillStyle = '#ffffff'; g.fillRect(x - .8, y - 9, 1.6, 10); g.fillStyle = '#F97316'; g.fillRect(x + .8, y - 9, 7, 5); }
  g.restore();
  g.fillStyle = '#F97316'; g.beginPath(); g.moveTo(W / 2, H / 2 - 8); g.lineTo(W / 2 - 5.5, H / 2 + 6); g.lineTo(W / 2 + 5.5, H / 2 + 6); g.closePath(); g.fill();
  g.strokeStyle = '#0B1320'; g.lineWidth = 1.5; g.stroke();
}

// ---------------------------------------------------------------- story
async function pollStory() {
  if (polling) return;
  polling = true;
  try {
    const lists = await Promise.all(story.map((s) => s.due(dayP)));
    for (const m of lists.flat()) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      found.push({ ...m, day: Math.max(1, Math.ceil(dayP * 14)) });

    }
  } catch (e) { /* try again next poll */ }
  polling = false;
}

function epilogueCards() {
  const names = chosen.map((c) => c.name).join(' and ');
  return [
    ['Day 29', 'Sunrise', `After 14 Earth days of darkness, sunlight returns to ${site.name}.`],
    survived
      ? ['Wake-up check', `${names} woke up!`, `They made it through the night with ${Math.round(power)}% power. Very few real landers have managed that.`]
      : ['Wake-up check', `${names} stayed asleep`, 'The cold drained the batteries. Most real CLPS landers do not survive the lunar night either.'],
    ['The real story', 'Blue Ghost 1', "NASA reports Firefly's Blue Ghost 1 kept working through sunset and into the lunar night before its mission ended."],
  ];
}
function finish() {
  phase = 'end';
  $('#toast').classList.remove('is-visible');
  const names = chosen.map((c) => c.name).join(' and ');
  $('#end-title').textContent = `${names} on the Moon`;
  $('#end-lead').textContent = `${names} rode the rover through a whole lunar day at ${site.name}: 14 Earth days of sunlight, then the first hours of the two-week night. Along the way you found ${found.length} real stories from NASA's Moon missions.`;
  $('#end-pets').replaceChildren(...chosen.map((p) => {
    const card = document.createElement('div');
    card.className = 'end-pet';
    card.style.setProperty('--c', PET_COLORS[p.id] || '#62b0ff');
    card.innerHTML = '<i class="pet-dot"></i><div><b></b><p class="what"></p><p class="fate"></p></div>';
    card.querySelector('b').textContent = p.name;
    card.querySelector('.what').textContent = p.tagline;
    card.querySelector('.fate').textContent = `What really happened: ${p.fate || ''}`;
    return card;
  }));
  $('#end-stories').replaceChildren(...found.map((m) => {
    const li = document.createElement('li');
    li.append(document.createTextNode(`Day ${m.day} · ${m.title}. ${m.text} `));
    const a = document.createElement('a');
    a.href = m.sourceUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'NASA source ↗';
    li.append(a);
    return li;
  }));
  const doneActs = ACTS.filter(actDone).length;
  const rating = survived ? (doneActs === ACTS.length && rv.hull > 70 ? 'Lunar Legend' : 'Night Survivor') : doneActs >= 3 ? 'Brave Explorer' : 'Moon Rookie';
  const visas = [...ACTS.map((a) => ({ n: CHAPTERS[a.id].n, title: CHAPTERS[a.id].title, done: actDone(a) })), { n: 5, title: 'Long Night', done: !!survived }];
  $('#pp-visas').replaceChildren(...visas.map((v, i) => { const d = document.createElement('div'); d.className = 'visa' + (v.done ? '' : ' missing'); d.style.setProperty('--rot', `${[-8, 5, -3, 7, -6][i]}deg`); d.innerHTML = '<small></small><b></b><span></span>'; d.querySelector('small').textContent = `Chapter ${v.n}`; d.querySelector('b').textContent = v.title; d.querySelector('span').textContent = v.done ? 'Completed' : 'Not reached'; return d; }));
  $('#pp-date').textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const code = (x) => String(x).toUpperCase().replace(/[^A-Z0-9]+/g, '<');
  $('#pp-no').textContent = `No. ${code(site.id)}-${String(rv.sent).padStart(2, '0')}${String(found.length).padStart(2, '0')}`.replace(/</g, '-');
  $('#pp-photos').replaceChildren(...chosen.map((p) => { const d = document.createElement('div'); d.className = 'pp-photo'; d.style.setProperty('--c', PET_COLORS[p.id] || '#F97316'); d.innerHTML = '<i class="pet-dot"></i><span></span>'; d.querySelector('span').textContent = p.name; return d; }));
  const fields = [['Crew', names], ['Landing site', site.name], ['Days on the Moon', '14 days of sunlight + 14 nights'], ['Night survival', survived ? `Woke up at dawn with ${Math.round(power)}% power` : 'Did not wake up at dawn'], ['Highest Sun', `${rv.maxSun.toFixed(0)}° above the horizon`], ['Driven', `${(rv.odo / 1000).toFixed(2)} km`], ['Data sent home', String(rv.sent)], ['Rover hull', `${Math.round(rv.hull)}% (${rv.hits} boulder hit${rv.hits === 1 ? '' : 's'})`], ['Activities', `${ACTS.filter(actDone).length} of ${ACTS.length}: ${ACTS.filter(actDone).map((a) => a.id === 'samples' ? 'samples' : a.id === 'ice' ? 'ice scan' : a.id === 'beacon' ? 'nav beacon' : 'back at base').join(', ') || 'none yet'}`], ['Stories found', String(found.length)], ['Power / warmth at night', `${Math.round(power)}% / ${Math.round(warmth)}%`]];
  $('#pp-fields').replaceChildren(...fields.flatMap(([k, v]) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; return [dt, dd]; }));
  $('#pp-stamp').textContent = rating;
  $('#pp-mrz').textContent = `P<MOON<${code(names)}<<${code(site.name)}`.padEnd(44, '<').slice(0, 44);
  $('#end').classList.add('is-visible');
  $('#again').focus();
}

function startDay() {
  phase = 'day'; phaseT = 0; dayP = 0; power = 80; warmth = 70;
  rv.odo = 0; rv.sent = 0; rv.maxSun = 0; rv.hull = 100; rv.hits = 0;
  resetActivities();
  seen.clear(); found.length = 0; toastQueue.length = 0;
  $('#log').replaceChildren();
  story.forEach((s, i) => s.setContext(site.id, chosen[i].id));
  $('#end').classList.remove('is-visible');
  log(`${chosen.map((c) => c.name).join(' and ')} landed at ${site.name}.`, 'Touchdown');
  shownChapter = null;
}

// ---------------------------------------------------------------- loop

function update(dt) {
  t += dt; phaseT += dt;
  if (phase === 'day') dayP = Math.min(1, phaseT / DAY_SECS);
  if (phase === 'landing') dayP = 0;
  const arc = phase === 'day' || phase === 'landing' ? Math.sin(Math.PI * Math.max(dayP, .08)) : 0;
  const sunUp = arc * Math.sin(SUN_MAX); // how high the Sun is (low near the poles)

  // sun position: rises in the east, crosses the sky, sets in the west
  const a = phase === 'day' || phase === 'landing' ? Math.PI * Math.max(dayP, .08) : Math.PI * 1.04;
  const dir = new THREE.Vector3(Math.cos(a), Math.max(.03, Math.sin(a) * Math.sin(SUN_MAX) + .02), .38).normalize();
  rv.maxSun = Math.max(rv.maxSun, Math.asin(Math.min(1, sunUp)) * 57.3);
  $('#rover-read').textContent = `Odometer ${(rv.odo / 1000).toFixed(2)} km · Data sent home ${rv.sent}`;
  $('#m-hull').style.width = `${rv.hull}%`; $('#m-hull').classList.toggle('low', rv.hull < 30); $('#v-hull').textContent = Math.round(rv.hull);
  $('#sky-read').textContent = `Sun ${(Math.asin(Math.min(1, sunUp)) * 57.3).toFixed(0)}° · Earth ${earthUp ? 'in view' : 'below horizon'}`;
  sun.position.copy(rover.position).addScaledVector(dir, 60);
  sun.target.position.copy(rover.position);
  const lit = phase === 'night' ? 0 : Math.max(.4, Math.min(1, sunUp * 1.6));
  sun.intensity = 4.2 * lit;
  hemi.intensity = phase === 'night' || phase === 'epilogue' ? (earthUp ? .3 : .1) : .25 + .35 * lit; // Earthshine lights the night side
  fill.intensity = phase === 'night' ? .5 : .9;
  fill.position.copy(camera.position);
  sunSprite.position.copy(camera.position).addScaledVector(dir, 700);
  sunSprite.visible = (phase === 'day' || phase === 'landing') && dir.y > -.05;

  // driving
  const live = phase === 'day' || phase === 'night';
  const fwd = live ? (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0) : 0;
  const steer = live ? (keys.has('left') ? 1 : 0) - (keys.has('right') ? 1 : 0) : 0;
  const maxSpeed = rv.hull <= 0 ? 0 : power > 2 ? 9 * (.5 + rv.hull / 200) : 2;
  car.speed += fwd * 10 * dt;
  car.speed *= Math.pow(fwd ? .6 : .2, dt);
  car.speed = Math.max(-4, Math.min(maxSpeed, car.speed));
  car.heading += steer * dt * 1.6 * Math.sign(car.speed || 1) * Math.min(1, Math.abs(car.speed) / 2 + .2);
  car.x += Math.cos(car.heading) * car.speed * dt;
  car.z -= Math.sin(car.heading) * car.speed * dt;
  const far = Math.hypot(car.x, car.z), RIM = WORLD - 48;
  if (far > RIM) { // the rock wall stops the rover
    car.x *= RIM / far; car.z *= RIM / far;
    car.speed *= -.2;
    if (!edgeWarned) { edgeWarned = true; banner('Rock wall', 'Giant boulders block the way. Turn back.', 2.2); }
  } else if (far < RIM - 10) edgeWarned = false;
  rv.odo += Math.abs(car.speed * dt);
  for (const rk of ROCKS) {
    const dx = car.x - rk.x, dz = car.z - rk.z;
    if (Math.abs(dx) > rk.r + 1.6 || Math.abs(dz) > rk.r + 1.6) continue;
    const d = Math.hypot(dx, dz), min = rk.r + 1.3; // rover half-length ~1.3 m
    if (d < min && d > 0) {
      const impact = Math.abs(car.speed);
      car.x = rk.x + dx / d * min; car.z = rk.z + dz / d * min; // stopped by the rock
      if (impact > 1.2) {
        const dmg = Math.min(25, impact * 2.4);
        rv.hull = Math.max(0, rv.hull - dmg); rv.hits++;
        shake = Math.min(1, .25 + impact * .08);
        banner('Collision!', `Hit a boulder: hull -${dmg.toFixed(0)}%`, 1.4);
        log(`Hit a boulder at ${impact.toFixed(1)} m/s. Hull ${Math.round(rv.hull)}%.`, `Day ${Math.max(1, Math.ceil(dayP * 14))}`);
      }
      car.speed = 0;
    }
  }
  car.wheel -= car.speed * dt / .42;

  // follow the ground: height + tilt from four sample points
  const c = Math.cos(car.heading), s = Math.sin(car.heading);
  const hF = blockTop(car.x + c * 1.1, car.z - s * 1.1), hB = blockTop(car.x - c * 1.1, car.z + s * 1.1);
  const hL = blockTop(car.x - s * .9, car.z - c * .9), hR = blockTop(car.x + s * .9, car.z + c * .9);
  const groundY = (hF + hB + hL + hR) / 4;
  rover.position.set(car.x, rover.position.y + (groundY - rover.position.y) * Math.min(1, dt * 8), car.z);
  const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.atan2(hL - hR, 1.8), car.heading, Math.atan2(hF - hB, 2.2), 'YXZ'));
  rover.quaternion.slerp(target, Math.min(1, dt * 6));
  wheels.forEach((w) => { w.rotation.z = car.wheel; });
  if (solarPanel) {
    const wantTilt = care.tracking ? Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) - Math.PI / 2 : -.2;
    solarPanel.rotation.z += (wantTilt - solarPanel.rotation.z) * Math.min(1, dt * 2);
  }
  beacon.material.emissiveIntensity = 1.2 + .4 * Math.sin(t * 3);

  if (Math.abs(car.speed) > 1.2) for (let k = 0; k < 2; k++) emitDust(car.x - c * 1.2 + (Math.random() - .5), rover.position.y + .1, car.z + s * 1.2 + (Math.random() - .5));
  stepDust(dt);

  // meters and moods
  if (live) {
    if (care.heater && power <= 0) { care.heater = false; renderCare(); }
    if (phase === 'night') { // no Sun: batteries only. Sleep mode halves the drain.
      power = Math.max(0, power - ((sleepReady ? .3 : .7) + (care.heater ? (sleepReady ? .2 : .6) : 0) + Math.abs(car.speed) * .12) * dt);
      warmth = Math.max(0, Math.min(100, warmth + (-.9 + (care.heater && power > 0 ? .95 : 0)) * dt));
    } else {
      power = Math.max(0, Math.min(100, power + ((care.tracking ? arc * 7.5 : sunUp * 4.5) - .9 - Math.abs(car.speed) * .12 - (care.heater ? 1.8 : 0)) * dt));
      warmth = Math.max(0, Math.min(100, warmth + (sunUp * 3.2 - 1.9 + (care.heater ? 3 : 0)) * dt));
    }
    renderMeters();
  }
  for (const r of petRigs) {
    const mood = phase === 'night' ? (r.id === 'retro' ? 'sleeping' : 'shivering') : warmth < 25 ? 'shivering' : power < 15 ? 'sleeping' : 'happy';
    if (mood !== r.mood) { r.mood = mood; r.setMood(mood); renderCrew(); }
    r.animate(t);
    if (r.baseY === undefined) { r.baseY = r.holder.position.y; r.baseRot = r.holder.rotation.y; }
    const acting = petAct.until > t, i = petRigs.indexOf(r);
    if (acting && petAct.kind === 'work') {
      r.holder.rotation.y += dt * 5 * (i ? -1 : 1);
      r.holder.position.y = r.baseY + Math.abs(Math.sin(t * 22 + i)) * .03;
    } else if (acting && petAct.kind === 'hop') {
      r.holder.position.y = r.baseY + Math.abs(Math.sin(t * 9 + i * 1.3)) * .22;
      r.holder.rotation.y += (r.baseRot - r.holder.rotation.y) * Math.min(1, dt * 6);
    } else {
      r.holder.position.y += (r.baseY - r.holder.position.y) * Math.min(1, dt * 8);
      r.holder.rotation.y += (r.baseRot - r.holder.rotation.y) * Math.min(1, dt * 4);
    }
  }

  // camera
  if (phase === 'landing') {
    const k = Math.min(1, phaseT / 3.2), e = 1 - Math.pow(1 - k, 3);
    camera.position.set(rover.position.x - 6 * (1 - e) - .9 * e, rover.position.y + 1.75 + 70 * (1 - e), rover.position.z + 4 * (1 - e));
    camera.lookAt(rover.position.x + 6, rover.position.y + .6, rover.position.z);
    if (k >= 1) { startDay(); }
  }
  const fpView = phase !== 'landing' && cam.mode === 'fp';
  rover.children.forEach((o) => { if (o.userData.fpHide) o.visible = !fpView; });
  if (phase === 'landing') {
    // handled above
  } else if (cam.mode === 'fp') {
    // first person: sitting in the driver's seat behind the pets
    const seat = new THREE.Vector3(-1.75, 1.95, 0).applyQuaternion(rover.quaternion).add(rover.position);
    camera.position.lerp(seat, Math.min(1, dt * 12));
    const yaw = car.heading + cam.lookYaw;
    const look = new THREE.Vector3(Math.cos(yaw) * Math.cos(cam.lookPitch), Math.sin(cam.lookPitch), -Math.sin(yaw) * Math.cos(cam.lookPitch));
    camera.lookAt(camera.position.clone().add(look));
    camera.position.y += Math.sin(t * 9) * Math.min(.03, Math.abs(car.speed) * .004); // a little bump while driving
  } else {
    const camYaw = car.heading + Math.PI + cam.yaw;
    const want = new THREE.Vector3(
      rover.position.x + Math.cos(camYaw) * cam.dist * Math.cos(cam.pitch),
      rover.position.y + 1.2 + Math.sin(cam.pitch) * cam.dist,
      rover.position.z - Math.sin(camYaw) * cam.dist * Math.cos(cam.pitch));
    want.y = Math.max(want.y, blockTop(want.x, want.z) + 1);
    camera.position.lerp(want, Math.min(1, dt * 3));
    camera.lookAt(rover.position.x, rover.position.y + 1.1, rover.position.z);
    if (!cam.dragging) cam.yaw *= Math.pow(.25, dt);
  }

  if (shake > 0) { camera.position.x += (Math.random() - .5) * shake * .35; camera.position.y += (Math.random() - .5) * shake * .35; shake = Math.max(0, shake - dt * 1.8); }

  updateActivities(dt);
  mapT += dt;
  if (mapT > .15) {
    mapT = 0; drawMinimap(); renderObjective();
    const M_PER_DEG = 30330; // metres per degree of latitude on the Moon
    const la = (site.lat || 0) - car.z / M_PER_DEG, lo = (site.lon || 0) + car.x / (M_PER_DEG * Math.max(.05, Math.cos(la * Math.PI / 180)));
    const hd = ((90 - car.heading * 57.3) % 360 + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    $('#pos').innerHTML = `<b>${Math.abs(la).toFixed(4)}°${la >= 0 ? 'N' : 'S'} ${Math.abs(lo).toFixed(4)}°${lo >= 0 ? 'E' : 'W'}</b><span>${Math.round(Math.hypot(car.x - FLAG.x, car.z - FLAG.z))} m from flag · heading ${dirs[Math.round(hd / 45) % 8]}</span>`;
  }
  if (cineUntil && t > cineUntil) { cineUntil = 0; endCutscene(); }

  // story flow
  if (phase === 'day') {
    $('#day').textContent = `Day ${Math.min(14, Math.floor(dayP * 14) + 1)}`;
    $('#track').style.width = `${dayP * 100}%`;
    if (t - lastPoll > .6) { lastPoll = t; pollStory(); }
    if (dayP >= 1) {
      phase = 'night'; phaseT = 0; pollStory();
      setChapter('Chapter 5 · The Long Night');
      cutscene('Chapter 5 of 5', 'The Long Night', 'Two weeks of darkness, colder than -170 °C. Keep your pets alive until sunrise.', 4.2);
    }
  } else if (phase === 'night') {
    const nightP = Math.min(1, phaseT / NIGHT_SECS);
    $('#day').textContent = `Night ${Math.min(14, Math.floor(nightP * 14) + 1)}`;
    $('#track').style.width = `${nightP * 100}%`;
    if (nightP >= 1) { phase = 'epilogue'; phaseT = 0; epi = -1; survived = power > 0 && warmth > 0; }
  } else if (phase === 'epilogue') {
    const cards = epilogueCards(), i = Math.floor(phaseT / 4.6);
    if (i !== epi && i < cards.length) { epi = i; cutscene(cards[i][0], cards[i][1], cards[i][2], 4.4); }
    if (phaseT > cards.length * 4.6) { endCutscene(); finish(); }
  }
  if (t > toastUntil) {
    if (toastQueue.length && phase !== 'end') showToast(toastQueue.shift());
    else $('#toast').classList.remove('is-visible');
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- input
const KEYMAP = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
addEventListener('keydown', (e) => { if (KEYMAP[e.key]) { keys.add(KEYMAP[e.key]); e.preventDefault(); } });
addEventListener('keyup', (e) => { if (KEYMAP[e.key]) keys.delete(KEYMAP[e.key]); });
addEventListener('keydown', (e) => {
  if (e.key === 'c' || e.key === 'C') cam.mode = cam.mode === 'fp' ? 'chase' : 'fp';
  if (e.key === 'p' || e.key === 'P') { care.tracking = !care.tracking; renderCare(); }
  if (e.key === 'h' || e.key === 'H') { care.heater = !care.heater; renderCare(); }
  if (e.key === 'f' || e.key === 'F') sendData();
});
$('#opt-track').addEventListener('click', () => { care.tracking = !care.tracking; renderCare(); });
$('#opt-heat').addEventListener('click', () => { care.heater = !care.heater; renderCare(); });
$('#opt-send').addEventListener('click', sendData);
document.querySelectorAll('.touch button').forEach((b) => {
  b.addEventListener('pointerdown', () => keys.add(b.dataset.k));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => keys.delete(b.dataset.k));
});
const sceneEl = $('#scene');
sceneEl.addEventListener('pointerdown', (e) => { cam.dragging = true; cam.lx = e.clientX; cam.ly = e.clientY; sceneEl.setPointerCapture(e.pointerId); });
sceneEl.addEventListener('pointermove', (e) => {
  if (!cam.dragging) return;
  if (cam.mode === 'fp') {
    cam.lookYaw = Math.max(-2.6, Math.min(2.6, cam.lookYaw - (e.clientX - cam.lx) * .005));
    cam.lookPitch = Math.max(-.9, Math.min(.9, cam.lookPitch - (e.clientY - cam.ly) * .004));
  } else {
    cam.yaw -= (e.clientX - cam.lx) * .006;
    cam.pitch = Math.max(.08, Math.min(1.2, cam.pitch + (e.clientY - cam.ly) * .004));
  }
  cam.lx = e.clientX; cam.ly = e.clientY;
});
sceneEl.addEventListener('pointerup', () => { cam.dragging = false; });
sceneEl.addEventListener('wheel', (e) => { cam.dist = Math.max(4.5, Math.min(18, cam.dist + e.deltaY * .01)); }, { passive: true });
$('#again').addEventListener('click', () => { car.x = car.z = 0; car.heading = 0; sleepReady = false; survived = null; lastSend = -1; endCutscene(); startDay(); });

function nearestStorySite(list, lat, lon) {
  const rad = Math.PI / 180;
  const lat1 = lat * rad;
  let best = list[0];
  let bestD = Infinity;
  for (const s of list) {
    const lat2 = (s.lat || 0) * rad;
    const dLat = lat2 - lat1;
    const dLon = ((s.lon || 0) - lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const d = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
    if (d < bestD) { bestD = d; best = s; }
  }
  return best || list[0];
}

// ---------------------------------------------------------------- boot
async function boot() {
  THREE = await getThree();
  const [p, s] = await Promise.all([story[0].pets(), story[0].sites()]);
  pets = p; sites = s;
  const q = new URLSearchParams(location.search);
  const want = (q.get('pets') || 'lister,ln-1').split(',').map((x) => x.trim().toLowerCase());
  chosen = want.map((id) => pets.find((x) => x.id.toLowerCase() === id || x.name.toLowerCase() === id)).filter(Boolean).slice(0, 2);
  for (const extra of pets) if (chosen.length < 2 && !chosen.includes(extra)) chosen.push(extra);
  const rawLat = q.has('lat') && q.get('lat') !== '' ? Number(q.get('lat')) : NaN;
  const rawLon = q.has('lon') && q.get('lon') !== '' ? Number(q.get('lon')) : NaN;
  const hasCustomCoords = Number.isFinite(rawLat) && Number.isFinite(rawLon);
  const siteId = (q.get('site') || chosen[0].defaultSite || 'MARE_CRISIUM').toUpperCase().replace(/-/g, '_');
  const aliasedId = siteId === 'SHACKLETON_RIM' ? 'SHACKLETON_RIDGE' : siteId;
  site = sites.find((x) => x.id === aliasedId)
    || (hasCustomCoords ? nearestStorySite(sites, rawLat, rawLon) : null)
    || sites[0];
  const dropName = q.get('dropName')?.trim();
  const displaySiteName = dropName || site.name;
  site = { ...site, name: displaySiteName };
  $('#site').textContent = displaySiteName;
  const lat = hasCustomCoords ? rawLat : (site.lat || 0);
  const lon = hasCustomCoords ? rawLon : (site.lon || 0);
  SUN_MAX = Math.max(3, 90 - Math.abs(lat)) * Math.PI / 180;
  CRATERS = makeCraters([...(site.id + (hasCustomCoords ? `${lat.toFixed(2)},${lon.toFixed(2)}` : ''))].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) || 7);
  const earthEl = 90 - Math.acos(Math.cos(lat * Math.PI / 180) * Math.cos(lon * Math.PI / 180)) * 57.3;
  earthUp = earthEl > 0;

  renderer = new THREE.WebGLRenderer({ canvas: sceneEl, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .05, 2000);
  camera.position.set(-8, 5, 0);
  hemi = new THREE.HemisphereLight(0xb8c4e6, 0x3a3632, .6);
  scene.add(hemi);
  fill = new THREE.PointLight(0xdfe7ff, .9, 14, 1.2);
  scene.add(fill);
  sun = new THREE.DirectionalLight(0xfff4e0, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 2;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 160 });
  sun.shadow.bias = -.0006;
  scene.add(sun, sun.target);
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

  buildSky();
  { const el = Math.max(2, (90 - Math.acos(Math.cos(lat * Math.PI / 180) * Math.cos(lon * Math.PI / 180)) * 57.3)) * Math.PI / 180;
    const pos = new THREE.Vector3(-.45 * Math.cos(el), Math.sin(el), -.9 * Math.cos(el)).normalize().multiplyScalar(600);
    earthSprite.position.copy(pos); earthGlow.position.copy(pos); earthSprite.visible = earthGlow.visible = earthUp; }
  buildTerrain();
  buildRover();
  buildDust();
  buildFlag();
  buildActivities();
  setupSteps();
  await addPets();
  renderCrew();
  renderMeters();
  renderCare();
  document.body.classList.remove('is-loading');
  rover.position.y = blockTop(0, 0);
  phase = 'landing'; phaseT = 0;
  banner('Landing…', site.name, 2.6);
  try { window.focus(); } catch {}
  sceneEl.addEventListener('pointerdown', () => { try { window.focus(); } catch {} });
  if (q.get('from') === 'map' && window.parent && window.parent !== window) {
    const row = $('.end-row');
    if (row && !$('#choose-site-btn')) {
      const backBtn = document.createElement('button');
      backBtn.id = 'choose-site-btn';
      backBtn.className = 'btn';
      backBtn.type = 'button';
      backBtn.style.marginLeft = '10px';
      backBtn.textContent = 'Pick new landing site';
      backBtn.addEventListener('click', () => window.parent.postMessage({ type: 'payloadpets:back-to-map' }, '*'));
      row.append(backBtn);
    }
  }
  requestAnimationFrame(frame);
}
boot().catch((e) => {
  console.error(e);
  $('#loading span').textContent = 'Could not start the 3D scene. Check the internet connection (Three.js loads from a CDN) and that ./run-story.sh is running.';
});
