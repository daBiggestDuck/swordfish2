// Engine page. All game rules run in Java (src/engine). This file only draws the state
// and sends button presses to the local server. It never contacts any other website.
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

  let gameId = null;
  let state = null;
  let timer = null;
  let busy = false;
  let facts = { facts: [], sources: [], milestones: [] };

  async function api(path) {
    const res = await fetch(path);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `${path} failed`);
    return body;
  }

  const kToC = (k) => Math.round(k - 273.15);
  const temp = (k) => `${Math.round(k)} K (${kToC(k)} °C)`;
  const pct = (v) => `${Math.round(v)}`;

  // ---------------------------------------------------------------- setup

  async function init() {
    const [sites, pets, f] = await Promise.all([
      api('/api/engine/sites'), api('/api/engine/pets'), api('/api/engine/facts'),
    ]);
    facts = f;
    for (const p of pets) $('#pet').add(new Option(`${p.name}: ${p.fullName} (${p.flewOn})`, p.id));
    for (const s of sites) {
      const o = new Option(`${s.name} (${s.region})`, s.id);
      o.dataset.note = `${s.note} Noon ${temp(s.dayMaxK)}, night ${temp(s.nightMinK)}.`;
      $('#site').add(o);
    }
    $('#site').addEventListener('change', showSiteNote);
    showSiteNote();
    renderFacts();
    renderMilestones();
  }

  function showSiteNote() {
    $('#site-note').textContent = $('#site').selectedOptions[0]?.dataset.note || '';
  }

  async function start() {
    pause();
    const q = new URLSearchParams({
      site: $('#site').value, pet: $('#pet').value, name: $('#name').value,
      tipped: $('#tipped').checked,
    });
    const r = await api(`/api/engine/new?${q}`);
    gameId = r.id;
    state = r.state;
    $('#log').innerHTML = '';
    $('#over').hidden = true;
    $('#setup').hidden = true;
    $('#game').hidden = false;
    log(`${state.petName} the ${state.pet.name} landed at ${state.site.name}. Sunrise!`, 'big');
    render();
  }

  function restart() {
    pause();
    $('#game').hidden = true;
    $('#setup').hidden = false;
  }

  // ---------------------------------------------------------------- time

  function play() {
    if (timer || !state || !state.alive || state.won) return;
    timer = setInterval(step, 1000 / 4);
    $('#play').textContent = '⏸ Pause';
  }

  function pause() {
    clearInterval(timer);
    timer = null;
    $('#play').textContent = '▶ Play';
  }

  async function step() {
    if (busy) return;
    busy = true;
    try {
      const hours = Number($('#speed').value) / 4;
      const r = await api(`/api/engine/tick?id=${gameId}&hours=${hours}`);
      state = r.state;
      r.events.forEach(describe);
      render();
      if (!state.alive || state.won) { pause(); showOver(); }
    } catch (e) {
      pause();
      $('#error').textContent = e.message;
    } finally {
      busy = false;
    }
  }

  async function act(id) {
    const r = await api(`/api/engine/act?id=${gameId}&action=${id}`);
    state = r.state;
    $('#error').textContent = r.result.error || '';
    r.result.events.forEach(describe);
    render();
  }

  // ---------------------------------------------------------------- drawing

  function setBar(id, value, { invert = false } = {}) {
    const el = $(`#m-${id}`);
    el.style.width = `${Math.max(0, Math.min(100, value))}%`;
    const v = invert ? 100 - value : value;
    el.className = v < 10 ? 'bad' : v < 25 ? 'warn' : '';
    $(`#v-${id}`).textContent = pct(value);
  }

  function render() {
    const s = state;
    $('#title').textContent = `${s.petName} the ${s.pet.name} at ${s.site.name}${s.tipped ? ' (tipped)' : ''}`;
    $('#face').textContent = FACES[s.mood] || '🙂';
    $('#mood').textContent = MOOD_TEXT[s.mood] || s.mood;

    const day = s.isDay;
    $('#clock').textContent = day
      ? `☀️ Day ${s.earthDays.toFixed(1)} of ${(s.dayHours / 24).toFixed(1)} (hour ${Math.floor(s.hour)})`
      : `🌑 Night: ${Math.floor(s.hour - s.dayHours)} h after sunset`;
    $('#sun').style.width = `${(s.hour / s.gameHours) * 100}%`;
    $('#sun').style.background = day ? '' : '#5b6aa0';

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
    else { $('#t-extra-label').textContent = 'Lander hour'; $('#t-extra').textContent = Math.floor(s.hour); }

    const box = $('#actions');
    box.innerHTML = '';
    for (const a of s.actions) {
      const b = document.createElement('button');
      b.textContent = a.label + (a.powerCost > 0 ? ` (−${Math.round(a.powerCost)}⚡)` : '');
      b.disabled = Boolean(a.blockedBy);
      b.title = a.blockedBy || '';
      if ((a.id === 'heater' && s.heaterOn) || (a.id === 'shade' && s.shadeOn)) b.classList.add('on');
      b.addEventListener('click', () => act(a.id));
      box.appendChild(b);
    }
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
    if (e.type === 'ping') return log(`${when} Laser ping from orbit bounced back (+${Number(e.detail).toFixed(1)} data).`);
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
    $('#log').prepend(li);
  }

  function showOver() {
    const s = state;
    const beaten = facts.milestones.filter((m) => s.milestones.includes(m.id)).map((m) => m.mission);
    const box = $('#over');
    box.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = s.won ? '🏆 You survived a full lunar day and night!' : `${s.petName} lasted ${s.earthDays.toFixed(1)} Earth days`;
    const p = document.createElement('p');
    p.textContent = `Data sent home: ${s.dataSent.toFixed(0)}. ` +
      (beaten.length ? `Beat or matched: ${beaten.join(', ')}.` : 'Try to outlast IM-2 (one day) next time!');
    box.append(h, p);
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

  $('#start').addEventListener('click', () => start().catch((e) => { $('#site-note').textContent = e.message; }));
  $('#restart').addEventListener('click', restart);
  $('#play').addEventListener('click', () => (timer ? pause() : play()));
  init().catch((e) => { $('#site-note').textContent = `Could not reach the engine server: ${e.message}`; });
})();
