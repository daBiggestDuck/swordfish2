// Engine data panel for the Story game. The deployer adds this file to web/story/rover.html as the
// page passes through it; the game's own files are not changed and the game never calls this code.
//
// When the game starts (the loading screen goes away) it opens an engine game for the same site and
// lead pet, then keeps the engine's clock in step with the game's day bar and mirrors the game's
// heater switch. It only READS the game's page: it never writes to it or changes how the game plays.
(() => {
  'use strict';
  const API = '/_deployer/engine/api/engine/';
  const POLL_MS = 1000;
  const MAX_TICK = 48;          // the engine refuses more than 48 h per tick
  const DAY_HOURS = 346;        // engine Rules.DAY_HOURS: one lunar day of sunlight
  const $ = (s) => document.querySelector(s);

  const panel = document.createElement('aside');
  panel.id = 'engine-hud';
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-label', 'Engine data: live rover and pet stats from the engine');
  panel.innerHTML = `
    <div class="eh-head"><i class="eh-dot"></i><span>Engine data</span>
      <button class="eh-toggle" type="button" aria-expanded="true" title="Hide or show engine data">–</button></div>
    <div class="eh-body">
      <div class="eh-msg">Connecting to the engine…</div>
    </div>`;
  document.body.appendChild(panel);
  const body = panel.querySelector('.eh-body');
  const toggle = panel.querySelector('.eh-toggle');
  try { if (localStorage.getItem('engine-hud-collapsed') === '1') collapse(true); } catch (e) { /* storage off */ }
  toggle.addEventListener('click', () => collapse(!panel.classList.contains('is-collapsed')));
  function collapse(on) {
    panel.classList.toggle('is-collapsed', on);
    toggle.textContent = on ? '+' : '–';
    toggle.setAttribute('aria-expanded', String(!on));
    try { localStorage.setItem('engine-hud-collapsed', on ? '1' : '0'); } catch (e) { /* storage off */ }
  }

  let sites = null, pets = null, id = null, state = null, source = '';
  let lastP = 0, lastAt = 0, hoursPerSec = DAY_HOURS / 90, nightHours = 0, busy = false;

  async function call(path) {
    const res = await fetch(API + path, { cache: 'no-store' });
    source = res.headers.get('X-Engine-Source') || source;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Engine answered ${res.status}`);
    return data;
  }

  // ---- read the game's page (never written to) ----
  const gameStarted = () => !document.body.classList.contains('is-loading');
  const gameOver = () => !!$('#end.is-visible');
  const isNight = () => ($('#day')?.textContent || '').trim().toLowerCase() === 'night';
  const heaterOn = () => $('#opt-heat')?.getAttribute('aria-pressed') === 'true';
  function dayProgress() {
    const w = parseFloat($('#track')?.style.width || '0');
    return Number.isFinite(w) ? Math.max(0, Math.min(1, w / 100)) : 0;
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function pick(list, ...wants) {
    for (const w of wants) {
      const hit = list.find((x) => norm(x.id) === norm(w) || norm(x.name) === norm(w));
      if (hit) return hit;
    }
    return list[0];
  }

  async function newGame() {
    if (!sites) [sites, pets] = await Promise.all([call('sites'), call('pets')]);
    const q = new URLSearchParams(location.search);
    const site = pick(sites, $('#site')?.textContent, q.get('site'));
    const leadName = $('#crew .pet-chip b')?.textContent;
    const pet = pick(pets, leadName, (q.get('pets') || 'lister').split(',')[0]);
    const r = await call(`new?site=${encodeURIComponent(site.id)}&pet=${encodeURIComponent(pet.id)}&name=${encodeURIComponent(pet.name)}`);
    id = r.id; state = r.state; lastP = 0; lastAt = performance.now(); nightHours = 0;
  }

  async function step() {
    if (!gameStarted()) return;
    if (!id) await newGame();
    if (gameOver()) return;                            // freeze on the end screen
    const p = dayProgress(), now = performance.now();
    if (!isNight() && p + 0.02 < lastP) await newGame(); // "Play the day again" restarted the bar
    if (!isNight() && p > lastP && now > lastAt) hoursPerSec = ((p - lastP) * DAY_HOURS) / ((now - lastAt) / 1000);
    if (isNight()) nightHours += hoursPerSec * (now - lastAt) / 1000;
    lastP = p; lastAt = now;

    const target = isNight() ? DAY_HOURS + nightHours : p * DAY_HOURS;
    let behind = target - state.hour;
    while (behind > 0.01 && state.alive && !state.won) {
      const h = Math.min(MAX_TICK, behind);
      state = (await call(`tick?id=${id}&hours=${h.toFixed(3)}`)).state;
      behind -= h;
    }
    if (state.alive && heaterOn() !== !!state.heaterOn) {
      const heater = (state.actions || []).find((a) => a.id === 'heater');
      if (heater && !heater.blockedBy) state = (await call(`act?id=${id}&action=heater`)).state;
    }
  }

  // ---- draw ----
  const fmt = (n, d = 0) => (Number.isFinite(+n) ? (+n).toFixed(d) : '–');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function meter(label, v, low) {
    const pct = Math.max(0, Math.min(100, +v || 0));
    return `<div class="eh-meter"><span>${label}</span><div class="eh-bar${low ? ' is-low' : ''}"><i style="width:${pct}%"></i></div><b>${fmt(v)}</b></div>`;
  }
  function render() {
    if (!state) return;
    const s = state, pet = s.pet || {};
    const status = s.tempStatus === 'cold' ? 'Too cold' : s.tempStatus === 'hot' ? 'Too hot' : 'In safe range';
    const data = pet.id === 'LRA' ? `${s.pings} pings` : `${fmt(s.dataBuffer, 1)} / ${fmt(s.dataSent, 1)} sent`;
    body.innerHTML = `
      <div class="eh-temp"><b>${fmt(s.petTempK)} K</b><span>${fmt(s.petTempK - 273.15)} °C</span></div>
      <div class="eh-status"><span class="${esc(s.tempStatus)}">${status}</span> · safe ${fmt(pet.minSafeK)}–${fmt(pet.maxSafeK)} K</div>
      ${meter('Power', s.power, s.power < 25)}
      ${meter('Health', s.health, s.health < 40)}
      ${meter('Dust', s.dust, s.dust >= 60)}
      <dl>
        <dt>Pet</dt><dd>${esc(s.petName)} (${esc(pet.id)})</dd>
        <dt>Mood</dt><dd>${esc(s.mood)}</dd>
        <dt>Ground temp</dt><dd>${fmt(s.surfaceTempK)} K</dd>
        <dt>Sun elevation</dt><dd>${fmt(s.sunElevation, 1)}°</dd>
        <dt>Solar</dt><dd>+${fmt(s.solarPerHour, 2)} /h</dd>
        <dt>Heater · shade</dt><dd>${s.heaterOn ? 'on' : 'off'} · ${s.shadeOn ? 'on' : 'off'}</dd>
        <dt>Data</dt><dd>${data}</dd>
        <dt>Mission time</dt><dd>${fmt(s.hour)} h · ${fmt(s.earthDays, 1)} d</dd>
        <dt>Site</dt><dd>${esc((s.site || {}).name)}</dd>
      </dl>
      <div class="eh-foot">${!s.alive ? 'Engine says: pet stopped responding · ' : s.won ? 'Engine says: mission complete · ' : ''}Live from ${esc(source || 'engine')}</div>`;
  }

  async function loop() {
    if (!busy) {
      busy = true;
      try {
        await step();
        panel.classList.add('is-live'); panel.classList.remove('is-down');
        render();
      } catch (e) {
        panel.classList.add('is-down'); panel.classList.remove('is-live');
        if (!state) body.innerHTML = `<div class="eh-msg">${esc(e.message)}</div>`;
        if (/No game with that id/.test(e.message)) id = null; // engine restarted: start over
      } finally {
        busy = false;
      }
    }
    setTimeout(loop, POLL_MS);
  }
  loop();
})();
