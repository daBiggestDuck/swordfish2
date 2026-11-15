import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_MAPS_ROOT = path.join(REPO_ROOT, 'data', 'maps');
const WEB_ROOT = path.join(REPO_ROOT, 'web');

export const LUNAR_RADIUS_KM = 1737.4;
const SOLAR_CONSTANT_W_M2 = 1361.0;
const STEFAN_BOLTZMANN = 5.670374419e-8;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10.0) / 10.0;
const round2 = (v) => Math.round(v * 100.0) / 100.0;

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
  let region = lat <= -78 ? 'SOUTH_POLE' : Math.abs(lon) > 90 ? 'FAR_SIDE' : 'NEAR_SIDE';

  let elevationMeters;
  let slopeDegrees;
  let roughnessIndex;
  let divinerMinTempK;
  let divinerMaxTempK;
  let albedo;
  let terrainSummary;
  let lightingCondition;
  let horizonProfileDeg;

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
    } else if (region === 'SOUTH_POLE') {
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
  }

  const id = matchedKnownSite ? nearestSite.id : `CUSTOM_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const name = matchedKnownSite
    ? nearestSite.name
    : `Custom Drop Point (${Math.abs(lat).toFixed(2)}${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}${lon >= 0 ? 'E' : 'W'})`;

  const synthetic = {
    id,
    name,
    lat: round2(lat),
    lon: round2(lon),
    region,
    elevationMeters,
    slopeDegrees,
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

  const decayMultipliers = {
    power: round2(clamp(1.55 - (win.computedSunlitTerrainPct / 100) * 0.9, 0.55, 1.8)),
    warmth: round2(clamp(1.65 - (divinerMinTempK / 180) * 0.75, 0.85, 1.85)),
    signal: round2(clamp(2.0 - (win.dteCoveragePct / 100) * 1.2, 0.8, 2.0)),
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
    slopeDegrees,
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
    warnings,
    sky,
  };
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

function readJsonOptional(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function inferRegion(lat, lon) {
  if (lat <= -78.0) return 'SOUTH_POLE';
  if (Math.abs(lon) > 90.0) return 'FAR_SIDE';
  return 'NEAR_SIDE';
}

export function loadMapDataset(mapsRoot = DEFAULT_MAPS_ROOT) {
  const main = JSON.parse(fs.readFileSync(path.join(mapsRoot, 'lunar_map_data.json'), 'utf8'));
  const rawDir = path.join(mapsRoot, 'raw');
  const quickmap = readJsonOptional(path.join(rawDir, 'quickmap_lroc_stack3314.json'));
  const trekSites = readJsonOptional(path.join(rawDir, 'trek_clps_sites.json'));
  const trekPsr = readJsonOptional(path.join(rawDir, 'trek_south_pole_psr.json'));
  const lola = readJsonOptional(path.join(rawDir, 'trek_lola_terrain_profiles.json'));
  const horizons = readJsonOptional(path.join(rawDir, 'horizons_lunar_ephemeris.json'));

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
        decayMultipliers: { power: 1.0, warmth: 1.0, signal: 1.0 },
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

    sites.push({
      ...s,
      elevationMeters: lp.elevationMeters ?? s.elevationMeters ?? 0,
      slopeDegrees: lp.slopeDegrees ?? s.slopeDegrees ?? 2.0,
      roughnessIndex: lp.roughnessIndex ?? s.roughnessIndex ?? 0.2,
      terrainSummary: lp.terrainType || s.terrainSummary || '',
      lightingCondition: lp.lightingCondition || s.lightingCondition || '',
      illuminationFlatPct: lp.illuminationFlatPct ?? s.illuminationFlatPct ?? 50.0,
      illuminationTerrainPct: lp.illuminationTerrainPct ?? s.illuminationTerrainPct ?? 50.0,
      illuminationMethod: s.illuminationMethod || 'horizon-raycast',
      illuminationSource: s.illuminationSource || 'MOON_TREK:LOLA + JPL_HORIZONS:301',
      earthVisibilityPct: earthVis,
      divinerMinTempK: lp.divinerMinTempK ?? s.divinerMinTempK ?? 80,
      divinerMaxTempK: lp.divinerMaxTempK ?? s.divinerMaxTempK ?? 360,
      albedo: lp.albedo ?? s.albedo ?? 0.12,
      horizonProfileDeg: horizonBins,
      nearestPsrId,
      nearestPsrName,
      nearestPsrKm: round1(nearestPsrKm),
      quickmapUrl: s.quickmapUrl || `https://quickmap.lroc.im-ldi.com/?extent=${s.lon - 5},${s.lat - 5},${s.lon + 5},${s.lat + 5}&proj=10&earthShadowEnabled=true&stack=3314`,
      trekUrl: s.trekUrl || `https://trek.nasa.gov/moon/#v=0.1&x=${s.lon}&y=${s.lat}&z=5&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104903&b=moon`,
    });
  }

  return {
    metadata: main.metadata || {},
    quickmap,
    sites,
    missions: main.missions || [],
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
  const sunlitSeries = [];
  const dteSeries = [];
  const dualSeries = [];

  let sunlitCount = 0;
  let flatSunlitCount = 0;
  let dteCount = 0;
  let dualCount = 0;

  for (const ep of ephemeris) {
    const sunEl = elevationDeg(site.lat, site.lon, ep.sunSubLat, ep.sunSubLon);
    const sunAz = azimuthDeg(site.lat, site.lon, ep.sunSubLat, ep.sunSubLon);
    const earthEl = elevationDeg(site.lat, site.lon, ep.obsSubLat, ep.obsSubLon);
    const earthAz = azimuthDeg(site.lat, site.lon, ep.obsSubLat, ep.obsSubLon);

    const sunHoriz = horizonElevationAtAzimuth(site.horizonProfileDeg, sunAz);
    const earthHoriz = horizonElevationAtAzimuth(site.horizonProfileDeg, earthAz);

    const isFlatSun = sunEl > 0.0;
    const isSunlit = sunEl > sunHoriz;
    const isDte = earthEl > earthHoriz && earthEl > -0.5;
    const isDual = isSunlit && isDte;

    if (isFlatSun) flatSunlitCount++;
    if (isSunlit) sunlitCount++;
    if (isDte) dteCount++;
    if (isDual) dualCount++;

    sunElevSeries.push(round1(sunEl));
    sunAzSeries.push(round1(sunAz));
    earthElevSeries.push(round1(earthEl));
    earthAzSeries.push(round1(earthAz));
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
    sun: sunElevSeries,
    sunAzimuth: sunAzSeries,
    earth: earthElevSeries,
    earthAzimuth: earthAzSeries,
    horizonProfileDeg: site.horizonProfileDeg,
    timestamps: ephemeris.map((e) => e.timestampUtc),
    model: 'JPL Horizons DE441 ephemeris + LOLA DEM 36-bin horizon profile',
  };
}

const norm = (s) => (s || '').trim().toUpperCase();
const isAll = (s) => !s || s === 'ALL';

export function filterMissions(bundle, params = {}) {
  const timeWindow = norm(params.timeWindow);
  const year = norm(params.year);
  const region = norm(params.region);
  const status = norm(params.status);
  const payloadType = norm(params.payloadType);
  const siteId = norm(params.site || params.siteId);
  const q = (params.q || '').trim().toLowerCase();

  return bundle.missions.filter((m) => {
    if (!isAll(timeWindow) && norm(m.timeWindow) !== timeWindow) return false;
    if (!isAll(year) && String(m.year) !== year) return false;
    if (!isAll(region) && norm(m.region) !== region) return false;
    if (!isAll(status) && norm(m.status) !== status) return false;
    if (!isAll(siteId) && norm(m.siteId) !== siteId) return false;
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
  const q = (params.q || '').trim().toLowerCase();

  const hasMissionFilter = !isAll(timeWindow) || !isAll(year) || !isAll(status) || !isAll(payloadType);
  const matchedSites = new Set(
    hasMissionFilter ? filterMissions(bundle, params).map((m) => norm(m.siteId)).filter(Boolean) : []
  );

  return bundle.sites.filter((s) => {
    if (!isAll(region) && norm(s.region) !== region) return false;
    if (hasMissionFilter && !matchedSites.has(norm(s.id))) return false;
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
    const found = bundle.sites.find((s) => s.id.toUpperCase() === id.trim().toUpperCase());
    if (found) chosen.push(found);
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
  const site =
    bundle.sites.find((s) => s.id.toUpperCase() === String(siteId).toUpperCase()) || bundle.sites[0];
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

const RAW_FILE_MAP = {
  quickmap: 'quickmap_lroc_stack3314.json',
  trek_sites: 'trek_clps_sites.json',
  trek_psr: 'trek_south_pole_psr.json',
  lola: 'trek_lola_terrain_profiles.json',
  horizons: 'horizons_lunar_ephemeris.json',
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export function createMapRequestHandler(mapsRoot = DEFAULT_MAPS_ROOT, webRoot = WEB_ROOT) {
  const bundle = loadMapDataset(mapsRoot);

  return (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const params = Object.fromEntries(url.searchParams.entries());
    const pathname = url.pathname;

    const sendJson = (code, obj) => {
      const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
    };

    if (pathname === '/api/map/data') {
      return sendJson(200, {
        metadata: bundle.metadata,
        quickmap: bundle.quickmap,
        sites: bundle.sites,
        missions: bundle.missions,
        payloads: bundle.payloads,
        psrZones: bundle.psrZones,
        ephemerisCount: bundle.ephemeris.length,
        sources: bundle.sources,
      });
    }
    if (pathname === '/api/map/sites' || pathname === '/api/sites') {
      return sendJson(200, filterSites(bundle, params));
    }
    if (pathname === '/api/map/missions' || pathname === '/api/missions') {
      return sendJson(200, filterMissions(bundle, params));
    }
    if (pathname === '/api/map/sky' || pathname === '/api/sky') {
      const siteId = params.site || 'SHACKLETON_RIM';
      const sample = Number.parseInt(params.sample ?? '141', 10);
      const site = bundle.sites.find((s) => s.id.toUpperCase() === siteId.toUpperCase());
      if (!site) return sendJson(404, { error: 'unknown site' });
      return sendJson(200, computeSiteSky(site, bundle.ephemeris, Number.isNaN(sample) ? 141 : sample));
    }
    if (pathname === '/api/map/evaluate') {
      const lat = Number.parseFloat(params.lat ?? '-89.63');
      const lon = Number.parseFloat(params.lon ?? '132.32');
      const sample = Number.parseInt(params.sample ?? '141', 10);
      return sendJson(
        200,
        evaluateDropPoint(bundle, Number.isNaN(lat) ? -89.63 : lat, Number.isNaN(lon) ? 132.32 : lon, Number.isNaN(sample) ? 141 : sample)
      );
    }
    if (pathname === '/api/map/compare') {
      const ids = (params.sites || '').split(',').filter(Boolean);
      return sendJson(200, compareSites(bundle, ids));
    }
    if (pathname === '/api/map/cascade') {
      return sendJson(200, simulateCascade(bundle, params.mission || 'blue-ghost-2'));
    }
    if (pathname === '/api/map/recipe') {
      const mass = Number.parseFloat(params.mass ?? '25');
      const power = Number.parseFloat(params.power ?? '90');
      return sendJson(
        200,
        recommendRecipe(bundle, params.site || 'MONS_MOUTON', Number.isNaN(mass) ? 25 : mass, Number.isNaN(power) ? 90 : power)
      );
    }
    if (pathname.startsWith('/api/map/raw/')) {
      const key = pathname.slice('/api/map/raw/'.length).replace(/[^a-zA-Z0-9_]/g, '');
      const filename = RAW_FILE_MAP[key];
      if (!filename) return sendJson(404, { error: 'unknown raw dataset' });
      const rawPath = path.join(mapsRoot, 'raw', filename);
      if (!fs.existsSync(rawPath)) return sendJson(404, { error: 'missing raw dataset' });
      return sendJson(200, fs.readFileSync(rawPath, 'utf8'));
    }

    // Static files from web/
    const relPath = pathname === '/' ? '/index.html' : pathname;
    const resolved = path.resolve(webRoot, '.' + relPath);
    if (!resolved.startsWith(webRoot) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(resolved).pipe(res);
  };
}

export function createMapServer(mapsRoot = DEFAULT_MAPS_ROOT, webRoot = WEB_ROOT) {
  return http.createServer(createMapRequestHandler(mapsRoot, webRoot));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.argv[2] || '8080', 10);
  const server = createMapServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Payload Pets Lunar Map Server (Node mirror): http://localhost:${port}/  (Ctrl+C to stop)`);
  });
}
