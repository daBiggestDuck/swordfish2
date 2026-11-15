// Standalone story page: plays one lunar day, shows mission pop-ups, then the Pet Passport.
// All story content and logic come from the Java server through story-client.js.
import { createStoryClient } from './story-client.js';

const $ = (s) => document.querySelector(s);
const DAY_EARTH_DAYS = 14;
const DAY_MS = 86400000;

const story = createStoryClient();
let progress = 0;
let timer = null;
let showing = false;
const queue = [];
let missions = [];
let pets = [];
let lastSky = null; // Sun/Earth data for the current site, used by the stage

function currentPet() {
  return pets.find((p) => p.id === $('#pet').value) || { name: 'Pip', face: '🙂', sleepsAtNight: false };
}

function today() { return new Date().toISOString().slice(0, 10); }

// ---------------------------------------------------------------- pet and day

function mood() {
  const pet = currentPet();
  if (care.fainted) return ['😵', 'Fainted... try again?', 'sleep'];
  if (care.warmth < 30) return ['🥶', 'So cold! Heater, please!', 'cold'];
  if (care.power < 25) return ['🪫', 'Running low on power...', 'sleep'];
  if (progress >= 0.95) return pet.sleepsAtNight ? ['😴', 'Sleeping through the night', 'sleep'] : ['🥶', 'Brr, the night is here!', 'cold'];
  if (progress >= 0.8) return ['🥶', 'Sunset is close. It is getting cold...', 'cold'];
  if (progress >= 0.5) return ['😄', 'Full sun, feeling great!', 'happy'];
  return ['🙂', 'Warming up in the morning light', 'warm'];
}

/** A round pet avatar in the pet's own colour (placeholder until the pets branch's art). */
const FACE = '<circle cx="25" cy="30" r="4" fill="#1b1f3a"/><circle cx="39" cy="30" r="4" fill="#1b1f3a"/>'
  + '<circle cx="26.3" cy="28.7" r="1.3" fill="#fff"/><circle cx="40.3" cy="28.7" r="1.3" fill="#fff"/>'
  + '<path d="M27 38 q5 5 10 0" fill="none" stroke="#1b1f3a" stroke-width="2" stroke-linecap="round"/>'
  + '<circle cx="20" cy="36" r="2.6" fill="#ff9db0" opacity=".7"/><circle cx="44" cy="36" r="2.6" fill="#ff9db0" opacity=".7"/>';

// Hand-drawn pet characters (SVG), one per real mission. Emoji is only the fallback.
const PET_ART = {
  // Ghost: Blue Ghost 1, a friendly ghost-shaped lander with gold foil and landing legs
  BLUE_GHOST: '<path d="M14 54 l-5 6 M50 54 l5 6" stroke="#c9a23a" stroke-width="3" stroke-linecap="round"/>'
    + '<path d="M12 34 a20 22 0 0 1 40 0 v18 l-6.7 -5 -6.6 5 -6.7 -5 -6.7 5 -6.6 -5 -6.7 5z" fill="#f4f6ff" stroke="#aab4ee" stroke-width="1.5"/>'
    + '<rect x="12" y="43" width="40" height="5" fill="#f0c95a" opacity=".9"/>' + FACE,
  // Luna: Blue Moon Mark 1, a round blue lander with a porthole belly
  BLUE_MOON: '<path d="M16 50 l-6 9 M48 50 l6 9" stroke="#9fb4d8" stroke-width="3" stroke-linecap="round"/>'
    + '<rect x="12" y="12" width="40" height="42" rx="18" fill="#3f8dff" stroke="#1d4fa8" stroke-width="1.5"/>'
    + '<ellipse cx="32" cy="33" rx="15" ry="13" fill="#d8ecff"/>'
    + '<path d="M32 12 v-6" stroke="#9fb4d8" stroke-width="2"/><circle cx="32" cy="5" r="2.5" fill="#fff"/>' + FACE,
  // Triddy: the TRIDENT drill, orange with a hard hat and a drill bit
  TRIDENT: '<path d="M26 50 h12 l-6 12z" fill="#aab0bd" stroke="#6d7483" stroke-width="1.2"/>'
    + '<path d="M28 54 h8 M30 58 h4" stroke="#6d7483" stroke-width="1.2"/>'
    + '<rect x="13" y="18" width="38" height="34" rx="11" fill="#ffb84d" stroke="#c77f12" stroke-width="1.5"/>'
    + '<path d="M13 22 a19 14 0 0 1 38 0z" fill="#ffd45e" stroke="#c77f12" stroke-width="1.5"/>'
    + '<rect x="10" y="21" width="44" height="4" rx="2" fill="#ffd45e" stroke="#c77f12" stroke-width="1.2"/>' + FACE,
  // Nodey: the LN-1 beacon, green with an antenna sending signal waves
  'LN-1': '<path d="M32 16 v-8" stroke="#d6ffe6" stroke-width="2"/><circle cx="32" cy="7" r="3" fill="#ff6b6b"/>'
    + '<path d="M40 6 a8 8 0 0 1 0 8 M45 3 a13 13 0 0 1 0 14 M24 6 a8 8 0 0 0 0 8 M19 3 a13 13 0 0 0 0 14" fill="none" stroke="#d6ffe6" stroke-width="1.6" stroke-linecap="round"/>'
    + '<rect x="13" y="16" width="38" height="38" rx="14" fill="#45d48a" stroke="#1f8f55" stroke-width="1.5"/>'
    + '<rect x="24" y="44" width="16" height="5" rx="2.5" fill="#1f8f55" opacity=".5"/>'
    + '<path d="M18 54 v5 M46 54 v5" stroke="#1f8f55" stroke-width="3" stroke-linecap="round"/>' + FACE,
};

/** A round pet avatar: the pet's SVG character on its own colour (emoji if a pet has no art yet). */
function artHtml(pet) {
  const art = PET_ART[pet.id];
  return art ? `<svg viewBox="0 0 64 64" aria-hidden="true">${art}</svg>` : '';
}

// The pets team's 3D models (web/story/pets-3d, from Pranav's PayloadPets3D). Each story pet
// shows the real instrument it is, or the one its lander carried:
// Ghost -> LISTER (flew on Blue Ghost 1), Luna -> the retroreflector Blue Moon Mark 1 carries.
const PET_3D = { BLUE_GHOST: 'lister', BLUE_MOON: 'retro', TRIDENT: 'trident', 'LN-1': 'ln-1' };
const MOOD_3D = { happy: 'happy', warm: 'happy', cold: 'shivering', sleep: 'sleeping' };
let pets3d = null; // set once the 3D module has loaded; until then (or without WebGL) the drawn pets show

async function upgrade3d(a, opts = {}) {
  const model = PET_3D[a.dataset.pet];
  if (!pets3d || !model || a._h || a._loading) return;
  a._loading = true;
  try {
    a.classList.add('is3d');
    a._h = await pets3d.renderPet3D(model, 'happy', a, { autoRotate: true, interactive: false, ...opts });
    if (PET_3D[a.dataset.pet] && PET_3D[a.dataset.pet] !== model) a._h.setPet(PET_3D[a.dataset.pet]);
  } catch (e) {
    a.classList.remove('is3d');
    a.innerHTML = artHtml({ id: a.dataset.pet });
  }
  a._loading = false;
}

function setAvatarPet(a, pet) {
  a.dataset.pet = pet.id || '';
  if (a._h && PET_3D[pet.id]) a._h.setPet(PET_3D[pet.id]);
  else if (!a._h) a.innerHTML = artHtml(pet);
  if (!a._h) upgrade3d(a, { interactive: !!a.closest('#pet-face') });
}

/** A round pet avatar: the 3D model when available, the drawn character otherwise. */
function avatar(pet, opts) {
  const a = document.createElement('span');
  a.className = 'avatar';
  a.dataset.pet = pet.id || '';
  a.innerHTML = artHtml(pet);
  upgrade3d(a, opts);
  return a;
}

function renderPetCards() {
  const box = $('#pet-cards');
  box.replaceChildren();
  for (const pet of pets) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pet-card';
    b.dataset.pet = pet.id;
    b.setAttribute('aria-pressed', String(pet.id === $('#pet').value));
    const text = document.createElement('span');
    text.className = 'pc-text';
    const name = document.createElement('span');
    name.className = 'pc-name';
    name.textContent = pet.name;
    const mission = document.createElement('span');
    mission.className = 'pc-mission';
    mission.textContent = pet.instrument ? `${pet.instrument} · ${pet.vendor}` : pet.vendor;
    text.append(name, mission);
    b.append(avatar(pet), text);
    b.onclick = () => { $('#pet').value = pet.id; onPetChange(); };
    box.append(b);
  }
}

function renderStage(pet, moodFace, state, name) {
  const stage = $('#stage');
  const sunY = Math.sin(Math.PI * Math.min(1, progress));
  stage.style.setProperty('--sun-x', progress.toFixed(3));
  stage.style.setProperty('--sun-y', sunY.toFixed(3));
  stage.style.setProperty('--light', sunY.toFixed(3));
  stage.dataset.mood = state;
  stage.dataset.pet = pet.id || '';
  let earthUp = true;
  if (lastSky && lastSky.earth) {
    const frac = progress * (lastSky.gameDays / lastSky.monthDays);
    earthUp = lastSky.earth[Math.round(frac * (lastSky.earth.length - 1))] > 0;
  }
  $('#earth').dataset.up = String(earthUp);
  const holder = $('#pet-face');
  let a = holder.querySelector('.avatar');
  let tag = holder.querySelector('.pet-name');
  if (!a) {
    a = avatar(pet, { interactive: true });
    tag = document.createElement('span');
    tag.className = 'pet-name';
    holder.replaceChildren(a, tag);
  } else if (a.dataset.pet !== pet.id) {
    setAvatarPet(a, pet);
  }
  if (a._h && a._mood !== state) { a._mood = state; a._h.update(MOOD_3D[state] || 'happy'); }
  tag.textContent = name;
  holder.setAttribute('aria-label', `${name} the ${pet.instrument || pet.name}`);
}

function render() {
  const pet = currentPet();
  const name = $('#petName').value || pet.name;
  $('#slider').value = Math.round(progress * 1000);
  $('#readout').textContent = `Day ${(progress * DAY_EARTH_DAYS).toFixed(1)} of ${DAY_EARTH_DAYS}`;
  const [face, text, state] = mood();
  renderStage(pet, face, state, name);
  $('#chapter').textContent = care.fainted ? 'The end: lights out'
    : progress < 0.25 ? 'Chapter 1 · Sunrise: landing day'
    : progress < 0.7 ? 'Chapter 2 · High noon: science time'
    : progress < 0.95 ? 'Chapter 3 · Sunset: race the cold'
    : 'Chapter 4 · Night falls';
  if (!$('#stage').classList.contains('patted')) $('#mood').textContent = `${name}: ${text}`;
  renderMarkers();
  $('#pet-bio').textContent = `${pet.vendor || ''}: ${pet.tagline || ''}`;
  document.querySelectorAll('.pet-card').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.pet === $('#pet').value)));
  drawSky();
}

function onPetChange() {
  const pet = currentPet();
  if (pet.defaultSite && [...$('#site').options].some((o) => o.value === pet.defaultSite)) {
    $('#site').value = pet.defaultSite;
  }
  restart();
}

// ---------------------------------------------------------------- interactions

let markers = [];

/** Dots on the day track showing where a story is waiting. */
async function loadMarkers() {
  try {
    markers = await story.api(`/api/moments?site=${encodeURIComponent($('#site').value)}&pet=${encodeURIComponent($('#pet').value)}&progress=1`);
  } catch (e) { markers = []; }
  renderMarkers();
}

function renderMarkers() {
  const box = $('#markers');
  box.replaceChildren();
  for (const m of markers) {
    const d = document.createElement('span');
    d.className = 'marker' + (progress >= m.dayStart ? ' seen' : '');
    d.style.left = `${m.dayStart * 100}%`;
    d.title = progress >= m.dayStart ? m.title : 'A story is waiting here';
    box.append(d);
  }
  const seen = markers.filter((m) => progress >= m.dayStart).length;
  $('#story-count').textContent = markers.length ? `Stories found: ${seen} of ${markers.length}` : '';
}

const CHEERS = ['Beep boop! Thanks!', 'That tickles!', 'Best. Human. Ever.', 'Science is fun with you!', 'More pats, please!'];
let cheerTimer = null;

/** Clicking (or pressing Enter on) the pet gives it a pat: a heart floats up and it answers. */
function patPet() {
  const stage = $('#stage');
  const h = document.createElement('span');
  h.className = 'heart';
  h.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 21s-8-5.4-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.6-8 11-8 11z" fill="#ea580c" stroke="#d8ecff" stroke-width="1"/></svg>';
  h.style.left = `${46 + Math.random() * 8}%`;
  stage.append(h);
  setTimeout(() => h.remove(), 1200);
  const name = $('#petName').value || currentPet().name;
  $('#mood').textContent = `${name}: ${CHEERS[Math.floor(Math.random() * CHEERS.length)]}`;
  stage.classList.add('patted');
  clearTimeout(cheerTimer);
  cheerTimer = setTimeout(() => { stage.classList.remove('patted'); render(); }, 1400);
}

// ---------------------------------------------------------------- care game
// A small care loop for the story page (the engine branch owns the full rules and balance).
// Power charges with the Sun's height; Warmth falls when the Sun is low; data can only be sent
// while Earth is above the horizon, like real lander operations.

const care = { power: 70, warmth: 60, sent: 0, heater: false, tilt: 0, tiltCool: 0, sendCool: 0, fainted: false };

function resetCare() {
  Object.assign(care, { power: 70, warmth: 60, sent: 0, heater: false, tilt: 0, tiltCool: 0, sendCool: 0, fainted: false });
  renderCare();
}

function earthUpNow() {
  if (!lastSky || !lastSky.earth) return true;
  const frac = progress * (lastSky.gameDays / lastSky.monthDays);
  return lastSky.earth[Math.round(frac * (lastSky.earth.length - 1))] > 0;
}

function careTick() {
  const sunY = Math.sin(Math.PI * Math.min(1, progress));
  care.power += sunY * (care.tilt > 0 ? 1.6 : 1.0) - 0.55 - (care.heater ? 0.5 : 0);
  care.warmth += sunY * 1.2 - 1.06 + (care.heater ? 0.9 : 0);
  care.power = Math.max(0, Math.min(100, care.power));
  care.warmth = Math.max(0, Math.min(100, care.warmth));
  if (care.tilt > 0) care.tilt--;
  if (care.tiltCool > 0) care.tiltCool--;
  if (care.sendCool > 0) care.sendCool--;
  if (care.heater && care.power <= 0) care.heater = false;
  if (care.power <= 0 || care.warmth <= 0) care.fainted = true;
  renderCare();
}

function renderCare() {
  const set = (id, v) => {
    const el = $(`#m-${id}`);
    el.style.width = `${v}%`;
    el.dataset.level = v < 25 ? 'low' : v < 50 ? 'mid' : 'ok';
    $(`#v-${id}`).textContent = Math.round(v);
  };
  set('power', care.power);
  set('warmth', care.warmth);
  const up = earthUpNow();
  $('#link').textContent = up ? 'Earth link: ready' : 'Earth link: none (Earth is below the horizon)';
  $('#link').dataset.up = String(up);
  $('#v-data').textContent = `${care.sent} sent`;
  const live = !!timer && !care.fainted;
  $('#act-tilt').disabled = !live || care.tiltCool > 0;
  $('#act-tilt').textContent = care.tilt > 0 ? 'Panels tilted!' : 'Tilt panels to the Sun';
  $('#act-heater').disabled = !live;
  $('#act-heater').textContent = `Heater: ${care.heater ? 'on' : 'off'}`;
  $('#act-heater').setAttribute('aria-pressed', String(care.heater));
  $('#act-send').disabled = !live || !up || care.power < 15 || care.sendCool > 0;
  $('#care-tip').textContent = care.fainted
    ? (care.power <= 0 ? 'Out of power! Tilt the panels sooner next time.' : 'Too cold! Use the heater near sunrise and sunset.')
    : !timer ? 'Press Play, then keep Power and Warmth above zero until sunset. Real landers juggle the same three things.'
    : care.warmth < 30 ? 'Getting cold: switch the heater on (it uses power).'
    : care.power < 30 ? 'Power is low: tilt the panels, and turn the heater off if you can.'
    : up ? 'All good. Send data home while Earth is in view!' : 'All good. No Earth link right now, so data has to wait.';
}

function actTilt() { care.tilt = 22; care.tiltCool = 45; renderCare(); }
function actHeater() { care.heater = !care.heater; renderCare(); }
function actSend() {
  care.power -= 10;
  care.sent++;
  care.sendCool = 14;
  story.handleEngineEvent({ type: 'dataSent' });
  const name = $('#petName').value || currentPet().name;
  $('#mood').textContent = `${name}: Data sent to Earth!`;
  $('#stage').classList.add('patted');
  clearTimeout(cheerTimer);
  cheerTimer = setTimeout(() => { $('#stage').classList.remove('patted'); render(); }, 1200);
  renderCare();
}

// ---------------------------------------------------------------- pop-ups

async function checkMoments() {
  queue.push(...(await story.due(progress)));
  showNext();
}

function showNext() {
  if (showing || queue.length === 0) return;
  showing = true;
  pause();
  const m = queue.shift();
  $('#popup-title').textContent = m.title;
  $('#popup-text').textContent = m.text;
  $('#popup-mission').textContent = `Real mission: ${m.mission}`;
  const src = $('#popup-source');
  src.href = m.sourceUrl || '#';
  src.hidden = !m.sourceUrl;
  $('#popup').hidden = false;
  $('#popup-ok').focus();
}

function closePopup() {
  $('#popup').hidden = true;
  showing = false;
  if (queue.length) return showNext();
  if (progress >= 1) return finish();
  start();
}

// ---------------------------------------------------------------- playing

function start() {
  if (timer || progress >= 1 || care.fainted) return;
  $('#play').textContent = 'Pause';
  timer = setInterval(tick, 100);
  renderCare();
}

function pause() {
  clearInterval(timer);
  timer = null;
  $('#play').textContent = 'Play';
  renderCare();
}

async function tick() {
  progress = Math.min(1, progress + 0.004);
  careTick();
  render();
  if (care.fainted) { story.handleEngineEvent({ type: 'fainted' }); queue.length = 0; return finish(); }
  await checkMoments();
  if (progress >= 1 && !showing) finish();
}

async function finish() {
  pause();
  await fillPassport(true);
  $('#passport-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Fills section 5. done = the day is over, so the passport gets its rating stamp. */
async function fillPassport(done) {
  const p = await story.passport(progress, $('#petName').value);
  const rows = [
    ['Pet', `${p.petName}, based on ${p.instrument}`],
    ['Home', p.siteName],
    ['Survived', `${p.daysSurvived.toFixed(1)} of ${p.lunarDayLength} Earth days`],
    ['Rating', p.rating],
    ['Science', p.science.join('; ')],
    ['Stories', p.moments.map((m) => m.title).join(', ') || 'None yet'],
    ['Real mission', p.fate || ''],
  ];
  const body = $('#pp-body');
  body.replaceChildren();
  for (const [k, v] of rows.filter(([key]) => !['Survived', 'Rating', 'Real mission'].includes(key))) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    body.append(dt, dd);
  }
  const sdt = document.createElement('dt'); sdt.textContent = 'Sources';
  const sdd = document.createElement('dd');
  p.sources.forEach((u, k) => {
    const a = document.createElement('a');
    a.href = u; a.target = '_blank'; a.rel = 'noopener'; a.textContent = `NASA ${k + 1}`;
    a.className = 'srclink';
    sdd.append(a);
  });
  body.append(sdt, sdd);
  $('#pp-face .avatar')?._h?.dispose();
  $('#pp-face').replaceChildren(avatar(currentPet()));
  $('#pp-stamp').textContent = done ? p.rating : 'Not stamped yet';
  $('#passport').dataset.done = String(!!done);
  $('#pp-lead').textContent = done
    ? (care.fainted ? 'Your pet fainted before sunset. Here is how far it got. Play again to do better!' : 'Stamped! Your pet made it. Copy it to share.')
    : 'This fills in as you play. Finish the lunar day to get it stamped.';
  const stat = (big, small) => {
    const d = document.createElement('div');
    const b = document.createElement('b'); b.textContent = big;
    const s = document.createElement('span'); s.textContent = small;
    d.append(b, s);
    return d;
  };
  const found = markers.filter((m) => progress >= m.dayStart).length;
  $('#pp-stats').replaceChildren(
    stat(p.daysSurvived.toFixed(1), `of ${p.lunarDayLength} Earth days survived`),
    stat(`${found}/${markers.length}`, 'real stories found'),
    stat(String(care.sent), 'data sends to Earth'));
  $('#pp-journey').style.width = `${Math.min(100, (p.daysSurvived / p.lunarDayLength) * 100)}%`;
  $('#pp-fate').textContent = p.fate || '';
  const code = (t) => String(t).toUpperCase().replace(/[^A-Z0-9]+/g, '<');
  $('#pp-no').textContent = `No. CLPS-${code(currentPet().missionId || 'moon').replace(/</g, '-')}`;
  $('#pp-mrz').textContent = `P<MOON<${code(p.petName)}<<${code(p.siteName)}<<${code(p.rating)}`.padEnd(44, '<').slice(0, 44);
  $('#pp-nasa').href = p.sources[0] || 'https://www.nasa.gov/commercial-lunar-payload-services/';
  $('#pp-copy').onclick = () => navigator.clipboard?.writeText(
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\nSource: ${$('#pp-nasa').href}`);
}

function restart() {
  pause();
  progress = 0;
  story.setContext($('#site').value, $('#pet').value);
  resetCare();
  queue.length = 0;
  $('#popup').hidden = true;
  showing = false;
  render();
  renderTimeline();
  loadMarkers().then(() => fillPassport(false)).catch(() => {});
}

function renderTimeline() {
  const site = $('#site').value;
  const ol = $('#timeline');
  ol.replaceChildren();
  for (const m of missions) {
    const li = document.createElement('li');
    if (m.siteId === site) li.className = 'here';
    const tag = document.createElement('span');
    tag.className = `tag ${m.status}`;
    tag.textContent = m.status === 'NO_LANDING' ? 'NO LANDING' : m.status;
    const name = document.createElement('span');
    name.textContent = `${m.name} (${m.vendor})`;
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = m.landed ? `Landed ${m.landed}` : m.launched ? `Launched ${m.launched}` : 'Planned';
    li.append(tag, name, when);
    ol.append(li);
  }
}

// ---------------------------------------------------------------- Sun & Earth view

const skyCache = {};
const SVGNS = 'http://www.w3.org/2000/svg';
const HORIZON = 90;
const SCALE = 0.85; // pixels per degree of elevation

function svgEl(name, attrs, parent) {
  const el = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.append(el);
  return el;
}

function ensureSky(id, date) {
  const key = `${id}|${date}`;
  if (!skyCache[key]) skyCache[key] = story.sky(id, date);
  return skyCache[key];
}

function skyBox(data) {
  // The game plays the first half of the month, starting on the landing date.
  const frac = progress * (data.gameDays / data.monthDays);
  const i = Math.round(frac * (data.sun.length - 1));
  const sunEl = data.sun[i];
  const earthEl = data.earth ? data.earth[i] : data.earthElevation;
  const earthUp = earthEl > 0;
  const x = (n) => 20 + 260 * n;
  const day = new Date(Date.parse(data.startDate) + progress * data.gameDays * DAY_MS).toISOString().slice(0, 10);
  const box = document.createElement('div');
  box.className = 'skybox';
  const h = document.createElement('h4');
  h.textContent = data.name;
  const svg = svgEl('svg', { viewBox: '0 0 300 124', role: 'img',
    'aria-label': `${data.name} on ${day}: Sun ${sunEl.toFixed(1)} degrees, Earth ${earthEl.toFixed(1)} degrees above the horizon` });
  svgEl('rect', { x: 0, y: 0, width: 300, height: 124, fill: '#070918' }, svg);
  const path = data.sun.map((e, k) => `${k ? 'L' : 'M'}${x(k / (data.sun.length - 1)).toFixed(1)},${(HORIZON - Math.max(0, e) * SCALE).toFixed(1)}`).join(' ');
  svgEl('path', { d: path, fill: 'none', stroke: '#3b4285', 'stroke-dasharray': '3 3' }, svg);
  svgEl('rect', { x: 0, y: HORIZON, width: 300, height: 34, fill: '#2a2c40' }, svg);
  const label = (tx, anchor, text) => { svgEl('text', { x: tx, y: 116, fill: '#9aa0c7', 'font-size': 9, 'text-anchor': anchor }, svg).textContent = text; };
  label(20, 'start', data.startDate);
  label(280, 'end', '+29.5 days');
  svgEl('line', { x1: x(data.gameDays / data.monthDays), y1: 10, x2: x(data.gameDays / data.monthDays), y2: HORIZON, stroke: '#566', 'stroke-dasharray': '2 3' }, svg);
  if (earthUp) svgEl('circle', { cx: 150, cy: HORIZON - earthEl * SCALE, r: 6, fill: '#4a9bff' }, svg);
  if (sunEl > 0) svgEl('circle', { cx: x(frac), cy: HORIZON - sunEl * SCALE, r: 8, fill: '#ffd24a' }, svg);
  const power = Math.max(0, Math.sin(sunEl * Math.PI / 180)) * 100;
  const p = document.createElement('p');
  p.textContent = `${day}: Sun ${sunEl.toFixed(1)}° up, panel power ~${power.toFixed(0)}%. `
    + (earthUp ? `Earth ${earthEl.toFixed(1)}° up (link OK). ` : 'Earth below the horizon (no link). ')
    + `Average power over the game day: ~${data.avgPowerPct.toFixed(0)}%.`;
  box.append(h, svg, p);
  if (data.illuminationPct !== undefined) {
    const q = document.createElement('p');
    q.textContent = `Site profile (NASA Moon Trek): ${data.illuminationPct}% sunlit, Earth visible ${data.earthVisibilityPct}% of the time.`;
    box.append(q);
  }
  return box;
}

async function drawSky() {
  const date = $('#date').value || today();
  const ids = [$('#site').value, $('#compare').value].filter(Boolean);
  if (!ids[0]) return;
  try {
    const data = await Promise.all(ids.map((id) => ensureSky(id, date)));
    lastSky = data[0];
    $('#sky').replaceChildren(...data.map(skyBox));
    $('#sky-note').textContent = data.every((d) => d.real)
      ? `Sun and Earth positions: ${data[0].model}. Local terrain (hills hiding the Sun) is not included. Power assumes a flat panel; tilting panels toward the Sun helps.`
      : 'Simplified geometry, not NASA ephemeris data (add the data branch\'s data/ folder for real positions). It understates polar lighting. Power assumes a flat panel.';
  } catch (e) { console.error(e); }
}

async function bestDate() {
  const date = $('#date').value || today();
  const data = await ensureSky($('#site').value, date);
  $('#date').value = data.bestStartDate;
  drawSky();
}

// ---------------------------------------------------------------- wiring

$('#act-tilt').onclick = actTilt;
$('#act-heater').onclick = actHeater;
$('#act-send').onclick = actSend;
const petEl = $('#pet-face');
petEl.setAttribute('role', 'button');
petEl.tabIndex = 0;
petEl.onclick = patPet;
petEl.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); patPet(); } };
$('#play').onclick = () => (timer ? pause() : start());
$('#restart').onclick = restart;
$('#popup-ok').onclick = closePopup;
$('#pp-close').onclick = () => { restart(); $('#stage').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
$('#slider').oninput = (e) => { progress = e.target.value / 1000; render(); checkMoments(); };
$('#site').onchange = restart;
$('#pet').onchange = onPetChange;
$('#petName').oninput = render;
$('#compare').onchange = drawSky;
$('#date').onchange = drawSky;
$('#best').onclick = bestDate;
$('#date').value = today();
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('#popup').hidden) closePopup(); }
});

Promise.all([story.missions(), story.pets(), story.sites()]).then(([m, p, sites]) => {
  missions = m;
  pets = p;
  $('#site').replaceChildren();
  for (const s of sites) {
    for (const sel of [$('#site'), $('#compare')]) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      sel.append(opt);
    }
  }
  for (const pet of pets) {
    const opt = document.createElement('option');
    opt.value = pet.id;
    opt.textContent = `${pet.face} ${pet.name} (${pet.vendor})`;
    $('#pet').append(opt);
  }
  renderPetCards();
  onPetChange();
}).catch(console.error);
render();

// Load the 3D pets after the page works; if this fails (offline, no WebGL) the drawn pets stay.
import('./pets-3d/pets3d.js').then((m) => {
  pets3d = m;
  document.querySelectorAll('.avatar').forEach((a) => upgrade3d(a, { interactive: !!a.closest('#pet-face') }));
}).catch(() => {});
