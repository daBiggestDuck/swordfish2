import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import {
  loadMapDataset,
  computeSiteSky,
  evaluateDropPoint,
  filterMissions,
  filterSites,
  compareSites,
  simulateCascade,
  recommendRecipe,
  createMapRequestHandler,
} from '../tools/serve_map.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const MAPS_ROOT = path.join(REPO_ROOT, 'data', 'maps');

test('all required raw and consolidated NASA map datasets exist and are non-empty', () => {
  const required = [
    'NOTICE.md',
    'lunar_map_data.json',
    'raw/quickmap_lroc_stack3314.json',
    'raw/trek_clps_sites.json',
    'raw/trek_south_pole_psr.json',
    'raw/trek_lola_terrain_profiles.json',
    'raw/horizons_lunar_ephemeris.json',
  ];
  for (const rel of required) {
    const full = path.join(MAPS_ROOT, rel);
    assert.ok(fs.existsSync(full), `Missing file: ${rel}`);
    assert.ok(fs.statSync(full).size > 0, `Empty file: ${rel}`);
  }
  const notice = fs.readFileSync(path.join(MAPS_ROOT, 'NOTICE.md'), 'utf8');
  assert.match(notice, /LROC QuickMap/i);
  assert.match(notice, /NASA Moon Trek/i);
  assert.match(notice, /JPL Horizons/i);
  assert.match(notice, /17 U\.S\.C/i);
});

test('loadMapDataset parses 8 sites, 11 CLPS missions, 8 PSRs, and 178 JPL Horizons ephemeris samples', () => {
  const bundle = loadMapDataset(MAPS_ROOT);
  assert.ok(bundle.sites.length >= 8, `Expected >= 8 sites, got ${bundle.sites.length}`);
  assert.ok(bundle.missions.length >= 11, `Expected >= 11 missions, got ${bundle.missions.length}`);
  assert.ok(bundle.psrZones.length >= 8, `Expected >= 8 PSRs, got ${bundle.psrZones.length}`);
  assert.equal(bundle.ephemeris.length, 178);

  for (const s of bundle.sites) {
    assert.ok(s.lat >= -90 && s.lat <= 90, `Invalid lat for ${s.id}: ${s.lat}`);
    assert.ok(s.lon >= -180 && s.lon <= 180, `Invalid lon for ${s.id}: ${s.lon}`);
    assert.equal(s.horizonProfileDeg.length, 36, `Expected 36-bin horizon for ${s.id}`);
    assert.ok(s.nearestPsrKm >= 0, `Expected non-negative PSR distance for ${s.id}`);
  }
});

test('raw Moon Trek FeatureSet and JPL Horizons adaptation supports newly appended records dynamically', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swordfish-map-adapt-'));
  try {
    fs.cpSync(MAPS_ROOT, tmpDir, { recursive: true });
    const trekPath = path.join(tmpDir, 'raw', 'trek_clps_sites.json');
    const trekJson = JSON.parse(fs.readFileSync(trekPath, 'utf8'));
    trekJson.features.push({
      attributes: {
        OBJECTID: 99,
        Site_ID: 'DE_GERLACHE_RIM',
        Site_Name: 'de Gerlache Rim 2',
        Lander: 'Artemis Candidate',
        Vendor: 'NASA',
        Task_Order: 'ARTEMIS-3',
        Region: 'SOUTH_POLE',
        Status: 'PLANNED',
        Latitude: -88.5,
        Longitude: -88.3,
        URL: 'https://www.nasa.gov/',
      },
      geometry: { x: -88.3, y: -88.5 },
    });
    fs.writeFileSync(trekPath, JSON.stringify(trekJson), 'utf8');

    const adapted = loadMapDataset(tmpDir);
    const added = adapted.sites.find((s) => s.id === 'DE_GERLACHE_RIM');
    assert.ok(added, 'Expected newly added raw Moon Trek site to be adapted automatically');
    assert.equal(added.lat, -88.5);
    assert.equal(added.lon, -88.3);
    assert.equal(added.nearestPsrId, 'PSR_DE_GERLACHE');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Lunar astronomy physics: Mare Crisium has 100% DTE, Far Side Schrodinger has 0% DTE, Shackleton Rim has >70% sunlit terrain', () => {
  const bundle = loadMapDataset(MAPS_ROOT);
  const byId = new Map(bundle.sites.map((s) => [s.id, s]));

  const mareSky = computeSiteSky(byId.get('MARE_CRISIUM'), bundle.ephemeris, 141);
  assert.equal(mareSky.earthVisible, true);
  assert.equal(mareSky.windows.dteCoveragePct, 100);

  const farSky = computeSiteSky(byId.get('FAR_SIDE'), bundle.ephemeris, 141);
  assert.equal(farSky.earthVisible, false);
  assert.equal(farSky.windows.dteCoveragePct, 0);

  const shackletonSky = computeSiteSky(byId.get('SHACKLETON_RIM'), bundle.ephemeris, 141);
  assert.ok(shackletonSky.windows.computedSunlitTerrainPct > 70, `Expected >70% sunlit on Shackleton Rim, got ${shackletonSky.windows.computedSunlitTerrainPct}`);
  assert.equal(shackletonSky.sun.length, 178);
});

test('Filter service, comparison, LunarLink cascade simulator, and Regolith Recipe Box', () => {
  const bundle = loadMapDataset(MAPS_ROOT);

  assert.equal(filterMissions(bundle, { timeWindow: 'PAST' }).length, 4);
  assert.equal(filterMissions(bundle, { year: '2026' }).length, 4);
  assert.equal(filterMissions(bundle, { status: 'NO_LANDING' }).length, 1);
  assert.equal(filterSites(bundle, { region: 'SOUTH_POLE' }).length, 3);
  assert.equal(filterSites(bundle, { region: 'FAR_SIDE' }).length, 1);

  const cmp = compareSites(bundle, ['SHACKLETON_RIM', 'MALAPERT_A', 'MARE_CRISIUM']);
  assert.equal(cmp.count, 3);

  const cascade = simulateCascade(bundle, 'blue-ghost-2');
  assert.ok(cascade.impactCount >= 1);
  assert.ok(cascade.impactedMissions.some((m) => m.id === 'draper-1'));

  const recipe = recommendRecipe(bundle, 'MONS_MOUTON', 25, 90);
  assert.ok(recipe.recommended.some((r) => r.payload.id === 'PRIME1'));
  assert.ok(recipe.recommended.some((r) => r.payload.id === 'LRA'));
});

function invokeHandler(handler, url) {
  return new Promise((resolve) => {
    const res = new PassThrough();
    const chunks = [];
    let statusCode = 200;
    let headers = {};
    res.writeHead = (code, hdrs = {}) => {
      statusCode = code;
      headers = hdrs;
    };
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      resolve({ status: statusCode, headers, text: Buffer.concat(chunks).toString('utf8') });
    });
    handler({ url }, res);
  });
}

test('HTTP server endpoints and static UI files serve cleanly', async () => {
  const handler = createMapRequestHandler(MAPS_ROOT, path.join(REPO_ROOT, 'web'));

  const htmlRes = await invokeHandler(handler, '/');
  assert.equal(htmlRes.status, 200);
  assert.match(htmlRes.text, /Lunar Map/);

  const jsRes = await invokeHandler(handler, '/map.js');
  assert.equal(jsRes.status, 200);
  assert.match(jsRes.text, /parseHorizonsRows/);

  const dataRes = await invokeHandler(handler, '/api/map/data');
  assert.equal(dataRes.status, 200);
  const data = JSON.parse(dataRes.text);
  assert.equal(data.ephemerisCount, 178);

  const skyRes = await invokeHandler(handler, '/api/map/sky?site=SHACKLETON_RIM&sample=141');
  assert.equal(skyRes.status, 200);
  const sky = JSON.parse(skyRes.text);
  assert.equal(sky.id, 'SHACKLETON_RIM');
  assert.equal(sky.sampleCount, 178);

  const rawRes = await invokeHandler(handler, '/api/map/raw/horizons');
  assert.equal(rawRes.status, 200);
  const raw = JSON.parse(rawRes.text);
  assert.match(raw.result, /\$\$SOE/);

  const cmpRes = await invokeHandler(handler, '/api/map/compare?sites=MALAPERT_A,MARE_CRISIUM');
  assert.equal(cmpRes.status, 200);
  assert.equal(JSON.parse(cmpRes.text).count, 2);

  const recipeRes = await invokeHandler(handler, '/api/map/recipe?site=MONS_MOUTON&mass=30&power=100');
  assert.equal(recipeRes.status, 200);
  assert.ok(JSON.parse(recipeRes.text).recommended.length > 0);

  const evalKnownRes = await invokeHandler(handler, '/api/map/evaluate?lat=16.18&lon=59.10&sample=141');
  assert.equal(evalKnownRes.status, 200);
  const evalKnown = JSON.parse(evalKnownRes.text);
  assert.equal(evalKnown.matchedKnownSite, true);
  assert.equal(evalKnown.nearestSiteId, 'MARE_CRISIUM');

  const evalFarRes = await invokeHandler(handler, '/api/map/evaluate?lat=-75.0&lon=140.0&sample=141');
  assert.equal(evalFarRes.status, 200);
  const evalFar = JSON.parse(evalFarRes.text);
  assert.equal(evalFar.region, 'FAR_SIDE');
  assert.equal(evalFar.sky.earthVisible, false);
  assert.ok(evalFar.warnings.some((w) => /relay/i.test(w)));
  assert.ok(evalFar.scores.overall >= 0 && evalFar.scores.overall <= 100);
  assert.ok(evalFar.decayMultipliers.signal > 1.5);

  const globeJsRes = await invokeHandler(handler, '/globe_gl.js');
  assert.equal(globeJsRes.status, 200);
  assert.match(globeJsRes.text, /LunarGlobeGL/);

  const badSky = await invokeHandler(handler, '/api/map/sky?site=NONEXISTENT');
  assert.equal(badSky.status, 404);
});

test('evaluateDropPoint provides pre-drop environmental context for arbitrary lunar coordinates', () => {
  const bundle = loadMapDataset(MAPS_ROOT);
  const southPoleCustom = evaluateDropPoint(bundle, -86.2, -20.0, 141);
  assert.equal(southPoleCustom.region, 'SOUTH_POLE');
  assert.ok(southPoleCustom.nearestPsrKm >= 0);
  assert.ok(southPoleCustom.warnings.length >= 1);
  assert.equal(southPoleCustom.sky.sun.length, 178);
});
