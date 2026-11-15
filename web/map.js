import './pets-3d/install.js';
import { LunarGlobeGL } from './globe_gl.js';
import { handleClientApi, normalizeSiteId, elevationDeg, azimuthDeg } from './map_engine_client.js';
import {
  DROP_PETS,
  buildOverlayMarkerGroup,
  conditionsToReaction,
  disposePetVisual,
  getDropPet,
  isDropPet,
  mountPetVisual,
  poseForSite,
  readPlacedPet,
  readSelectedPetId,
  writePlacedPet,
  writeSelectedPetId,
} from './pet_moon.js';

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
  selectedPetId: readSelectedPetId('lister'),
  placedPet: readPlacedPet(),
  compareIds: ['SHACKLETON_RIM', 'MALAPERT_A', 'MARE_CRISIUM'],
  projection: '3d', // '3d' | 'global' | 'pole'
  sampleIndex: 141, // 2026-Dec-03 12:00 UTC
  sampleFloat: 141,
  playing: false,
  playRaf: null,
  playLastTime: 0,
  skySyncBusy: false,
  skySyncPending: false,
  lastSyncedSample: 141,
  sky: null,
  failedMissionId: null,
  impactedMissionIds: new Set(),
  globe: null,
  stagedDrop: null, // { lat, lon, evalData, animStartTime }
  inspectedEval: null,
  storyboardRaf: null,
  stageSeq: 0,
  petReactionKey: '',
  surfacePetKey: '',
  surfacePetBusy: false,
};

function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(el);
  return el;
}

function setElementHidden(el, isHidden) {
  if (!el) return;
  const hide = Boolean(isHidden);
  el.hidden = hide;
  if (hide) {
    el.setAttribute('hidden', '');
    el.style.display = 'none';
  } else {
    el.removeAttribute('hidden');
    el.style.display = '';
  }
}

/** Exclusive map overlay popups: "predrop" | "pet" | "none". HUD is soft (suppressed when exclusive). */
function setActiveMapPopup(kind) {
  const vp = $('#map-viewport');
  const next = kind === 'predrop' || kind === 'pet' ? kind : 'none';
  if (vp) vp.dataset.activePopup = next;

  const card = $('#predrop-card');
  const stage = $('#moon-pet-stage');

  if (next === 'predrop') {
    if (stage) setElementHidden(stage, true);
    if (card) setElementHidden(card, false);
  } else if (next === 'pet') {
    if (card) {
      card.classList.remove('story-active', 'dock-left', 'dock-bottom');
      setElementHidden(card, true);
    }
    if (stage) setElementHidden(stage, false);
  } else {
    if (card) {
      card.classList.remove('story-active', 'dock-left', 'dock-bottom');
      setElementHidden(card, true);
    }
    // pet stage visibility decided by caller / refreshPlacedPetReaction
  }
}

/** Flip/shift predrop so it stays in-viewport and away from the drop pin. */
function layoutPredropCard(screenX, screenY, viewportW, viewportH) {
  const card = $('#predrop-card');
  if (!card || card.hidden) return { dockLeft: false, dockBottom: false };

  const pad = 12;
  const cardW = Math.min(300, Math.max(200, viewportW - pad * 2));
  const cardH = Math.min(card.offsetHeight || 320, viewportH - pad * 2);
  let dockLeft = Number.isFinite(screenX) ? screenX > viewportW * 0.5 : false;
  let dockBottom = false;

  // If pin is in the upper half near the card's preferred top, prefer bottom dock.
  if (Number.isFinite(screenY) && screenY < pad + cardH * 0.45 && screenY < viewportH * 0.42) {
    dockBottom = true;
  }
  // Keep card fully inside viewport height when top-docked.
  if (!dockBottom && cardH + pad * 2 > viewportH) {
    dockBottom = false; // still top; CSS max-height + scroll handles overflow
  }

  card.classList.toggle('dock-left', dockLeft);
  card.classList.toggle('dock-bottom', dockBottom);
  return { dockLeft, dockBottom, cardW };
}

/** Keep mood sheet off the on-globe pet when the pin is in the bottom-left corner. */
function layoutPetStage(screenX, viewportW) {
  const stage = $('#moon-pet-stage');
  if (!stage || stage.hidden) return;
  const dockRight = Number.isFinite(screenX) && Number.isFinite(viewportW)
    ? screenX < viewportW * 0.42
    : false;
  stage.classList.toggle('dock-right', dockRight);
}

let clientFallbackMode = false;

async function api(url) {
  if (clientFallbackMode) return handleClientApi(url);
  try {
    const res = await fetch(url);
    const ct = (res.headers?.get('content-type') || '').toLowerCase();
    if (!res.ok || (ct && !ct.includes('json'))) {
      clientFallbackMode = true;
      return handleClientApi(url);
    }
    return await res.json();
  } catch {
    clientFallbackMode = true;
    return handleClientApi(url);
  }
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

const MONTHS_REV = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_IDX = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function lerpAngleDeg(a, b, t) {
  const delta = (((b - a + 540) % 360) - 180);
  const res = a + delta * t;
  return (((res + 180) % 360) + 360) % 360 - 180;
}

function formatInterpolatedUtc(ep0, frac) {
  if (!ep0?.timestampUtc) return '';
  const m = String(ep0.timestampUtc).trim().match(/^(\d{4})-([A-Za-z]{3})-(\d{1,2})\s+(\d{2}):(\d{2})$/);
  if (!m || frac <= 0) return ep0.timestampUtc;
  const mon = MONTH_IDX[m[2]];
  if (mon === undefined) return ep0.timestampUtc;
  const baseMs = Date.UTC(Number(m[1]), mon, Number(m[3]), Number(m[4]), Number(m[5]));
  const dt = new Date(baseMs + Math.round(frac * 240) * 60 * 1000);
  const yyyy = dt.getUTCFullYear();
  const monStr = MONTHS_REV[dt.getUTCMonth()];
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const hh = String(dt.getUTCHours()).padStart(2, '0');
  const min = String(dt.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${monStr}-${dd} ${hh}:${min}`;
}

function getInterpolatedEphemeris(sampleFloat = state.sampleFloat) {
  const list = state.ephemeris;
  if (!Array.isArray(list) || list.length === 0) return null;
  const n = list.length;
  const wrapped = ((Number(sampleFloat) % n) + n) % n;
  const i0 = Math.floor(wrapped) % n;
  const i1 = (i0 + 1) % n;
  const frac = wrapped - Math.floor(wrapped);
  const a = list[i0];
  const b = list[i1];
  return {
    timestampUtc: formatInterpolatedUtc(a, frac),
    sunSubLat: a.sunSubLat + (b.sunSubLat - a.sunSubLat) * frac,
    sunSubLon: lerpAngleDeg(a.sunSubLon, b.sunSubLon, frac),
    obsSubLat: a.obsSubLat + (b.obsSubLat - a.obsSubLat) * frac,
    obsSubLon: lerpAngleDeg(a.obsSubLon, b.obsSubLon, frac),
  };
}

function getActiveCoords() {
  if (state.stagedDrop) return { lat: state.stagedDrop.lat, lon: state.stagedDrop.lon };
  if (state.inspectedEval && !state.inspectedEval.matchedKnownSite) {
    return { lat: state.inspectedEval.lat, lon: state.inspectedEval.lon };
  }
  if (state.confirmedDrop && !state.confirmedDrop.matchedKnownSite) {
    return { lat: state.confirmedDrop.lat, lon: state.confirmedDrop.lon };
  }
  const site = (state.data?.sites || []).find((s) => s.id === state.selectedSiteId);
  return site ? { lat: site.lat, lon: site.lon } : null;
}

function getActivePointInfo() {
  if (state.stagedDrop) {
    const ev = state.stagedDrop.evalData;
    const isCustom = ev ? !ev.matchedKnownSite : false;
    return {
      lat: state.stagedDrop.lat,
      lon: state.stagedDrop.lon,
      name: ev?.name || 'Selected Spot',
      shortName: ev?.matchedKnownSite ? (ev.name || 'Selected Spot') : 'Selected Spot',
      isCustom,
      isStaged: true,
      isConfirmed: false,
      siteId: ev?.matchedKnownSite ? (normalizeSiteId(ev.nearestSiteId) || state.selectedSiteId) : null,
    };
  }
  if (state.inspectedEval && !state.inspectedEval.matchedKnownSite) {
    const confirmedSame = Boolean(
      state.confirmedDrop?.custom &&
      Math.abs(state.confirmedDrop.lat - state.inspectedEval.lat) < 0.05 &&
      Math.abs(state.confirmedDrop.lon - state.inspectedEval.lon) < 0.05
    );
    return {
      lat: state.inspectedEval.lat,
      lon: state.inspectedEval.lon,
      name: state.inspectedEval.name || 'Custom Landing Spot',
      shortName: 'Custom Spot',
      isCustom: true,
      isStaged: false,
      isConfirmed: confirmedSame,
      siteId: null,
    };
  }
  if (state.confirmedDrop?.custom) {
    return {
      lat: state.confirmedDrop.lat,
      lon: state.confirmedDrop.lon,
      name: state.confirmedDrop.name || 'Selected Spot',
      shortName: 'Selected Spot',
      isCustom: true,
      isStaged: false,
      isConfirmed: true,
      siteId: null,
    };
  }
  const canon = normalizeSiteId(state.selectedSiteId);
  const site = (state.data?.sites || []).find((s) => normalizeSiteId(s.id) === canon);
  if (site) {
    return {
      lat: site.lat,
      lon: site.lon,
      name: site.name,
      shortName: site.shortName || site.name,
      isCustom: false,
      isStaged: false,
      isConfirmed: state.pickedPetSiteId === site.id,
      siteId: site.id,
    };
  }
  return null;
}

function horizonElevAtAz(bins, azDeg) {
  if (!Array.isArray(bins) || bins.length === 0) return 0;
  const n = bins.length;
  const binW = 360 / n;
  const norm = ((azDeg % 360) + 360) % 360;
  const exact = norm / binW;
  const i0 = Math.floor(exact) % n;
  const i1 = (i0 + 1) % n;
  const frac = exact - Math.floor(exact);
  return bins[i0] * (1 - frac) + bins[i1] * frac;
}

function formatCoords(lat, lon) {
  const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr} / ${lonStr}`;
}

function kelvinToCelsius(k) {
  return Math.round(k - 273.15);
}

function formatTempPlain(k) {
  const c = kelvinToCelsius(k);
  const f = Math.round((c * 9) / 5 + 32);
  return `${c}°C (${f}°F)`;
}

function formatTempRangePlain(minK, maxK) {
  return `${kelvinToCelsius(minK)}°C to ${kelvinToCelsius(maxK)}°C`;
}

function formatSlopePlain(deg) {
  if (deg <= 4) return `Flat (${deg.toFixed(1)}°)`;
  if (deg <= 10) return `Moderate (${deg.toFixed(1)}°)`;
  return `Steep (${deg.toFixed(1)}°)`;
}

function formatElevationPlain(meters) {
  const km = meters / 1000;
  return `${km >= 0 ? '+' : ''}${km.toFixed(1)} km`;
}

function translateWarningPlain(w) {
  return String(w || '')
    .replace(/\bLOS\b/g, 'direct signal')
    .replace(/\bDTE\b/g, 'Earth signal')
    .replace(/\bPSR\b/g, 'permanently shadowed crater');
}

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatIsoDatePlain(isoStr, short = false) {
  if (!isoStr) return '';
  const parts = String(isoStr).split('-');
  if (parts.length !== 3) return String(isoStr);
  const yr = parts[0];
  const mIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const mName = (short ? SHORT_MONTHS : FULL_MONTHS)[mIdx];
  if (!mName || Number.isNaN(day)) return String(isoStr);
  return short ? `${mName} ${yr}` : `${mName} ${day}, ${yr}`;
}

function getSiteMissions(siteId) {
  const canon = normalizeSiteId(siteId);
  if (!canon) return [];
  return (state.data?.missions || []).filter((m) => normalizeSiteId(m.siteId) === canon);
}

function formatMissionWhenPlain(m) {
  if (!m) return '';
  if (m.status === 'LANDED' && m.landed) return `Landed ${formatIsoDatePlain(m.landed)}`;
  if (m.status === 'NO_LANDING') {
    return m.launched
      ? `Launched ${formatIsoDatePlain(m.launched)} (Did not land — propellant issue)`
      : `${m.year} (Did not land)`;
  }
  return `Planned for ${m.year}`;
}

function formatSiteShortSchedule(siteId) {
  const missions = getSiteMissions(siteId);
  if (!missions.length) return 'NASA Candidate Site';
  const parts = missions.map((m) => {
    if (m.status === 'LANDED' && m.landed) return `Landed ${formatIsoDatePlain(m.landed, true)}`;
    if (m.status === 'NO_LANDING') return `Missed ${m.year}`;
    return `Planned ${m.year}`;
  });
  const vendors = [...new Set(missions.map((m) => m.vendor))].join(' / ');
  return `${parts.join(' · ')} (${vendors})`;
}

function describeSiteNasaPlan(site) {
  const missions = getSiteMissions(site.id);
  if (!missions.length) {
    return `${site.name} is an official NASA candidate landing area. Future Artemis or CLPS landing dates have not been announced yet.`;
  }
  const lines = missions.map((m) => `${m.name} (${m.vendor}) — ${formatMissionWhenPlain(m)}. ${m.note}`);
  return `${site.name} is a real NASA Commercial Lunar Payload Services (CLPS) landing site. ${lines.join(' ')}`;
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
  const isCustomActive =
    Boolean(state.confirmedDrop?.custom) ||
    Boolean(state.inspectedEval && !state.inspectedEval.matchedKnownSite);
  if (sites.length > 0 && !sites.some((s) => s.id === state.selectedSiteId) && !isCustomActive) {
    state.selectedSiteId = sites[0].id;
    await loadSiteSky();
  }
  renderSiteList();
  renderMap();
  renderMissions();
}

async function loadSiteSky() {
  if (state.stagedDrop) {
    await stageDropPoint(state.stagedDrop.lat, state.stagedDrop.lon, true, false);
    await refreshPlacedPetReaction();
    return;
  }

  const customTarget =
    state.confirmedDrop && !state.confirmedDrop.matchedKnownSite
      ? state.confirmedDrop
      : state.inspectedEval && !state.inspectedEval.matchedKnownSite
        ? state.inspectedEval
        : null;

  if (customTarget) {
    const ev = await api(
      `/api/map/evaluate?lat=${Number(customTarget.lat).toFixed(3)}&lon=${Number(customTarget.lon).toFixed(3)}&sample=${state.sampleIndex}`
    );
    state.inspectedEval = ev;
    state.sky = ev.sky;
    renderDossierFromEval(ev);
  } else {
    state.sky = await api(
      `/api/map/sky?site=${encodeURIComponent(state.selectedSiteId)}&sample=${state.sampleIndex}`
    );
    const matchingEval =
      state.inspectedEval &&
      state.inspectedEval.matchedKnownSite &&
      normalizeSiteId(state.inspectedEval.nearestSiteId) === normalizeSiteId(state.selectedSiteId)
        ? state.inspectedEval
        : null;
    renderDossier(matchingEval);
  }
  renderTelemetry();
  renderSkyDome();
  renderOpChart();
  updateClockDisplay();
  await refreshPlacedPetReaction();

  const ep = getInterpolatedEphemeris();
  if (ep && state.globe) {
    state.globe.setSunAndEarth(ep.sunSubLat, ep.sunSubLon, ep.obsSubLat, ep.obsSubLon);
  }
}

async function selectSite(siteId) {
  const canonicalId = normalizeSiteId(siteId) || siteId;
  state.confirmedDrop = null;
  state.selectedSiteId = canonicalId;
  const site = (state.data?.sites || []).find((s) => normalizeSiteId(s.id) === canonicalId);
  if (site) {
    await stageDropPoint(site.lat, site.lon, true, true);
  } else {
    state.inspectedEval = null;
    await loadSiteSky();
    renderSiteList();
    renderMap();
  }
  if ($('#tab-recipe').classList.contains('active')) {
    await refreshRecipe();
  }
  if (site) {
    window.dispatchEvent(
      new CustomEvent('payloadpets:site-selected', { detail: { siteId: site.id, site, sky: state.sky } })
    );
  }
}

function updateClockDisplay() {
  const ep = getInterpolatedEphemeris();
  const utcText = ep ? `${ep.timestampUtc} UTC` : (state.sky?.timestampUtc || '—');
  const dayNum = Math.floor((state.sampleFloat * 4) / 24) + 1;
  $('#clock-utc').textContent = utcText;
  $('#clock-sample').textContent = `Day ${dayNum} of 29.5 (Lunar Cycle)`;
  const maxSlider = Math.max(0, (state.ephemeris.length || 178) - 1);
  $('#time-slider').value = String(Math.min(maxSlider, Math.max(0, state.sampleFloat)));
}

function applyContinuousSunFrame() {
  const ep = getInterpolatedEphemeris();
  if (ep && state.globe) {
    state.globe.setSunAndEarth(ep.sunSubLat, ep.sunSubLon, ep.obsSubLat, ep.obsSubLon);
  }
  if (state.projection !== '3d') {
    renderMap();
  }
  renderSkyDome();
  renderOpChart();
  updateClockDisplay();
}

function isCustomSpotActive() {
  return (
    Boolean(state.inspectedEval && !state.inspectedEval.matchedKnownSite) ||
    Boolean(state.confirmedDrop?.custom)
  );
}

function renderSiteList() {
  const ul = $('#site-list');
  ul.replaceChildren();
  $('#site-count').textContent = String(state.filteredSites.length);
  const customActive = isCustomSpotActive();

  for (const s of state.filteredSites) {
    const status = primarySiteStatus(s.id);
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `site-item${s.id === state.selectedSiteId && !customActive ? ' active' : ''}`;
    btn.onclick = () => selectSite(s.id);

    const left = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'sname';
    name.textContent = s.name + (state.pickedPetSiteId === s.id ? ' ★' : '');
    const coord = document.createElement('span');
    coord.className = 'scoord';
    coord.textContent = `${formatSiteShortSchedule(s.id)} · ${s.illuminationTerrainPct}% sunlit`;
    left.append(name, coord);

    const pill = document.createElement('span');
    pill.className = `status-pill ${status}`;
    pill.textContent = status === 'NO_LANDING' ? 'TOO RISKY' : status.replace('_', ' ');
    btn.append(left, pill);
    li.append(btn);
    ul.append(li);
  }
}

function renderDossier(ev = null) {
  const site = (state.data?.sites || []).find((s) => s.id === state.selectedSiteId);
  if (!site) return;

  $('#dossier-region').textContent = site.region.replace('_', ' ');
  $('#dossier-title').textContent = site.name;
  $('#dossier-coords').textContent = formatCoords(site.lat, site.lon);
  $('#dossier-terrain').textContent = site.terrainSummary;

  const siteMissions = getSiteMissions(site.id);
  $('#dossier-nasa-kicker').textContent = 'OFFICIAL NASA CLPS / ARTEMIS LANDING SITE';
  $('#dossier-nasa-schedule').textContent = describeSiteNasaPlan(site);
  $('#dossier-nasa-box').classList.remove('is-custom');

  $('#dossier-missions').textContent = siteMissions.length
    ? siteMissions.map((m) => `${m.name} (${m.vendor} — ${formatMissionWhenPlain(m)})`).join(' · ')
    : 'Official NASA Candidate Site';

  const skyCur = state.sky?.current || ev?.sky?.current;
  const skyWin = state.sky?.windows || ev?.sky?.windows;
  const sunlitPct = skyWin ? skyWin.computedSunlitTerrainPct : site.illuminationTerrainPct;
  $('#dossier-lighting').textContent = skyCur
    ? `${skyCur.sunlit ? `Daytime (${skyCur.panelPowerPct.toFixed(0)}% solar)` : 'In Shadow (Dark)'} · Sunlit ${sunlitPct}% of month`
    : `${site.lightingCondition} (${site.illuminationTerrainPct}% sunlit per month)`;
  $('#dossier-elev').textContent = ev
    ? `${formatSlopePlain(site.slopeDegrees)} · Safety ${ev.scores.safety}/100 · Height ${formatElevationPlain(site.elevationMeters)}`
    : `${formatSlopePlain(site.slopeDegrees)} · Height ${formatElevationPlain(site.elevationMeters)}`;
  $('#dossier-psr').textContent = `${site.nearestPsrName} (${site.nearestPsrKm.toFixed(1)} km away)`;
  const rangeText = formatTempRangePlain(site.divinerMinTempK, site.divinerMaxTempK);
  $('#dossier-temp').textContent = skyCur ? `${formatTempPlain(skyCur.surfaceTempK)} (Range: ${rangeText})` : rangeText;
  $('#dossier-science').textContent = site.scienceGoal;

  $('#link-quickmap').href = site.quickmapUrl;
  $('#link-trek').href = site.trekUrl;
  $('#link-nasa').href = site.sourceUrl;

  const banner = $('#picked-banner');
  if (state.pickedPetSiteId === site.id) {
    setElementHidden(banner, false);
    banner.textContent = `Selected Spot: ${site.shortName} (${formatCoords(site.lat, site.lon)})`;
  } else {
    setElementHidden(banner, true);
  }
}

function renderDossierFromEval(ev) {
  $('#dossier-region').textContent = ev.region.replace('_', ' ');
  $('#dossier-title').textContent = ev.name;
  $('#dossier-coords').textContent = formatCoords(ev.lat, ev.lon);
  $('#dossier-terrain').textContent = ev.terrainSummary;

  const matchedSite = ev.matchedKnownSite && ev.nearestSiteId
    ? (state.data?.sites || []).find((s) => normalizeSiteId(s.id) === normalizeSiteId(ev.nearestSiteId))
    : null;
  if (matchedSite) {
    const siteMissions = getSiteMissions(matchedSite.id);
    $('#dossier-nasa-kicker').textContent = 'OFFICIAL NASA CLPS / ARTEMIS LANDING SITE';
    $('#dossier-nasa-schedule').textContent = describeSiteNasaPlan(matchedSite);
    $('#dossier-nasa-box').classList.remove('is-custom');
    $('#dossier-missions').textContent = siteMissions.length
      ? siteMissions.map((m) => `${m.name} (${m.vendor} — ${formatMissionWhenPlain(m)})`).join(' · ')
      : 'Official NASA Candidate Site';
  } else {
    $('#dossier-nasa-kicker').textContent = 'CUSTOM MOON SPOT (NOT AN OFFICIAL NASA SITE)';
    $('#dossier-nasa-schedule').textContent = ev.nearestSiteName
      ? `You picked a custom spot on the Moon. NASA has not scheduled a mission here — the closest real NASA landing site is ${ev.nearestSiteName} (${ev.nearestSiteKm} km away · ${formatSiteShortSchedule(ev.nearestSiteId)}).`
      : 'You picked a custom spot on the Moon. NASA does not have a landing scheduled at these exact coordinates.';
    $('#dossier-nasa-box').classList.add('is-custom');
    $('#dossier-missions').textContent = ev.nearestSiteName
      ? `None here (Closest NASA site: ${ev.nearestSiteName}, ${ev.nearestSiteKm} km away)`
      : 'Custom spot on Moon (no scheduled NASA mission)';
  }

  const skyCur = ev.sky?.current;
  const skyWin = ev.sky?.windows;
  $('#dossier-lighting').textContent = skyCur
    ? `${skyCur.sunlit ? `Daytime (${skyCur.panelPowerPct.toFixed(0)}% solar)` : 'In Shadow (Dark)'} · Sunlit ${skyWin.computedSunlitTerrainPct}% of month`
    : `${ev.lightingCondition} (${ev.sky.windows.computedSunlitTerrainPct}% sunlit per month)`;
  $('#dossier-elev').textContent = `${formatSlopePlain(ev.slopeDegrees)} · Safety ${ev.scores.safety}/100 · Height ${formatElevationPlain(ev.elevationMeters)}`;
  $('#dossier-psr').textContent = `${ev.nearestPsrName} (${ev.nearestPsrKm.toFixed(1)} km away)`;
  const rangeText = formatTempRangePlain(ev.divinerMinTempK, ev.divinerMaxTempK);
  $('#dossier-temp').textContent = skyCur ? `${formatTempPlain(skyCur.surfaceTempK)} (Range: ${rangeText})` : rangeText;
  $('#dossier-science').textContent = (ev.warnings || []).map(translateWarningPlain).join(' ');

  $('#link-quickmap').href =
    `https://quickmap.lroc.im-ldi.com/?extent=${ev.lon - 5},${ev.lat - 5},${ev.lon + 5},${ev.lat + 5}&proj=10&earthShadowEnabled=true&stack=3314`;
  $('#link-trek').href =
    `https://trek.nasa.gov/moon/#v=0.1&x=${ev.lon}&y=${ev.lat}&z=5&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104903&b=moon`;
  $('#link-nasa').href = 'https://www.nasa.gov/commercial-lunar-payload-services/';

  const banner = $('#picked-banner');
  setElementHidden(banner, false);
  banner.textContent = `Selected Spot: ${formatCoords(ev.lat, ev.lon)} (Score ${ev.scores.overall}/100)`;
}

function renderTelemetry() {
  if (!state.sky) return;
  const cur = state.sky.current;
  const win = state.sky.windows;

  $('#tele-sun-elev').textContent = cur.sunlit ? 'Daytime (Sunlit)' : 'Nighttime (Dark)';
  $('#tele-sun-sub').textContent = cur.sunlit
    ? `Solar power ${cur.panelPowerPct.toFixed(0)}% · Sun ${cur.sunElevationDeg.toFixed(0)}° up`
    : 'No sunlight right now — relies on battery';
  $('#tele-next-sunset').textContent = cur.nextSunset;
  const sunBadge = $('#tele-sun-badge');
  sunBadge.textContent = cur.sunlit ? 'DAYTIME' : 'NIGHTTIME';
  sunBadge.className = `badge ${cur.sunlit ? 'good' : 'warn'}`;

  $('#tele-dte-status').textContent = cur.earthVisible ? 'Clear View' : 'Blocked';
  $('#tele-dte-sub').textContent = cur.earthVisible
    ? `Direct Earth signal ${win.dteCoveragePct}% of month`
    : 'Hidden from Earth — needs satellite relay';
  $('#tele-next-earthset').textContent = cur.nextEarthset;
  const dteBadge = $('#tele-dte-badge');
  dteBadge.textContent = cur.earthVisible ? 'DIRECT SIGNAL' : 'NEEDS RELAY';
  dteBadge.className = `badge ${cur.earthVisible ? 'info' : 'bad'}`;

  $('#tele-op-state').textContent = cur.dualViable
    ? 'Good to Operate'
    : (cur.sunlit ? 'Sunlit, No Signal' : 'Dark & Freezing');
  $('#tele-op-sub').textContent = `Surface temp ~${formatTempPlain(cur.surfaceTempK)}`;
  $('#tele-illum-cmp').textContent = `${win.computedSunlitTerrainPct}% of month`;
  const opBadge = $('#tele-op-badge');
  opBadge.textContent = cur.dualViable ? 'GREAT' : (cur.sunlit ? 'SUN ONLY' : 'NIGHT');
  opBadge.className = `badge ${cur.dualViable ? 'good' : (cur.sunlit ? 'warn' : 'bad')}`;

  const liveMeta = $('#live-summary-meta');
  if (liveMeta) {
    const sunBit = cur.sunlit ? 'Day' : 'Night';
    const dteBit = cur.earthVisible ? 'Earth OK' : 'No Earth';
    liveMeta.textContent = `${sunBit} · ${dteBit} · ${opBadge.textContent}`;
  }

  $('#win-sunlit').textContent = win.sunlitDaysText;
  $('#win-dte').textContent = `${win.dteCoveragePct}%`;
  $('#win-dual').textContent = win.dualViableDaysText;
}

function cancelStoryboardAnim() {
  if (state.storyboardRaf !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(state.storyboardRaf);
  }
  state.storyboardRaf = null;
}

function startStoryboardLineLoop() {
  cancelStoryboardAnim();
  if (typeof requestAnimationFrame !== 'function') return;
  const renderOverlayFrame = () => {
    if (state.projection === '3d') render3DOverlay();
    else renderMap();
  };
  const tick = () => {
    renderOverlayFrame();
    const start = state.stagedDrop?.animStartTime;
    if (start && performance.now() - start < 210) {
      state.storyboardRaf = requestAnimationFrame(tick);
    } else {
      state.storyboardRaf = null;
      renderOverlayFrame();
    }
  };
  state.storyboardRaf = requestAnimationFrame(tick);
}

// ---- Pre-Drop Staging & Environmental Context Callout ----
async function stageDropPoint(lat, lon, fetchNew = true, animate = fetchNew) {
  const seq = ++state.stageSeq;
  const card = $('#predrop-card');

  // Dismiss pet stage / prior sheet — exclusive popup slot
  if (animate) {
    cancelStoryboardAnim();
    card.classList.remove('story-active', 'dock-left', 'dock-bottom');
    setActiveMapPopup('none');
    setElementHidden(card, true);
    setElementHidden($('#moon-pet-stage'), true);
  } else {
    setActiveMapPopup('predrop');
  }

  const ev =
    !fetchNew && state.stagedDrop?.evalData
      ? state.stagedDrop.evalData
      : await api(`/api/map/evaluate?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&sample=${state.sampleIndex}`);
  if (seq !== state.stageSeq) return;

  if (ev.matchedKnownSite && ev.nearestSiteId) {
    const canonId = normalizeSiteId(ev.nearestSiteId) || ev.nearestSiteId;
    const matchedSite = (state.data?.sites || []).find((s) => normalizeSiteId(s.id) === canonId);
    if (matchedSite) {
      ev.lat = matchedSite.lat;
      ev.lon = matchedSite.lon;
    }
    state.selectedSiteId = canonId;
  }

  const existingAnimStart = !animate ? (state.stagedDrop?.animStartTime ?? 0) : null;
  state.stagedDrop = { lat: ev.lat, lon: ev.lon, evalData: ev, animStartTime: existingAnimStart };
  state.inspectedEval = ev;
  state.sky = ev.sky;

  if (state.globe) {
    state.globe.setStagedPoint(ev.lat, ev.lon);
    const ep = getInterpolatedEphemeris();
    if (ep) state.globe.setSunAndEarth(ep.sunSubLat, ep.sunSubLon, ep.obsSubLat, ep.obsSubLon);
  }

  if (ev.matchedKnownSite && ev.nearestSiteId) {
    renderDossier(ev);
  } else {
    renderDossierFromEval(ev);
  }
  renderSiteList();
  renderTelemetry();
  renderSkyDome();
  renderOpChart();
  updateClockDisplay();
  if ($('#tab-recipe').classList.contains('active')) {
    refreshRecipe();
  }

  if (animate && state.globe && state.projection === '3d') {
    renderMap();
    await state.globe.focusLatLon(ev.lat, ev.lon, { duration: 250, yawOffsetRad: 0.22 });
    if (seq !== state.stageSeq) return;
  }

  const cur = ev.sky.current;
  const win = ev.sky.windows;

  $('#pd-title').textContent = ev.name;
  $('#pd-coords').textContent = `${formatCoords(ev.lat, ev.lon)} · ${ev.region.replace('_', ' ')}`;
  $('#pd-summary').textContent = ev.terrainSummary;

  const pdPlan = $('#pd-nasa-plan');
  if (ev.matchedKnownSite && ev.nearestSiteId) {
    const siteMissions = getSiteMissions(ev.nearestSiteId);
    const missionText = siteMissions.length
      ? siteMissions.map((m) => `${m.name} (${m.vendor} — ${formatMissionWhenPlain(m)})`).join('; ')
      : 'Official NASA candidate landing site';
    pdPlan.textContent = `Official NASA Landing Site: ${missionText}.`;
    pdPlan.classList.remove('is-custom');
  } else {
    pdPlan.textContent = ev.nearestSiteName
      ? `Custom Moon Spot (not a scheduled NASA site). Closest real NASA site: ${ev.nearestSiteName} (${ev.nearestSiteKm} km away — ${formatSiteShortSchedule(ev.nearestSiteId)}).`
      : 'Custom Moon Spot: NASA does not have a mission scheduled at these exact coordinates.';
    pdPlan.classList.add('is-custom');
  }

  const pill = $('#pd-score-pill');
  pill.textContent = `Score ${ev.scores.overall}/100`;
  pill.className = `badge ${ev.scores.overall >= 75 ? 'good' : ev.scores.overall >= 55 ? 'warn' : 'bad'}`;

  $('#pd-sun').textContent = cur.sunlit ? `Daytime (${cur.panelPowerPct.toFixed(0)}% solar)` : 'In Shadow (Dark)';
  $('#pd-sun-sub').textContent = `Sunlit ${win.computedSunlitTerrainPct}% of month`;

  $('#pd-temp').textContent = formatTempPlain(cur.surfaceTempK);
  $('#pd-temp-sub').textContent = `Range: ${formatTempRangePlain(ev.divinerMinTempK, ev.divinerMaxTempK)}`;

  $('#pd-terrain').textContent = formatSlopePlain(ev.slopeDegrees);
  $('#pd-terrain-sub').textContent = `Safety ${ev.scores.safety}/100 · Height ${formatElevationPlain(ev.elevationMeters)}`;

  $('#pd-comms').textContent = cur.earthVisible ? 'Direct Signal' : 'Needs Relay';
  $('#pd-comms-sub').textContent = cur.earthVisible
    ? `Clear view ${win.dteCoveragePct}% of month`
    : 'On the Moon’s far side from Earth';

  $('#pd-psr').textContent = `${ev.nearestPsrKm.toFixed(1)} km`;
  $('#pd-psr-sub').textContent = ev.nearestPsrName;

  const mult = ev.careMultipliers ?? ev.decayMultipliers;
  const warmthMult = mult.warmth ?? mult.oxygen ?? 1;
  const signalMult = mult.signal ?? mult.happiness ?? 1;
  $('#pd-pet').textContent = `Power ×${mult.power} · Heat ×${warmthMult} · Signal ×${signalMult}`;
  $('#pd-pet-sub').textContent = `Next sunset: ${cur.nextSunset}`;

  const warnUl = $('#pd-warnings');
  warnUl.replaceChildren();
  for (const w of ev.warnings) {
    const li = document.createElement('li');
    li.textContent = translateWarningPlain(w);
    warnUl.appendChild(li);
  }

  renderPetPickers();
  if (animate) {
    state.stagedDrop.animStartTime = typeof performance !== 'undefined' ? performance.now() : 0;
    card.classList.remove('story-active');
    setActiveMapPopup('predrop');
    void card.offsetWidth;
    card.classList.add('story-active');
    renderMap();
    startStoryboardLineLoop();
  } else {
    card.classList.add('story-active');
    setActiveMapPopup('predrop');
    renderMap();
  }
}

function clearStagedDrop() {
  state.stageSeq++;
  cancelStoryboardAnim();
  state.stagedDrop = null;
  const card = $('#predrop-card');
  card.classList.remove('story-active', 'dock-left', 'dock-bottom');
  setElementHidden(card, true);
  if (state.globe) {
    const active = getActivePointInfo();
    if (active && active.isCustom) {
      state.globe.setStagedPoint(active.lat, active.lon);
    } else {
      state.globe.setStagedPoint(null, null);
    }
  }
  // Restore pet mood sheet if a pet is placed; otherwise clear exclusive slot
  const placed = state.placedPet || readPlacedPet();
  if (placed && isDropPet(placed.petId)) {
    setActiveMapPopup('pet');
    refreshPlacedPetReaction(false);
  } else {
    setActiveMapPopup('none');
    setElementHidden($('#moon-pet-stage'), true);
  }
  renderMap();
}

async function confirmStagedDrop() {
  if (!state.stagedDrop) return;
  const ev = state.stagedDrop.evalData;
  const petId = readSelectedPetId(state.selectedPetId || 'lister');
  const skyCurrent = ev.sky?.current || state.sky?.current || {};
  const reaction = conditionsToReaction(petId, skyCurrent);
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
    petId,
    confirmedAt: new Date().toISOString(),
  };

  state.confirmedDrop = dropRecord;
  localStorage.setItem('payloadPets.selectedDrop', JSON.stringify(dropRecord));
  const siteId = ev.matchedKnownSite && ev.nearestSiteId ? ev.nearestSiteId : ev.id;
  if (ev.matchedKnownSite && ev.nearestSiteId) {
    state.selectedSiteId = ev.nearestSiteId;
    state.pickedPetSiteId = ev.nearestSiteId;
    localStorage.setItem('payloadPets.selectedSite', ev.nearestSiteId);
  } else {
    state.pickedPetSiteId = ev.id;
    localStorage.setItem('payloadPets.selectedSite', ev.id);
  }

  state.selectedPetId = petId;
  writeSelectedPetId(petId);
  state.placedPet = writePlacedPet({
    petId,
    siteId,
    siteName: ev.name,
    lat: ev.lat,
    lon: ev.lon,
    matchedKnownSite: Boolean(ev.matchedKnownSite),
    sampleIndex: state.sampleIndex,
    phaseId: reaction.phaseId,
    moodId: reaction.moodId,
    label: reaction.label,
    reason: reaction.reason,
    signal: reaction.signal,
    sunlit: reaction.sunlit,
    earthVisible: reaction.earthVisible,
  });

  clearStagedDrop();
  await loadSiteSky();
  renderSiteList();
  renderPetPickers();
  // Face the drop pin so the on-globe 3D billboard is front-and-center (not clipped at the limb).
  if (state.projection === '3d' && state.globe && state.placedPet) {
    await state.globe.focusLatLon(state.placedPet.lat, state.placedPet.lon, { duration: 320 });
  }
  renderMap();
  await refreshPlacedPetReaction(true);
  positionSurfacePetLayer();
  window.dispatchEvent(new CustomEvent('payloadPets:siteSelected', { detail: { ...dropRecord, placedPet: state.placedPet } }));
  window.dispatchEvent(new CustomEvent('payloadpets:site-selected', { detail: { ...dropRecord, placedPet: state.placedPet } }));
  window.dispatchEvent(new CustomEvent('payloadPets:petDropped', { detail: state.placedPet }));
}

function renderPetPickers() {
  const fill = (root) => {
    if (!root) return;
    root.replaceChildren();
    for (const pet of DROP_PETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pet-chip${pet.id === state.selectedPetId ? ' is-on' : ''}`;
      btn.setAttribute('aria-pressed', pet.id === state.selectedPetId ? 'true' : 'false');
      btn.dataset.petId = pet.id;
      btn.innerHTML = `<strong>${pet.name}</strong><small>${pet.role}</small>`;
      btn.addEventListener('click', () => {
        state.selectedPetId = pet.id;
        writeSelectedPetId(pet.id);
        renderPetPickers();
        updateDropConfirmLabel();
      });
      root.appendChild(btn);
    }
  };
  fill($('#pet-picker'));
  fill($('#pd-pet-picker'));
  updateDropConfirmLabel();
  const hint = $('#pet-drop-hint');
  if (hint) {
    const pet = getDropPet(state.selectedPetId);
    hint.textContent = pet
      ? `${pet.name} selected (${pet.role}). Click the Moon or Inspect & Pick, then Drop Pet on Moon.`
      : 'Select a pet, then click a landing spot and confirm the drop.';
  }
}

function updateDropConfirmLabel() {
  const btn = $('#btn-confirm-drop');
  if (!btn) return;
  const pet = getDropPet(state.selectedPetId);
  btn.textContent = pet ? `Drop ${pet.name} on Moon` : 'Drop Pet on Moon';
}

function currentSkyForPet() {
  return (
    state.sky?.current ||
    state.stagedDrop?.evalData?.sky?.current ||
    state.inspectedEval?.sky?.current ||
    {}
  );
}

async function refreshPlacedPetReaction(force = false) {
  const placed = state.placedPet || readPlacedPet();
  state.placedPet = placed;
  const stage = $('#moon-pet-stage');
  const banner = $('#placed-pet-banner');
  if (!placed || !isDropPet(placed.petId)) {
    if (stage) setElementHidden(stage, true);
    if (banner) setElementHidden(banner, true);
    if ($('#map-viewport')?.dataset?.activePopup === 'pet') setActiveMapPopup('none');
    state.petReactionKey = '';
    disposeSurfacePetLayer();
    return;
  }

  const sky = currentSkyForPet();
  const reaction = conditionsToReaction(placed.petId, sky);
  const key = `${placed.petId}:${reaction.phaseId}:${reaction.moodId}:${reaction.signalStress ? 1 : 0}:${reaction.powerGlow ? 1 : 0}:${state.sampleIndex}`;
  if (!force && key === state.petReactionKey) {
    updatePlacedPetChrome(placed, reaction);
    positionSurfacePetLayer();
    return;
  }
  state.petReactionKey = key;

  state.placedPet = writePlacedPet({
    ...placed,
    sampleIndex: state.sampleIndex,
    phaseId: reaction.phaseId,
    moodId: reaction.moodId,
    label: reaction.label,
    reason: reaction.reason,
    signal: reaction.signal,
    sunlit: reaction.sunlit,
    earthVisible: reaction.earthVisible,
  });

  updatePlacedPetChrome(state.placedPet, reaction);
  const art = $('#moon-pet-art');
  if (art) {
    // Shared-farm blit (same instruments as globe). Does not consume a live WebGL slot,
    // so the surface pet can keep its dedicated context in 3D mode.
    await mountPetVisual(art, placed.petId, sky, {
      idPrefix: 'map-moon-pet',
      mode: 'shared',
      autoRotate: state.projection !== '3d',
      interactive: false,
    });
  }
  // Only show pet sheet when predrop is not occupying the exclusive slot
  const activePopup = $('#map-viewport')?.dataset?.activePopup;
  if (stage && activePopup !== 'predrop' && !state.stagedDrop) {
    setActiveMapPopup('pet');
  }
  await syncSurfacePetLayer(force);
  renderMap();
}

function disposeSurfacePetLayer() {
  const layer = $('#surface-pet-layer');
  const host = $('#surface-pet-art');
  disposePetVisual(host);
  state.surfacePetKey = '';
  if (layer) {
    layer.className = 'surface-pet-layer';
    setElementHidden(layer, true);
    layer.setAttribute('aria-hidden', 'true');
  }
}

/** Sync transform only — cheap, called on every globe view change. */
function positionSurfacePetLayer() {
  const layer = $('#surface-pet-layer');
  const placed = state.placedPet;
  if (!layer || !placed || !isDropPet(placed.petId) || state.projection !== '3d' || !state.globe) {
    if (layer && state.projection !== '3d') setElementHidden(layer, true);
    return;
  }
  const p = state.globe.latLonToScreen(placed.lat, placed.lon);
  const { width: vw } = state.globe.getViewportSize?.() || { width: 960 };
  if (p?.visible !== false) layoutPetStage(p.x, vw);
  if (!p || p.visible === false) {
    setElementHidden(layer, true);
    layer.setAttribute('aria-hidden', 'true');
    return;
  }
  setElementHidden(layer, false);
  layer.removeAttribute('aria-hidden');
  layer.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
}

/**
 * Mount / update the on-globe 3D pet for globe mode; tear down for 2D / south-pole.
 * Flat views draw SVG sprites via drawPlacedPetMarker instead.
 */
async function syncSurfacePetLayer(force = false) {
  const layer = $('#surface-pet-layer');
  const host = $('#surface-pet-art');
  const placed = state.placedPet;
  if (!layer || !host) return;

  if (!placed || !isDropPet(placed.petId) || state.projection !== '3d') {
    disposeSurfacePetLayer();
    return;
  }

  const sky = currentSkyForPet();
  const reaction = conditionsToReaction(placed.petId, sky);
  const mountKey = `${placed.petId}:${reaction.moodId}:${reaction.signal}:${reaction.powerGlow ? 1 : 0}:${reaction.signalStress ? 1 : 0}`;

  for (const cls of [...layer.classList]) {
    if (cls.startsWith('anim-')) layer.classList.remove(cls);
  }
  layer.classList.add(`anim-${reaction.animation}`);

  positionSurfacePetLayer();

  if (!force && mountKey === state.surfacePetKey && host._pets3dHandle?.petId === placed.petId) {
    try {
      host._pets3dHandle.update?.(reaction.moodId, {
        signal: reaction.signal,
        powerGlow: reaction.powerGlow,
        signalStress: reaction.signalStress,
        phaseId: reaction.phaseId,
        surface: true,
      });
      host._pets3dHandle.setSignal?.(reaction.signal);
    } catch {
      /* ignore */
    }
    return;
  }

  if (state.surfacePetBusy) return;
  state.surfacePetBusy = true;
  try {
    await mountPetVisual(host, placed.petId, sky, {
      idPrefix: 'surface-pet',
      surface: true,
      autoRotate: false,
      interactive: false,
    });
    state.surfacePetKey = mountKey;
    positionSurfacePetLayer();
  } finally {
    state.surfacePetBusy = false;
  }
}

function updatePlacedPetChrome(placed, reaction) {
  const pet = getDropPet(placed.petId);
  const nameEl = $('#moon-pet-name');
  const moodEl = $('#moon-pet-mood');
  const reasonEl = $('#moon-pet-reason');
  if (nameEl) nameEl.textContent = pet?.name || placed.petId;
  if (moodEl) moodEl.textContent = reaction.label;
  if (reasonEl) reasonEl.textContent = reaction.reason;

  const banner = $('#placed-pet-banner');
  if (banner) {
    setElementHidden(banner, false);
    banner.textContent = `${pet?.name || placed.petId} on ${placed.siteName || 'the Moon'} · ${reaction.label}${
      reaction.powerGlow ? ' · power glow' : ''
    }${reaction.signalStress ? ' · signal stress' : ''}`;
  }
}

/** Blit PNG cache for Flat / South Pole markers (same geometry as PayloadPets3D). */
const overlayBlitCache = new Map();
/** @type {string} */
let overlayBlitPendingKey = '';

function overlayBlitKey(petId, reaction, size) {
  return `${petId}:${reaction.moodId}:${Math.round(reaction.signal || 0)}:${reaction.powerGlow ? 1 : 0}:${reaction.signalStress ? 1 : 0}:${size}`;
}

/**
 * Kick off a shared-farm capture for the flat-map pin; re-renders when ready.
 * @param {string} petId
 * @param {ReturnType<typeof conditionsToReaction>} reaction
 * @param {number} size
 */
async function ensureOverlayBlitSprite(petId, reaction, size) {
  const key = overlayBlitKey(petId, reaction, size);
  if (overlayBlitCache.has(key) || overlayBlitPendingKey === key) return overlayBlitCache.get(key) || null;
  overlayBlitPendingKey = key;
  try {
    const three = globalThis.PayloadPets3D;
    if (!three) return null;
    if (three.ready) {
      try {
        await Promise.race([
          three.ready,
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
        ]);
      } catch {
        /* may still expose capturePetSprite after partial load */
      }
    }
    if (typeof three.capturePetSprite !== 'function') return null;
    const sprite = await three.capturePetSprite(petId, reaction.moodId, {
      size,
      signal: reaction.signal,
      powerGlow: reaction.powerGlow,
      signalStress: reaction.signalStress,
      phaseId: reaction.phaseId,
    });
    if (sprite?.dataUrl) {
      overlayBlitCache.set(key, sprite.dataUrl);
      if (state.projection !== '3d' && state.placedPet?.petId === petId) {
        renderMap();
      }
      return sprite.dataUrl;
    }
  } catch (err) {
    console.warn('[map] pet sprite blit failed', err);
  } finally {
    if (overlayBlitPendingKey === key) overlayBlitPendingKey = '';
  }
  return null;
}

/**
 * Draw placed pet on map overlays.
 * 3D globe: small surface pin only (3D model lives in #surface-pet-layer).
 * Flat / south-pole: mood-reactive instrument blit (same geometry as 3D), SVG fallback.
 */
function drawPlacedPetMarker(svg, projectFn, mode = '2d') {
  const placed = state.placedPet;
  if (!placed || !isDropPet(placed.petId)) return;
  const p = projectFn(placed.lat, placed.lon);
  if (!p || p.visible === false) return;

  if (mode === '3d') {
    svgEl('circle', {
      cx: p.x.toFixed(1),
      cy: p.y.toFixed(1),
      r: 5,
      fill: '#ffe7ad',
      stroke: '#ffb84d',
      'stroke-width': '2',
      class: 'moon-pet-pin',
    }, svg);
    return;
  }

  try {
    const sky = currentSkyForPet();
    const pose = poseForSite(placed.petId, sky);
    const reaction = pose.reaction || conditionsToReaction(placed.petId, sky);
    const scale = state.projection === 'pole' ? 0.3 : 0.26;
    const blitSize = state.projection === 'pole' ? 144 : 128;
    const cacheKey = overlayBlitKey(placed.petId, reaction, blitSize);
    const spriteUrl = overlayBlitCache.get(cacheKey) || null;
    const marker = buildOverlayMarkerGroup(pose, p.x, p.y, scale, {
      label: true,
      pin: true,
      spriteUrl,
      spriteSize: Math.round(200 * scale),
    });
    svg.appendChild(marker);
    if (!spriteUrl) {
      void ensureOverlayBlitSprite(placed.petId, reaction, blitSize);
    }
  } catch (err) {
    console.warn('[map] pet marker', err);
    svgEl('circle', {
      cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 8,
      fill: '#ffe7ad', stroke: '#ffb84d', 'stroke-width': '2',
    }, svg);
    const pet = getDropPet(placed.petId);
    svgEl('text', {
      x: p.x.toFixed(1),
      y: (p.y - 14).toFixed(1),
      fill: '#ffe7ad',
      'font-size': '11',
      'font-weight': '700',
      'text-anchor': 'middle',
      class: 'moon-pet-sprite-label',
    }, svg).textContent = pet?.name || placed.petId;
  }
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

function projectSouthPoleClamped(lat, lon) {
  if (lat <= -73.5) {
    return { ...projectSouthPole(lat, lon), clamped: false };
  }
  const rad = (lon * Math.PI) / 180;
  return {
    x: 480 + 204 * Math.sin(rad),
    y: 240 - 204 * Math.cos(rad),
    clamped: true,
  };
}

function svgViewBoxMetrics(svg) {
  const rect = svg.getBoundingClientRect();
  const rw = Math.max(1, rect.width || 960);
  const rh = Math.max(1, rect.height || 480);
  const scale = Math.min(rw / 960, rh / 480);
  const drawW = 960 * scale;
  const drawH = 480 * scale;
  const offsetX = rect.left + (rw - drawW) * 0.5;
  const offsetY = rect.top + (rh - drawH) * 0.5;
  return { rect, rw, rh, scale, drawW, drawH, offsetX, offsetY };
}

function unproject2DClick(clientX, clientY, svg) {
  const { scale, offsetX, offsetY } = svgViewBoxMetrics(svg);
  const x = (clientX - offsetX) / Math.max(0.0001, scale);
  const y = (clientY - offsetY) / Math.max(0.0001, scale);
  if (state.projection === 'global') {
    if (x < 0 || x > 960 || y < 0 || y > 480) return null;
    const lon = (x / 960) * 360 - 180;
    const lat = 90 - (y / 480) * 180;
    return { lat, lon };
  }
  const dx = x - 480;
  const dy = 240 - y;
  const r = Math.hypot(dx, dy);
  if (r > 212) return null;
  const colat = (r / 212) * 16.5;
  const lat = -90 + colat;
  const lon = (Math.atan2(dx, dy) * 180) / Math.PI;
  return { lat, lon };
}

function projectPoint2D(lat, lon) {
  return state.projection === 'global' ? projectGlobal(lat, lon) : projectSouthPole(lat, lon);
}

function findNearest2DSite(clientX, clientY, svg, maxPx = 16) {
  const { scale, offsetX, offsetY } = svgViewBoxMetrics(svg);
  const x = (clientX - offsetX) / Math.max(0.0001, scale);
  const y = (clientY - offsetY) / Math.max(0.0001, scale);
  const maxViewDist = maxPx / Math.max(0.0001, scale);
  let best = null;
  let bestDist = maxViewDist;

  for (const s of state.filteredSites || []) {
    if (state.projection === 'pole' && s.lat > -73.5) continue;
    const p = projectPoint2D(s.lat, s.lon);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestDist) {
      bestDist = d;
      best = s;
    }
  }

  if (!best && state.projection === 'pole' && !isCustomSpotActive()) {
    const activeCanonId = normalizeSiteId(state.selectedSiteId);
    const selSite = (state.data?.sites || []).find((s) => normalizeSiteId(s.id) === activeCanonId);
    if (selSite && selSite.lat > -73.5) {
      const rp = projectSouthPoleClamped(selSite.lat, selSite.lon);
      if (Math.hypot(rp.x - x, rp.y - y) <= maxViewDist) {
        best = selSite;
      }
    }
  }
  return best;
}

function drawStoryboardConnector(svg, spx, spy, anchorX, cardTopY, padTop = 14) {
  const elbowY = Math.max(padTop, Math.min(cardTopY - padTop, spy - 24));
  const seg1 = Math.hypot(anchorX - spx, elbowY - spy);
  const seg2 = Math.abs(cardTopY - elbowY);
  const totalLen = Math.max(1, seg1 + seg2);

  const rawT = state.stagedDrop.animStartTime > 0
    ? Math.min(1, (performance.now() - state.stagedDrop.animStartTime) / 180)
    : 1;
  // Fast-out, slow-in speed curve matching cubic-bezier(0.16, 1, 0.3, 1)
  const lineProgress = 1 - Math.pow(1 - rawT, 3.5);
  const drawnLen = totalLen * lineProgress;

  let pts;
  let tipX = anchorX;
  let tipY = cardTopY;
  if (drawnLen <= seg1) {
    const u = drawnLen / Math.max(0.001, seg1);
    tipX = spx + (anchorX - spx) * u;
    tipY = spy + (elbowY - spy) * u;
    pts = `${spx.toFixed(1)},${spy.toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)}`;
  } else {
    const v = (drawnLen - seg1) / Math.max(0.001, seg2);
    tipX = anchorX;
    tipY = elbowY + (cardTopY - elbowY) * v;
    pts = `${spx.toFixed(1)},${spy.toFixed(1)} ${anchorX.toFixed(1)},${elbowY.toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)}`;
  }

  svgEl('polyline', {
    points: pts,
    fill: 'none', stroke: 'rgba(255, 184, 77, 0.25)', 'stroke-width': '4.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, svg);
  svgEl('polyline', {
    points: pts,
    fill: 'none', stroke: '#ffb84d', 'stroke-width': '1.9', 'stroke-dasharray': '4 2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, svg);
  svgEl('circle', {
    cx: tipX.toFixed(1), cy: tipY.toFixed(1), r: lineProgress < 1 ? 3.8 : 3.0,
    fill: '#ffb84d', stroke: '#ffffff', 'stroke-width': '1.2',
  }, svg);
}

function renderActiveCustomMarkers(svg, projFn) {
  if (state.confirmedDrop?.custom) {
    const cp = projFn(state.confirmedDrop.lat, state.confirmedDrop.lon);
    if (cp.visible !== false) {
      svgEl('circle', { cx: cp.x.toFixed(1), cy: cp.y.toFixed(1), r: 7, fill: '#45d48a', stroke: '#ffffff', 'stroke-width': '2' }, svg);
      if (cp.clamped) {
        svgEl('circle', { cx: cp.x.toFixed(1), cy: cp.y.toFixed(1), r: 11.5, fill: 'none', stroke: '#45d48a', 'stroke-width': '1.3', 'stroke-dasharray': '3 2' }, svg);
      }
      const inward = cp.clamped && cp.x > 480;
      const lbl = svgEl('text', {
        x: (inward ? cp.x - 12 : cp.x + 10).toFixed(1),
        y: (cp.y + 4).toFixed(1),
        fill: '#45d48a', 'font-size': '10.5', 'font-weight': '700',
        'text-anchor': inward ? 'end' : 'start',
      }, svg);
      lbl.textContent = cp.clamped
        ? `SELECTED ★ (${Math.abs(state.confirmedDrop.lat).toFixed(0)}°${state.confirmedDrop.lat >= 0 ? 'N' : 'S'} ↑)`
        : 'SELECTED ★';
    }
  }

  const ie = state.inspectedEval;
  const sameAsConfirmed = Boolean(
    state.confirmedDrop?.custom && ie &&
    Math.hypot(state.confirmedDrop.lat - ie.lat, state.confirmedDrop.lon - ie.lon) < 0.05
  );
  if (ie && !ie.matchedKnownSite && !state.stagedDrop && !sameAsConfirmed) {
    const ip = projFn(ie.lat, ie.lon);
    if (ip.visible !== false) {
      svgEl('circle', { cx: ip.x.toFixed(1), cy: ip.y.toFixed(1), r: 10, fill: 'none', stroke: '#F97216', 'stroke-width': '1.5', 'stroke-dasharray': '3 2' }, svg);
      svgEl('circle', { cx: ip.x.toFixed(1), cy: ip.y.toFixed(1), r: 5.5, fill: '#F97216', stroke: '#ffffff', 'stroke-width': '1.6' }, svg);
      const inward = ip.clamped && ip.x > 480;
      svgEl('text', {
        x: (inward ? ip.x - 12 : ip.x + 10).toFixed(1),
        y: (ip.y + 4).toFixed(1),
        fill: '#D1D4DB', 'font-size': '10', 'font-weight': '600',
        'text-anchor': inward ? 'end' : 'start',
      }, svg).textContent = ip.clamped
        ? `Custom Spot (${Math.abs(ie.lat).toFixed(0)}°${ie.lat >= 0 ? 'N' : 'S'} ↑)`
        : 'Custom Spot';
    }
  }
}

function render3DOverlay() {
  const svg = $('#globe-overlay');
  svg.replaceChildren();
  if (!state.globe || state.projection !== '3d') return;

  const { width: vw, height: vh } = state.globe.getViewportSize();
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);

  const showPsr = $('#lyr-psr').checked;
  const showLinks = $('#lyr-links').checked;

  // PSR markers on 3D globe
  if (showPsr) {
    for (const psr of state.data?.psrZones || []) {
      const p = state.globe.latLonToScreen(psr.centerLat, psr.centerLon);
      if (!p.visible) continue;
      svgEl('circle', {
        cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 4.5,
        fill: 'rgba(253, 230, 138, 0.34)', stroke: '#fde68a', 'stroke-width': '1',
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
          stroke: isHit ? '#ff6b6b' : '#64748B', 'stroke-width': isHit ? '2.1' : '1.1',
          'stroke-dasharray': isHit ? 'none' : '4 3', opacity: '0.72',
        }, svg);
      }
    }
  }

  // Clickable CLPS Landing Sites on 3D Globe
  const customActive = isCustomSpotActive();
  for (const s of state.filteredSites) {
    const p = state.globe.latLonToScreen(s.lat, s.lon);
    if (!p.visible) continue;
    const status = primarySiteStatus(s.id);
    const color = status === 'LANDED' ? '#45d48a' : status === 'NO_LANDING' ? '#ff6b6b' : '#F97216';
    const selected = s.id === state.selectedSiteId && !customActive;

    if (selected) {
      svgEl('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 10.5, fill: 'none', stroke: '#ffffff', 'stroke-width': '1.6' }, svg);
    }
    svgEl('circle', {
      cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: selected ? 6.2 : 5,
      fill: color, stroke: '#0B1320', 'stroke-width': '1.5', class: 'clickable-marker',
      'data-site-id': s.id,
    }, svg);

    const lbl = svgEl('text', {
      x: (p.x + 8).toFixed(1), y: (p.y + 3).toFixed(1),
      fill: selected ? '#ffffff' : '#D1D4DB', 'font-size': '10.5', 'font-weight': selected ? '700' : '500',
      class: 'clickable-marker',
      'data-site-id': s.id,
    }, svg);
    lbl.textContent = s.shortName + (state.pickedPetSiteId === s.id ? ' ★' : '');
  }

  // Confirmed / Inspected Custom Drop Markers
  renderActiveCustomMarkers(svg, (lat, lon) => state.globe.latLonToScreen(lat, lon));
  // Pin under the on-globe 3D pet (model itself is in #surface-pet-layer)
  drawPlacedPetMarker(svg, (lat, lon) => state.globe.latLonToScreen(lat, lon), '3d');
  positionSurfacePetLayer();

  // Staged Drop Pin + Animated Storyboard Leader Line to #predrop-card (exclusive popup)
  if (state.stagedDrop) {
    const sp = state.globe.latLonToScreen(state.stagedDrop.lat, state.stagedDrop.lon);
    const layout = layoutPredropCard(
      sp.visible ? sp.x : vw * 0.5,
      sp.visible ? sp.y : 80,
      vw,
      vh
    );
    if (sp.visible) {
      svgEl('circle', { cx: sp.x.toFixed(1), cy: sp.y.toFixed(1), r: 11, fill: 'none', stroke: '#ffb84d', 'stroke-width': '1.8' }, svg);
      svgEl('circle', { cx: sp.x.toFixed(1), cy: sp.y.toFixed(1), r: 4.5, fill: '#ffffff', stroke: '#ffb84d', 'stroke-width': '1.5' }, svg);

      if (state.stagedDrop.animStartTime !== null) {
        const cardWidth = layout.cardW || Math.min(300, Math.max(200, vw - 24));
        const anchorX = layout.dockLeft ? 12 + cardWidth * 0.52 : vw - 12 - cardWidth * 0.52;
        const anchorY = layout.dockBottom ? Math.max(80, vh - 24) : 12;
        drawStoryboardConnector(svg, sp.x, sp.y, anchorX, anchorY, 14);
      }
    }
  }
}

function siteLabelPlacement2D(site, projection) {
  if (projection === 'global') {
    if (site.id === 'GRUITHUISEN_DOMES') return { dx: 10, dy: -4, anchor: 'start' };
    if (site.id === 'SINUS_VISCOSITATIS') return { dx: -10, dy: 9, anchor: 'end' };
    if (site.id === 'SHACKLETON_RIM') return { dx: 10, dy: -5, anchor: 'start' };
    return { dx: 10, dy: 4, anchor: 'start' };
  }
  const p = projectSouthPole(site.lat, site.lon);
  const inward = p.x > 525;
  if (site.id === 'MALAPERT_A') return { dx: 10, dy: -3, anchor: 'start' };
  return { dx: inward ? -10 : 10, dy: 4, anchor: inward ? 'end' : 'start' };
}

function renderMap() {
  const is3D = state.projection === '3d';
  setElementHidden($('#lunar-globe-gl'), !is3D);
  setElementHidden($('#globe-overlay'), !is3D);
  setElementHidden($('#lunar-map'), is3D);

  if (is3D) {
    if (state.globe) {
      state.globe.resize();
      state.globe.setLayers({
        showTerminator: $('#lyr-terminator').checked,
        showGraticule: $('#lyr-graticule').checked,
      });
    }
    render3DOverlay();
    void syncSurfacePetLayer(false);
    return;
  }

  // Flat / south-pole: tear down WebGL surface pet; sprites drawn on #lunar-map
  disposeSurfacePetLayer();

  const svg = $('#lunar-map');
  svg.replaceChildren();
  svg.setAttribute('viewBox', '0 0 960 480');
  const ep = getInterpolatedEphemeris() || { sunSubLon: 121.2, sunSubLat: -1.35, obsSubLon: -4.2, obsSubLat: -5.9 };
  const showTerm = $('#lyr-terminator').checked;
  const showGrid = $('#lyr-graticule').checked;
  const showPsr = $('#lyr-psr').checked;
  const showLinks = $('#lyr-links').checked;

  svgEl('rect', { x: 0, y: 0, width: 960, height: 480, fill: '#0B1320' }, svg);

  if (state.projection === 'global') {
    if (state.globe) {
      svgEl('image', {
        href: state.globe.getAlbedoDataUrl(),
        x: 0, y: 0, width: 960, height: 480,
        preserveAspectRatio: 'none', opacity: '0.9',
      }, svg);
    } else {
      svgEl('rect', { x: 240, y: 0, width: 480, height: 480, fill: '#151E2E', opacity: '0.55' }, svg);
    }

    if (showGrid) {
      for (let lon = -150; lon <= 150; lon += 30) {
        const x = ((lon + 180) / 360) * 960;
        svgEl('line', {
          x1: x, y1: 0, x2: x, y2: 480,
          stroke: lon === 0 ? '#64748B' : '#151E2E', 'stroke-width': lon === 0 ? 1.4 : 0.8,
          'stroke-dasharray': Math.abs(lon) === 90 ? '4 4' : '',
        }, svg);
        if (lon === -90 || lon === 0 || lon === 90) {
          svgEl('text', {
            x: x + 3, y: 12, fill: '#9AA4B4', 'font-size': '8.5', 'font-family': 'monospace', opacity: '0.85',
          }, svg).textContent = lon === 0 ? '0°' : `${Math.abs(lon)}°${lon > 0 ? 'E' : 'W'}`;
        }
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = ((90 - lat) / 180) * 480;
        svgEl('line', {
          x1: 0, y1: y, x2: 960, y2: y,
          stroke: lat === 0 ? '#64748B' : '#151E2E', 'stroke-width': lat === 0 ? 1.4 : 0.8,
        }, svg);
        if (lat === -60 || lat === 0 || lat === 60) {
          svgEl('text', {
            x: 6, y: y - 3, fill: '#9AA4B4', 'font-size': '8.5', 'font-family': 'monospace', opacity: '0.85',
          }, svg).textContent = lat === 0 ? '0° Eq' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`;
        }
      }
    }

    for (const f of state.data?.quickmap?.notableAlbedoFeatures || []) {
      const normLon = f.lon > 180 ? f.lon - 360 : f.lon;
      const p = projectGlobal(f.lat, normLon);
      svgEl('text', {
        x: p.x.toFixed(1), y: (p.y + 3).toFixed(1),
        fill: '#D1D4DB', opacity: '0.68', 'font-size': '8.5', 'text-anchor': 'middle', 'font-family': 'monospace',
      }, svg).textContent = f.name;
    }

    if (showTerm) {
      const rad = Math.PI / 180;
      const sunLatDeg = Math.abs(ep.sunSubLat) < 0.08 ? (ep.sunSubLat >= 0 ? 0.08 : -0.08) : ep.sunSubLat;
      const sunLatRad = sunLatDeg * rad;
      const polyPts = [];
      let segPts = [];
      const termSegments = [];
      for (let lon = -180; lon <= 180; lon += 0.5) {
        const dLon = (ep.sunSubLon - lon) * rad;
        const termLatDeg = (Math.atan(-Math.cos(dLon) / Math.tan(sunLatRad)) * 180) / Math.PI;
        const p = projectGlobal(termLatDeg, lon);
        polyPts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        if (Math.abs(termLatDeg) < 88.2) {
          segPts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        } else if (segPts.length > 1) {
          termSegments.push(segPts);
          segPts = [];
        } else {
          segPts = [];
        }
      }
      if (segPts.length > 1) termSegments.push(segPts);
      const nightPoleY = sunLatDeg >= 0 ? 480 : 0;
      svgEl('path', {
        d: `M 0,${nightPoleY} L ${polyPts.join(' L ')} L 960,${nightPoleY} Z`,
        fill: '#0B1320', opacity: '0.52',
      }, svg);
      for (const seg of termSegments) {
        svgEl('polyline', {
          points: seg.join(' '), fill: 'none', stroke: '#ffb84d', 'stroke-width': '1.25', opacity: '0.62',
        }, svg);
      }

      const sunP = projectGlobal(ep.sunSubLat, ep.sunSubLon);
      svgEl('circle', { cx: sunP.x.toFixed(1), cy: sunP.y.toFixed(1), r: 5.5, fill: '#ffb84d', stroke: '#fff7e0', 'stroke-width': '1.4', opacity: '0.9' }, svg);
      svgEl('text', { x: (sunP.x + 8).toFixed(1), y: (sunP.y + 3).toFixed(1), fill: '#ffb84d', 'font-size': '8.5', 'font-family': 'monospace', 'font-weight': '700' }, svg).textContent = 'SUN';

      const earthP = projectGlobal(ep.obsSubLat, ep.obsSubLon);
      svgEl('circle', { cx: earthP.x.toFixed(1), cy: earthP.y.toFixed(1), r: 4.5, fill: '#D1D4DB', stroke: '#ffffff', 'stroke-width': '1.2', opacity: '0.88' }, svg);
      svgEl('text', { x: (earthP.x + 7).toFixed(1), y: (earthP.y + 3).toFixed(1), fill: '#D1D4DB', 'font-size': '8.5', 'font-family': 'monospace', 'font-weight': '700' }, svg).textContent = 'EARTH';
    }
  } else {
    const defs = svgEl('defs', {}, svg);
    const clip = svgEl('clipPath', { id: 'pole-clip' }, defs);
    svgEl('circle', { cx: 480, cy: 240, r: 212 }, clip);

    svgEl('circle', { cx: 480, cy: 240, r: 214, fill: '#0B1320', stroke: '#64748B', 'stroke-width': '1.6' }, svg);
    if (state.globe && typeof state.globe.getSouthPoleDataUrl === 'function') {
      svgEl('image', {
        href: state.globe.getSouthPoleDataUrl(),
        x: 268, y: 28, width: 424, height: 424,
        preserveAspectRatio: 'xMidYMid meet',
        'clip-path': 'url(#pole-clip)',
        opacity: '0.94',
      }, svg);
    } else {
      svgEl('circle', { cx: 480, cy: 240, r: 212, fill: '#151E2E' }, svg);
    }

    if (showGrid) {
      for (const deg of [0, 90, 180, -90]) {
        const rad = (deg * Math.PI) / 180;
        svgEl('line', {
          x1: 480, y1: 240,
          x2: (480 + 212 * Math.sin(rad)).toFixed(1),
          y2: (240 - 212 * Math.cos(rad)).toFixed(1),
          stroke: deg === 0 ? 'rgba(249, 114, 22, 0.42)' : 'rgba(249, 114, 22, 0.2)',
          'stroke-width': deg === 0 ? '1.1' : '0.8',
        }, svg);
      }
      for (const latRing of [-85, -80, -75]) {
        const r = ((90 + latRing) / 16.5) * 212;
        svgEl('circle', {
          cx: 480, cy: 240, r: r.toFixed(1), fill: 'none',
          stroke: 'rgba(100, 116, 139, 0.45)', 'stroke-dasharray': '3 3',
        }, svg);
        svgEl('text', {
          x: 484, y: (240 - r + 11).toFixed(1),
          fill: '#D1D4DB', 'font-size': '9.5', 'font-family': 'monospace',
        }, svg).textContent = `${Math.abs(latRing)}°S`;
      }
      // Subtle South Pole crosshair (90°S)
      svgEl('line', { x1: 475, y1: 240, x2: 485, y2: 240, stroke: 'rgba(255,255,255,0.45)', 'stroke-width': '1' }, svg);
      svgEl('line', { x1: 480, y1: 235, x2: 480, y2: 245, stroke: 'rgba(255,255,255,0.45)', 'stroke-width': '1' }, svg);

      svgEl('text', { x: 480, y: 18, fill: '#D1D4DB', 'font-size': '9.5', 'font-family': 'monospace', 'text-anchor': 'middle' }, svg).textContent = '0° NEAR SIDE (EARTH)';
      svgEl('text', { x: 480, y: 470, fill: '#D1D4DB', 'font-size': '9.5', 'font-family': 'monospace', 'text-anchor': 'middle' }, svg).textContent = '180° FAR SIDE';
      svgEl('text', { x: 702, y: 243, fill: '#D1D4DB', 'font-size': '9.5', 'font-family': 'monospace' }, svg).textContent = '90°E';
      svgEl('text', { x: 258, y: 243, fill: '#D1D4DB', 'font-size': '9.5', 'font-family': 'monospace', 'text-anchor': 'end' }, svg).textContent = '90°W';
    }

    if (showTerm) {
      const sunRad = (ep.sunSubLon * Math.PI) / 180;
      const sx = Math.sin(sunRad);
      const sy = -Math.cos(sunRad);
      const nx = -sx;
      const ny = -sy;
      const tx = -ny;
      const ty = nx;
      const R = 360;
      // Offset terminator across pole by solar sub-latitude so negative sunSubLat lights the pole
      const termOffsetPx = (ep.sunSubLat / 16.5) * 212;
      const cxT = 480 + sx * termOffsetPx;
      const cyT = 240 + sy * termOffsetPx;
      const pts = [
        [cxT + tx * R, cyT + ty * R],
        [cxT + tx * R + nx * R, cyT + ty * R + ny * R],
        [cxT - tx * R + nx * R, cyT - ty * R + ny * R],
        [cxT - tx * R, cyT - ty * R],
      ].map((p) => p.map((n) => n.toFixed(1)).join(','));
      svgEl('polygon', {
        points: pts.join(' '), fill: '#0B1320', opacity: '0.52', 'clip-path': 'url(#pole-clip)',
      }, svg);
      svgEl('line', {
        x1: (cxT - tx * 240).toFixed(1), y1: (cyT - ty * 240).toFixed(1),
        x2: (cxT + tx * 240).toFixed(1), y2: (cyT + ty * 240).toFixed(1),
        stroke: '#ffb84d', 'stroke-width': '1.25', opacity: '0.68', 'clip-path': 'url(#pole-clip)',
      }, svg);

      // Sun azimuth badge on polar rim (well inside outer cardinal labels)
      const sRimX = 480 + sx * 212;
      const sRimY = 240 + sy * 212;
      svgEl('circle', { cx: sRimX.toFixed(1), cy: sRimY.toFixed(1), r: 4.5, fill: '#ffb84d', stroke: '#fff7e0', 'stroke-width': '1.2' }, svg);
      svgEl('text', {
        x: (480 + sx * 198).toFixed(1), y: (240 + sy * 198 + 3).toFixed(1),
        fill: '#ffb84d', 'font-size': '8.5', 'font-family': 'monospace', 'font-weight': '700',
        'text-anchor': sx > 0.25 ? 'end' : (sx < -0.25 ? 'start' : 'middle'),
        style: 'paint-order: stroke; stroke: #0B1320; stroke-width: 2.4px;',
      }, svg).textContent = 'SUN';
    }
  }

  if (showPsr) {
    for (const psr of state.data?.psrZones || []) {
      if (state.projection === 'pole' && psr.centerLat > -74) continue;
      if (state.projection === 'global') {
        const p = projectGlobal(psr.centerLat, psr.centerLon);
        svgEl('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 5.5, fill: 'rgba(253, 230, 138, 0.3)', stroke: '#fde68a', 'stroke-width': '1' }, svg);
      } else if (psr.rings?.[0]) {
        const pts = psr.rings[0].map(([lon, lat]) => {
          const p = projectSouthPole(lat, lon);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        }).join(' ');
        svgEl('polygon', { points: pts, fill: 'rgba(253, 230, 138, 0.28)', stroke: '#fde68a', 'stroke-width': '1.2' }, svg);
        if (!psr.name.includes('Shackleton')) {
          const cp = projectSouthPole(psr.centerLat, psr.centerLon);
          svgEl('text', {
            x: cp.x.toFixed(1), y: (cp.y - 6).toFixed(1),
            fill: '#D1D4DB', opacity: '0.78', 'font-size': '8.2', 'font-family': 'monospace', 'text-anchor': 'middle',
          }, svg).textContent = psr.name.replace(/\s+(Crater|Floor|PSR|Complex).*$/i, '');
        }
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
          fill: 'none', stroke: isHit ? '#ff6b6b' : '#64748B', 'stroke-width': isHit ? '2.2' : '1.2',
          'stroke-dasharray': isHit ? 'none' : '4 3', opacity: isHit ? '0.95' : '0.65',
        }, svg);
      }
    }
  }

  const customActive2D = isCustomSpotActive();
  const activeCanonId = normalizeSiteId(state.selectedSiteId);
  let renderedSelectedSiteInPole = false;
  for (const s of state.filteredSites) {
    const selected = normalizeSiteId(s.id) === activeCanonId && !customActive2D;
    if (state.projection === 'pole' && s.lat > -73.5) continue;
    if (selected) renderedSelectedSiteInPole = true;

    const p = projectPoint2D(s.lat, s.lon);
    const status = primarySiteStatus(s.id);
    const color = status === 'LANDED' ? '#45d48a' : status === 'NO_LANDING' ? '#ff6b6b' : '#F97216';

    if (selected) {
      svgEl('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 12, fill: 'none', stroke: '#ffffff', 'stroke-width': '2' }, svg);
    }
    svgEl('circle', {
      cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: selected ? 7 : 5.5,
      fill: color, stroke: '#0B1320', 'stroke-width': '1.6', style: 'cursor:pointer',
      'data-site-id': s.id,
    }, svg);

    const plc = siteLabelPlacement2D(s, state.projection);
    const lbl = svgEl('text', {
      x: (p.x + plc.dx).toFixed(1), y: (p.y + plc.dy).toFixed(1),
      fill: selected ? '#ffffff' : '#D1D4DB', 'font-size': selected ? '11.5' : '10',
      'font-weight': selected ? '700' : '500', 'text-anchor': plc.anchor,
      style: 'cursor:pointer; paint-order: stroke; stroke: #0B1320; stroke-width: 2.6px; stroke-linejoin: round;',
      'data-site-id': s.id,
    }, svg);
    lbl.textContent = s.shortName + (state.pickedPetSiteId === s.id ? ' ★' : '');
  }

  // If the currently selected known site is north of -73.5S while in South Pole view,
  // render a directional polar-rim indicator so selection remains visibly synchronized.
  if (state.projection === 'pole' && !customActive2D && !renderedSelectedSiteInPole) {
    const selSite = (state.data?.sites || []).find((s) => normalizeSiteId(s.id) === activeCanonId);
    if (selSite && selSite.lat > -73.5) {
      const rp = projectSouthPoleClamped(selSite.lat, selSite.lon);
      svgEl('circle', { cx: rp.x.toFixed(1), cy: rp.y.toFixed(1), r: 10, fill: 'none', stroke: '#ffffff', 'stroke-width': '1.6', 'stroke-dasharray': '3 2', 'data-site-id': selSite.id }, svg);
      svgEl('circle', { cx: rp.x.toFixed(1), cy: rp.y.toFixed(1), r: 5.5, fill: '#F97216', stroke: '#0B1320', 'stroke-width': '1.5', style: 'cursor:pointer', 'data-site-id': selSite.id }, svg);
      const inward = rp.x > 480;
      svgEl('text', {
        x: (inward ? rp.x - 12 : rp.x + 12).toFixed(1), y: (rp.y + 4).toFixed(1),
        fill: '#ffffff', 'font-size': '10', 'font-weight': '700', 'text-anchor': inward ? 'end' : 'start',
        style: 'cursor:pointer; paint-order: stroke; stroke: #0B1320; stroke-width: 2.6px;',
        'data-site-id': selSite.id,
      }, svg).textContent = `${selSite.shortName} (${Math.abs(selSite.lat).toFixed(0)}°${selSite.lat >= 0 ? 'N' : 'S'} ↑)`;
    }
  }

  const proj2DOrClamped = (lat, lon) => (
    state.projection === 'global' ? { ...projectGlobal(lat, lon), visible: true } : { ...projectSouthPoleClamped(lat, lon), visible: true }
  );
  renderActiveCustomMarkers(svg, proj2DOrClamped);
  drawPlacedPetMarker(svg, proj2DOrClamped, '2d');

  if (state.stagedDrop) {
    const sp = proj2DOrClamped(state.stagedDrop.lat, state.stagedDrop.lon);
    const m = svgViewBoxMetrics(svg);
    const layout = layoutPredropCard(sp.x / 960 * m.rw, sp.y / 480 * m.rh, m.rw, m.rh);
    svgEl('circle', {
      cx: sp.x.toFixed(1), cy: sp.y.toFixed(1), r: 10.5,
      fill: 'none', stroke: '#ffb84d', 'stroke-width': '1.8',
      'stroke-dasharray': sp.clamped ? '3 2' : 'none',
    }, svg);
    svgEl('circle', { cx: sp.x.toFixed(1), cy: sp.y.toFixed(1), r: 4.5, fill: '#ffffff', stroke: '#ffb84d', 'stroke-width': '1.5' }, svg);
    if (sp.clamped) {
      const inward = sp.x > 480;
      svgEl('text', {
        x: (inward ? sp.x - 14 : sp.x + 14).toFixed(1), y: (sp.y + 4).toFixed(1),
        fill: '#ffb84d', 'font-size': '10', 'font-weight': '700', 'text-anchor': inward ? 'end' : 'start',
        style: 'paint-order: stroke; stroke: #0B1320; stroke-width: 2.6px;',
      }, svg).textContent = `${Math.abs(state.stagedDrop.lat).toFixed(1)}°${state.stagedDrop.lat >= 0 ? 'N' : 'S'} ↑`;
    }
    if (state.stagedDrop.animStartTime !== null) {
      const cardWidthPx = layout.cardW || Math.min(300, Math.max(200, m.rw - 24));
      const anchorPxX = layout.dockLeft ? 12 + cardWidthPx * 0.52 : m.rw - 12 - cardWidthPx * 0.52;
      const anchorX = (m.rect.left + anchorPxX - m.offsetX) / Math.max(0.0001, m.scale);
      const anchorPxY = layout.dockBottom ? Math.max(80, m.rh - 24) : 12;
      const cardTopY = (m.rect.top + anchorPxY - m.offsetY) / Math.max(0.0001, m.scale);
      drawStoryboardConnector(svg, sp.x, sp.y, anchorX, cardTopY, 10);
    }
  }
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
    svgEl('circle', { cx, cy, r: r.toFixed(1), fill: 'none', stroke: '#202938', 'stroke-width': '1' }, svg);
    svgEl('text', { x: cx + 3, y: (cy - r + 10).toFixed(1), fill: '#9AA4B4', 'font-size': '9' }, svg).textContent = label;
  }
  for (const [ang, lbl] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
    const a = (ang * Math.PI) / 180;
    svgEl('line', { x1: cx, y1: cy, x2: (cx + R * Math.sin(a)).toFixed(1), y2: (cy - R * Math.cos(a)).toFixed(1), stroke: '#202938' }, svg);
    svgEl('text', {
      x: (cx + (R + 12) * Math.sin(a)).toFixed(1),
      y: (cy - (R + 12) * Math.cos(a) + 3).toFixed(1),
      fill: '#9AA4B4', 'font-size': '10', 'text-anchor': 'middle',
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
      fill: 'rgba(140, 155, 189, 0.25)', stroke: '#9AA4B4', 'stroke-width': '1',
    }, svg);
  }

  const cur = state.sky.current;
  const ep = getInterpolatedEphemeris();
  const coords = getActiveCoords();
  const earthEl = ep && coords ? elevationDeg(coords.lat, coords.lon, ep.obsSubLat, ep.obsSubLon) : cur.earthElevationDeg;
  const earthAz = ep && coords ? azimuthDeg(coords.lat, coords.lon, ep.obsSubLat, ep.obsSubLon) : cur.earthAzimuthDeg;
  const sunEl = ep && coords ? elevationDeg(coords.lat, coords.lon, ep.sunSubLat, ep.sunSubLon) : cur.sunElevationDeg;
  const sunAz = ep && coords ? azimuthDeg(coords.lat, coords.lon, ep.sunSubLat, ep.sunSubLon) : cur.sunAzimuthDeg;
  const earthVis = bins.length ? earthEl > horizonElevAtAz(bins, earthAz) : (ep && coords ? earthEl > -0.5 : cur.earthVisible);
  const sunVis = bins.length ? sunEl > horizonElevAtAz(bins, sunAz) : (ep && coords ? sunEl > 0 : cur.sunlit);

  function domePos(elev, az) {
    const r = ((90 - Math.max(-5, Math.min(90, elev))) / 90) * R;
    const rad = (az * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  }
  const earthP = domePos(earthEl, earthAz);
  svgEl('circle', {
    cx: earthP.x.toFixed(1), cy: earthP.y.toFixed(1), r: 6.5,
    fill: earthVis ? '#D1D4DB' : 'none', stroke: '#D1D4DB', 'stroke-width': '1.6',
  }, svg);
  const sunP = domePos(sunEl, sunAz);
  svgEl('circle', {
    cx: sunP.x.toFixed(1), cy: sunP.y.toFixed(1), r: 7.5,
    fill: sunVis ? '#ffb84d' : 'none', stroke: '#ffb84d', 'stroke-width': '1.8',
  }, svg);

  svgEl('text', { x: 14, y: 242, fill: '#45d48a', 'font-size': '10', 'font-family': 'monospace' }, svg)
    .textContent = `EARTH ${earthEl >= 0 ? '+' : ''}${earthEl.toFixed(1)}°`;
  svgEl('text', { x: 266, y: 242, fill: '#ffb84d', 'font-size': '10', 'font-family': 'monospace', 'text-anchor': 'end' }, svg)
    .textContent = `SUN ${sunEl >= 0 ? '+' : ''}${sunEl.toFixed(1)}°`;
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
      stroke: deg === 0 ? '#64748B' : '#202938', 'stroke-width': deg === 0 ? '1.3' : '0.8',
      'stroke-dasharray': deg === 0 ? '4 3' : '',
    }, svg);
    svgEl('text', { x: padL - 5, y: (y + 3).toFixed(1), fill: '#9AA4B4', 'font-size': '9.5', 'text-anchor': 'end', 'font-family': 'monospace' }, svg)
      .textContent = `${deg}°`;
  }

  const earthPts = state.sky.earth.map((e, i) => `${xOf(i).toFixed(1)},${yOf(e).toFixed(1)}`).join(' ');
  svgEl('polyline', { points: earthPts, fill: 'none', stroke: '#F97216', 'stroke-width': '1.8' }, svg);

  const sunPts = state.sky.sun.map((e, i) => `${xOf(i).toFixed(1)},${yOf(e).toFixed(1)}`).join(' ');
  svgEl('polyline', { points: sunPts, fill: 'none', stroke: '#ffb84d', 'stroke-width': '2' }, svg);

  const nowX = xOf(Math.min(Math.max(0, state.sampleFloat), Math.max(0, n - 1)));
  svgEl('line', { x1: nowX.toFixed(1), y1: padT, x2: nowX.toFixed(1), y2: H - padB, stroke: '#ffffff', 'stroke-width': '1.3', 'stroke-dasharray': '3 3' }, svg);
  svgEl('text', { x: Math.min(W - 35, Math.max(padL + 4, nowX + 4)), y: padT + 10, fill: '#ffffff', 'font-size': '9.5', 'font-family': 'monospace' }, svg)
    .textContent = 'NOW';

  for (let i = 0; i < n; i += 24) {
    const lbl = (state.sky.timestamps[i] || '').slice(5, 11).toUpperCase();
    svgEl('text', { x: xOf(i).toFixed(1), y: H - 8, fill: '#9AA4B4', 'font-size': '9', 'text-anchor': 'middle', 'font-family': 'monospace' }, svg)
      .textContent = lbl;
  }

  svg.onclick = (ev) => {
    const rect = svg.getBoundingClientRect();
    const clickX = ((ev.clientX - rect.left) / rect.width) * W;
    const ratio = Math.max(0, Math.min(1, (clickX - padL) / plotW));
    state.sampleFloat = ratio * (n - 1);
    state.sampleIndex = Math.round(state.sampleFloat) % n;
    state.lastSyncedSample = state.sampleIndex;
    applyContinuousSunFrame();
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
    <h4>Raw NASA Payloads (${clientFallbackMode ? 'Client Bundle / Static' : 'Served by Backend'})</h4>
    <p>Inspect unmodified NASA JSON files stored under <code>data/maps/raw/</code>:</p>
    <div style="display:grid;gap:.25rem">
      <a class="raw-payload-link" href="/api/map/raw/trek_sites" target="_blank">/api/map/raw/trek_sites</a>
      <a class="raw-payload-link" href="/api/map/raw/trek_psr" target="_blank">/api/map/raw/trek_psr</a>
      <a class="raw-payload-link" href="/api/map/raw/lola" target="_blank">/api/map/raw/lola</a>
      <a class="raw-payload-link" href="/api/map/raw/horizons" target="_blank">/api/map/raw/horizons</a>
      <a class="raw-payload-link" href="/api/map/raw/quickmap" target="_blank">/api/map/raw/quickmap</a>
    </div>
  `;
  rawLinks.querySelectorAll('.raw-payload-link').forEach((link) => {
    link.addEventListener('click', async (ev) => {
      if (!clientFallbackMode) return;
      ev.preventDefault();
      const json = await handleClientApi(link.getAttribute('href'));
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    });
  });
  grid.appendChild(rawLinks);
}

// ---- Playback & Events ----
function stopPlay() {
  if (state.playRaf !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(state.playRaf);
  }
  state.playRaf = null;
  state.playing = false;
  state.playLastTime = 0;
  const btn = $('#btn-play');
  if (btn) btn.textContent = '▶ Play';
}

function requestSkySync() {
  if (state.skySyncBusy) {
    state.skySyncPending = true;
    return;
  }
  state.skySyncBusy = true;
  state.skySyncPending = false;
  state.lastSyncedSample = state.sampleIndex;
  loadSiteSky()
    .catch((err) => console.error(err))
    .finally(() => {
      state.skySyncBusy = false;
      if (state.skySyncPending && state.lastSyncedSample !== state.sampleIndex) {
        requestSkySync();
      } else {
        state.skySyncPending = false;
      }
    });
}

function stepPlay(now) {
  if (!state.playing) return;
  const dt = state.playLastTime > 0 ? Math.min(0.1, Math.max(0, (now - state.playLastTime) / 1000)) : 0;
  state.playLastTime = now;

  const n = state.ephemeris.length || 178;
  const hz = Number($('#play-speed').value) || 3;
  state.sampleFloat = (state.sampleFloat + dt * hz) % n;
  const rounded = Math.round(state.sampleFloat) % n;
  const crossed = rounded !== state.sampleIndex;
  state.sampleIndex = rounded;

  applyContinuousSunFrame();
  if (crossed) {
    requestSkySync();
  }
  if (state.playing && typeof requestAnimationFrame === 'function') {
    state.playRaf = requestAnimationFrame(stepPlay);
  }
}

function togglePlay() {
  if (state.playing) {
    stopPlay();
    return;
  }
  state.playing = true;
  $('#btn-play').textContent = '❚❚ Pause';
  state.playLastTime = typeof performance !== 'undefined' ? performance.now() : 0;
  if (typeof requestAnimationFrame === 'function') {
    state.playRaf = requestAnimationFrame(stepPlay);
  }
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
      state.sampleFloat = curr;
      state.lastSyncedSample = curr;
      loadSiteSky().then(renderMap);
      return;
    }
  }
}

function setProjection(mode, focusActive = true) {
  state.projection = mode;
  $('#proj-3d').classList.toggle('active', mode === '3d');
  $('#proj-global').classList.toggle('active', mode === 'global');
  $('#proj-pole').classList.toggle('active', mode === 'pole');

  const active = getActivePointInfo() || (state.placedPet
    ? { lat: state.placedPet.lat, lon: state.placedPet.lon, isCustom: !state.placedPet.matchedKnownSite }
    : null);
  if (mode === '3d' && state.globe) {
    setElementHidden($('#lunar-globe-gl'), false);
    setElementHidden($('#globe-overlay'), false);
    setElementHidden($('#lunar-map'), true);
    state.globe.resize();
    if (active && (state.stagedDrop || active.isCustom || state.placedPet)) {
      state.globe.setStagedPoint(active.lat, active.lon);
    } else {
      state.globe.setStagedPoint(null, null);
    }
    if (focusActive && active) {
      state.globe.focusLatLon(active.lat, active.lon, {
        duration: 240,
        yawOffsetRad: state.stagedDrop ? 0.22 : 0,
      });
    }
  } else {
    disposeSurfacePetLayer();
  }

  $('#cursor-hud').textContent = mode === '3d'
    ? 'Drag to spin · Scroll to zoom · Click anywhere on the Moon to inspect a spot'
    : 'Click anywhere on the Moon map to inspect conditions or check a landing spot';

  renderMap();
  if (mode === '3d') void syncSurfacePetLayer(true);
}

function wireEvents() {
  $('#proj-3d').onclick = () => setProjection('3d');
  $('#proj-global').onclick = () => setProjection('global');
  $('#proj-pole').onclick = () => setProjection('pole');
  $('#btn-reset-globe').onclick = () => {
    if (state.globe) state.globe.resetView();
    setProjection('3d', false);
  };

  for (const id of ['#lyr-terminator', '#lyr-graticule', '#lyr-psr', '#lyr-links']) {
    $(id).onchange = renderMap;
  }

  const mapSvg = $('#lunar-map');
  if (mapSvg) {
    let mapDown = null;
    mapSvg.addEventListener('mousedown', (e) => {
      if (state.projection === '3d') return;
      const targetSiteEl = e.target?.closest?.('[data-site-id]');
      const siteId = targetSiteEl?.dataset?.siteId || targetSiteEl?.getAttribute?.('data-site-id') || null;
      mapDown = { x: e.clientX, y: e.clientY, siteId };
    });

    mapSvg.addEventListener('mousemove', (e) => {
      if (state.projection === '3d') return;
      const hud = $('#cursor-hud');
      const targetSiteEl = e.target?.closest?.('[data-site-id]');
      const targetSiteId = targetSiteEl?.dataset?.siteId || targetSiteEl?.getAttribute?.('data-site-id');
      const siteHit = (targetSiteId
        ? (state.data?.sites || []).find((s) => s.id === targetSiteId)
        : null) || findNearest2DSite(e.clientX, e.clientY, mapSvg, 16);
      const ep = getInterpolatedEphemeris() || { sunSubLon: 121.2, sunSubLat: -1.35, obsSubLon: -4.2, obsSubLat: -5.9 };
      if (siteHit) {
        mapSvg.style.cursor = 'pointer';
        const sunEl = quickSunElevation(siteHit.lat, siteHit.lon, ep);
        hud.textContent = `${siteHit.shortName} · ${formatCoords(siteHit.lat, siteHit.lon)} · ${sunEl > 0 ? 'Daytime (Sunlit)' : 'Nighttime (Dark)'} — Click to inspect`;
        return;
      }
      const coords = unproject2DClick(e.clientX, e.clientY, mapSvg);
      if (!coords) {
        mapSvg.style.cursor = 'default';
        hud.textContent = 'Click anywhere on the Moon map to inspect conditions or check a landing spot';
        return;
      }
      mapSvg.style.cursor = 'crosshair';
      const sunEl = quickSunElevation(coords.lat, coords.lon, ep);
      hud.textContent = `${formatCoords(coords.lat, coords.lon)} · ${sunEl > 0 ? 'Daytime (Sunlit)' : 'Nighttime (Dark)'} — Click to check this spot`;
    });

    mapSvg.addEventListener('mouseleave', () => {
      mapDown = null;
      if (state.projection === '3d') return;
      $('#cursor-hud').textContent = 'Click anywhere on the Moon map to inspect conditions or check a landing spot';
    });

    mapSvg.addEventListener('mouseup', (e) => {
      if (state.projection === '3d') return;
      const down = mapDown;
      mapDown = null;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const targetSiteEl = e.target?.closest?.('[data-site-id]');
      const targetSiteId = down?.siteId || targetSiteEl?.dataset?.siteId || targetSiteEl?.getAttribute?.('data-site-id');
      const siteHit = (targetSiteId
        ? (state.data?.sites || []).find((s) => s.id === targetSiteId)
        : null) || findNearest2DSite(e.clientX, e.clientY, mapSvg, 16);
      if (siteHit) {
        stageDropPoint(siteHit.lat, siteHit.lon);
        return;
      }
      const coords = unproject2DClick(e.clientX, e.clientY, mapSvg);
      if (coords) stageDropPoint(coords.lat, coords.lon);
    });
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
    // Speed is read dynamically on each animation frame.
  };
  $('#btn-step-back').onclick = () => {
    const n = state.ephemeris.length || 178;
    state.sampleIndex = (Math.round(state.sampleFloat) - 1 + n) % n;
    state.sampleFloat = state.sampleIndex;
    state.lastSyncedSample = state.sampleIndex;
    loadSiteSky().then(renderMap);
  };
  $('#btn-step-fwd').onclick = () => {
    const n = state.ephemeris.length || 178;
    state.sampleIndex = (Math.round(state.sampleFloat) + 1) % n;
    state.sampleFloat = state.sampleIndex;
    state.lastSyncedSample = state.sampleIndex;
    loadSiteSky().then(renderMap);
  };
  $('#btn-jump-sunrise').onclick = () => jumpToSunTransition(true);
  $('#btn-jump-sunset').onclick = () => jumpToSunTransition(false);
  $('#time-slider').oninput = (e) => {
    const n = state.ephemeris.length || 178;
    state.sampleFloat = Math.max(0, Math.min(n - 1, Number(e.target.value)));
    state.sampleIndex = Math.round(state.sampleFloat) % n;
    applyContinuousSunFrame();
    if (state.sampleIndex !== state.lastSyncedSample) {
      requestSkySync();
    }
  };

  $('#btn-pick-pet-site').onclick = () => {
    if (state.inspectedEval && !state.inspectedEval.matchedKnownSite) {
      stageDropPoint(state.inspectedEval.lat, state.inspectedEval.lon);
      return;
    }
    const s = (state.data?.sites || []).find((x) => x.id === state.selectedSiteId);
    if (s) stageDropPoint(s.lat, s.lon);
  };
  $('#btn-confirm-drop').onclick = confirmStagedDrop;
  $('#btn-cancel-drop').onclick = clearStagedDrop;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (state.stagedDrop) {
      e.preventDefault();
      clearStagedDrop();
    }
  });

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
    `${pStats.deliveriesPlannedThrough2028 || 17} planned NASA landings · click the Moon to inspect`;

  state.globe = new LunarGlobeGL($('#lunar-globe-gl'), {
    quickmap: data.quickmap || {},
    quickmapFeatures: data.quickmap?.notableAlbedoFeatures || [],
    psrZones: data.psrZones || [],
    sites: data.sites || [],
    onHover: (hit) => {
      const hud = $('#cursor-hud');
      if (!hit) {
        hud.textContent = 'Drag to spin · Scroll to zoom · Click anywhere on the Moon to inspect a spot';
        return;
      }
      const ep = getInterpolatedEphemeris() || state.ephemeris[state.sampleIndex];
      const sunEl = ep ? quickSunElevation(hit.lat, hit.lon, ep) : 0;
      const siteObj = hit.siteId ? (state.data?.sites || []).find((s) => s.id === hit.siteId) : null;
      const prefix = siteObj ? `${siteObj.shortName} · ` : '';
      hud.textContent = `${prefix}${formatCoords(hit.lat, hit.lon)} · ${sunEl > 0 ? 'Daytime (Sunlit)' : 'Nighttime (Dark)'} — Click to check this spot`;
    },
    onSelectPoint: (hit) => {
      stageDropPoint(hit.lat, hit.lon);
    },
    onViewChange: () => {
      if (state.projection === '3d') {
        render3DOverlay();
        positionSurfacePetLayer();
      }
    },
    onTextureLoad: () => {
      if (state.projection !== '3d') renderMap();
    },
  });

window.PayloadPetsMap = {
  normalizeSiteId,
  DROP_PETS,
  getSelectedPetId() {
    return state.selectedPetId;
  },
  getPlacedPet() {
    return state.placedPet ? { ...state.placedPet } : null;
  },
  getSelectedSite() {
    const canonical = normalizeSiteId(state.selectedSiteId);
    return (state.data?.sites || []).find((s) => normalizeSiteId(s.id) === canonical) || null;
  },
  getConfirmedDrop() {
    return state.confirmedDrop ? { ...state.confirmedDrop } : null;
  },
  evaluateDrop(lat, lon, sample = state.sampleIndex) {
    return api(
      `/api/map/evaluate?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&sample=${encodeURIComponent(sample)}`
    );
  },
  getSky(siteId = state.selectedSiteId, sample = state.sampleIndex) {
    const canonical = normalizeSiteId(siteId) || siteId;
    return api(
      `/api/map/sky?site=${encodeURIComponent(canonical)}&sample=${encodeURIComponent(sample)}`
    );
  },
};

  renderPetPickers();
  renderSiteList();
  renderSources();
  renderMissions();
  await loadSiteSky();
  // Restore camera onto any previously dropped pet so the surface billboard isn't off-limb.
  if (state.projection === '3d' && state.globe && state.placedPet && isDropPet(state.placedPet.petId)) {
    await state.globe.focusLatLon(state.placedPet.lat, state.placedPet.lon, {
      duration: 0,
      animate: false,
    });
  }
  renderMap();
  await refreshPlacedPetReaction(true);
  positionSurfacePetLayer();
  await refreshCompare();
}

init().catch((err) => {
  console.error(err);
  $('#program-stats').textContent = `Error loading lunar map data: ${err.message}`;
});
