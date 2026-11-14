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

function currentPet() {
  return pets.find((p) => p.id === $('#pet').value) || { name: 'Pip', face: '🙂', sleepsAtNight: false };
}

function today() { return new Date().toISOString().slice(0, 10); }

// ---------------------------------------------------------------- pet and day

function mood() {
  const pet = currentPet();
  if (progress >= 0.95) return pet.sleepsAtNight ? ['😴', 'Sleeping through the night'] : ['🥶', 'Brr, the night is here!'];
  if (progress >= 0.8) return ['🥶', 'Sunset is close. It is getting cold...'];
  if (progress >= 0.5) return ['😄', 'Full sun, feeling great!'];
  return ['🙂', 'Warming up in the morning light'];
}

function render() {
  const pet = currentPet();
  $('#slider').value = Math.round(progress * 1000);
  $('#readout').textContent = `Day ${(progress * DAY_EARTH_DAYS).toFixed(1)} of ${DAY_EARTH_DAYS}`;
  const [face, text] = mood();
  $('#pet-face').textContent = pet.face + face;
  $('#mood').textContent = `${$('#petName').value || pet.name}: ${text}`;
  $('#pet-bio').textContent = `${pet.vendor || ''}: ${pet.tagline || ''}`;
  drawSky();
}

function onPetChange() {
  const pet = currentPet();
  if (pet.defaultSite && [...$('#site').options].some((o) => o.value === pet.defaultSite)) {
    $('#site').value = pet.defaultSite;
  }
  restart();
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
  if (timer || progress >= 1) return;
  $('#play').textContent = 'Pause';
  timer = setInterval(tick, 100);
}

function pause() {
  clearInterval(timer);
  timer = null;
  $('#play').textContent = 'Play';
}

async function tick() {
  progress = Math.min(1, progress + 0.004);
  render();
  await checkMoments();
  if (progress >= 1 && !showing) finish();
}

async function finish() {
  pause();
  const p = await story.passport(progress, $('#petName').value);
  const rows = [
    ['Pet', `${p.petName}, based on ${p.instrument}`],
    ['Home', p.siteName],
    ['Survived', `${p.daysSurvived.toFixed(1)} of ${p.lunarDayLength} Earth days`],
    ['Rating', p.rating],
    ['Science', p.science.join('; ')],
    ['Stories', p.moments.map((m) => m.title).join(', ') || 'None yet'],
  ];
  const body = $('#pp-body');
  body.replaceChildren();
  for (const [k, v] of rows) {
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
  $('#pp-nasa').href = p.sources[0] || 'https://www.nasa.gov/commercial-lunar-payload-services/';
  $('#pp-copy').onclick = () => navigator.clipboard?.writeText(
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\nSource: ${$('#pp-nasa').href}`);
  $('#passport').hidden = false;
  $('#pp-close').focus();
}

function restart() {
  pause();
  progress = 0;
  story.setContext($('#site').value, $('#pet').value);
  queue.length = 0;
  $('#popup').hidden = true;
  $('#passport').hidden = true;
  showing = false;
  render();
  renderTimeline();
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

$('#play').onclick = () => (timer ? pause() : start());
$('#restart').onclick = restart;
$('#popup-ok').onclick = closePopup;
$('#pp-close').onclick = () => { $('#passport').hidden = true; };
$('#slider').oninput = (e) => { progress = e.target.value / 1000; render(); checkMoments(); };
$('#site').onchange = restart;
$('#pet').onchange = onPetChange;
$('#petName').oninput = render;
$('#compare').onchange = drawSky;
$('#date').onchange = drawSky;
$('#best').onclick = bestDate;
$('#date').value = today();
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('#popup').hidden) closePopup(); else $('#passport').hidden = true; }
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
  onPetChange();
}).catch(console.error);
render();
