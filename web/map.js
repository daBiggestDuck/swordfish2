import { LunarGlobeGL } from './globe_gl.js';

const $ = (sel) => document.querySelector(sel);
const SVGNS = 'http://www.w3.org/2000/svg';

const state = {
  data: null,
  ephemeris: [],
  filteredSites: [],
  filteredMissions: [],
  selectedSiteId: 'SHACKLETON_RIM',
  pickedPetSiteId: localStorage.getItem('payloadPets.selectedSite') || null,
  confirmedDrop: (() => {
    try { return JSON.parse(localStorage.getItem('payloadPets.selectedDrop') || 'null'); }
    catch { return null; }
  })(),
  compareIds: ['SHACKLETON_RIM', 'MALAPERT_A', 'MARE_CRISIUM'],
  projection: '3d', // '3d' | 'global' | 'pole'
  sampleIndex: 141, // 2026-Dec-03 12:00 UTC
  playing: false,
  playTimer: null,
  sky: null,
  failedMissionId: null,
  impactedMissionIds: new Set(),
  globe: null,
  stagedDrop: null, // { lat, lon, evalData }
};

function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(el);
  return el;
}

async function api(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

function parseHorizonsRows(horizonsJson) {
  const text = horizonsJson?.result || '';
  const soe = text.indexOf('$$SOE');
  const eoe = text.indexOf('$$EOE');
  if (soe < 0 || eoe <= soe) return [];
  const rows = [];
  for (const rawLine of text.slice(soe + 5, eoe).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const p = line.split(',');
    if (p.length < 7) continue;
    const obsSubLon = parseFloat(p[3]);
    const obsSubLat = parseFloat(p[4]);
    const sunSubLon = parseFloat(p[5]);
    const sunSubLat = parseFloat(p[6]);
    if ([obsSubLon, obsSubLat, sunSubLon, sunSubLat].some(Number.isNaN)) continue;
    rows.push({ timestampUtc: p[0].trim(), obsSubLon, obsSubLat, sunSubLon, sunSubLat });
  }
  return rows;
}

function formatCoords(lat, lon) {
  const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr} / ${lonStr}`;
}

function quickSunElevation(lat, lon, ep) {
  const rad = Math.PI / 180;
  const s =
    Math.sin(lat * rad) * Math.sin(ep.sunSubLat * rad) +
    Math.cos(lat * rad) * Math.cos(ep.sunSubLat * rad) * Math.cos((ep.sunSubLon - lon) * rad);
  return (Math.asin(Math.max(-1, Math.min(1, s))) * 180) / Math.PI;
}

function primarySiteStatus(siteId) {
  const siteMissions = (state.data?.missions || []).filter((m) => m.siteId === siteId);
  if (siteMissions.some((m) => m.status === 'LANDED')) return 'LANDED';
  if (siteMissions.some((m) => m.status === 'PLANNED')) return 'PLANNED';
  if (siteMissions.some((m) => m.status === 'NO_LANDING')) return 'NO_LANDING';
  return 'PLANNED';
}

function currentFilters() {
  return {
    timeWindow: $('#f-time').value,
    year: $('#f-year').value,
    region: $('#f-region').value,
    status: $('#f-status').value,
    payloadType: $('#f-payload').value,
    q: $('#f-search').value.trim(),
  };
}

async function applyFilters() {
  const qs = new URLSearchParams(currentFilters()).toString();
  const [sites, missions] = await Promise.all([
    api(`/api/map/sites?${qs}`),
    api(`/api/map/missions?${qs}`),
  ]);
  state.filteredSites = sites;
  state.filteredMissions = missions;
  if (sites.length > 0 && !sites.some((s) => s.id === state.selectedSiteId) && !state.confirmedDrop?.custom) {
    state.selectedSiteId = sites[0].id;
    await loadSiteSky();
  }
  renderSiteList();
  renderMap();
  renderMissions();
}

async function loadSiteSky() {
  if (state.confirmedDrop && !state.confirmedDrop.matchedKnownSite) {
    const ev = await api(
      `/api/map/evaluate?lat=${state.confirmedDrop.lat}&lon=${state.confirmedDrop.lon}&sample=${state.sampleIndex}`
    );
    state.sky = ev.sky;
    renderDossierFromEval(ev);
  } else {
    state.sky = await api(
      `/api/map/sky?site=${encodeURIComponent(state.selectedSiteId)}&sample=${state.sampleIndex}`
    );
    renderDossier();
  }
  renderTelemetry();
  renderSkyDome();
  renderOpChart();
  updateClockDisplay();

  const ep = state.ephemeris[state.sampleIndex];
  if (ep && state.globe) {
    state.globe.setSunAndEarth(ep.sunSubLat, ep.sunSubLon, ep.obsSubLat, ep.obsSubLon);
  }
  if (state.stagedDrop) {
    await stageDropPoint(state.stagedDrop.lat, state.stagedDrop.lon, false);
  }
}

async function selectSite(siteId) {
  state.confirmedDrop = null;
  state.selectedSiteId = siteId;
  const site = (state.data?.sites || []).find((s) => s.id === siteId);
  if (site && state.globe && state.projection === '3d') {
    state.globe.focusLatLon(site.lat, site.lon);
  }
  await loadSiteSky();
  renderSiteList();
  renderMap();
  if ($('#tab-recipe').classList.contains('active')) {
    await refreshRecipe();
  }
}

function updateClockDisplay() {
  const ep = state.ephemeris[state.sampleIndex];
  const utcText = ep ? `${ep.timestampUtc} UTC` : (state.sky?.timestampUtc || '—');
  $('#clock-utc').textContent = utcText;
  $('#clock-sample').textContent = `Sample ${state.sampleIndex + 1} / ${state.ephemeris.length || 178} · 4h step`;
  $('#time-slider').value = String(state.sampleIndex);
}

function renderSiteList() {
  const ul = $('#site-list');
  ul.replaceChildren();
  $('#site-count').textContent = String(state.filteredSites.length);

  for (const s of state.filteredSites) {
    const status = primarySiteStatus(s.id);
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `site-item${s.id === state.selectedSiteId && !state.confirmedDrop?.custom ? ' active' : ''}`;
    btn.onclick = () => selectSite(s.id);

    const left = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'sname';
    name.textContent = s.name + (state.pickedPetSiteId === s.id ? ' ★' : '');
    const coord = document.createElement('span');
    coord.className = 'scoord';
    coord.textContent = `${formatCoords(s.lat, s.lon)} · ${s.illuminationTerrainPct}% sun`;
    left.append(name, coord);

    const pill = document.createElement('span');
    pill.className = `status-pill ${status}`;
    pill.textContent = status.replace('_', ' ');
    btn.append(left, pill);
    li.append(btn);
    ul.append(li);
  }
}

function renderDossier() {
  const site = (state.data?.sites || []).find((s) => s.id === state.selectedSiteId);
  if (!site) return;

  $('#dossier-region').textContent = site.region.replace('_', ' ');
  $('#dossier-title').textContent = site.name;
  $('#dossier-coords').textContent = formatCoords(site.lat, site.lon);
  $('#dossier-terrain').textContent = site.terrainSummary;

  const siteMissions = (state.data?.missions || []).filter((m) => m.siteId === site.id);
  $('#dossier-missions').textContent = siteMissions.length
    ? siteMissions.map((m) => `${m.name} (${m.taskOrder})`).join(' · ')
    : 'Artemis III / Practice Candidate';
  $('#dossier-lighting').textContent = `${site.lightingCondition} (${site.illuminationTerrainPct}% terrain vs ${site.illuminationFlatPct}% flat)`;
  $('#dossier-elev').textContent = `${(site.elevationMeters / 1000).toFixed(2)} km · Slope ${site.slopeDegrees.toFixed(1)}°`;
  $('#dossier-psr').textContent = `${site.nearestPsrName} (${site.nearestPsrKm.toFixed(1)} km)`;
  $('#dossier-temp').textContent = `${site.divinerMinTempK}–${site.divinerMaxTempK} K (Diviner-calibrated)`;
  $('#dossier-science').textContent = site.scienceGoal;

  $('#link-quickmap').href = site.quickmapUrl;
  $('#link-trek').href = site.trekUrl;
  $('#link-nasa').href = site.sourceUrl;

  const banner = $('#picked-banner');
  if (state.pickedPetSiteId === site.id) {
    banner.hidden = false;
    banner.textContent = `Confirmed Payload Pet Drop Site: ${site.shortName} (${formatCoords(site.lat, site.lon)})`;
  } else {
    banner.hidden = true;
  }
}

function renderDossierFromEval(ev) {
  $('#dossier-region').textContent = ev.region.replace('_', ' ');
  $('#dossier-title').textContent = ev.name;
  $('#dossier-coords').textContent = formatCoords(ev.lat, ev.lon);
  $('#dossier-terrain').textContent = ev.terrainSummary;
  $('#dossier-missions').textContent = ev.nearestSiteName
    ? `Nearest CLPS: ${ev.nearestSiteName} (${ev.nearestSiteKm} km away)`
    : 'Custom cursor drop zone';
  $('#dossier-lighting').textContent = `${ev.lightingCondition} (${ev.sky.windows.computedSunlitTerrainPct}% sunlit)`;
  $('#dossier-elev').textContent = `${(ev.elevationMeters / 1000).toFixed(2)} km · Slope ${ev.slopeDegrees.toFixed(1)}°`;
  $('#dossier-psr').textContent = `${ev.nearestPsrName} (${ev.nearestPsrKm.toFixed(1)} km)`;
  $('#dossier-temp').textContent = `${ev.divinerMinTempK}–${ev.divinerMaxTempK} K`;
  $('#dossier-science').textContent = ev.warnings.join(' ');

  $('#link-quickmap').href =
    `https://quickmap.lroc.im-ldi.com/?extent=${ev.lon - 5},${ev.lat - 5},${ev.lon + 5},${ev.lat + 5}&proj=10&earthShadowEnabled=true&stack=3314`;
  $('#link-trek').href =
    `https://trek.nasa.gov/moon/#v=0.1&x=${ev.lon}&y=${ev.lat}&z=5&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104903&b=moon`;
  $('#link-nasa').href = 'https://www.nasa.gov/commercial-lunar-payload-services/';

  const banner = $('#picked-banner');
  banner.hidden = false;
  banner.textContent = `Confirmed Custom Drop at ${formatCoords(ev.lat, ev.lon)} (Suitability ${ev.scores.overall}/100)`;
}

function renderTelemetry() {
  if (!state.sky) return;
  const cur = state.sky.current;
  const win = state.sky.windows;

  const sunSign = cur.sunElevationDeg >= 0 ? '+' : '';
  $('#tele-sun-elev').textContent = `${sunSign}${cur.sunElevationDeg.toFixed(1)}°`;
  $('#tele-sun-sub').textContent = `Azimuth ${cur.sunAzimuthDeg.toFixed(0)}° · Panel Power ${cur.panelPowerPct.toFixed(0)}%`;
  $('#tele-next-sunset').textContent = cur.nextSunset;
  const sunBadge = $('#tele-sun-badge');
  sunBadge.textContent = cur.sunlit ? 'SUNLIT' : 'SHADOW';
  sunBadge.className = `badge ${cur.sunlit ? 'good' : 'warn'}`;

  $('#tele-dte-status').textContent = cur.earthVisible ? 'LOS' : 'BLOCKED';
  $('#tele-dte-sub').textContent = `Earth elev ${cur.earthElevationDeg >= 0 ? '+' : ''}${cur.earthElevationDeg.toFixed(1)}° · DTE ${win.dteCoveragePct}%`;
  $('#tele-next-earthset').textContent = cur.nextEarthset;
  const dteBadge = $('#tele-dte-badge');
  dteBadge.textContent = cur.earthVisible ? 'LINE OF SIGHT' : 'FAR-SIDE RELAY REQ';
  dteBadge.className = `badge ${cur.earthVisible ? 'info' : 'bad'}`;

  $('#tele-op-state').textContent = cur.operationalState;
  $('#tele-op-sub').textContent = `Surface Temp ~${cur.surfaceTempK.toFixed(0)} K`;
  $('#tele-illum-cmp').textContent = `${win.computedSunlitTerrainPct}% / ${win.computedSunlitFlatPct}%`;
  const opBadge = $('#tele-op-badge');
  opBadge.textContent = cur.dualViable ? 'DUAL VIABLE' : (cur.sunlit ? 'SOLAR ONLY' : 'SURVIVAL');
  opBadge.className = `badge ${cur.dualViable ? 'good' : (cur.sunlit ? 'warn' : 'bad')}`;

  $('#win-sunlit').textContent = win.sunlitDaysText;
  $('#win-dte').textContent = `${win.dteCoveragePct}%`;
  $('#win-dual').textContent = win.dualViableDaysText;
}

// ---- Pre-Drop Staging & Environmental Context Callout ----
async function stageDropPoint(lat, lon, fetchNew = true) {
  const ev =
    !fetchNew && state.stagedDrop?.evalData
      ? state.stagedDrop.evalData
      : await api(`/api/map/evaluate?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&sample=${state.sampleIndex}`);

  state.stagedDrop = { lat: ev.lat, lon: ev.lon, evalData: ev };
  if (state.globe) {
    state.globe.setStagedPoint(ev.lat, ev.lon);
  }

  const cur = ev.sky.current;
  const win = ev.sky.windows;

  $('#pd-title').textContent = ev.name;
  $('#pd-coords').textContent = `${formatCoords(ev.lat, ev.lon)} · ${ev.region.replace('_', ' ')}`;
  $('#pd-summary').textContent = ev.terrainSummary;

  const pill = $('#pd-score-pill');
  pill.textContent = `Suitability ${ev.scores.overall}/100`;
  pill.className = `badge ${ev.scores.overall >= 75 ? 'good' : ev.scores.overall >= 55 ? 'warn' : 'bad'}`;

  $('#pd-sun').textContent = `${cur.sunElevationDeg >= 0 ? '+' : ''}${cur.sunElevationDeg.toFixed(1)}° (${cur.sunlit ? 'SUNLIT' : 'SHADOW'})`;
  $('#pd-sun-sub').textContent = `${win.computedSunlitTerrainPct}% 29.5d sun · Array ${cur.panelPowerPct.toFixed(0)}%`;

  const tempC = Math.round(cur.surfaceTempK - 273.15);
  $('#pd-temp').textContent = `${Math.round(cur.surfaceTempK)} K (${tempC}°C)`;
  $('#pd-temp-sub').textContent = `Diviner ${ev.divinerMinTempK}–${ev.divinerMaxTempK} K`;

  $('#pd-terrain').textContent = `${(ev.elevationMeters / 1000).toFixed(2)} km · ${ev.slopeDegrees.toFixed(1)}° slope`;
  $('#pd-terrain-sub').textContent = `Safety Score ${ev.scores.safety}/100`;

  $('#pd-comms').textContent = cur.earthVisible ? `LOS (${win.dteCoveragePct}% DTE)` : 'BLOCKED (0% DTE)';
  $('#pd-comms-sub').textContent = cur.earthVisible
    ? `Earth ${cur.earthElevationDeg >= 0 ? '+' : ''}${cur.earthElevationDeg.toFixed(1)}° up`
    : 'Orbital relay required';

  $('#pd-psr').textContent = `${ev.nearestPsrKm.toFixed(1)} km`;
  $('#pd-psr-sub').textContent = ev.nearestPsrName;

  $('#pd-pet').textContent = `P ×${ev.decayMultipliers.power} · W ×${ev.decayMultipliers.warmth} · S ×${ev.decayMultipliers.signal}`;
  $('#pd-pet-sub').textContent = `Next sunset: ${cur.nextSunset}`;

  const warnUl = $('#pd-warnings');
  warnUl.replaceChildren();
  for (const w of ev.warnings) {
    const li = document.createElement('li');
    li.textContent = w;
    warnUl.appendChild(li);
  }

  $('#predrop-card').hidden = false;
  renderMap();
}

function clearStagedDrop() {
  state.stagedDrop = null;
  $('#predrop-card').hidden = true;
  if (state.globe) state.globe.setStagedPoint(null, null);
  renderMap();
}

async function confirmStagedDrop() {
  if (!state.stagedDrop) return;
  const ev = state.stagedDrop.evalData;
  const dropRecord = {
    id: ev.id,
    name: ev.name,
    lat: ev.lat,
    lon: ev.lon,
    region: ev.region,
    matchedKnownSite: ev.matchedKnownSite,
    custom: !ev.matchedKnownSite,
    decayMultipliers: ev.decayMultipliers,
    scores: ev.scores,
    confirmedAt: new Date().toISOString(),
  };

  state.confirmedDrop = dropRecord;
  localStorage.setItem('payloadPets.selectedDrop', JSON.stringify(dropRecord));
  if (ev.matchedKnownSite && ev.nearestSiteId) {
    state.selectedSiteId = ev.nearestSiteId;
    state.pickedPetSiteId = ev.nearestSiteId;
    localStorage.setItem('payloadPets.selectedSite', ev.nearestSiteId);
  } else {
    state.pickedPetSiteId = ev.id;
    localStorage.setItem('payloadPets.selectedSite', ev.id);
  }

  clearStagedDrop();
  await loadSiteSky();
  renderSiteList();
  renderMap();
  window.dispatchEvent(new CustomEvent('payloadPets:siteSelected', { detail: dropRecord }));
}

// ---- Map Projection Helpers ----
function projectGlobal(lat, lon) {
  return {
    x: ((lon + 180) / 360) * 960,
    y: ((90 - lat) / 180) * 480,
  };
}

function projectSouthPole(lat, lon) {
  const colat = Math.max(0, 90 + lat);
  const maxColat = 16.5;
  const radius = 212;
  const r = (colat / maxColat) * radius;
  const rad = (lon * Math.PI) / 180;
  return {
    x: 480 + r * Math.sin(rad),
    y: 240 - r * Math.cos(rad),
  };
}

function unproject2DClick(clientX, clientY, svg) {
  const rect = svg.getBoundingClientRect();
  const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 960;
  const y = ((clientY - rect.top) / Math.max(1, rect.height)) * 480;
  if (state.projection === 'global') {
    const lon = (x / 960) * 360 - 180;
    const lat = 90 - (y / 480) * 180;
    return { lat, lon };
  }
  const dx = x - 480;
  const dy = 240 - y;
  const r = Math.hypot(dx, dy);
  if (r > 215) return null;
  const colat = (r / 212) * 16.5;
  const lat = -90 + colat;
  const lon = (Math.atan2(dx, dy) * 180) / Math.PI;
  return { lat, lon };
}

function projectPoint2D(lat, lon) {
  return state.projection === 'global' ? projectGlobal(lat, lon) : projectSouthPole(lat, lon);
}

function render3DOverlay() {
  const svg = $('#globe-overlay');
  svg.replaceChildren();
  if (!state.globe || state.projection !== '3d') return;

  const ep = state.ephemeris[state.sampleIndex] || { sunSubLon: 121.2, sunSubLat: -1.35, obsSubLon: -4.2, obsSubLat: -5.9 };
  const showPsr = $('#lyr-psr').checked;
  const showLinks = $('#lyr-links').checked;

  // PSR markers on 3D globe
  if (showPsr) {
    for (const psr of state.data?.psrZones || []) {
      const p = state.globe.latLonToScreen(psr.centerLat, psr.centerLon);
      if (!p.visible) continue;
      svgEl('circle', {
        cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 4.5,
        fill: 'rgba(68, 226, 255, 0.34)', stroke: '#44e2ff', 'stroke-width': '1',
      }, svg);
    }
  }

  // LunarLink dependency arcs projected on 3D globe
  if (showLinks) {
    const siteById = new Map((state.data?.sites || []).map((s) => [s.id, s]));
    const missionById = new Map((state.data?.missions || []).map((m) => [m.id, m]));
    for (const m of state.filteredMissions) {
      const toSite = siteById.get(m.siteId);
      if (!toSite) continue;
      for (const depId of m.dependsOn || []) {
        const fromM = missionById.get(depId);
        const fromSite = fromM ? siteById.get(fromM.siteId) : null;
        if (!fromSite || fromSite.id === toSite.id) continue;
        const p1 = state.globe.latLonToScreen(fromSite.lat, fromSite.lon);
        const p2 = state.globe.latLonToScreen(toSite.lat, toSite.lon);
        if (!p1.visible && !p2.visible) continue;
        const isHit = state.impactedMissionIds.has(m.id);
        svgEl('line', {
          x1: p1.x.toFixed(1), y1: p1.y.toFixed(1), x2: p2.x.toFixed(1), y2: p2.y.toFixed(1),
          stroke: isHit ? '#ff6b6b' : '#4a68b0', 'stroke-width': isHit ? '2.1' : '1.1',
          'stroke-dasharray': isHit ? 'none' : '4 3', opacity: '0.72',
        }, svg);
      }
    }
  }

  // Sub-Solar & Sub-Earth pins
  const sunP = state.globe.latLonToScreen(ep.sunSubLat, ep.sunSubLon);
  if (sunP.visible) {
    svgEl('circle', { cx: sunP.x.toFixed(1), cy: sunP.y.toFixed(1), r: 6, fill: '#ffb84d', stroke: '#fff', 'stroke-width': '1.2' }, svg);
    svgEl('text', { x: (sunP.x + 8).toFixed(1), y: (sunP.y + 3).toFixed(1), fill: '#ffb84d', 'font-size': '9.5', 'font-family': 'monospace' }, svg).textContent = 'SUN';
  }
  const earthP = state.globe.latLonToScreen(ep.obsSubLat, ep.obsSubLon);
  if (earthP.visible) {
    svgEl('circle', { cx: earthP.x.toFixed(1), cy: earthP.y.toFixed(1), r: 5, fill: '#58a6ff', stroke: '#fff', 'stroke-width': '1.2' }, svg);
    svgEl('text', { x: (earthP.x + 8).toFixed(1), y: (earthP.y + 3).toFixed(1), fill: '#58a6ff', 'font-size': '9.5', 'font-family': 'monospace' }, svg).textContent = 'EARTH';
  }

  // Clickable CLPS Landing Sites on 3D Globe
  for (const s of state.filteredSites) {
    const p = state.globe.latLonToScreen(s.lat, s.lon);
    if (!p.visible) continue;
    const status = primarySiteStatus(s.id);
    const color = status === 'LANDED' ? '#45d48a' : status === 'NO_LANDING' ? '#ff6b6b' : '#62b0ff';
    const selected = s.id === state.selectedSiteId && !state.confirmedDrop?.custom;

    if (selected) {
      svgEl('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 10.5, fill: 'none', stroke: '#ffffff', 'stroke-width': '1.6' }, svg);
    }
    const dot = svgEl('circle', {
      cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: selected ? 6.2 : 5,
      fill: color, stroke: '#070a14', 'stroke-width': '1.5', class: 'clickable-marker',
    }, svg);
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      stageDropPoint(s.lat, s.lon);
    });

    const lbl = svgEl('text', {
      x: (p.x + 8).toFixed(1), y: (p.y + 3).toFixed(1),
      fill: selected ? '#ffffff' : '#dce6f9', 'font-size': '10.5', 'font-weight': selected ? '700' : '500',
      class: 'clickable-marker',
    }, svg);
    lbl.textContent = s.shortName + (state.pickedPetSiteId === s.id ? ' ★' : '');
    lbl.addEventListener('click', (e) => {
      e.stopPropagation();
      stageDropPoint(s.lat, s.lon);
    });
  }

  // Confirmed Custom Drop Marker
  if (state.confirmedDrop?.custom) {
    const cp = state.globe.latLonToScreen(state.confirmedDrop.lat, state.confirmedDrop.lon);
    if (cp.visible) {
      svgEl('circle', { cx: cp.x.toFixed(1), cy: cp.y.toFixed(1), r: 7, fill: '#45d48a', stroke: '#ffffff', 'stroke-width': '2' }, svg);
      svgEl('text', { x: (cp.x + 10).toFixed(1), y: (cp.y + 4).toFixed(1), fill: '#45d48a', 'font-size': '10.5', 'font-weight': '700' }, svg).textContent = 'DROPPED ★';
    }
  }

  // Staged Drop Pin + Leader Line to #predrop-card (matches user sketch!)
  if (state.stagedDrop) {
    const sp = state.globe.latLonToScreen(state.stagedDrop.lat, state.stagedDrop.lon);
    const card = $('#predrop-card');
    const dockLeft = sp.visible && sp.x > 480;
    card.classList.toggle('dock-left', dockLeft);
    if (sp.visible) {
      const targetX = dockLeft ? 336 : 624;
      const targetY = 120;
      const elbowX = sp.x + (targetX - sp.x) * 0.45;
      svgEl('polyline', {
        points: `${sp.x.toFixed(1)},${sp.y.toFixed(1)} ${elbowX.toFixed(1)},${targetY} ${targetX},${targetY}`,
        fill: 'none', stroke: '#ffb84d', 'stroke-width': '1.8', 'stroke-dasharray': '4 2',
      }, svg);
      svgEl('circle', { cx: sp.x.toFixed(1), cy: sp.y.toFixed(1), r: 11, fill: 'none', stroke: '#ffb84d', 'stroke-width': '1.8' }, svg);
      svgEl('circle', { cx: sp.x.toFixed(1), cy: sp.y.toFixed(1), r: 4.5, fill: '#ffffff', stroke: '#ffb84d', 'stroke-width': '1.5' }, svg);
    }
  }
}

function renderMap() {
  const is3D = state.projection === '3d';
  $('#lunar-globe-gl').hidden = !is3D;
  $('#globe-overlay').hidden = !is3D;
  $('#lunar-map').hidden = is3D;

  if (is3D) {
    if (state.globe) {
      state.globe.setLayers({
        showTerminator: $('#lyr-terminator').checked,
        showGraticule: $('#lyr-graticule').checked,
      });
    }
    render3DOverlay();
    return;
  }

  const svg = $('#lunar-map');
  svg.replaceChildren();
  const ep = state.ephemeris[state.sampleIndex] || { sunSubLon: 121.2, sunSubLat: -1.35, obsSubLon: -4.2, obsSubLat: -5.9 };
  const showTerm = $('#lyr-terminator').checked;
  const showGrid = $('#lyr-graticule').checked;
  const showPsr = $('#lyr-psr').checked;
  const showLinks = $('#lyr-links').checked;

  svgEl('rect', { x: 0, y: 0, width: 960, height: 480, fill: '#090e1b' }, svg);

  if (state.projection === 'global') {
    svgEl('rect', { x: 240, y: 0, width: 480, height: 480, fill: '#10182d', opacity: '0.55' }, svg);
    for (const f of state.data?.quickmap?.notableAlbedoFeatures || []) {
      const p = projectGlobal(f.lat, f.lon > 180 ? f.lon - 360 : f.lon);
      const r = f.radiusDeg * 2.55;
      const isMare = f.albedo.includes('mare');
      svgEl('circle', {
        cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: r.toFixed(1),
        fill: isMare ? '#070b14' : '#2a3758', opacity: isMare ? '0.68' : '0.3',
      }, svg);
      svgEl('text', {
        x: p.x.toFixed(1), y: (p.y + 3).toFixed(1),
        fill: '#495a82', 'font-size': '9', 'text-anchor': 'middle', 'font-family': 'monospace',
      }, svg).textContent = f.name;
    }

    if (showGrid) {
      for (let lon = -150; lon <= 150; lon += 30) {
        const x = ((lon + 180) / 360) * 960;
        svgEl('line', {
          x1: x, y1: 0, x2: x, y2: 480,
          stroke: lon === 0 ? '#2b3d66' : '#162038', 'stroke-width': lon === 0 ? 1.4 : 0.8,
          'stroke-dasharray': Math.abs(lon) === 90 ? '4 4' : '',
        }, svg);
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = ((90 - lat) / 180) * 480;
        svgEl('line', {
          x1: 0, y1: y, x2: 960, y2: y,
          stroke: lat === 0 ? '#2b3d66' : '#162038', 'stroke-width': lat === 0 ? 1.4 : 0.8,
        }, svg);
      }
    }

    if (showTerm) {
      const rad = Math.PI / 180;
      const sunLatRad = Math.abs(ep.sunSubLat) < 0.12 ? (ep.sunSubLat >= 0 ? 0.12 : -0.12) * rad : ep.sunSubLat * rad;
      const pts = [];
      for (let lon = -180; lon <= 180; lon += 4) {
        const dLon = (ep.sunSubLon - lon) * rad;
        const termLatRad = Math.atan(-Math.cos(dLon) / Math.tan(sunLatRad));
        const p = projectGlobal((termLatRad * 180) / Math.PI, lon);
        pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
      }
      const nightPoleY = ep.sunSubLat >= 0 ? 480 : 0;
      svgEl('path', { d: `M 0,${nightPoleY} L ${pts.join(' L ')} L 960,${nightPoleY} Z`, fill: '#02040a', opacity: '0.52' }, svg);
      svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: '#ffb84d', 'stroke-width': '1.2', opacity: '0.65' }, svg);
    }
  } else {
    svgEl('circle', { cx: 480, cy: 240, r: 215, fill: '#121b31', stroke: '#293b66', 'stroke-width': '1.5' }, svg);
    if (showGrid) {
      for (const latRing of [-85, -80, -75]) {
        const r = ((90 + latRing) / 16.5) * 212;
        svgEl('circle', { cx: 480, cy: 240, r: r.toFixed(1), fill: 'none', stroke: '#223055', 'stroke-dasharray': '3 3' }, svg);
        svgEl('text', { x: 484, y: (240 - r + 11).toFixed(1), fill: '#6c80ad', 'font-size': '10' }, svg).textContent = `${Math.abs(latRing)}°S`;
      }
    }
    if (showTerm) {
      const sunRad = (ep.sunSubLon * Math.PI) / 180;
      const nx = -Math.sin(sunRad);
      const ny = Math.cos(sunRad);
      const tx = -ny;
      const ty = nx;
      const R = 212;
      const pts = [
        [480 + tx * R, 240 + ty * R],
        [480 + tx * R + nx * R, 240 + ty * R + ny * R],
        [480 - tx * R + nx * R, 240 - ty * R + ny * R],
        [480 - tx * R, 240 - ty * R],
      ].map((p) => p.map((n) => n.toFixed(1)).join(','));
      const clip = svgEl('clipPath', { id: 'pole-clip' }, svg);
      svgEl('circle', { cx: 480, cy: 240, r: 212 }, clip);
      svgEl('polygon', { points: pts.join(' '), fill: '#02040a', opacity: '0.48', 'clip-path': 'url(#pole-clip)' }, svg);
    }
  }

  if (showPsr) {
    for (const psr of state.data?.psrZones || []) {
      if (state.projection === 'pole' && psr.centerLat > -74) continue;
      if (state.projection === 'global') {
        const p = projectGlobal(psr.centerLat, psr.centerLon);
        svgEl('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 5.5, fill: 'rgba(68, 226, 255, 0.3)', stroke: '#44e2ff', 'stroke-width': '1' }, svg);
      } else if (psr.rings?.[0]) {
        const pts = psr.rings[0].map(([lon, lat]) => {
          const p = projectSouthPole(lat, lon);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        }).join(' ');
        svgEl('polygon', { points: pts, fill: 'rgba(68, 226, 255, 0.28)', stroke: '#44e2ff', 'stroke-width': '1.2' }, svg);
      }
    }
  }

  if (showLinks) {
    const siteById = new Map((state.data?.sites || []).map((s) => [s.id, s]));
    const missionById = new Map((state.data?.missions || []).map((m) => [m.id, m]));
    for (const m of state.filteredMissions) {
      const toSite = siteById.get(m.siteId);
      if (!toSite) continue;
      if (state.projection === 'pole' && toSite.lat > -73.5) continue;
      for (const depId of m.dependsOn || []) {
        const fromM = missionById.get(depId);
        const fromSite = fromM ? siteById.get(fromM.siteId) : null;
        if (!fromSite || fromSite.id === toSite.id) continue;
        if (state.projection === 'pole' && fromSite.lat > -73.5) continue;
        const p1 = projectPoint2D(fromSite.lat, fromSite.lon);
        const p2 = projectPoint2D(toSite.lat, toSite.lon);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2 - 22;
        const isHit = state.impactedMissionIds.has(m.id);
        svgEl('path', {
          d: `M ${p1.x.toFixed(1)},${p1.y.toFixed(1)} Q ${mx.toFixed(1)},${my.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`,
          fill: 'none', stroke: isHit ? '#ff6b6b' : '#4a68b0', 'stroke-width': isHit ? '2.2' : '1.2',
          'stroke-dasharray': isHit ? 'none' : '4 3', opacity: isHit ? '0.95' : '0.65',
        }, svg);
      }
    }
  }

  if (state.projection === 'global') {
    const subSun = projectGlobal(ep.sunSubLat, ep.sunSubLon);
    svgEl('circle', { cx: subSun.x.toFixed(1), cy: subSun.y.toFixed(1), r: 6.5, fill: '#ffb84d', stroke: '#fff', 'stroke-width': '1.2' }, svg);
    const subEarth = projectGlobal(ep.obsSubLat, ep.obsSubLon);
    svgEl('circle', { cx: subEarth.x.toFixed(1), cy: subEarth.y.toFixed(1), r: 5.5, fill: '#58a6ff', stroke: '#fff', 'stroke-width': '1.2' }, svg);
  }

  for (const s of state.filteredSites) {
    if (state.projection === 'pole' && s.lat > -73.5) continue;
    const p = projectPoint2D(s.lat, s.lon);
    const status = primarySiteStatus(s.id);
    const color = status === 'LANDED' ? '#45d48a' : status === 'NO_LANDING' ? '#ff6b6b' : '#62b0ff';
    const selected = s.id === state.selectedSiteId;

    if (selected) {
      svgEl('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 12, fill: 'none', stroke: '#ffffff', 'stroke-width': '2' }, svg);
    }
    const marker = svgEl('circle', {
      cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: selected ? 7 : 5.5,
      fill: color, stroke: '#070a14', 'stroke-width': '1.6', style: 'cursor:pointer',
    }, svg);
    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      stageDropPoint(s.lat, s.lon);
    });
    svgEl('text', {
      x: (p.x + 10).toFixed(1), y: (p.y + 4).toFixed(1),
      fill: selected ? '#ffffff' : '#c2cee8', 'font-size': selected ? '11.5' : '10',
      'font-weight': selected ? '700' : '500', style: 'cursor:pointer',
    }, svg).textContent = s.shortName + (state.pickedPetSiteId === s.id ? ' ★' : '');
  }

  if (state.stagedDrop) {
    const sp = projectPoint2D(state.stagedDrop.lat, state.stagedDrop.lon);
    const card = $('#predrop-card');
    const dockLeft = sp.x > 480;
    card.classList.toggle('dock-left', dockLeft);
    svgEl('circle', { cx: sp.x.toFixed(1), cy: sp.y.toFixed(1), r: 10, fill: 'none', stroke: '#ffb84d', 'stroke-width': '1.8' }, svg);
    svgEl('circle', { cx: sp.x.toFixed(1), cy: sp.y.toFixed(1), r: 4, fill: '#ffffff', stroke: '#ffb84d', 'stroke-width': '1.5' }, svg);
  }

  svg.onclick = (e) => {
    const coords = unproject2DClick(e.clientX, e.clientY, svg);
    if (coords) stageDropPoint(coords.lat, coords.lon);
  };
}

function renderSkyDome() {
  const svg = $('#sky-dome');
  svg.replaceChildren();
  if (!state.sky) return;

  const cx = 140;
  const cy = 128;
  const R = 98;

  for (const [deg, label] of [[0, '0°'], [30, '30°'], [60, '60°']]) {
    const r = ((90 - deg) / 90) * R;
    svgEl('circle', { cx, cy, r: r.toFixed(1), fill: 'none', stroke: '#1d2947', 'stroke-width': '1' }, svg);
    svgEl('text', { x: cx + 3, y: (cy - r + 10).toFixed(1), fill: '#6c80ad', 'font-size': '9' }, svg).textContent = label;
  }
  for (const [ang, lbl] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
    const a = (ang * Math.PI) / 180;
    svgEl('line', { x1: cx, y1: cy, x2: (cx + R * Math.sin(a)).toFixed(1), y2: (cy - R * Math.cos(a)).toFixed(1), stroke: '#17203a' }, svg);
    svgEl('text', {
      x: (cx + (R + 12) * Math.sin(a)).toFixed(1),
      y: (cy - (R + 12) * Math.cos(a) + 3).toFixed(1),
      fill: '#8c9bbd', 'font-size': '10', 'text-anchor': 'middle',
    }, svg).textContent = lbl;
  }

  const bins = state.sky.horizonProfileDeg || [];
  if (bins.length === 36) {
    const innerPts = bins.map((elev, idx) => {
      const azRad = (idx * 10 * Math.PI) / 180;
      const clamped = Math.max(0, Math.min(85, elev));
      const r = ((90 - clamped) / 90) * R;
      return `${(cx + r * Math.sin(azRad)).toFixed(1)},${(cy - r * Math.cos(azRad)).toFixed(1)}`;
    });
    const outerPts = [];
    for (let idx = 35; idx >= 0; idx--) {
      const azRad = (idx * 10 * Math.PI) / 180;
      outerPts.push(`${(cx + R * Math.sin(azRad)).toFixed(1)},${(cy - R * Math.cos(azRad)).toFixed(1)}`);
    }
    svgEl('polygon', {
      points: `${innerPts.join(' ')} ${outerPts.join(' ')}`,
      fill: 'rgba(140, 155, 189, 0.25)', stroke: '#6c80ad', 'stroke-width': '1',
    }, svg);
  }

  const cur = state.sky.current;
  function domePos(elev, az) {
    const r = ((90 - Math.max(-5, Math.min(90, elev))) / 90) * R;
    const rad = (az * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  }
  const earthP = domePos(cur.earthElevationDeg, cur.earthAzimuthDeg);
  svgEl('circle', {
    cx: earthP.x.toFixed(1), cy: earthP.y.toFixed(1), r: 6.5,
    fill: cur.earthVisible ? '#58a6ff' : 'none', stroke: '#58a6ff', 'stroke-width': '1.6',
  }, svg);
  const sunP = domePos(cur.sunElevationDeg, cur.sunAzimuthDeg);
  svgEl('circle', {
    cx: sunP.x.toFixed(1), cy: sunP.y.toFixed(1), r: 7.5,
    fill: cur.sunlit ? '#ffb84d' : 'none', stroke: '#ffb84d', 'stroke-width': '1.8',
  }, svg);

  svgEl('text', { x: 14, y: 242, fill: '#45d48a', 'font-size': '10', 'font-family': 'monospace' }, svg)
    .textContent = `EARTH ${cur.earthElevationDeg >= 0 ? '+' : ''}${cur.earthElevationDeg.toFixed(1)}°`;
  svgEl('text', { x: 266, y: 242, fill: '#ffb84d', 'font-size': '10', 'font-family': 'monospace', 'text-anchor': 'end' }, svg)
    .textContent = `SUN ${cur.sunElevationDeg >= 0 ? '+' : ''}${cur.sunElevationDeg.toFixed(1)}°`;
}

function renderOpChart() {
  const svg = $('#op-chart');
  svg.replaceChildren();
  if (!state.sky) return;

  const W = 640;
  const H = 200;
  const padL = 36;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = state.sky.sun.length;

  const xOf = (i) => padL + (i / Math.max(1, n - 1)) * plotW;
  const yOf = (deg) => padT + ((90 - Math.max(-90, Math.min(90, deg))) / 180) * plotH;

  for (let i = 0; i < n; i++) {
    const sunOk = state.sky.sun[i] > 0;
    const dteOk = state.sky.earth[i] > -0.5;
    if (sunOk && dteOk) {
      const w = plotW / Math.max(1, n - 1) + 0.6;
      svgEl('rect', { x: xOf(i).toFixed(1), y: padT, width: w.toFixed(1), height: plotH, fill: 'rgba(69, 212, 138, 0.10)' }, svg);
    }
  }

  for (const deg of [90, 45, 0, -45, -90]) {
    const y = yOf(deg);
    svgEl('line', {
      x1: padL, y1: y.toFixed(1), x2: W - padR, y2: y.toFixed(1),
      stroke: deg === 0 ? '#4d608f' : '#18223d', 'stroke-width': deg === 0 ? '1.3' : '0.8',
      'stroke-dasharray': deg === 0 ? '4 3' : '',
    }, svg);
    svgEl('text', { x: padL - 5, y: (y + 3).toFixed(1), fill: '#6c80ad', 'font-size': '9.5', 'text-anchor': 'end', 'font-family': 'monospace' }, svg)
      .textContent = `${deg}°`;
  }

  const earthPts = state.sky.earth.map((e, i) => `${xOf(i).toFixed(1)},${yOf(e).toFixed(1)}`).join(' ');
  svgEl('polyline', { points: earthPts, fill: 'none', stroke: '#62b0ff', 'stroke-width': '1.8' }, svg);

  const sunPts = state.sky.sun.map((e, i) => `${xOf(i).toFixed(1)},${yOf(e).toFixed(1)}`).join(' ');
  svgEl('polyline', { points: sunPts, fill: 'none', stroke: '#ffb84d', 'stroke-width': '2' }, svg);

  const nowX = xOf(state.sampleIndex);
  svgEl('line', { x1: nowX.toFixed(1), y1: padT, x2: nowX.toFixed(1), y2: H - padB, stroke: '#ffffff', 'stroke-width': '1.3', 'stroke-dasharray': '3 3' }, svg);
  svgEl('text', { x: Math.min(W - 35, Math.max(padL + 4, nowX + 4)), y: padT + 10, fill: '#ffffff', 'font-size': '9.5', 'font-family': 'monospace' }, svg)
    .textContent = 'NOW';

  for (let i = 0; i < n; i += 24) {
    const lbl = (state.sky.timestamps[i] || '').slice(5, 11).toUpperCase();
    svgEl('text', { x: xOf(i).toFixed(1), y: H - 8, fill: '#6c80ad', 'font-size': '9', 'text-anchor': 'middle', 'font-family': 'monospace' }, svg)
      .textContent = lbl;
  }

  svg.onclick = (ev) => {
    const rect = svg.getBoundingClientRect();
    const clickX = ((ev.clientX - rect.left) / rect.width) * W;
    const ratio = Math.max(0, Math.min(1, (clickX - padL) / plotW));
    state.sampleIndex = Math.round(ratio * (n - 1));
    loadSiteSky().then(renderMap);
  };
}

// ---- Compare, Recipe Box, Cascade, Sources ----
async function refreshCompare() {
  const chips = $('#cmp-chips');
  chips.replaceChildren();
  const siteMap = new Map((state.data?.sites || []).map((s) => [s.id, s]));
  for (const id of state.compareIds) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = siteMap.get(id)?.shortName || id;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.textContent = '×';
    rm.onclick = () => {
      state.compareIds = state.compareIds.filter((x) => x !== id);
      refreshCompare();
    };
    chip.append(rm);
    chips.append(chip);
  }
  $('#cmp-count').textContent = String(state.compareIds.length);

  const cmp = await api(`/api/map/compare?sites=${encodeURIComponent(state.compareIds.join(','))}`);
  const table = $('#cmp-table');
  table.replaceChildren();
  const cols = cmp.sites || [];
  if (!cols.length) return;

  const head = document.createElement('tr');
  head.appendChild(document.createElement('th')).textContent = 'Metric (Provenance)';
  for (const c of cols) {
    const th = document.createElement('td');
    th.innerHTML = `<strong>${c.name}</strong><br><span class="muted">${formatCoords(c.lat, c.lon)}</span>`;
    head.appendChild(th);
  }
  table.appendChild(head);

  const rows = [
    ['Region', (c) => c.region.replace('_', ' ')],
    ['Elevation / Slope', (c) => `${c.elevationKm} km · ${c.slopeDegrees}°`],
    ['Terrain vs Flat Illum', (c) => `${c.illuminationTerrainPct}% terrain (flat ${c.illuminationFlatPct}%)`],
    ['Earth DTE Coverage', (c) => `${c.earthVisibilityPct}%`],
    ['Diviner Temp Range', (c) => c.tempRangeK],
    ['Nearest Ice PSR', (c) => `${c.nearestPsrName} (${c.nearestPsrKm} km)`],
    ['CLPS Missions', (c) => c.missions.join(', ') || 'Artemis Candidate'],
    ['Science Focus', (c) => c.scienceGoal],
  ];
  for (const [label, fn] of rows) {
    const tr = document.createElement('tr');
    tr.appendChild(document.createElement('th')).textContent = label;
    for (const c of cols) {
      const td = document.createElement('td');
      td.textContent = fn(c);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
}

async function refreshRecipe() {
  const mass = Number($('#recipe-mass').value);
  const power = Number($('#recipe-power').value);
  $('#recipe-mass-val').textContent = `${mass} kg`;
  $('#recipe-power-val').textContent = `${power} W`;

  const res = await api(`/api/map/recipe?site=${encodeURIComponent(state.selectedSiteId)}&mass=${mass}&power=${power}`);
  $('#recipe-site-name').textContent = res.siteName;
  $('#recipe-science-goal').textContent = res.scienceGoal;

  const grid = $('#recipe-results');
  grid.replaceChildren();
  for (const item of [...res.recommended, ...res.otherPayloads]) {
    const p = item.payload;
    const card = document.createElement('div');
    card.className = `recipe-card ${item.fitsBudget && item.scienceMatch ? 'fit' : item.commsWarning ? 'warn' : ''}`;
    card.innerHTML = `
      <h4>${p.name} <span class="muted">(${p.massKg} kg · ${p.powerW} W)</span></h4>
      <div class="recipe-meta">${p.fullName}</div>
      <p style="margin:.25rem 0;font-size:.8rem">${item.reason}</p>
      <a href="${p.pdsUrl}" target="_blank" rel="noopener" style="font-size:.74rem">PDS Geosciences Data →</a>
    `;
    grid.appendChild(card);
  }
}

function renderMissions() {
  const grid = $('#mission-cards');
  grid.replaceChildren();
  for (const m of state.filteredMissions) {
    const isRoot = state.failedMissionId === m.id;
    const isHit = state.impactedMissionIds.has(m.id);
    const card = document.createElement('div');
    card.className = `mission-card${isRoot ? ' failed-root' : isHit ? ' cascade-hit' : ''}`;

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.innerHTML = `<span class="status-pill ${m.status}">${m.status.replace('_', ' ')}</span><span class="muted">${m.year} · ${m.taskOrder}</span>`;

    const title = document.createElement('h4');
    title.textContent = m.name;
    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.textContent = `${m.vendor} · Site: ${m.siteId} · Payloads: ${(m.payloadIds || []).join(', ')}`;

    const note = document.createElement('p');
    note.style.margin = '0';
    note.style.fontSize = '.8rem';
    note.textContent = m.note;

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '.4rem';
    actions.style.marginTop = '.25rem';

    const focusBtn = document.createElement('button');
    focusBtn.type = 'button';
    focusBtn.className = 'btn-ghost';
    focusBtn.textContent = 'Focus Site';
    focusBtn.onclick = () => selectSite(m.siteId);

    const simBtn = document.createElement('button');
    simBtn.type = 'button';
    simBtn.className = isRoot ? 'btn-primary' : 'btn-danger';
    simBtn.textContent = isRoot ? 'Clear Failure' : 'Simulate Failure';
    simBtn.onclick = () => toggleCascadeSimulation(m.id);

    actions.append(focusBtn, simBtn);
    card.append(header, title, meta, note, actions);
    grid.appendChild(card);
  }
}

async function toggleCascadeSimulation(missionId) {
  if (state.failedMissionId === missionId) {
    state.failedMissionId = null;
    state.impactedMissionIds.clear();
    $('#cascade-summary').textContent = 'No failure simulated.';
  } else {
    const res = await api(`/api/map/cascade?mission=${encodeURIComponent(missionId)}`);
    state.failedMissionId = missionId;
    state.impactedMissionIds = new Set((res.impactedMissions || []).map((m) => m.id));
    $('#cascade-summary').textContent = res.riskSummary;
  }
  renderMissions();
  renderMap();
}

function renderSources() {
  const grid = $('#sources-list');
  grid.replaceChildren();
  for (const s of state.data?.sources || []) {
    const card = document.createElement('div');
    card.className = 'source-card';
    card.innerHTML = `
      <h4>${s.name}</h4>
      <p style="margin:.25rem 0">${s.role}</p>
      <a href="${s.url}" target="_blank" rel="noopener">${s.url}</a>
    `;
    grid.appendChild(card);
  }
  const rawLinks = document.createElement('div');
  rawLinks.className = 'source-card';
  rawLinks.innerHTML = `
    <h4>Raw NASA Payloads Served by Java Backend</h4>
    <p>Inspect unmodified NASA JSON files stored under <code>data/maps/raw/</code>:</p>
    <div style="display:grid;gap:.25rem">
      <a href="/api/map/raw/trek_sites" target="_blank">/api/map/raw/trek_sites</a>
      <a href="/api/map/raw/trek_psr" target="_blank">/api/map/raw/trek_psr</a>
      <a href="/api/map/raw/lola" target="_blank">/api/map/raw/lola</a>
      <a href="/api/map/raw/horizons" target="_blank">/api/map/raw/horizons</a>
      <a href="/api/map/raw/quickmap" target="_blank">/api/map/raw/quickmap</a>
    </div>
  `;
  grid.appendChild(rawLinks);
}

// ---- Playback & Events ----
function togglePlay() {
  if (state.playing) {
    clearInterval(state.playTimer);
    state.playing = false;
    $('#btn-play').textContent = '▶ Play';
    return;
  }
  state.playing = true;
  $('#btn-play').textContent = '❚❚ Pause';
  const hz = Number($('#play-speed').value);
  state.playTimer = setInterval(() => {
    state.sampleIndex = (state.sampleIndex + 1) % (state.ephemeris.length || 178);
    loadSiteSky().then(renderMap);
  }, Math.round(1000 / hz));
}

function jumpToSunTransition(targetSunlit) {
  if (!state.sky) return;
  const n = state.sky.sun.length;
  for (let offset = 1; offset < n; offset++) {
    const prev = (state.sampleIndex + offset - 1) % n;
    const curr = (state.sampleIndex + offset) % n;
    const hPrev = state.sky.sun[prev] > 0;
    const hCurr = state.sky.sun[curr] > 0;
    if (hPrev !== targetSunlit && hCurr === targetSunlit) {
      state.sampleIndex = curr;
      loadSiteSky().then(renderMap);
      return;
    }
  }
}

function setProjection(mode) {
  state.projection = mode;
  $('#proj-3d').classList.toggle('active', mode === '3d');
  $('#proj-global').classList.toggle('active', mode === 'global');
  $('#proj-pole').classList.toggle('active', mode === 'pole');
  renderMap();
}

function wireEvents() {
  $('#proj-3d').onclick = () => setProjection('3d');
  $('#proj-global').onclick = () => setProjection('global');
  $('#proj-pole').onclick = () => setProjection('pole');
  $('#btn-reset-globe').onclick = () => {
    if (state.globe) state.globe.resetView();
    setProjection('3d');
  };

  for (const id of ['#lyr-terminator', '#lyr-graticule', '#lyr-psr', '#lyr-links']) {
    $(id).onchange = renderMap;
  }

  for (const id of ['#f-time', '#f-year', '#f-region', '#f-status', '#f-payload']) {
    $(id).onchange = applyFilters;
  }
  $('#f-search').oninput = applyFilters;
  $('#btn-reset-filters').onclick = () => {
    $('#f-time').value = 'ALL';
    $('#f-year').value = 'ALL';
    $('#f-region').value = 'ALL';
    $('#f-status').value = 'ALL';
    $('#f-payload').value = 'ALL';
    $('#f-search').value = '';
    applyFilters();
  };

  $('#btn-play').onclick = togglePlay;
  $('#play-speed').onchange = () => {
    if (state.playing) { togglePlay(); togglePlay(); }
  };
  $('#btn-step-back').onclick = () => {
    const n = state.ephemeris.length || 178;
    state.sampleIndex = (state.sampleIndex - 1 + n) % n;
    loadSiteSky().then(renderMap);
  };
  $('#btn-step-fwd').onclick = () => {
    const n = state.ephemeris.length || 178;
    state.sampleIndex = (state.sampleIndex + 1) % n;
    loadSiteSky().then(renderMap);
  };
  $('#btn-jump-sunrise').onclick = () => jumpToSunTransition(true);
  $('#btn-jump-sunset').onclick = () => jumpToSunTransition(false);
  $('#time-slider').oninput = (e) => {
    state.sampleIndex = Number(e.target.value);
    loadSiteSky().then(renderMap);
  };

  $('#btn-pick-pet-site').onclick = () => {
    const s = (state.data?.sites || []).find((x) => x.id === state.selectedSiteId);
    if (s) stageDropPoint(s.lat, s.lon);
  };
  $('#btn-confirm-drop').onclick = confirmStagedDrop;
  $('#btn-cancel-drop').onclick = clearStagedDrop;

  $('#btn-pin-compare').onclick = () => {
    if (!state.compareIds.includes(state.selectedSiteId)) {
      state.compareIds = [...state.compareIds.slice(-3), state.selectedSiteId];
    }
    refreshCompare();
  };
  $('#btn-cmp-clear').onclick = () => {
    state.compareIds = ['SHACKLETON_RIM', 'MALAPERT_A', 'MARE_CRISIUM'];
    refreshCompare();
  };

  $('#recipe-mass').oninput = refreshRecipe;
  $('#recipe-power').oninput = refreshRecipe;

  for (const btn of document.querySelectorAll('.dtab')) {
    btn.onclick = () => {
      document.querySelectorAll('.dtab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.dtab-body').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      $(`#tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'recipe') refreshRecipe();
    };
  }
}

async function init() {
  wireEvents();
  const [data, rawHorizons] = await Promise.all([
    api('/api/map/data'),
    api('/api/map/raw/horizons'),
  ]);
  state.data = data;
  state.ephemeris = parseHorizonsRows(rawHorizons);
  state.filteredSites = data.sites;
  state.filteredMissions = data.missions;

  const pStats = data.metadata?.programSummary || {};
  $('#program-stats').textContent =
    `${pStats.deliveriesPlannedThrough2028 || 17} CLPS Deliveries Planned · ${pStats.payloadCount || '60+'} Payloads · `
    + `${pStats.contractValueCeiling || '$2.6B'} Program Ceiling · OpenGL 3D Solar Globe + Cursor Drop`;

  state.globe = new LunarGlobeGL($('#lunar-globe-gl'), {
    quickmapFeatures: data.quickmap?.notableAlbedoFeatures || [],
    psrZones: data.psrZones || [],
    onHover: (hit) => {
      const hud = $('#cursor-hud');
      if (!hit) {
        hud.textContent = 'Drag to orbit · Scroll to zoom · Click anywhere on the Moon to inspect environmental conditions before dropping';
        return;
      }
      const ep = state.ephemeris[state.sampleIndex];
      const sunEl = ep ? quickSunElevation(hit.lat, hit.lon, ep) : 0;
      hud.textContent = `Cursor: ${formatCoords(hit.lat, hit.lon)} · Sun ${sunEl >= 0 ? '+' : ''}${sunEl.toFixed(1)}° (${sunEl > 0 ? 'SUNLIT' : 'SHADOW'}) — Click to inspect drop site`;
    },
    onSelectPoint: (hit) => {
      stageDropPoint(hit.lat, hit.lon);
    },
    onViewChange: () => {
      render3DOverlay();
    },
  });

  renderSiteList();
  renderSources();
  renderMissions();
  await loadSiteSky();
  renderMap();
  await refreshCompare();
}

init().catch((err) => {
  console.error(err);
  $('#program-stats').textContent = `Error loading lunar map data: ${err.message}`;
});
