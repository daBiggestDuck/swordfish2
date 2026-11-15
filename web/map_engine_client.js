import { BUNDLED_MAP_DATA } from './map_data_bundle.js';

export const LUNAR_RADIUS_KM = 1737.4;
const SOLAR_CONSTANT_W_M2 = 1361.0;
const STEFAN_BOLTZMANN = 5.670374419e-8;

export const RAW_FILE_MAP = {
  quickmap: 'quickmap_lroc_stack3314.json',
  trek_sites: 'trek_clps_sites.json',
  trek_psr: 'trek_south_pole_psr.json',
  lola: 'trek_lola_terrain_profiles.json',
  horizons: 'horizons_lunar_ephemeris.json',
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10.0) / 10.0;
const round2 = (v) => Math.round(v * 100.0) / 100.0;
const norm = (s) => (s || '').trim().toUpperCase();
const isAll = (s) => !s || s === 'ALL';

const SITE_ID_ALIASES = {
  SHACKLETON_RIM: 'SHACKLETON_RIM',
  SHACKLETON_RIDGE: 'SHACKLETON_RIM',
  'SHACKLETON-RIM': 'SHACKLETON_RIM',
  'SHACKLETON-RIDGE': 'SHACKLETON_RIM',
  MARE_CRISIUM: 'MARE_CRISIUM',
  'MARE-CRISIUM': 'MARE_CRISIUM',
  MALAPERT_A: 'MALAPERT_A',
  'MALAPERT-A': 'MALAPERT_A',
  MONS_MOUTON: 'MONS_MOUTON',
  'MONS-MOUTON': 'MONS_MOUTON',
  REINER_GAMMA: 'REINER_GAMMA',
  'REINER-GAMMA': 'REINER_GAMMA',
  FAR_SIDE: 'FAR_SIDE',
  SCHRODINGER_BASIN: 'FAR_SIDE',
  'SCHRODINGER-BASIN': 'FAR_SIDE',
  LUNAR_FARSIDE: 'FAR_SIDE',
  'LUNAR-FARSIDE': 'FAR_SIDE',
  NOBILE_RIM: 'NOBILE_RIM',
  NOBILE_REGION: 'NOBILE_RIM',
  'NOBILE-REGION': 'NOBILE_RIM',
  SINUS_VISCOSITATIS: 'SINUS_VISCOSITATIS',
  'SINUS-VISCOSITATIS': 'SINUS_VISCOSITATIS',
  GRUITHUISEN_DOMES: 'GRUITHUISEN_DOMES',
  'GRUITHUISEN-DOMES': 'GRUITHUISEN_DOMES',
};

const MONTH_MAP = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

function toIsoDate(horizonsTs) {
  if (!horizonsTs) return '2026-11-10';
  const datePart = String(horizonsTs).trim().split(/\s+/)[0];
  const parts = datePart.split('-');
  if (parts.length !== 3) return '2026-11-10';
  const mm = MONTH_MAP[parts[1]] || '11';
  const dd = parts[2].length === 1 ? `0${parts[2]}` : parts[2];
  return `${parts[0]}-${mm}-${dd}`;
}

export function normalizeSiteId(id) {
  if (!id) return '';
  const upper = String(id).trim().toUpperCase();
  if (SITE_ID_ALIASES[upper]) return SITE_ID_ALIASES[upper];
  const underscored = upper.replace(/-/g, '_');
  return SITE_ID_ALIASES[underscored] || upper;
}

export function findSite(bundle, siteId) {
  const canon = normalizeSiteId(siteId);
  if (!canon) return null;
  const rawLower = String(siteId || '').trim().toLowerCase();
  return (bundle.sites || []).find(
    (s) => normalizeSiteId(s.id) === canon || s.id.toLowerCase() === rawLower
  ) || null;
}

export function elevationDeg(siteLatDeg, siteLonDeg, subLatDeg, subLonDeg) {
  const rad = Math.PI / 180.0;
  const phi = siteLatDeg * rad;
  const delta = subLatDeg * rad;
  const dLon = (subLonDeg - siteLonDeg) * rad;
  const sinH = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(dLon);
  return (Math.asin(clamp(sinH, -1.0, 1.0)) * 180.0) / Math.PI;
}

export function azimuthDeg(siteLatDeg, siteLonDeg, targetLatDeg, targetLonDeg) {
  const rad = Math.PI / 180.0;
  const phi1 = siteLatDeg * rad;
  const phi2 = targetLatDeg * rad;
  const dLon = (targetLonDeg - siteLonDeg) * rad;
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const deg = (Math.atan2(y, x) * 180.0) / Math.PI;
  return ((deg % 360.0) + 360.0) % 360.0;
}

export function horizonElevationAtAzimuth(horizonBins, azDeg) {
  if (!Array.isArray(horizonBins) || horizonBins.length === 0) return 0.0;
  const n = horizonBins.length;
  const binWidth = 360.0 / n;
  const normAz = ((azDeg % 360.0) + 360.0) % 360.0;
  const exactIdx = normAz / binWidth;
  const i0 = Math.floor(exactIdx) % n;
  const i1 = (i0 + 1) % n;
  const frac = exactIdx - Math.floor(exactIdx);
  return horizonBins[i0] * (1.0 - frac) + horizonBins[i1] * frac;
}

export function greatCircleDistanceKm(lat1Deg, lon1Deg, lat2Deg, lon2Deg) {
  const rad = Math.PI / 180.0;
  const phi1 = lat1Deg * rad;
  const phi2 = lat2Deg * rad;
  const dPhi = (lat2Deg - lat1Deg) * rad;
  const dLon = (lon2Deg - lon1Deg) * rad;
  const a =
    Math.sin(dPhi / 2.0) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2.0) ** 2;
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0.0, 1.0 - a)));
  return LUNAR_RADIUS_KM * c;
}

function solarPanelPowerPct(sunElevDeg, horizonElevDeg, slopeDeg) {
  if (sunElevDeg <= horizonElevDeg) return 0.0;
  const eff = clamp(sunElevDeg + Math.min(12.0, slopeDeg * 0.25), 0.0, 90.0);
  return clamp(Math.sin((eff * Math.PI) / 180.0) * 100.0, 0.0, 100.0);
}

function calibratedSurfaceTempK(sunElevDeg, sunlit, albedo, minK, maxK) {
  if (!sunlit || sunElevDeg <= 0.0) return minK;
  const sinInc = Math.sin((clamp(sunElevDeg, 0.5, 90.0) * Math.PI) / 180.0);
  const emissivity = 0.95;
  const absorbed = SOLAR_CONSTANT_W_M2 * (1.0 - albedo) * sinInc;
  const tEq = Math.pow(absorbed / (STEFAN_BOLTZMANN * emissivity), 0.25);
  return clamp(tEq, minK, maxK);
}

export function formatDurationDaysHours(totalHours) {
  const rounded = Math.round(totalHours);
  const days = Math.floor(rounded / 24);
  const hours = rounded % 24;
  return `${days}d ${hours}h`;
}

function findNextTransition(series, startIdx, targetState, stepHours) {
  if (series.length < 2) return 'No event';
  for (let offset = 1; offset < series.length; offset++) {
    const prevIdx = (startIdx + offset - 1) % series.length;
    const currIdx = (startIdx + offset) % series.length;
    if (series[prevIdx] !== targetState && series[currIdx] === targetState) {
      return formatDurationDaysHours(offset * stepHours);
    }
  }
  return 'No event';
}

export function parseHorizonsEphemeris(horizonsJson) {
  const result = horizonsJson?.result || '';
  const soe = result.indexOf('$$SOE');
  const eoe = result.indexOf('$$EOE');
  if (soe < 0 || eoe <= soe) return [];
  const block = result.slice(soe + 5, eoe);
  const samples = [];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 7) continue;
    const obsSubLon = Number.parseFloat(parts[3].trim());
    const obsSubLat = Number.parseFloat(parts[4].trim());
    const sunSubLon = Number.parseFloat(parts[5].trim());
    const sunSubLat = Number.parseFloat(parts[6].trim());
    if ([obsSubLon, obsSubLat, sunSubLon, sunSubLat].some(Number.isNaN)) continue;
    samples.push({
      index: samples.length,
      timestampUtc: parts[0].trim(),
      obsSubLon,
      obsSubLat,
      sunSubLon,
      sunSubLat,
    });
  }
  return samples;
}

function inferRegion(lat, lon) {
  if (lat <= -78.0) return 'SOUTH_POLE';
  if (Math.abs(lon) > 90.0) return 'FAR_SIDE';
  return 'NEAR_SIDE';
}

/** Normalize raw NASA Map + Ephemeris files into the application's unified dataset bundle. */
export function buildMapDataset({ main = {}, quickmap = {}, trekSites = {}, trekPsr = {}, lola = {}, horizons = {} }) {
  const psrZones = (trekPsr.features || []).map((f, idx) => {
    const attr = f.attributes || {};
    return {
      id: attr.PSR_ID || `PSR_${idx}`,
      name: attr.Name || 'Unnamed PSR',
      centerLat: Number(attr.CenterLat ?? -89.0),
      centerLon: Number(attr.CenterLon ?? 0.0),
      areaKm2: Number(attr.AreaKm2 ?? 0.0),
      radiusKm: Number(attr.RadiusKm ?? 0.0),
      divinerMaxTempK: Number(attr.DivinerMaxTempK ?? 100.0),
      iceEvidenceScore: Number(attr.IceEvidenceScore ?? 0.5),
      notes: attr.Notes || '',
      rings: f.geometry?.rings || [],
    };
  });

  const ephemeris = parseHorizonsEphemeris(horizons);
  const lolaProfiles = lola.profiles || {};

  const mergedById = new Map();
  for (const s of main.sites || []) {
    if (s.id) mergedById.set(s.id, { ...s });
  }

  for (const f of trekSites.features || []) {
    const attr = f.attributes || {};
    const geom = f.geometry || {};
    const rawId = (attr.Site_ID || attr.Site_Name || '').trim() ||
      String(attr.Site_Name || 'SITE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const lon = Number(geom.x ?? attr.Longitude ?? 0);
    const lat = Number(geom.y ?? attr.Latitude ?? 0);
    let target = mergedById.get(rawId);
    if (!target) {
      target = {
        id: rawId,
        name: attr.Site_Name || rawId,
        shortName: attr.Site_Name || rawId,
        region: attr.Region || inferRegion(lat, lon),
        terrainSummary: `Adapted from Moon Trek CLPS_sites (${attr.Lander || 'CLPS'}).`,
        lightingCondition: Math.abs(lat) >= 75 ? 'Polar Grazing' : 'Lunar Day/Night Cycle',
        scienceGoal: `Lunar exploration target (${attr.Task_Order || 'CLPS'}).`,
        recommendedPayloadTypes: ['RETROREFLECTOR_NAV'],
        decayMultipliers: { power: 1.0, oxygen: 1.0, food: 1.0, happiness: 1.0 },
        careMultipliers: { power: 1.0, warmth: 1.0, signal: 1.0 },
        sourceUrl: attr.URL || 'https://trek.nasa.gov/moon/',
      };
      mergedById.set(rawId, target);
    }
    target.lat = lat;
    target.lon = lon;
    if (attr.Region) target.region = attr.Region;
  }

  const sites = [];
  for (const s of mergedById.values()) {
    const lp = lolaProfiles[s.id] || {};
    const horizonBins = Array.isArray(lp.horizonProfileDeg) && lp.horizonProfileDeg.length > 0
      ? lp.horizonProfileDeg
      : new Array(36).fill(0.0);

    let nearestPsrId = '';
    let nearestPsrName = lp.nearestPsrName || 'None nearby';
    let nearestPsrKm = Infinity;
    for (const psr of psrZones) {
      const dist = greatCircleDistanceKm(s.lat, s.lon, psr.centerLat, psr.centerLon);
      const edgeDist = Math.max(0, dist - psr.radiusKm);
      if (edgeDist < nearestPsrKm) {
        nearestPsrKm = edgeDist;
        nearestPsrId = psr.id;
        nearestPsrName = psr.name;
      }
    }
    if (!Number.isFinite(nearestPsrKm)) nearestPsrKm = 0;

    let earthVis = s.earthVisibilityPct ?? (Math.abs(s.lon) > 90 ? 0.0 : 100.0);
    if (ephemeris.length > 0) {
      let ok = 0;
      for (const ep of ephemeris) {
        const eEl = elevationDeg(s.lat, s.lon, ep.obsSubLat, ep.obsSubLon);
        const eAz = azimuthDeg(s.lat, s.lon, ep.obsSubLat, ep.obsSubLon);
        const hEl = horizonElevationAtAzimuth(horizonBins, eAz);
        if (eEl > hEl && eEl > -0.5) ok++;
      }
      earthVis = round1((ok * 100.0) / ephemeris.length);
    }

    const rawDecay = s.decayMultipliers || {};
    const rawCare = s.careMultipliers || {};
    const powerM = Number(rawDecay.power ?? rawCare.power ?? 1.0);
    const oxygenM = Number(rawDecay.oxygen ?? rawDecay.warmth ?? rawCare.warmth ?? 1.0);
    const foodM = Number(rawDecay.food ?? 1.0);
    const happinessM = Number(rawDecay.happiness ?? rawDecay.signal ?? rawCare.signal ?? 1.0);
    const elevM = lp.elevationMeters ?? s.elevationMeters ?? 0;
    const slopeDeg = lp.slopeDegrees ?? s.slopeDegrees ?? 2.0;
    const illumTerrain = lp.illuminationTerrainPct ?? s.illuminationTerrainPct ?? 50.0;

    sites.push({
      ...s,
      elevationMeters: elevM,
      elevationM: elevM,
      slopeDegrees: slopeDeg,
      slopeDegs: slopeDeg,
      roughnessIndex: lp.roughnessIndex ?? s.roughnessIndex ?? 0.2,
      terrainSummary: lp.terrainType || s.terrainSummary || '',
      lightingCondition: lp.lightingCondition || s.lightingCondition || '',
      illuminationFlatPct: lp.illuminationFlatPct ?? s.illuminationFlatPct ?? 50.0,
      illuminationTerrainPct: illumTerrain,
      illuminationPct: illumTerrain,
      illuminationMethod: s.illuminationMethod || 'horizon-raycast',
      illuminationSource: s.illuminationSource || 'MOON_TREK:LOLA + JPL_HORIZONS:301',
      earthVisibilityPct: earthVis,
      divinerMinTempK: lp.divinerMinTempK ?? s.divinerMinTempK ?? 80,
      divinerMaxTempK: lp.divinerMaxTempK ?? s.divinerMaxTempK ?? 360,
      albedo: lp.albedo ?? s.albedo ?? 0.12,
      horizonProfileDeg: horizonBins,
      horizonProfile: horizonBins,
      decayMultipliers: { power: powerM, oxygen: oxygenM, food: foodM, happiness: happinessM },
      careMultipliers: { power: powerM, warmth: oxygenM, signal: happinessM },
      nearestPsrId,
      nearestPsrName,
      nearestPsrKm: round1(nearestPsrKm),
      quickmapUrl: s.quickmapUrl || `https://quickmap.lroc.im-ldi.com/?extent=${s.lon - 5},${s.lat - 5},${s.lon + 5},${s.lat + 5}&proj=10&earthShadowEnabled=true&stack=3314`,
      trekUrl: s.trekUrl || `https://trek.nasa.gov/moon/#v=0.1&x=${s.lon}&y=${s.lat}&z=5&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104903&b=moon`,
    });
  }

  const missions = (main.missions || []).map((m) => ({
    ...m,
    duration: m.duration ?? 60,
    requires: m.requires || { power: 25, oxygen: 20 },
    cost: m.cost || { power: -15, oxygen: -10 },
    reward: m.reward || { happiness: 20, food: 10 },
  }));

  return {
    metadata: main.metadata || {},
    quickmap,
    sites,
    missions,
    payloads: main.payloads || [],
    psrZones,
    ephemeris,
    sources: main.sources || [],
  };
}

export function computeSiteSky(site, ephemeris, currentIndex = 141) {
  const n = ephemeris.length;
  const safeIdx = n === 0 ? 0 : clamp(Math.trunc(currentIndex), 0, n - 1);
  const stepHours = 4.0;

  const sunElevSeries = [];
  const sunAzSeries = [];
  const earthElevSeries = [];
  const earthAzSeries = [];
  const powerSeries = [];
  const sunlitSeries = [];
  const dteSeries = [];
  const dualSeries = [];

  let sunlitCount = 0;
  let flatSunlitCount = 0;
  let dteCount = 0;
  let dualCount = 0;
  let powerSum = 0;

  for (const ep of ephemeris) {
    const sunEl = elevationDeg(site.lat, site.lon, ep.sunSubLat, ep.sunSubLon);
    const sunAz = azimuthDeg(site.lat, site.lon, ep.sunSubLat, ep.sunSubLon);
    const earthEl = elevationDeg(site.lat, site.lon, ep.obsSubLat, ep.obsSubLon);
    const earthAz = azimuthDeg(site.lat, site.lon, ep.obsSubLat, ep.obsSubLon);

    const sunHoriz = horizonElevationAtAzimuth(site.horizonProfileDeg, sunAz);
    const earthHoriz = horizonElevationAtAzimuth(site.horizonProfileDeg, earthAz);
    const samplePwr = solarPanelPowerPct(sunEl, sunHoriz, site.slopeDegrees);

    const isFlatSun = sunEl > 0.0;
    const isSunlit = sunEl > sunHoriz;
    const isDte = earthEl > earthHoriz && earthEl > -0.5;
    const isDual = isSunlit && isDte;

    if (isFlatSun) flatSunlitCount++;
    if (isSunlit) sunlitCount++;
    if (isDte) dteCount++;
    if (isDual) dualCount++;
    powerSum += samplePwr;

    sunElevSeries.push(round1(sunEl));
    sunAzSeries.push(round1(sunAz));
    earthElevSeries.push(round1(earthEl));
    earthAzSeries.push(round1(earthAz));
    powerSeries.push(samplePwr);
    sunlitSeries.push(isSunlit);
    dteSeries.push(isDte);
    dualSeries.push(isDual);
  }

  const currentSunEl = n > 0 ? sunElevSeries[safeIdx] : 0;
  const currentSunAz = n > 0 ? sunAzSeries[safeIdx] : 0;
  const currentEarthEl = n > 0 ? earthElevSeries[safeIdx] : 0;
  const currentEarthAz = n > 0 ? earthAzSeries[safeIdx] : 0;
  const currentSunlit = n > 0 ? sunlitSeries[safeIdx] : false;
  const currentDte = n > 0 ? dteSeries[safeIdx] : false;
  const currentDual = n > 0 ? dualSeries[safeIdx] : false;

  const currentHorizonAtSun = horizonElevationAtAzimuth(site.horizonProfileDeg, currentSunAz);
  const panelPowerPct = round1(solarPanelPowerPct(currentSunEl, currentHorizonAtSun, site.slopeDegrees));
  const surfaceTempK = round1(calibratedSurfaceTempK(currentSunEl, currentSunlit, site.albedo, site.divinerMinTempK, site.divinerMaxTempK));

  let operationalState;
  if (currentDual) operationalState = 'Optimal';
  else if (currentSunlit) operationalState = 'Sunlit Only (No DTE)';
  else if (currentDte) operationalState = 'Night Survival (DTE OK)';
  else operationalState = 'Blackout (No Sun / No DTE)';

  const sunlitHours = round1(sunlitCount * stepHours);
  const dualViableHours = round1(dualCount * stepHours);
  const avgPowerPct = n > 0 ? round1(powerSum / n) : 0;
  const startDate = n > 0 ? toIsoDate(ephemeris[0].timestampUtc) : '2026-11-10';
  let bestIdx = 0;
  if (n > 0) {
    const win = Math.max(1, Math.floor(n / 2));
    let bestSum = -1;
    for (let start = 0; start < n; start++) {
      let sum = 0;
      for (let k = 0; k < win; k++) sum += powerSeries[(start + k) % n];
      if (sum > bestSum) {
        bestSum = sum;
        bestIdx = start;
      }
    }
  }
  const bestStartDate = n > 0 ? toIsoDate(ephemeris[bestIdx].timestampUtc) : startDate;

  return {
    id: site.id,
    name: site.name,
    lat: site.lat,
    lon: site.lon,
    sampleIndex: safeIdx,
    sampleCount: n,
    resolutionHours: stepHours,
    timestampUtc: n > 0 ? ephemeris[safeIdx].timestampUtc : '',
    current: {
      sunElevationDeg: currentSunEl,
      sunAzimuthDeg: currentSunAz,
      sunlit: currentSunlit,
      earthElevationDeg: currentEarthEl,
      earthAzimuthDeg: currentEarthAz,
      earthVisible: currentDte,
      dualViable: currentDual,
      operationalState,
      panelPowerPct,
      surfaceTempK,
      nextSunset: findNextTransition(sunlitSeries, safeIdx, false, stepHours),
      nextSunrise: findNextTransition(sunlitSeries, safeIdx, true, stepHours),
      nextEarthset: findNextTransition(dteSeries, safeIdx, false, stepHours),
    },
    windows: {
      sunlitHours,
      sunlitDaysText: formatDurationDaysHours(sunlitHours),
      dteCoveragePct: n > 0 ? round1((dteCount * 100.0) / n) : 0,
      dualViableHours,
      dualViableDaysText: formatDurationDaysHours(dualViableHours),
      computedSunlitTerrainPct: n > 0 ? round1((sunlitCount * 100.0) / n) : site.illuminationTerrainPct,
      computedSunlitFlatPct: n > 0 ? round1((flatSunlitCount * 100.0) / n) : site.illuminationFlatPct,
    },
    earthElevation: currentEarthEl,
    earthVisible: currentDte,
    startDate,
    bestStartDate,
    gameDays: 14.77,
    monthDays: 29.53,
    avgPowerPct,
    sun: sunElevSeries,
    sunAzimuth: sunAzSeries,
    earth: earthElevSeries,
    earthAzimuth: earthAzSeries,
    horizonProfileDeg: site.horizonProfileDeg,
    timestamps: ephemeris.map((e) => e.timestampUtc),
    model: 'JPL Horizons DE441 ephemeris + LOLA DEM 36-bin horizon profile',
  };
}

function matchQuickmapFeature(quickmap, lat, lon) {
  const craters = quickmap?.cratersAndMassifs || [];
  let bestCrater = null;
  let bestCraterNormR = Infinity;
  let bestCraterRadiusKm = 0;

  for (const c of craters) {
    const distKm = greatCircleDistanceKm(lat, lon, c.lat, c.lon);
    const radiusKm = Math.max(8, (c.radiusDeg || 1.2) * 30.3233);
    if (distKm <= radiusKm * 1.35) {
      const normR = distKm / radiusKm;
      if (normR < bestCraterNormR) {
        bestCraterNormR = normR;
        bestCrater = c;
        bestCraterRadiusKm = radiusKm;
      }
    }
  }

  if (bestCrater) {
    const c = bestCrater;
    const normR = bestCraterNormR;
    const radiusKm = bestCraterRadiusKm;
    const type = c.type || 'crater';

    if (type === 'massif-arc' || type === 'polar-massif' || type === 'plateau' || type === 'volcanic-dome') {
      const elevKm = c.elevKm || c.rimKm || 3.0;
      const elevationMeters = Math.round(elevKm * 1000 * Math.max(0.4, 1 - normR * 0.45));
      const slopeDegrees = round1(8.5 + (c.elevKm || 2.5) * 1.4);
      const roughnessIndex = 0.36;
      const albedo = type === 'plateau' || type === 'volcanic-dome' ? 0.13 : 0.16;
      const horizonDeg = 0.5;
      return {
        featureName: c.name,
        featureLabel: c.name,
        elevationMeters,
        slopeDegrees,
        roughnessIndex,
        albedo,
        horizonDeg,
        terrainSummary: `${c.name} (${type.replace(/-/g, ' ')}); LOLA relief ~${(elevationMeters / 1000).toFixed(2)} km with unobstructed ridge horizon.`,
      };
    }

    if (type === 'magnetic-swirl') {
      return {
        featureName: c.name,
        featureLabel: c.name,
        elevationMeters: -2140,
        slopeDegrees: 1.4,
        roughnessIndex: 0.14,
        albedo: 0.21,
        horizonDeg: 0.5,
        terrainSummary: `${c.name} magnetic anomaly swirl across Oceanus Procellarum mare basalt; high optical albedo.`,
      };
    }

    const depthKm = c.depthKm || 3.0;
    const rimKm = c.rimKm || 1.2;
    const isBright = String(c.albedo || '').includes('bright');
    const isDarkFloor = String(c.albedo || '').includes('low-mare') || String(c.albedo || '').includes('dark-floor');

    if (c.hasPeak && normR <= 0.25) {
      const elevationMeters = Math.round((-depthKm * 0.45 + 1.2) * 1000);
      return {
        featureName: c.name,
        featureLabel: `${c.name} Central Peak`,
        elevationMeters,
        slopeDegrees: 14.2,
        roughnessIndex: 0.42,
        albedo: isBright ? 0.18 : 0.15,
        horizonDeg: 4.5,
        terrainSummary: `${c.name} central peak massif rising inside a ${depthKm.toFixed(1)} km deep crater basin; steep rocky slopes.`,
      };
    }

    if (normR < 0.72) {
      const elevationMeters = Math.round(-depthKm * 1000);
      const slopeDegrees = round1(3.2 + depthKm * 0.6);
      const horizonDeg = round1(
        Math.min(18.0, (Math.atan2(depthKm + rimKm, Math.max(4.0, radiusKm * (1.0 - normR))) * 180) / Math.PI)
      );
      return {
        featureName: c.name,
        featureLabel: `${c.name} Floor`,
        elevationMeters,
        slopeDegrees,
        roughnessIndex: isDarkFloor ? 0.20 : 0.28,
        albedo: isDarkFloor ? 0.09 : isBright ? 0.17 : 0.14,
        horizonDeg,
        terrainSummary: `${c.name} interior floor (~${(elevationMeters / 1000).toFixed(2)} km LOLA elevation); surrounded by a ${rimKm.toFixed(1)} km rim (~${horizonDeg} deg horizon mask).`,
      };
    }

    const elevationMeters = Math.round((c.rimKm || 1.3) * 1000 * Math.max(0.25, 1.0 - Math.abs(normR - 0.95)));
    const slopeDegrees = round1(11.5 + depthKm * 1.6);
    return {
      featureName: c.name,
      featureLabel: `${c.name} Rim`,
      elevationMeters,
      slopeDegrees,
      roughnessIndex: 0.40,
      albedo: isBright ? 0.17 : 0.15,
      horizonDeg: 2.8,
      terrainSummary: `${c.name} terraced rim & upper wall (+${(elevationMeters / 1000).toFixed(2)} km LOLA elevation); steep ${slopeDegrees} deg wall slope.`,
    };
  }

  const albedoFeatures = quickmap?.notableAlbedoFeatures || [];
  let bestBasin = null;
  let bestBasinRadiusKm = Infinity;
  let bestBasinNormR = 0;

  for (const f of albedoFeatures) {
    const radiusKm = Math.max(20, (f.radiusDeg || 10) * 30.3233);
    const distKm = greatCircleDistanceKm(lat, lon, f.lat, f.lon);
    if (distKm <= radiusKm * 1.15 && radiusKm < bestBasinRadiusKm) {
      bestBasinRadiusKm = radiusKm;
      bestBasin = f;
      bestBasinNormR = distKm / radiusKm;
    }
  }

  if (bestBasin) {
    const f = bestBasin;
    const normR = bestBasinNormR;
    const isMare = String(f.albedo || '').includes('mare');
    if (normR > 0.85 && (f.rimKm || 0) >= 1.0) {
      const elevationMeters = Math.round(f.rimKm * 1000);
      return {
        featureName: f.name,
        featureLabel: `${f.name} Rim`,
        elevationMeters,
        slopeDegrees: round1(7.5 + f.rimKm * 2.2),
        roughnessIndex: 0.35,
        albedo: 0.14,
        horizonDeg: 2.0,
        terrainSummary: `${f.name} outer topographic basin ring (+${(elevationMeters / 1000).toFixed(2)} km LOLA rim uplift).`,
      };
    }

    const elevationMeters = Math.round((f.elevKm !== undefined ? f.elevKm : -2.0) * 1000);
    return {
      featureName: f.name,
      featureLabel: f.name,
      elevationMeters,
      slopeDegrees: isMare ? 2.1 : 5.2,
      roughnessIndex: isMare ? 0.14 : 0.31,
      albedo: isMare ? 0.08 : 0.13,
      horizonDeg: isMare ? 0.6 : 2.2,
      terrainSummary: isMare
        ? `${f.name} basaltic mare floor (${(elevationMeters / 1000).toFixed(2)} km LOLA elevation); low-albedo volcanic plain.`
        : `${f.name} deep impact basin interior (${(elevationMeters / 1000).toFixed(2)} km LOLA elevation).`,
    };
  }

  return null;
}

export function evaluateDropPoint(bundle, rawLat, rawLon, sampleIndex = 141) {
  const lat = clamp(Number(rawLat) || 0, -90, 90);
  const lon = ((((Number(rawLon) || 0) + 180) % 360) + 360) % 360 - 180;

  let nearestSite = null;
  let nearestSiteKm = Infinity;
  for (const s of bundle.sites || []) {
    const d = greatCircleDistanceKm(lat, lon, s.lat, s.lon);
    if (d < nearestSiteKm) {
      nearestSiteKm = d;
      nearestSite = s;
    }
  }

  let nearestPsr = null;
  let nearestPsrKm = Infinity;
  for (const psr of bundle.psrZones || []) {
    const d = Math.max(0, greatCircleDistanceKm(lat, lon, psr.centerLat, psr.centerLon) - psr.radiusKm);
    if (d < nearestPsrKm) {
      nearestPsrKm = d;
      nearestPsr = psr;
    }
  }
  if (!Number.isFinite(nearestPsrKm)) nearestPsrKm = 0;

  const matchedKnownSite = Boolean(nearestSite && nearestSiteKm <= 35);
  let region = inferRegion(lat, lon);

  let elevationMeters;
  let slopeDegrees;
  let roughnessIndex;
  let divinerMinTempK;
  let divinerMaxTempK;
  let albedo;
  let terrainSummary;
  let lightingCondition;
  let horizonProfileDeg;

  let matchedFeature = null;

  if (matchedKnownSite) {
    region = nearestSite.region;
    elevationMeters = nearestSite.elevationMeters;
    slopeDegrees = nearestSite.slopeDegrees;
    roughnessIndex = nearestSite.roughnessIndex;
    divinerMinTempK = nearestSite.divinerMinTempK;
    divinerMaxTempK = nearestSite.divinerMaxTempK;
    albedo = nearestSite.albedo;
    terrainSummary = nearestSite.terrainSummary;
    lightingCondition = nearestSite.lightingCondition;
    horizonProfileDeg = nearestSite.horizonProfileDeg;
  } else {
    const insidePsr = nearestPsr && nearestPsrKm <= 1.0 && lat <= -78;
    if (insidePsr) {
      elevationMeters = -3200;
      slopeDegrees = 10.5;
      roughnessIndex = 0.45;
      divinerMinTempK = nearestPsr.divinerMaxTempK;
      divinerMaxTempK = 140;
      albedo = 0.14;
      terrainSummary = `Inside or bordering Permanently Shadowed Region (${nearestPsr.name}).`;
      lightingCondition = 'Permanently Shadowed Cold Trap';
      horizonProfileDeg = new Array(36).fill(7.5);
    } else {
      if (region === 'SOUTH_POLE') {
        elevationMeters = Math.round(1200 * Math.cos((lon * Math.PI) / 180) + 400);
        slopeDegrees = round1(7.5 + 4.5 * Math.abs(Math.sin((lat * 3 * Math.PI) / 180)));
        roughnessIndex = 0.38;
        divinerMinTempK = 65;
        divinerMaxTempK = 230;
        albedo = 0.14;
        terrainSummary = 'South polar cratered highlands; low solar grazing angles cast long terrain shadows.';
        lightingCondition = 'Polar Grazing Illumination';
        horizonProfileDeg = new Array(36).fill(2.2);
      } else if (region === 'FAR_SIDE') {
        elevationMeters = 1650;
        slopeDegrees = 6.2;
        roughnessIndex = 0.34;
        divinerMinTempK = 86;
        divinerMaxTempK = 355;
        albedo = 0.15;
        terrainSummary = 'Ancient feldspathic far-side highlands; Earth permanently below the horizon.';
        lightingCondition = 'Far-Side Day/Night (No Direct Earth)';
        horizonProfileDeg = new Array(36).fill(2.4);
      } else {
        const mareZone = lon > -70 && lon < 65 && lat > -35 && lat < 45;
        elevationMeters = mareZone ? -2200 : 950;
        slopeDegrees = mareZone ? 2.4 : 5.4;
        roughnessIndex = mareZone ? 0.16 : 0.31;
        divinerMinTempK = mareZone ? 95 : 90;
        divinerMaxTempK = mareZone ? 385 : 370;
        albedo = mareZone ? 0.09 : 0.13;
        terrainSummary = mareZone
          ? 'Smooth near-side basaltic mare plains with gentle landing slopes.'
          : 'Cratered near-side highland terrain with moderate relief.';
        lightingCondition = 'Near-Side Solar Cycle (Continuous DTE)';
        horizonProfileDeg = new Array(36).fill(mareZone ? 0.6 : 1.8);
      }

      matchedFeature = matchQuickmapFeature(bundle.quickmap, lat, lon);
      if (matchedFeature) {
        elevationMeters = matchedFeature.elevationMeters;
        slopeDegrees = matchedFeature.slopeDegrees;
        roughnessIndex = matchedFeature.roughnessIndex;
        albedo = matchedFeature.albedo;
        terrainSummary = matchedFeature.terrainSummary;
        horizonProfileDeg = new Array(36).fill(matchedFeature.horizonDeg);
      }
    }
  }

  const coordLabel = `${Math.abs(lat).toFixed(2)}${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}${lon >= 0 ? 'E' : 'W'}`;
  const id = matchedKnownSite ? nearestSite.id : `CUSTOM_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const name = matchedKnownSite
    ? nearestSite.name
    : matchedFeature
      ? `${matchedFeature.featureLabel} (${coordLabel})`
      : `Custom Drop Point (${coordLabel})`;

  const synthetic = {
    id,
    name,
    lat: round2(lat),
    lon: round2(lon),
    region,
    elevationMeters,
    elevationM: elevationMeters,
    slopeDegrees,
    slopeDegs: slopeDegrees,
    horizonProfile: horizonProfileDeg,
    roughnessIndex,
    albedo,
    divinerMinTempK,
    divinerMaxTempK,
    horizonProfileDeg,
    illuminationTerrainPct: 50,
    illuminationFlatPct: 50,
  };

  const sky = computeSiteSky(synthetic, bundle.ephemeris, sampleIndex);
  const cur = sky.current;
  const win = sky.windows;

  const safety = Math.round(clamp(100 - slopeDegrees * 3.8 - roughnessIndex * 30 + (cur.sunlit ? 8 : -6), 15, 98));
  const science = Math.round(
    clamp(
      (region === 'SOUTH_POLE' ? 70 : region === 'FAR_SIDE' ? 75 : 58) +
        Math.max(0, 28 - nearestPsrKm * 0.04) +
        (matchedKnownSite ? 8 : 0),
      25,
      99
    )
  );
  const comms = Math.round(clamp(win.dteCoveragePct, 0, 100));
  const overall = Math.round(safety * 0.4 + science * 0.35 + comms * 0.25);

  const powerMult = round2(clamp(1.55 - (win.computedSunlitTerrainPct / 100) * 0.9, 0.55, 1.8));
  const warmthMult = round2(clamp(1.65 - (divinerMinTempK / 180) * 0.75, 0.85, 1.85));
  const signalMult = round2(clamp(2.0 - (win.dteCoveragePct / 100) * 1.2, 0.8, 2.0));
  const decayMultipliers = {
    power: powerMult,
    oxygen: warmthMult,
    food: 1.0,
    happiness: signalMult,
  };
  const careMultipliers = {
    power: powerMult,
    warmth: warmthMult,
    signal: signalMult,
  };

  const warnings = [];
  if (!cur.sunlit) {
    warnings.push('Currently in lunar night shadow — immediate heater & battery power draw on drop.');
  } else {
    warnings.push(`Sunlit (${cur.sunElevationDeg} deg) — solar power generation active.`);
  }
  if (!cur.earthVisible || win.dteCoveragePct < 5) {
    warnings.push('Zero direct-to-Earth line of sight — requires orbital comm relay (e.g., Blue Ghost 2).');
  } else if (win.dteCoveragePct < 85) {
    warnings.push(`Intermittent Earth visibility (${win.dteCoveragePct}%) due to polar libration & local ridge horizon.`);
  }
  if (slopeDegrees >= 10) {
    warnings.push(`Steep terrain slope (${slopeDegrees} deg) — elevated lander tip-over risk (cf. IM-1).`);
  }
  if (nearestPsrKm <= 25) {
    warnings.push(`Adjacent to water-ice cold trap (${nearestPsr?.name || 'PSR'}, ${round1(nearestPsrKm)} km).`);
  }

  return {
    id,
    name,
    matchedKnownSite,
    nearestSiteId: nearestSite?.id || null,
    nearestSiteName: nearestSite?.name || null,
    nearestSiteKm: round1(nearestSiteKm),
    lat: round2(lat),
    lon: round2(lon),
    region,
    elevationMeters,
    elevationM: elevationMeters,
    slopeDegrees,
    slopeDegs: slopeDegrees,
    horizonProfile: horizonProfileDeg,
    roughnessIndex,
    terrainSummary,
    lightingCondition,
    divinerMinTempK,
    divinerMaxTempK,
    nearestPsrId: nearestPsr?.id || '',
    nearestPsrName: nearestPsr?.name || 'None nearby',
    nearestPsrKm: round1(nearestPsrKm),
    scores: { safety, science, comms, overall },
    decayMultipliers,
    careMultipliers,
    warnings,
    sky,
  };
}

export function filterMissions(bundle, params = {}) {
  const timeWindow = norm(params.timeWindow);
  const year = norm(params.year);
  const region = norm(params.region);
  const status = norm(params.status);
  const payloadType = norm(params.payloadType);
  const rawSiteId = norm(params.site || params.siteId);
  const siteId = isAll(rawSiteId) ? rawSiteId : normalizeSiteId(rawSiteId);
  const q = (params.q || '').trim().toLowerCase();

  return bundle.missions.filter((m) => {
    if (!isAll(timeWindow) && norm(m.timeWindow) !== timeWindow) return false;
    if (!isAll(year) && String(m.year) !== year) return false;
    if (!isAll(region) && norm(m.region) !== region) return false;
    if (!isAll(status) && norm(m.status) !== status) return false;
    if (!isAll(siteId) && normalizeSiteId(m.siteId) !== siteId) return false;
    if (!isAll(payloadType) && !(m.payloadTypes || []).some((pt) => norm(pt) === payloadType)) return false;
    if (q) {
      const hay = `${m.name} ${m.vendor} ${m.taskOrder} ${m.note} ${m.siteId}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function filterSites(bundle, params = {}) {
  const timeWindow = norm(params.timeWindow);
  const year = norm(params.year);
  const region = norm(params.region);
  const status = norm(params.status);
  const payloadType = norm(params.payloadType);
  const rawSiteId = norm(params.site || params.siteId);
  const siteId = isAll(rawSiteId) ? rawSiteId : normalizeSiteId(rawSiteId);
  const q = (params.q || '').trim().toLowerCase();

  const hasMissionFilter = !isAll(timeWindow) || !isAll(year) || !isAll(status) || !isAll(payloadType);
  const matchedSites = new Set(
    hasMissionFilter ? filterMissions(bundle, params).map((m) => normalizeSiteId(m.siteId)).filter(Boolean) : []
  );

  return bundle.sites.filter((s) => {
    if (!isAll(siteId) && normalizeSiteId(s.id) !== siteId) return false;
    if (!isAll(region) && norm(s.region) !== region) return false;
    if (hasMissionFilter && !matchedSites.has(normalizeSiteId(s.id))) return false;
    if (q) {
      const hay = `${s.id} ${s.name} ${s.terrainSummary} ${s.scienceGoal}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function compareSites(bundle, siteIds = []) {
  const chosen = [];
  for (const id of siteIds) {
    const found = findSite(bundle, id);
    if (found && !chosen.includes(found)) chosen.push(found);
  }
  if (chosen.length === 0) {
    chosen.push(...bundle.sites.slice(0, 3));
  }
  const sites = chosen.map((s) => {
    const siteMissions = bundle.missions.filter((m) => m.siteId.toUpperCase() === s.id.toUpperCase());
    return {
      id: s.id,
      name: s.name,
      region: s.region,
      lat: s.lat,
      lon: s.lon,
      elevationKm: round2(s.elevationMeters / 1000.0),
      slopeDegrees: s.slopeDegrees,
      illuminationFlatPct: s.illuminationFlatPct,
      illuminationTerrainPct: s.illuminationTerrainPct,
      earthVisibilityPct: s.earthVisibilityPct,
      tempRangeK: `${Math.round(s.divinerMinTempK)}-${Math.round(s.divinerMaxTempK)} K`,
      nearestPsrName: s.nearestPsrName,
      nearestPsrKm: s.nearestPsrKm,
      lightingCondition: s.lightingCondition,
      missionCount: siteMissions.length,
      missions: siteMissions.map((m) => m.name),
      scienceGoal: s.scienceGoal,
      source: s.illuminationSource,
    };
  });
  return { sites, count: sites.length };
}

export function simulateCascade(bundle, failedMissionId) {
  const root = bundle.missions.find((m) => m.id.toLowerCase() === String(failedMissionId).toLowerCase());
  if (!root) return { error: 'Unknown mission id', missionId: failedMissionId };

  const impactedIds = new Set();
  const queue = [root.id];
  while (queue.length > 0) {
    const curr = queue.shift();
    for (const candidate of bundle.missions) {
      if ((candidate.dependsOn || []).some((dep) => dep.toLowerCase() === curr.toLowerCase())) {
        if (!impactedIds.has(candidate.id)) {
          impactedIds.add(candidate.id);
          queue.push(candidate.id);
        }
      }
    }
  }
  const impactedMissions = bundle.missions.filter((m) => impactedIds.has(m.id));
  return {
    failedMission: root,
    impactedMissions,
    impactCount: impactedMissions.length,
    riskSummary:
      impactedMissions.length === 0
        ? `No downstream CLPS missions directly depend on ${root.name}.`
        : `${impactedMissions.length} downstream mission(s) depend on technology, navigation, or relay capabilities from ${root.name}.`,
  };
}

export function recommendRecipe(bundle, siteId, maxMassKg = 25, maxPowerW = 90) {
  const site = findSite(bundle, siteId) || bundle.sites[0];
  const siteHasDte = site.earthVisibilityPct > 10.0;
  const recommended = [];
  const otherPayloads = [];

  for (const p of bundle.payloads) {
    const fitsMass = p.massKg <= maxMassKg;
    const fitsPower = p.powerW <= maxPowerW;
    const regionMatch = (p.preferredRegions || []).some((r) => r.toUpperCase() === site.region.toUpperCase());
    const typeMatch = (site.recommendedPayloadTypes || []).some((t) => t.toUpperCase() === p.type.toUpperCase());

    const reasons = [];
    if (!fitsMass) reasons.push(`Mass ${p.massKg} kg exceeds ${maxMassKg} kg budget`);
    if (!fitsPower) reasons.push(`Power ${p.powerW} W exceeds ${maxPowerW} W budget`);
    if (p.requiresDte && !siteHasDte && site.region !== 'FAR_SIDE') reasons.push('Requires direct-to-Earth link');

    const commsWarning = p.requiresDte && !siteHasDte ? `Needs orbital relay at ${site.shortName}` : null;
    let score = 0;
    if (fitsMass && fitsPower) score += 40;
    if (regionMatch) score += 30;
    if (typeMatch) score += 25;
    if (p.isPassive) score += 5;
    if (commsWarning) score -= 25;

    const entry = {
      payload: p,
      score: Math.max(0, score),
      fitsBudget: fitsMass && fitsPower,
      scienceMatch: regionMatch || typeMatch,
      commsWarning,
    };

    if (fitsMass && fitsPower && (regionMatch || typeMatch || p.isPassive)) {
      let why = p.isPassive
        ? `Passive zero-power instrument — survives lunar night at ${site.shortName}.`
        : `Matches ${site.shortName} science profile (${p.type.replace(/_/g, ' ').toLowerCase()}).`;
      if (commsWarning) why += ' Requires Blue Ghost 2 orbital relay for data return.';
      entry.reason = why;
      recommended.push(entry);
    } else {
      if (reasons.length === 0) reasons.push(`Lower science priority for ${site.region} region.`);
      entry.reason = reasons.join('; ');
      otherPayloads.push(entry);
    }
  }

  recommended.sort((a, b) => b.score - a.score);
  return {
    siteId: site.id,
    siteName: site.name,
    scienceGoal: site.scienceGoal,
    maxMassKg,
    maxPowerW,
    recommended,
    otherPayloads,
  };
}

/** Route /api/* requests identically in Node and in-browser static Live Server fallback. */
export function dispatchMapApi(bundle, rawSources, urlPathAndQuery) {
  const url = new URL(urlPathAndQuery, 'http://127.0.0.1');
  const params = Object.fromEntries(url.searchParams.entries());
  const pathname = url.pathname;

  if (pathname === '/api/map/data') {
    return {
      status: 200,
      body: {
        metadata: bundle.metadata,
        quickmap: bundle.quickmap,
        sites: bundle.sites,
        missions: bundle.missions,
        payloads: bundle.payloads,
        psrZones: bundle.psrZones,
        ephemerisCount: bundle.ephemeris.length,
        sources: bundle.sources,
      },
    };
  }
  if (pathname === '/api/map/sites' || pathname === '/api/sites') {
    return { status: 200, body: filterSites(bundle, params) };
  }
  if (pathname === '/api/map/missions' || pathname === '/api/missions') {
    return { status: 200, body: filterMissions(bundle, params) };
  }
  if (pathname === '/api/map/sky' || pathname === '/api/sky') {
    const siteId = params.site || 'SHACKLETON_RIM';
    const sample = Number.parseInt(params.sample ?? '141', 10);
    const site = findSite(bundle, siteId);
    if (!site) return { status: 404, body: { error: 'unknown site' } };
    return { status: 200, body: computeSiteSky(site, bundle.ephemeris, Number.isNaN(sample) ? 141 : sample) };
  }
  if (pathname === '/api/map/evaluate') {
    const lat = Number.parseFloat(params.lat ?? '-89.63');
    const lon = Number.parseFloat(params.lon ?? '132.32');
    const sample = Number.parseInt(params.sample ?? '141', 10);
    return {
      status: 200,
      body: evaluateDropPoint(
        bundle,
        Number.isNaN(lat) ? -89.63 : lat,
        Number.isNaN(lon) ? 132.32 : lon,
        Number.isNaN(sample) ? 141 : sample
      ),
    };
  }
  if (pathname === '/api/map/compare') {
    const ids = (params.sites || '').split(',').filter(Boolean);
    return { status: 200, body: compareSites(bundle, ids) };
  }
  if (pathname === '/api/map/cascade') {
    return { status: 200, body: simulateCascade(bundle, params.mission || 'blue-ghost-2') };
  }
  if (pathname === '/api/map/recipe') {
    const mass = Number.parseFloat(params.mass ?? '25');
    const power = Number.parseFloat(params.power ?? '90');
    return {
      status: 200,
      body: recommendRecipe(
        bundle,
        params.site || 'MONS_MOUTON',
        Number.isNaN(mass) ? 25 : mass,
        Number.isNaN(power) ? 90 : power
      ),
    };
  }
  if (pathname.startsWith('/api/map/raw/')) {
    const key = pathname.slice('/api/map/raw/'.length).replace(/[^a-zA-Z0-9_]/g, '');
    if (!RAW_FILE_MAP[key]) return { status: 404, body: { error: 'unknown raw dataset' } };
    const rawPayload = rawSources?.[key];
    if (rawPayload === undefined || rawPayload === null) {
      return { status: 404, body: { error: 'missing raw dataset' } };
    }
    return { status: 200, body: rawPayload };
  }
  return null;
}

let cachedBrowserStatePromise = null;

async function fetchJsonOrFallback(relPath, fallbackObj) {
  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    return fallbackObj;
  }
  try {
    const res = await fetch(relPath);
    if (!res.ok) return fallbackObj;
    const ct = (res.headers?.get('content-type') || '').toLowerCase();
    if (ct && !ct.includes('json') && !ct.includes('text/plain')) return fallbackObj;
    return await res.json();
  } catch {
    return fallbackObj;
  }
}

export function getBrowserDatasetState() {
  if (!cachedBrowserStatePromise) {
    cachedBrowserStatePromise = (async () => {
      const [main, quickmap, trekSites, trekPsr, lola, horizons] = await Promise.all([
        fetchJsonOrFallback('../data/maps/lunar_map_data.json', BUNDLED_MAP_DATA.main),
        fetchJsonOrFallback('../data/maps/raw/quickmap_lroc_stack3314.json', BUNDLED_MAP_DATA.quickmap),
        fetchJsonOrFallback('../data/maps/raw/trek_clps_sites.json', BUNDLED_MAP_DATA.trekSites),
        fetchJsonOrFallback('../data/maps/raw/trek_south_pole_psr.json', BUNDLED_MAP_DATA.trekPsr),
        fetchJsonOrFallback('../data/maps/raw/trek_lola_terrain_profiles.json', BUNDLED_MAP_DATA.lola),
        fetchJsonOrFallback('../data/maps/raw/horizons_lunar_ephemeris.json', BUNDLED_MAP_DATA.horizons),
      ]);
      const bundle = buildMapDataset({ main, quickmap, trekSites, trekPsr, lola, horizons });
      const rawSources = {
        quickmap,
        trek_sites: trekSites,
        trek_psr: trekPsr,
        lola,
        horizons,
      };
      return { bundle, rawSources };
    })();
  }
  return cachedBrowserStatePromise;
}

/** Client-side API adapter used when running under a static file server (e.g. VS Code Live Server). */
export async function handleClientApi(urlPathAndQuery) {
  const { bundle, rawSources } = await getBrowserDatasetState();
  const result = dispatchMapApi(bundle, rawSources, urlPathAndQuery);
  if (!result) throw new Error(`Unknown API route: ${urlPathAndQuery}`);
  if (result.status >= 400) {
    throw new Error(`${urlPathAndQuery} returned ${result.status}`);
  }
  return result.body;
}
