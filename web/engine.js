// Engine page. All game rules run in Java (src/engine). This file only draws the state
// and sends button presses to the local server. It never contacts any other website.
//
// Reliability rules this file follows:
//  - every request has a timeout and every failure lands in a visible message, never a silent hang;
//  - only one request is in flight at a time (ticks and button presses share one lock);
//  - if the server goes away we pause, poll /api/engine/health, and pick up where we left off;
//  - if the server restarted (game id unknown) we say so and offer a one-click new game.
(() => {
  const $ = (s) => document.querySelector(s);
  const FACES = {
    happy: '😄', night: '🌙', dusty: '😣', sleepy: '😴', freezing: '🥶',
    overheating: '🥵', fainted: '😵', proud: '🏆',
  };
  const MOOD_TEXT = {
    happy: 'Feeling great in the sunshine', night: 'Hanging on through the lunar night',
    dusty: 'Covered in dust: shake it off!', sleepy: 'Battery nearly empty',
    freezing: 'Too cold! Turn on the heater', overheating: 'Too hot! Use the sunshade',
    fainted: 'Fainted', proud: 'Survived a whole lunar day and night!',
  };
  const TICK_MS = 250;
  const REQUEST_TIMEOUT_MS = 6000;
  const RETRY_MS = 2500;
  const PREFS_KEY = 'payload-pets-engine-prefs';

  let gameId = null;
  let state = null;
  let timer = null;
  let busy = false;
  let ready = false;
  let retryTimer = null;
  let facts = { facts: [], sources: [], milestones: [] };

  // ---------------------------------------------------------------- network

  class EngineDown extends Error {}
  class GameLost extends Error {}

  async function api(path) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(path, { signal: ctrl.signal, cache: 'no-store' });
    } catch (e) {
      throw new EngineDown(e.name === 'AbortError' ? 'The engine took too long to answer.' : 'Cannot reach the engine server.');
    } finally {
      clearTimeout(t);
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      throw new EngineDown(`Engine answered ${res.status} without data. Is ./run-engine.sh running?`);
    }
    if (res.status === 404 && /No game/i.test(body?.error || '')) throw new GameLost(body.error);
    if (!res.ok) throw new Error(body?.error || `${path} failed (${res.status})`);
    return body;
  }

  /** Runs one request at a time; returns undefined if something else is already in flight. */
  async function exclusive(fn) {
    if (busy) return undefined;
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  }

  function setConn(kind, text) {
    const el = $('#conn');
    el.dataset.kind = kind;
    el.hidden = kind === 'ok';
    $('#conn-text').textContent = text || '';
  }

  function handleFailure(e) {
    pause();
    if (e instanceof GameLost) {
      gameId = null;
      setConn('lost', 'The engine restarted, so this game is gone. Start a new one; your pet and site are still selected.');
      showSetup();
    } else if (e instanceof EngineDown) {
      setConn('down', `${e.message} Start it with ./run-engine.sh. Retrying…`);
      waitForEngine();
    } else {
      $('#error').textContent = e.message;
    }
  }

  function waitForEngine() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(async () => {
      try {
        await api('/api/engine/health');
        setConn('ok');
        if (!ready) await init();
        else if (gameId) {
          const s = await api(`/api/engine/state?id=${encodeURIComponent(gameId)}`);
          state = s;
          render();
          setConn('ok');
          $('#error').textContent = 'Reconnected. Press Play (or Space) to keep going.';
        }
      } catch (e) {
        if (e instanceof GameLost) handleFailure(e);
        else waitForEngine();
      }
    }, RETRY_MS);
  }

  const kToC = (k) => Math.round(k - 273.15);
  const temp = (k) => `${Math.round(k)} K (${kToC(k)} °C)`;
  const pct = (v) => `${Math.round(v)}`;

  // ---------------------------------------------------------------- setup

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        pet: $('#pet').value, site: $('#site').value, name: $('#name').value, tipped: $('#tipped').checked,
      }));
    } catch {
      /* storage blocked: preferences are a convenience only */
    }
  }

  async function init() {
    setConn('wait', 'Connecting to the engine…');
    $('#start').disabled = true;
    const [sites, pets, f] = await Promise.all([
      api('/api/engine/sites'), api('/api/engine/pets'), api('/api/engine/facts'),
    ]);
    facts = f;
    $('#pet').innerHTML = '';
    $('#site').innerHTML = '';
    for (const p of pets) $('#pet').add(new Option(`${p.name}: ${p.fullName} (${p.flewOn})`, p.id));
    for (const s of sites) {
      const o = new Option(`${s.name} (${s.region})`, s.id);
      o.dataset.note = `${s.note} Noon ${temp(s.dayMaxK)}, night ${temp(s.nightMinK)}.`;
      $('#site').add(o);
    }
    const prefs = loadPrefs();
    if (prefs.pet && pets.some((p) => p.id === prefs.pet)) $('#pet').value = prefs.pet;
    if (prefs.site && sites.some((s) => s.id === prefs.site)) $('#site').value = prefs.site;
    if (typeof prefs.name === 'string' && prefs.name.trim()) $('#name').value = prefs.name.slice(0, 24);
    $('#tipped').checked = Boolean(prefs.tipped);
    showSiteNote();
    renderFacts();
    renderMilestones();
    ready = true;
    $('#start').disabled = false;
    setConn('ok');
  }

  function showSiteNote() {
    $('#site-note').textContent = $('#site').selectedOptions[0]?.dataset.note || '';
  }

  async function start() {
    if (!ready) return;
    pause();
    savePrefs();
    $('#start').disabled = true;
    try {
      const r = await exclusive(() => api(`/api/engine/new?${new URLSearchParams({
        site: $('#site').value, pet: $('#pet').value, name: $('#name').value.trim(),
        tipped: $('#tipped').checked,
      })}`));
      if (!r) return;
      gameId = r.id;
      state = r.state;
      $('#log').innerHTML = '';
      $('#over').hidden = true;
      $('#error').textContent = '';
      setConn('ok');
      $('#setup').hidden = true;
      $('#game').hidden = false;
      log(`${state.petName} the ${state.pet.name} landed at ${state.site.name}. Sunrise!`, 'big');
      render();
      $('#play').focus();
    } catch (e) {
      handleFailure(e);
    } finally {
      $('#start').disabled = !ready;
    }
  }

  function showSetup() {
    pause();
    $('#game').hidden = true;
    $('#setup').hidden = false;
  }

  function restart() {
    $('#error').textContent = '';
    showSetup();
    $('#start').focus();
  }

  // ---------------------------------------------------------------- time

  function canPlay() {
    return Boolean(gameId && state && state.alive && !state.won);
  }

  function play() {
    if (timer || !canPlay()) return;
    $('#error').textContent = '';
    timer = setInterval(step, TICK_MS);
    $('#play').textContent = '⏸ Pause';
    $('#play').setAttribute('aria-pressed', 'true');
  }

  function pause() {
    clearInterval(timer);
    timer = null;
    $('#play').textContent = '▶ Play';
    $('#play').setAttribute('aria-pressed', 'false');
  }

  function togglePlay() {
    if (timer) pause();
    else play();
  }

  async function step() {
    try {
      const hours = Number($('#speed').value) / (1000 / TICK_MS);
      const r = await exclusive(() => api(`/api/engine/tick?id=${encodeURIComponent(gameId)}&hours=${hours}`));
      if (!r) return;
      state = r.state;
      r.events.forEach(describe);
      render();
      if (!state.alive || state.won) { pause(); showOver(); }
    } catch (e) {
      handleFailure(e);
    }
  }

  async function act(id) {
    if (!gameId) return;
    try {
      const r = await exclusive(() => api(`/api/engine/act?id=${encodeURIComponent(gameId)}&action=${encodeURIComponent(id)}`));
      if (!r) return;
      state = r.state;
      $('#error').textContent = r.result.error || '';
      r.result.events.forEach(describe);
      render();
    } catch (e) {
      handleFailure(e);
    }
  }

  // ---------------------------------------------------------------- drawing

  function setBar(id, value, { invert = false } = {}) {
    const el = $(`#m-${id}`);
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    el.style.width = `${v}%`;
    const health = invert ? 100 - v : v;
    el.className = health < 10 ? 'bad' : health < 25 ? 'warn' : '';
    $(`#v-${id}`).textContent = pct(v);
    el.parentElement.setAttribute('aria-valuenow', String(Math.round(v)));
  }

  function render() {
    const s = state;
    if (!s) return;
    $('#title').textContent = `${s.petName} the ${s.pet.name} at ${s.site.name}${s.tipped ? ' (tipped)' : ''}`;
    $('#face').textContent = FACES[s.mood] || '🙂';
    $('#mood').textContent = MOOD_TEXT[s.mood] || s.mood;

    const day = s.isDay;
    $('#clock').textContent = day
      ? `☀️ Day ${s.earthDays.toFixed(1)} of ${(s.dayHours / 24).toFixed(1)} (hour ${Math.floor(s.hour)})`
      : `🌑 Night: ${Math.floor(s.hour - s.dayHours)} h after sunset`;
    $('#sun').style.width = `${Math.min(100, (s.hour / s.gameHours) * 100)}%`;
    $('#sun').classList.toggle('night', !day);

    setBar('health', s.health);
    setBar('power', s.power);
    setBar('dust', s.dust, { invert: true });
    setBar('data', s.dataBuffer, { invert: true });
    $('#m-data').className = '';

    $('#t-ground').textContent = temp(s.surfaceTempK);
    $('#t-pet').textContent = temp(s.petTempK);
    $('#t-pet').className = s.tempStatus === 'ok' ? '' : s.tempStatus;
    $('#t-pet-label').textContent = s.petName;
    $('#t-safe').textContent = s.pet.passive ? 'Any (passive)' : `${s.pet.minSafeK}–${s.pet.maxSafeK} K`;
    $('#t-solar').textContent = s.pet.passive ? 'Not needed' : `+${s.solarPerHour.toFixed(1)} / h`;
    $('#t-sent').textContent = s.dataSent.toFixed(0);
    if (s.pet.id === 'LISTER') { $('#t-extra-label').textContent = 'Drill depth'; $('#t-extra').textContent = `${s.drillDepthM.toFixed(3)} m of 1 m`; }
    else if (s.pet.id === 'LRA') { $('#t-extra-label').textContent = 'Laser pings'; $('#t-extra').textContent = s.pings; }
    else if (s.pet.id === 'LN-1') { $('#t-extra-label').textContent = 'Beacon pings'; $('#t-extra').textContent = s.pings; }
    else { $('#t-extra-label').textContent = 'Lander hour'; $('#t-extra').textContent = Math.floor(s.hour); }

    const box = $('#actions');
    const focusedId = document.activeElement?.dataset?.action;
    box.innerHTML = '';
    for (const a of s.actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.action = a.id;
      b.textContent = a.label + (a.powerCost > 0 ? ` (−${Math.round(a.powerCost)}⚡)` : '');
      b.disabled = Boolean(a.blockedBy);
      b.title = a.blockedBy || '';
      if ((a.id === 'heater' && s.heaterOn) || (a.id === 'shade' && s.shadeOn)) {
        b.classList.add('on');
        b.setAttribute('aria-pressed', 'true');
      }
      b.addEventListener('click', () => act(a.id));
      box.appendChild(b);
      if (a.id === focusedId && !b.disabled) b.focus();
    }
    $('#play').disabled = !canPlay();
    renderMilestones();
  }

  const EVENT_TEXT = {
    powerLow: ['Power is getting low.', ''],
    powerCritical: ['Power critical!', 'bad'],
    powerRecovered: ['Power back to normal.', ''],
    tooHot: ['Overheating! Use the sunshade.', 'bad'],
    tooCold: ['Freezing! Turn on the heater.', 'bad'],
    comfortable: ['Temperature is safe again.', ''],
    dusty: ['Dust is piling up on the panels.', ''],
    heaterOn: ['Heater on.', ''], heaterOff: ['Heater off.', ''],
    shadeOn: ['Sunshade up.', ''], shadeOff: ['Sunshade down.', ''],
    cleaned: ['Shook off the dust.', ''],
    sunset: ['🌅 Sunset. The lunar night begins and solar power stops.', 'big'],
    fainted: ['😵 Your pet fainted.', 'bad'],
    won: ['🏆 Sunrise again! You survived a full lunar day and night.', 'big'],
  };

  function describe(e) {
    const when = `h${Math.floor(e.hour)}`;
    if (e.type === 'moodChanged') return;
    if (e.type === 'drilled') return log(`${when} Drilled to ${e.detail}. Measured the soil's temperature.`, 'big');
    if (e.type === 'ping') {
      const what = state?.pet?.id === 'LN-1' ? 'Beacon ranging ping answered' : 'Laser ping from orbit bounced back';
      return log(`${when} ${what} (+${Number(e.detail).toFixed(1)} data).`);
    }
    if (e.type === 'dustTest') return log(`${when} Dust test done. The electric field cleared the surface.`);
    if (e.type === 'dataSent') return log(`${when} Sent ${Number(e.detail).toFixed(0)} data to Earth.`, 'big');
    if (e.type === 'milestone') {
      const m = facts.milestones.find((x) => x.id === e.detail);
      return log(`${when} ⭐ ${m ? m.text : e.detail}`, 'big');
    }
    const [text, cls] = EVENT_TEXT[e.type] || [e.type, ''];
    log(`${when} ${text}`, cls);
  }

  function log(text, cls = '') {
    const li = document.createElement('li');
    li.textContent = text;
    if (cls) li.className = cls;
    const ol = $('#log');
    ol.prepend(li);
    while (ol.children.length > 200) ol.lastElementChild.remove();
  }

  function showOver() {
    const s = state;
    const beaten = facts.milestones.filter((m) => s.milestones.includes(m.id)).map((m) => m.mission);
    const box = $('#over');
    box.innerHTML = '';
    box.className = `over ${s.won ? 'won' : 'lost'}`;
    const h = document.createElement('h3');
    h.textContent = s.won ? '🏆 You survived a full lunar day and night!' : `${s.petName} lasted ${s.earthDays.toFixed(1)} Earth days`;
    const p = document.createElement('p');
    p.textContent = `Data sent home: ${s.dataSent.toFixed(0)}. ` +
      (beaten.length ? `Beat or matched: ${beaten.join(', ')}.` : 'Try to outlast IM-2 (one day) next time!');
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'primary';
    again.textContent = 'Play again';
    again.addEventListener('click', restart);
    box.append(h, p, again);
    box.hidden = false;
  }

  function renderMilestones() {
    const done = state ? state.milestones : [];
    const ul = $('#milestones');
    ul.innerHTML = '';
    for (const m of facts.milestones) {
      const li = document.createElement('li');
      li.textContent = `${m.mission}, ${Math.round(m.hours)} h: ${m.text}`;
      if (done.includes(m.id)) li.className = 'done';
      ul.appendChild(li);
    }
  }

  function renderFacts() {
    const index = new Map(facts.sources.map((s, i) => [s.id, i + 1]));
    const byTopic = new Map();
    for (const f of facts.facts) {
      if (!byTopic.has(f.topic)) byTopic.set(f.topic, []);
      byTopic.get(f.topic).push(f);
    }
    const box = $('#facts');
    box.innerHTML = '';
    for (const [topic, list] of byTopic) {
      const h = document.createElement('h3');
      h.textContent = topic;
      const ul = document.createElement('ul');
      for (const f of list) {
        const li = document.createElement('li');
        li.textContent = `${f.text} `;
        const sup = document.createElement('sup');
        const a = document.createElement('a');
        a.href = `#src-${f.sourceId}`;
        a.textContent = `[${index.get(f.sourceId)}]`;
        sup.appendChild(a);
        li.appendChild(sup);
        ul.appendChild(li);
      }
      box.append(h, ul);
    }
    const ol = $('#sources');
    ol.innerHTML = '';
    for (const s of facts.sources) {
      const li = document.createElement('li');
      li.id = `src-${s.id}`;
      const a = document.createElement('a');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = s.title;
      li.appendChild(a);
      ol.appendChild(li);
    }
  }

  // ---------------------------------------------------------------- wiring

  $('#setup').addEventListener('submit', (e) => { e.preventDefault(); start(); });
  $('#restart').addEventListener('click', restart);
  $('#play').addEventListener('click', togglePlay);
  $('#conn-retry').addEventListener('click', () => {
    clearTimeout(retryTimer);
    (ready ? Promise.resolve() : init()).then(() => setConn('ok')).catch(handleFailure);
  });
  $('#site').addEventListener('change', showSiteNote);

  // Space toggles play while a game is on screen (unless typing or on a button that Space already clicks).
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || $('#game').hidden) return;
    if (e.target instanceof Element && e.target.closest('input, select, textarea, button, a')) return;
    e.preventDefault();
    togglePlay();
  });

  // Pause when the page is hidden, or when the v0 shell switches to another tab (it posts a message).
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('message', (e) => {
    if (e.source === window.parent && e.data && e.data.type === 'shell:tab-hidden') pause();
  });

  try {
    if (window.parent !== window) document.documentElement.classList.add('in-shell');
  } catch {
    /* cross-origin parent: fine */
  }

  init().catch(handleFailure);
})();
