import {
  getBrowserDatasetState,
  findSite,
  elevationDeg,
  azimuthDeg,
  horizonElevationAtAzimuth,
  formatDurationDaysHours,
} from './map_engine_client.js';

const DEFAULT_SITE_IDS = ['SHACKLETON_RIM', 'MALAPERT_A', 'MONS_MOUTON'];
const POLAR_LAT = -70;
const LOOKAHEAD_DAYS = 32;

const $ = (sel, el = document) => el.querySelector(sel);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;

let bundle = null;
let longEph = []; // from data/ephemeris.json when available
let selectedIds = [...DEFAULT_SITE_IDS];

function parseHorizonsDate(ts) {
  // "2026-Dec-03 12:00" or "2024-Jan-01 00:00"
  const m = String(ts).trim().match(/^(\d{4})-([A-Za-z]{3})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (!m) return NaN;
  const months = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const mo = months[m[2]];
  if (mo == null) return NaN;
  return Date.UTC(+m[1], mo, +m[3], +m[4], +m[5]);
}

function toIsoInput(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return { date: `${y}-${mo}-${day}`, time: `${h}:${mi}` };
}

function selectedUtcMs() {
  const date = $('#nav-date').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const time = $('#nav-time').value || '12:00';
  const [y, mo, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, mo - 1, d, hh || 0, mm || 0);
}

/** First and last sample times of the loaded ephemeris; the only dates we can honestly show. */
function ephRange(eph) {
  return { minMs: eph[0]._ms, maxMs: eph[eph.length - 1]._ms };
}

function selectedWindowDays() {
  return Number($('#nav-window').value) || 14;
}

/** Latest start time that still leaves the whole mission window inside the ephemeris. */
function latestStartMs(eph) {
  const { minMs, maxMs } = ephRange(eph);
  const lookMs = selectedWindowDays() * 86400000;
  return Math.max(minMs, maxMs - lookMs);
}

/**
 * Lock the date picker to the loaded ephemeris so out-of-range dates can't be picked.
 * The max moves with the mission window: a 29.5-day window must start ~30 days before the data ends.
 */
function applyDateLimits(eph) {
  if (!eph.length) return;
  const { minMs, maxMs } = ephRange(eph);
  const input = $('#nav-date');
  input.min = toIsoInput(minMs).date;
  input.max = toIsoInput(latestStartMs(eph)).date;
  input.title = `Pick a start between ${input.min} and ${input.max} (UTC)`;
  const hint = $('#date-range');
  if (hint) {
    hint.textContent = `Data ${toIsoInput(minMs).date} → ${toIsoInput(maxMs).date} · latest start ${input.max}`;
  }
}

function setDateNote(text, kind = 'warn') {
  const el = $('#date-note');
  if (!el) return;
  el.textContent = text || '';
  el.dataset.kind = text ? kind : '';
  el.hidden = !text;
}

/**
 * Selected UTC clamped to the ephemeris. Snaps the inputs back into range and explains why,
 * instead of silently showing the nearest sample from a different year.
 */
function resolveEpochMs(eph) {
  applyDateLimits(eph);
  const { minMs } = ephRange(eph);
  const maxMs = latestStartMs(eph);
  let ms = selectedUtcMs();
  let note = '';
  if (!Number.isFinite(ms)) {
    ms = Number($('#nav-date').dataset.lastGoodMs) || minMs;
    note = 'Pick a full UTC date. Showing the last valid date instead.';
  } else if (ms < minMs) {
    ms = minMs;
    note = `No ephemeris before ${toIsoInput(minMs).date}. Moved to the first available sample.`;
  } else if (ms > maxMs) {
    ms = maxMs;
    note = `A ${selectedWindowDays()}-day window can start no later than ${toIsoInput(maxMs).date} (ephemeris ends ${toIsoInput(ephRange(eph).maxMs).date}). Moved to that date.`;
  }
  if (note) {
    const iso = toIsoInput(ms);
    $('#nav-date').value = iso.date;
    $('#nav-time').value = iso.time;
    $('#nav-scrub').value = String(new Date(ms).getUTCHours());
  }
  $('#nav-date').dataset.lastGoodMs = String(ms);
  return { ms, note };
}

function convertLongEphemeris(raw) {
  const rows = raw?.rows || [];
  return rows.map((r, index) => ({
    index,
    timestampUtc: r.t,
    obsSubLon: r.elo,
    obsSubLat: r.ela,
    sunSubLon: r.slo,
    sunSubLat: r.sla,
    _ms: parseHorizonsDate(r.t),
  })).filter((r) => Number.isFinite(r._ms));
}

function activeEphemeris() {
  if (longEph.length > 40) return longEph;
  return (bundle?.ephemeris || []).map((e, index) => ({
    ...e,
    index,
    _ms: parseHorizonsDate(e.timestampUtc),
  }));
}

function ephStepHours(eph) {
  if (eph.length < 2) return 3;
  const dt = (eph[1]._ms - eph[0]._ms) / 3600000;
  return Number.isFinite(dt) && dt > 0 ? dt : 3;
}

function nearestIndex(eph, ms) {
  if (!eph.length) return 0;
  let best = 0;
  let bestDist = Infinity;
  // Coarse stride then refine — ephemeris can be 14k rows
  const stride = Math.max(1, Math.floor(eph.length / 800));
  for (let i = 0; i < eph.length; i += stride) {
    const dist = Math.abs(eph[i]._ms - ms);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  const lo = Math.max(0, best - stride * 2);
  const hi = Math.min(eph.length - 1, best + stride * 2);
  for (let i = lo; i <= hi; i++) {
    const dist = Math.abs(eph[i]._ms - ms);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function polarSites() {
  const sites = bundle?.sites || [];
  const polar = sites.filter((s) => {
    const region = String(s.region || '').toUpperCase().replace(/-/g, '_');
    return (
      s.lat <= POLAR_LAT ||
      region === 'SOUTH_POLE' ||
      region === 'POLAR' ||
      region === 'FAR_SIDE'
    );
  });
  // Prefer south-pole first, then far-side contrast (Schrödinger)
  polar.sort((a, b) => a.lat - b.lat);
  return polar.length ? polar : sites.slice(0, 6);
}

function horizonNote(site) {
  const bins = site.horizonProfileDeg || site.horizonProfile || [];
  const maxH = bins.length ? Math.max(...bins) : 0;
  if (!bins.length || maxH < 0.05) {
    return { label: 'Flat horizon approx. (no LOLA mask)', className: 'warn' };
  }
  return { label: `LOLA 36-bin horizon (max ${round1(maxH)}°)`, className: 'good' };
}

/** Same panel model as map_engine_client.solarPanelPowerPct (not exported). */
function panelPowerPct(sunElevDeg, horizonElevDeg, slopeDeg) {
  if (sunElevDeg <= horizonElevDeg) return 0;
  const eff = clamp(sunElevDeg + Math.min(12, (slopeDeg || 0) * 0.25), 0, 90);
  return clamp(Math.sin((eff * Math.PI) / 180) * 100, 0, 100);
}

function findNextTransition(series, startIdx, targetState, stepHours) {
  if (series.length < 2) return 'No event in look-ahead';
  for (let offset = 1; offset < series.length; offset++) {
    if (series[startIdx + offset - 1] !== targetState && series[startIdx + offset] === targetState) {
      return formatDurationDaysHours(offset * stepHours);
    }
  }
  return 'No event in look-ahead';
}

function sampleSky(site, ep) {
  const sunEl = elevationDeg(site.lat, site.lon, ep.sunSubLat, ep.sunSubLon);
  const sunAz = azimuthDeg(site.lat, site.lon, ep.sunSubLat, ep.sunSubLon);
  const earthEl = elevationDeg(site.lat, site.lon, ep.obsSubLat, ep.obsSubLon);
  const earthAz = azimuthDeg(site.lat, site.lon, ep.obsSubLat, ep.obsSubLon);
  const sunH = horizonElevationAtAzimuth(site.horizonProfileDeg, sunAz);
  const earthH = horizonElevationAtAzimuth(site.horizonProfileDeg, earthAz);
  const sunlit = sunEl > sunH;
  const earthVisible = earthEl > earthH && earthEl > -0.5;
  return {
    sunElevationDeg: round1(sunEl),
    sunAzimuthDeg: round1(sunAz),
    sunHorizonDeg: round1(sunH),
    sunlit,
    earthElevationDeg: round1(earthEl),
    earthAzimuthDeg: round1(earthAz),
    earthHorizonDeg: round1(earthH),
    earthVisible,
    dualViable: sunlit && earthVisible,
    panelPowerPct: round1(panelPowerPct(sunEl, sunH, site.slopeDegrees)),
  };
}

function verdictFromCurrent(c) {
  if (c.sunlit && c.earthVisible && c.panelPowerPct >= 25) {
    return { text: 'GO · power + DTE', className: 'good' };
  }
  if (c.sunlit || c.earthVisible) {
    return { text: 'MARGINAL · one link weak', className: 'warn' };
  }
  return { text: 'NO-GO · night / no DTE', className: 'bad' };
}

function windowSlice(eph, startIdx, windowDays, stepHours) {
  const need = Math.max(2, Math.round((windowDays * 24) / stepHours));
  const out = [];
  for (let k = 0; k < need && startIdx + k < eph.length; k++) {
    out.push(eph[startIdx + k]);
  }
  return out;
}

/**
 * Evaluate site at epoch without running computeSiteSky over the full
 * 14k-row Horizons catalog (that path is O(n²) for best-window search).
 */
function evaluateSite(site, eph, idx, windowDays) {
  const stepHours = ephStepHours(eph);
  const lookAhead = windowSlice(eph, idx, LOOKAHEAD_DAYS, stepHours);
  const samples = windowSlice(eph, idx, windowDays, stepHours);

  const sunlitSeries = [];
  const dteSeries = [];
  for (const ep of lookAhead) {
    const snap = sampleSky(site, ep);
    sunlitSeries.push(snap.sunlit);
    dteSeries.push(snap.earthVisible);
  }

  const current = sampleSky(site, eph[idx]);
  current.nextSunset = findNextTransition(sunlitSeries, 0, false, stepHours);
  current.nextSunrise = findNextTransition(sunlitSeries, 0, true, stepHours);
  current.nextEarthset = findNextTransition(dteSeries, 0, false, stepHours);

  let sunlit = 0;
  let dte = 0;
  let dual = 0;
  let powerSum = 0;
  const sunSeries = [];
  const earthSeries = [];
  const dualSeries = [];
  const horizonAtSun = [];

  for (const ep of samples) {
    const snap = sampleSky(site, ep);
    if (snap.sunlit) sunlit++;
    if (snap.earthVisible) dte++;
    if (snap.dualViable) dual++;
    powerSum += snap.panelPowerPct;
    sunSeries.push(snap.sunElevationDeg);
    earthSeries.push(snap.earthElevationDeg);
    dualSeries.push(snap.dualViable);
    horizonAtSun.push(snap.sunHorizonDeg);
  }

  const n = samples.length || 1;
  const hz = horizonNote(site);
  return {
    site,
    timestampUtc: eph[idx].timestampUtc,
    current,
    horizon: hz,
    verdict: verdictFromCurrent(current),
    window: {
      days: windowDays,
      samples: n,
      stepHours: round1(stepHours),
      sunlitPct: round1((sunlit * 100) / n),
      dtePct: round1((dte * 100) / n),
      dualPct: round1((dual * 100) / n),
      avgPowerPct: round1(powerSum / n),
      sunSeries,
      earthSeries,
      dualSeries,
      horizonAtSun,
      timestamps: samples.map((s) => s.timestampUtc),
    },
  };
}

function renderSitePicks() {
  const host = $('#site-picks');
  const sites = polarSites();
  host.innerHTML = sites.map((s) => {
    const on = selectedIds.includes(s.id);
    return `<label class="chk ${on ? 'on' : ''}">
      <input type="checkbox" data-site="${s.id}" ${on ? 'checked' : ''}>
      ${s.shortName || s.name}
    </label>`;
  }).join('');
  host.querySelectorAll('input[data-site]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const id = inp.dataset.site;
      if (inp.checked) {
        if (selectedIds.length >= 4) {
          inp.checked = false;
          return;
        }
        selectedIds.push(id);
      } else {
        selectedIds = selectedIds.filter((x) => x !== id);
        if (!selectedIds.length) {
          selectedIds = [id];
          inp.checked = true;
        }
      }
      renderSitePicks();
      refresh();
    });
  });
}

function renderCards(results) {
  const host = $('#compare-cards');
  host.innerHTML = results.map((r) => {
    const c = r.current;
    return `<article class="site-card" data-site-id="${r.site.id}">
      <div class="site-card-head">
        <div>
          <div class="kicker">SOUTH POLE CANDIDATE</div>
          <h3>${r.site.name}</h3>
          <div class="coords">${r.site.lat.toFixed(2)}° / ${r.site.lon.toFixed(2)}°E · elev ${Math.round(r.site.elevationMeters || 0)} m</div>
        </div>
        <span class="verdict ${r.verdict.className}">${r.verdict.text}</span>
      </div>
      <div class="metric-grid">
        <div class="metric" data-metric="sun-elev">
          <span>SUN ELEVATION</span>
          <strong>${c.sunElevationDeg.toFixed(1)}°</strong>
          <small>${c.sunlit ? 'Above local horizon' : 'Below / blocked'} · az ${c.sunAzimuthDeg.toFixed(0)}° · hz ${c.sunHorizonDeg.toFixed(1)}°</small>
        </div>
        <div class="metric" data-metric="solar-power">
          <span>SOLAR POWER (approx)</span>
          <strong>${c.panelPowerPct.toFixed(0)}%</strong>
          <small>sin(elev) + slope tip · slope ${round1(r.site.slopeDegrees || 0)}°</small>
        </div>
        <div class="metric" data-metric="earth-elev">
          <span>EARTH ELEVATION</span>
          <strong>${c.earthElevationDeg.toFixed(1)}°</strong>
          <small>${c.earthVisible ? 'DTE geometry OK' : 'No DTE'} · az ${c.earthAzimuthDeg.toFixed(0)}° · hz ${c.earthHorizonDeg.toFixed(1)}°</small>
        </div>
        <div class="metric" data-metric="dte">
          <span>EARTH COMMS</span>
          <strong>${c.earthVisible ? 'CLEAR' : 'BLOCKED'}</strong>
          <small>Next Earthset ${c.nextEarthset}</small>
        </div>
      </div>
      <div class="win-row">
        <div><span>WINDOW SUNLIT</span><strong>${r.window.sunlitPct}%</strong></div>
        <div><span>WINDOW DTE</span><strong>${r.window.dtePct}%</strong></div>
        <div><span>BOTH READY</span><strong>${r.window.dualPct}%</strong></div>
      </div>
      <p class="muted horizon-note">Horizon: ${r.horizon.label} · Next sunset ${c.nextSunset}</p>
    </article>`;
  }).join('') || `<p class="muted">Select at least one south-pole site.</p>`;
}

function renderTable(results) {
  const thead = $('#score-table thead');
  const tbody = $('#score-table tbody');
  thead.innerHTML = `<tr>
    <th>Metric</th>
    ${results.map((r) => `<th>${r.site.shortName || r.site.name}</th>`).join('')}
  </tr>`;
  const rows = [
    ['UTC sample', (r) => r.timestampUtc || '—'],
    ['Sun elev (°)', (r) => r.current.sunElevationDeg.toFixed(1)],
    ['Solar power % (approx)', (r) => r.current.panelPowerPct.toFixed(0)],
    ['Earth elev (°)', (r) => r.current.earthElevationDeg.toFixed(1)],
    ['DTE now', (r) => (r.current.earthVisible ? 'Yes' : 'No')],
    ['Window sunlit %', (r) => r.window.sunlitPct.toFixed(1)],
    ['Window DTE %', (r) => r.window.dtePct.toFixed(1)],
    ['Window dual %', (r) => r.window.dualPct.toFixed(1)],
    ['Avg power % (window)', (r) => r.window.avgPowerPct.toFixed(0)],
    ['Illum (terrain, catalog)', (r) => `${round1(r.site.illuminationTerrainPct ?? r.site.illuminationPct ?? 0)}%`],
    ['Earth vis (catalog)', (r) => `${round1(r.site.earthVisibilityPct ?? 0)}%`],
    ['Horizon model', (r) => r.horizon.label],
    ['Verdict @ epoch', (r) => r.verdict.text],
  ];
  tbody.innerHTML = rows.map(([label, fn]) => `<tr>
    <th scope="row">${label}</th>
    ${results.map((r) => `<td class="num">${fn(r)}</td>`).join('')}
  </tr>`).join('');
}

function renderChart(primary) {
  const svg = $('#elev-chart');
  if (!primary) {
    svg.innerHTML = '';
    return;
  }
  const sun = primary.window.sunSeries;
  const earth = primary.window.earthSeries;
  const dual = primary.window.dualSeries;
  const horiz = primary.window.horizonAtSun;
  const n = sun.length;
  const W = 720;
  const H = 220;
  const padL = 42;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const all = [...sun, ...earth, ...horiz, 0];
  const ymin = Math.min(-5, ...all) - 2;
  const ymax = Math.max(15, ...all) + 2;
  const xAt = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v) => padT + ((ymax - v) / (ymax - ymin)) * plotH;

  const path = (arr, color, width = 1.6, dash = '') => {
    let d = '';
    arr.forEach((v, i) => {
      d += `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)} `;
    });
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
    return `<path d="${d.trim()}" fill="none" stroke="${color}" stroke-width="${width}"${dashAttr}/>`;
  };

  let dualRects = '';
  for (let i = 0; i < n; i++) {
    if (!dual[i]) continue;
    const x0 = xAt(i);
    const x1 = i + 1 < n ? xAt(i + 1) : x0 + 2;
    dualRects += `<rect x="${x0}" y="${padT}" width="${Math.max(1, x1 - x0)}" height="${plotH}" fill="rgba(69,212,138,0.12)"/>`;
  }

  const zeroY = yAt(0);
  svg.innerHTML = `
    ${dualRects}
    <line x1="${padL}" y1="${zeroY}" x2="${W - padR}" y2="${zeroY}" stroke="var(--border, #2a3244)" stroke-dasharray="4 4"/>
    ${path(horiz, 'var(--muted, #8c9bbd)', 1, '3 3')}
    ${path(earth, 'var(--accent, #62b0ff)', 1.8)}
    ${path(sun, 'var(--warn, #ffb84d)', 2)}
    <text x="8" y="${padT + 10}" fill="var(--muted, #8c9bbd)" font-size="10" font-family="ui-monospace,monospace">${ymax.toFixed(0)}°</text>
    <text x="8" y="${H - padB}" fill="var(--muted, #8c9bbd)" font-size="10" font-family="ui-monospace,monospace">${ymin.toFixed(0)}°</text>
    <text x="${padL}" y="${H - 8}" fill="var(--muted, #8c9bbd)" font-size="10" font-family="ui-monospace,monospace">${primary.site.shortName || primary.site.name}</text>
  `;
  $('#chart-meta').textContent = `${primary.window.samples} samples · ${primary.window.stepHours}h step · ${primary.window.days}d window`;
}

function refresh() {
  if (!bundle) return;
  const eph = activeEphemeris();
  if (!eph.length) {
    $('#load-status').textContent = 'No ephemeris loaded.';
    $('#load-status').classList.add('error');
    return;
  }
  const { ms, note } = resolveEpochMs(eph);
  const idx = nearestIndex(eph, ms);
  const windowDays = Number($('#nav-window').value) || 14;
  const sample = eph[idx];
  const stepH = ephStepHours(eph);

  const wantSamples = Math.round((windowDays * 24) / stepH);
  const haveSamples = eph.length - idx;
  if (note) {
    setDateNote(note);
  } else if (haveSamples < wantSamples) {
    const days = round1((haveSamples * stepH) / 24);
    setDateNote(`Window cut to ${days} d: the ephemeris ends ${toIsoInput(ephRange(eph).maxMs).date}. Window percentages use only those days.`, 'info');
  } else {
    setDateNote('');
  }

  $('#epoch-label').textContent = sample.timestampUtc;
  $('#eph-meta').textContent = `${eph.length} ephemeris samples · nearest to selected UTC · step ~${round1(stepH)}h`;

  const results = [];
  for (const id of selectedIds) {
    const site = findSite(bundle, id) || polarSites().find((s) => s.id === id);
    if (!site) continue;
    results.push(evaluateSite(site, eph, idx, windowDays));
  }

  renderCards(results);
  renderTable(results);
  renderChart(results[0] || null);
  $('#load-status').textContent = `Ready · ${results.length} site(s) @ ${sample.timestampUtc}`;
  $('#load-status').classList.remove('error');
}

function detectShell() {
  try {
    if (window.parent && window.parent !== window) {
      document.documentElement.classList.add('in-shell');
    }
  } catch {
    /* cross-origin — ignore */
  }
}

async function boot() {
  detectShell();
  try {
    const [{ bundle: b }, ephRaw] = await Promise.all([
      getBrowserDatasetState(),
      fetch('../data/ephemeris.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    bundle = b;
    if (ephRaw?.rows?.length) {
      longEph = convertLongEphemeris(ephRaw);
      const range = ephRaw.startDate && ephRaw.stopDate
        ? `${ephRaw.startDate} → ${ephRaw.stopDate}`
        : `${longEph[0]?.timestampUtc} → ${longEph[longEph.length - 1]?.timestampUtc}`;
      $('#load-status').textContent = `Loaded ${longEph.length} Horizons rows (${range})`;
    } else {
      longEph = [];
      $('#load-status').textContent = `Using bundled map ephemeris (${bundle.ephemeris?.length || 0} samples)`;
    }

    const eph = activeEphemeris();
    if (!eph.length) throw new Error('no ephemeris samples in data/ephemeris.json or the map bundle');
    applyDateLimits(eph);
    const prefer = parseHorizonsDate('2026-Dec-03 12:00');
    const idx = nearestIndex(eph, prefer);
    const iso = toIsoInput(eph[idx]._ms);
    $('#nav-date').value = iso.date;
    $('#nav-time').value = iso.time;
    $('#nav-scrub').value = String(new Date(eph[idx]._ms).getUTCHours());

    selectedIds = DEFAULT_SITE_IDS.filter((id) => findSite(bundle, id)).slice(0, 3);
    if (!selectedIds.length) {
      selectedIds = polarSites().slice(0, 3).map((s) => s.id);
    }

    renderSitePicks();
    refresh();

    $('#btn-refresh').addEventListener('click', refresh);
    $('#btn-defaults').addEventListener('click', () => {
      selectedIds = DEFAULT_SITE_IDS.filter((id) => findSite(bundle, id)).slice(0, 3);
      if (!selectedIds.length) selectedIds = polarSites().slice(0, 3).map((s) => s.id);
      renderSitePicks();
      refresh();
    });
    ['nav-date', 'nav-time', 'nav-window'].forEach((id) => {
      $(`#${id}`).addEventListener('change', refresh);
    });
    $('#nav-scrub').addEventListener('input', (e) => {
      const h = String(e.target.value).padStart(2, '0');
      const t = $('#nav-time').value || '12:00';
      const mm = t.split(':')[1] || '00';
      $('#nav-time').value = `${h}:${mm}`;
      refresh();
    });
  } catch (err) {
    $('#load-status').textContent = `Failed to load navigator data: ${err.message || err}`;
    $('#load-status').classList.add('error');
  }
}

boot();
