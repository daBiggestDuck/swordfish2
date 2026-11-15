import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
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
  normalizeSiteId,
  createMapRequestHandler,
} from '../tools/serve_map.mjs';
import { handleClientApi } from '../web/map_engine_client.js';
import { createStoryClient } from '../web/story/story-client.js';

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

  for (const route of ['/', '/map', '/map.html']) {
    const htmlRes = await invokeHandler(handler, route);
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.text, /Lunar Map/);
  }

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
  assert.ok(evalFar.decayMultipliers.happiness > 1.5);
  assert.ok(evalFar.careMultipliers.signal > 1.5);

  const globeJsRes = await invokeHandler(handler, '/globe_gl.js');
  assert.equal(globeJsRes.status, 200);
  assert.match(globeJsRes.text, /LunarGlobeGL/);

  for (const rasterFile of ['lroc_wac_global.jpg', 'lola_dem_global.jpg']) {
    const rasterPath = path.join(REPO_ROOT, 'web', 'assets', rasterFile);
    assert.ok(fs.existsSync(rasterPath), `Missing NASA raster on disk: ${rasterPath}`);
    assert.ok(fs.statSync(rasterPath).size > 100000, `Expected ${rasterFile} > 100KB`);
    const assetRes = await invokeHandler(handler, `/assets/${rasterFile}`);
    assert.equal(assetRes.status, 200);
    const contentType = assetRes.headers['Content-Type'] || assetRes.headers['content-type'];
    assert.equal(contentType, 'image/jpeg');
  }

  const badSky = await invokeHandler(handler, '/api/map/sky?site=NONEXISTENT');
  assert.equal(badSky.status, 404);
});

test('evaluateDropPoint provides pre-drop environmental context for arbitrary lunar coordinates and NASA QuickMap features', () => {
  const bundle = loadMapDataset(MAPS_ROOT);
  const southPoleCustom = evaluateDropPoint(bundle, -86.2, -20.0, 141);
  assert.equal(southPoleCustom.region, 'SOUTH_POLE');
  assert.ok(southPoleCustom.nearestPsrKm >= 0);
  assert.ok(southPoleCustom.warnings.length >= 1);
  assert.equal(southPoleCustom.sky.sun.length, 178);

  const tychoPeak = evaluateDropPoint(bundle, -43.31, -11.36, 141);
  assert.match(tychoPeak.name, /Tycho Crater Central Peak/);
  assert.equal(tychoPeak.elevationMeters, -915);
  assert.ok(tychoPeak.slopeDegrees > 10);

  const tychoFloor = evaluateDropPoint(bundle, -43.80, -11.36, 141);
  assert.match(tychoFloor.name, /Tycho Crater Floor/);
  assert.equal(tychoFloor.elevationMeters, -4700);
  assert.ok(tychoFloor.horizonProfile[0] > 5);

  const tychoRim = evaluateDropPoint(bundle, -44.65, -11.36, 141);
  assert.match(tychoRim.name, /Tycho Crater Rim/);
  assert.ok(tychoRim.elevationMeters > 1000);

  const apenninus = evaluateDropPoint(bundle, 19.87, -3.70, 141);
  assert.match(apenninus.name, /Montes Apenninus/);
  assert.ok(apenninus.elevationMeters > 2000);

  const spaBasin = evaluateDropPoint(bundle, -53.0, -169.0, 141);
  assert.equal(spaBasin.region, 'FAR_SIDE');
  assert.match(spaBasin.name, /South Pole-Aitken Basin/);
  assert.equal(spaBasin.elevationMeters, -6200);
});

test('handleClientApi serves static Live Server fallback routes matching backend output', async () => {
  const data = await handleClientApi('/api/map/data');
  assert.equal(data.ephemerisCount, 178);
  assert.ok(data.sites.length >= 8);
  assert.ok(data.missions.length >= 11);

  const sky = await handleClientApi('/api/map/sky?site=SHACKLETON_RIM&sample=141');
  assert.equal(sky.id, 'SHACKLETON_RIM');
  assert.equal(sky.sampleCount, 178);
  assert.ok(sky.windows.computedSunlitTerrainPct > 70);

  const evalFar = await handleClientApi('/api/map/evaluate?lat=-75.0&lon=140.0&sample=141');
  assert.equal(evalFar.region, 'FAR_SIDE');
  assert.equal(evalFar.sky.earthVisible, false);
  assert.ok(evalFar.warnings.some((w) => /relay/i.test(w)));

  const cascade = await handleClientApi('/api/map/cascade?mission=blue-ghost-2');
  assert.ok(cascade.impactCount >= 1);
  assert.ok(cascade.impactedMissions.some((m) => m.id === 'draper-1'));

  const horizonsRaw = await handleClientApi('/api/map/raw/horizons');
  assert.match(horizonsRaw.result, /\$\$SOE/);

  await assert.rejects(() => handleClientApi('/api/map/sky?site=NONEXISTENT'), /404/);
});

test('NASA QuickMap catalog includes craters/massifs & Moon Trek rasters and 3D globe shader supports Steep POM parallax', () => {
  const qm = JSON.parse(fs.readFileSync(path.join(MAPS_ROOT, 'raw', 'quickmap_lroc_stack3314.json'), 'utf8'));
  assert.ok(Array.isArray(qm.notableAlbedoFeatures) && qm.notableAlbedoFeatures.length >= 22);
  assert.ok(Array.isArray(qm.cratersAndMassifs) && qm.cratersAndMassifs.length >= 40);
  assert.ok(qm.trekRasterEndpoints?.wacGlobal?.includes('LRO_WAC_Mosaic_Global'));
  assert.ok(qm.trekRasterEndpoints?.lolaDemGlobal?.includes('LRO_LOLA_DEM_Global'));

  const globeSrc = fs.readFileSync(path.join(REPO_ROOT, 'web', 'globe_gl.js'), 'utf8');
  assert.match(globeSrc, /uHeightTex/);
  assert.match(globeSrc, /uCamPos/);
  assert.match(globeSrc, /createRealisticMoonMaps/);
});

test('cross-branch compatibility: Data/story/engine site aliases, filters, mission fields, cascade aliases, and /api/sky', async () => {
  const ENGINE_METER_KEYS = ['food', 'happiness', 'oxygen', 'power'];
  const CARE_KEYS = ['power', 'signal', 'warmth'];
  const ORIGIN_DATA_SITE_IDS = [
    'sinus-viscositatis',
    'malapert-a',
    'mare-crisium',
    'nobile-region',
    'shackleton-ridge',
    'reiner-gamma',
    'schrodinger-basin',
    'gruithuisen-domes',
    'mons-mouton',
    'lunar-farside',
    'south-pole-bo',
    'south-pole-bg4',
    'south-pole-novad',
  ];

  assert.equal(normalizeSiteId('SHACKLETON_RIDGE'), 'SHACKLETON_RIM');
  assert.equal(normalizeSiteId('shackleton-ridge'), 'SHACKLETON_RIM');
  assert.equal(normalizeSiteId('nobile-region'), 'MONS_MOUTON');
  assert.equal(normalizeSiteId('mare-crisium'), 'MARE_CRISIUM');
  assert.equal(normalizeSiteId('schrodinger-basin'), 'FAR_SIDE');

  const handler = createMapRequestHandler(MAPS_ROOT, path.join(REPO_ROOT, 'web'));

  const sitesRes = await invokeHandler(handler, '/api/sites');
  assert.equal(sitesRes.status, 200);
  const sites = JSON.parse(sitesRes.text);
  assert.ok(sites.length >= 8);
  for (const site of sites) {
    assert.ok(Number.isFinite(site.elevationM));
    assert.ok(Number.isFinite(site.slopeDegs));
    assert.ok(Array.isArray(site.horizonProfile) && site.horizonProfile.length === 36);
    assert.deepEqual(Object.keys(site.decayMultipliers).sort(), ENGINE_METER_KEYS);
    for (const k of ENGINE_METER_KEYS) {
      assert.ok(Number.isFinite(site.decayMultipliers[k]) && site.decayMultipliers[k] >= 0);
    }
    assert.deepEqual(Object.keys(site.careMultipliers).sort(), CARE_KEYS);
  }

  for (const extSiteId of ORIGIN_DATA_SITE_IDS) {
    const extSiteRes = await invokeHandler(handler, `/api/sites?site=${encodeURIComponent(extSiteId)}`);
    assert.equal(extSiteRes.status, 200, `Expected 200 for /api/sites?site=${extSiteId}`);
    const matched = JSON.parse(extSiteRes.text);
    assert.equal(matched.length, 1, `Expected 1 site for ${extSiteId}, got ${matched.length}`);

    const extSkyRes = await invokeHandler(handler, `/api/sky?site=${encodeURIComponent(extSiteId)}`);
    assert.equal(extSkyRes.status, 200, `Expected 200 for /api/sky?site=${extSiteId}`);
    const extSky = JSON.parse(extSkyRes.text);
    assert.ok(Number.isFinite(extSky.bestAvgPowerPct));
  }

  const bundle = loadMapDataset(MAPS_ROOT);
  assert.equal(filterSites(bundle, { region: 'polar' }).length, 3);
  assert.equal(filterSites(bundle, { region: 'nearside' }).length, filterSites(bundle, { region: 'NEAR_SIDE' }).length);
  assert.equal(filterSites(bundle, { region: 'farside' }).length, 1);
  assert.equal(filterMissions(bundle, { status: 'failed' }).length, 1);
  assert.equal(filterMissions(bundle, { status: 'landed' }).length, 3);
  assert.equal(filterMissions(bundle, { status: 'planned' }).length, filterMissions(bundle, { status: 'PLANNED' }).length);

  const cascadeAliasRes = await invokeHandler(handler, '/api/map/cascade?mission=cs-3');
  assert.equal(cascadeAliasRes.status, 200);
  const cascadeAlias = JSON.parse(cascadeAliasRes.text);
  assert.equal(cascadeAlias.failedMission.id, 'blue-ghost-2');
  assert.ok(cascadeAlias.impactCount >= 1);

  const ev = evaluateDropPoint(bundle, -86.2, -20.0, 141);
  assert.ok(Number.isFinite(ev.elevationM));
  assert.ok(Number.isFinite(ev.slopeDegs));
  assert.ok(Array.isArray(ev.horizonProfile) && ev.horizonProfile.length === 36);
  assert.deepEqual(Object.keys(ev.decayMultipliers).sort(), ENGINE_METER_KEYS);
  for (const k of ENGINE_METER_KEYS) {
    assert.ok(Number.isFinite(ev.decayMultipliers[k]) && ev.decayMultipliers[k] >= 0);
  }
  assert.deepEqual(Object.keys(ev.careMultipliers).sort(), CARE_KEYS);

  const missionsRes = await invokeHandler(handler, '/api/missions');
  assert.equal(missionsRes.status, 200);
  const missions = JSON.parse(missionsRes.text);
  assert.ok(missions.length >= 11);
  for (const m of missions) {
    assert.ok('launchDate' in m && 'landingDate' in m);
    assert.ok(typeof m.lander === 'string' && m.lander.length > 0);
    assert.ok('launched' in m && 'landed' in m && typeof m.status === 'string');
    assert.ok(Number.isFinite(m.duration) && m.duration > 0);
    for (const bucket of [m.requires, m.cost, m.reward]) {
      assert.ok(bucket && typeof bucket === 'object');
      for (const [k, v] of Object.entries(bucket)) {
        assert.ok(ENGINE_METER_KEYS.includes(k), `Unexpected meter key ${k} on mission ${m.id}`);
        assert.ok(Number.isFinite(v));
      }
    }
  }

  const skyAliasRes = await invokeHandler(handler, '/api/sky?site=SHACKLETON_RIDGE&date=2026-10-19');
  assert.equal(skyAliasRes.status, 200);
  const skyAlias = JSON.parse(skyAliasRes.text);
  assert.equal(skyAlias.id, 'SHACKLETON_RIM');
  assert.equal(skyAlias.startDate, '2026-10-19');
  assert.match(skyAlias.bestStartDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Number.isFinite(skyAlias.gameDays) && skyAlias.gameDays > 0);
  assert.ok(Number.isFinite(skyAlias.monthDays) && skyAlias.monthDays > 0);
  assert.ok(Number.isFinite(skyAlias.avgPowerPct));
  assert.ok(Number.isFinite(skyAlias.bestAvgPowerPct));
  assert.ok(skyAlias.bestAvgPowerPct >= skyAlias.avgPowerPct);

  const siteAliasRes = await invokeHandler(handler, '/api/sites?site=shackleton-ridge');
  assert.equal(siteAliasRes.status, 200);
  const siteAliasList = JSON.parse(siteAliasRes.text);
  assert.equal(siteAliasList.length, 1);
  assert.equal(siteAliasList[0].id, 'SHACKLETON_RIM');

  const mareRes = await invokeHandler(handler, '/api/map/recipe?site=mare-crisium');
  assert.equal(mareRes.status, 200);
  assert.equal(JSON.parse(mareRes.text).siteId, 'MARE_CRISIUM');

  const cmpAliasRes = await invokeHandler(handler, '/api/map/compare?sites=shackleton-ridge,schrodinger-basin');
  assert.equal(cmpAliasRes.status, 200);
  const cmpAlias = JSON.parse(cmpAliasRes.text);
  assert.deepEqual(
    cmpAlias.sites.map((s) => s.id),
    ['SHACKLETON_RIM', 'FAR_SIDE']
  );

  const clientSky = await handleClientApi('/api/sky?site=schrodinger-basin&date=2026-11-15');
  assert.equal(clientSky.id, 'FAR_SIDE');
  assert.equal(clientSky.startDate, '2026-11-15');
  assert.ok(Number.isFinite(clientSky.avgPowerPct));
  assert.ok(Number.isFinite(clientSky.bestAvgPowerPct));

  const snappedMare = evaluateDropPoint(bundle, 16.35, 59.35, 141);
  assert.equal(snappedMare.matchedKnownSite, true);
  assert.equal(snappedMare.nearestSiteId, 'MARE_CRISIUM');
  assert.equal(snappedMare.lat, 16.18);
  assert.equal(snappedMare.lon, 59.1);
});

test('Live Server static routes and Story client offline fallback work cleanly', async () => {
  const story = createStoryClient();
  const [missions, pets, sites, sky] = await Promise.all([
    story.missions(),
    story.pets(),
    story.sites(),
    story.sky('SHACKLETON_RIDGE', '2026-10-19'),
  ]);
  assert.ok(Array.isArray(missions) && missions.length >= 11);
  assert.ok(Array.isArray(pets) && pets.length === 4);
  assert.ok(Array.isArray(sites) && sites.length === 5);
  assert.equal(sky.real, true);
  assert.ok(Array.isArray(sky.sun) && sky.sun.length === 178);
  assert.ok(Number.isFinite(sky.avgPowerPct));

  story.setContext('SHACKLETON_RIDGE', 'LISTER');
  const dueMoments = await story.due(0.5);
  assert.ok(dueMoments.length >= 3);
  const dupMoments = await story.due(0.5);
  assert.equal(dupMoments.length, 0);

  const passport = await story.passport(1.0, 'Astro');
  assert.equal(passport.petName, 'Astro');
  assert.equal(passport.rating, 'Lunar Day Legend');
  assert.ok(passport.sources.length >= 1);
  assert.ok(typeof passport.fate === 'string' && passport.fate.length > 0);

  const handler = createMapRequestHandler(MAPS_ROOT, path.join(REPO_ROOT, 'web'));
  for (const [route, pattern] of [
    ['/index.html', /Payload/],
    ['/web/map.html', /Lunar Map/],
    ['/web/navigator.html', /Navigator/],
    ['/web/story/index.html', /Payload Pets/],
    ['/demos/js-engine/index.html', /Game rules/],
    ['/demos/js-pets/index.html', /3D instruments|Pet instruments/],
  ]) {
    const res = await invokeHandler(handler, route);
    assert.equal(res.status, 200, `Expected 200 for ${route}`);
    assert.match(res.text, pattern);
  }
  const catalogRes = await invokeHandler(handler, '/data/catalog.json');
  assert.equal(catalogRes.status, 200);
  const catalog = JSON.parse(catalogRes.text);
  assert.ok(Array.isArray(catalog.missions) && catalog.missions.length >= 1);

  for (const dirRoute of ['/story', '/web/story', '/demos/js-pets']) {
    const redir = await invokeHandler(handler, dirRoute);
    assert.equal(redir.status, 302, `Expected 302 trailing-slash redirect for ${dirRoute}`);
    assert.equal(redir.headers.Location, `${dirRoute}/`);
  }
  const storySlash = await invokeHandler(handler, '/story/');
  assert.equal(storySlash.status, 200);
  assert.match(storySlash.text, /Payload Pets: Story/);

  const storyClientSrc = fs.readFileSync(path.join(REPO_ROOT, 'web', 'story', 'story-client.js'), 'utf8');
  assert.doesNotMatch(storyClientSrc, /^\s*import\s+[^;]*'\.\.\//m);
});

test('Markdown preview renderer formats user README.md GFM elements, excludes dev docs, and server serves /README.md and /readme.html', async () => {
  const require = createRequire(import.meta.url);
  const { PROJECT_DOCS, renderMarkdown, normalizeDocPath, README_FALLBACK } = require('../web/md_preview.js');

  assert.deepEqual(
    PROJECT_DOCS.map((d) => d.path),
    ['README.md', 'data/maps/NOTICE.md']
  );

  const readmeText = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
  assert.ok(README_FALLBACK.length > 500);
  assert.doesNotMatch(readmeText, /PLAN\.md|STORY\.md|data\/README\.md|run-v0\.sh|node --test/);

  const rendered = renderMarkdown(readmeText, { currentDoc: 'README.md' });
  assert.match(rendered.html, /<h1[^>]*>Payload Pets — User Guide<\/h1>/);
  assert.match(rendered.html, /<table class="md-table">[\s\S]*<th[^>]*>Tab<\/th>/);
  assert.match(rendered.html, /<table class="md-table">[\s\S]*<th[^>]*>Pet<\/th>/);
  assert.match(rendered.html, /<code>LRA<\/code>/);
  assert.match(rendered.html, /data-md-doc="data\/maps\/NOTICE\.md"/);
  assert.doesNotMatch(rendered.html, /data-md-doc="PLAN\.md"/);
  assert.ok(rendered.toc.some((entry) => entry.level === 2 && /Inside the App/.test(entry.text)));

  const codeSample = renderMarkdown('```txt\nsample block\n```');
  assert.match(codeSample.html, /<div class="md-code-block">[\s\S]*<pre><code>sample block/);

  assert.equal(normalizeDocPath('./maps/NOTICE.md', 'data/README.md'), 'data/maps/NOTICE.md');
  assert.equal(normalizeDocPath('../README.md', 'data/README.md'), 'README.md');
  assert.equal(normalizeDocPath('https://example.com/a.md', 'README.md'), null);

  const unsafe = renderMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert(1))');
  assert.ok(!unsafe.html.includes('<script>'));
  assert.ok(!unsafe.html.includes('href="javascript:'));

  const handler = createMapRequestHandler(MAPS_ROOT, path.join(REPO_ROOT, 'web'));
  for (const [route, pattern] of [
    ['/README.md', /Payload Pets — User Guide/],
    ['/data/maps/NOTICE.md', /LROC QuickMap/],
    ['/readme.html', /User Guide &amp; NASA Data Credits/],
    ['/readme', /User Guide &amp; NASA Data Credits/],
  ]) {
    const res = await invokeHandler(handler, route);
    assert.equal(res.status, 200, `Expected 200 for ${route}`);
    assert.match(res.text, pattern);
  }
});

test('Live Server and showcase Engine regression checks', async () => {
  const { readFile } = await import('node:fs/promises');

  const engineServer = await readFile(path.join(REPO_ROOT, 'src', 'engine', 'EngineServer.java'), 'utf8');
  assert.match(engineServer, /allowLocalOrigin\s*\(/);
  assert.match(engineServer, /Access-Control-Allow-Origin/);
  assert.match(engineServer, /Vary/);
  assert.match(engineServer, /allowLocalOrigin\s*\(\s*ex\s*\)/);

  const showcaseJs = await readFile(path.join(REPO_ROOT, 'web', 'showcase.js'), 'utf8');
  assert.match(showcaseJs, /resolvedSrc/);
  assert.match(showcaseJs, /127\.0\.0\.1/);
  assert.match(showcaseJs, /probeUrl/);
  assert.match(showcaseJs, /note\.className\s*=\s*["']panel-note["']/);

  const showcaseCss = await readFile(path.join(REPO_ROOT, 'web', 'showcase.css'), 'utf8');
  assert.match(showcaseCss, /\.topnav\s*\{[^}]*min-height:\s*var\(--nav-h\)/s);
  assert.match(showcaseCss, /\.topnav\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(showcaseCss, /\.tabs\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.doesNotMatch(showcaseCss, /\.tabs\s*\{[^}]*overflow-x:\s*auto/s);

  const engineCss = await readFile(path.join(REPO_ROOT, 'web', 'engine.css'), 'utf8');
  assert.match(engineCss, /header h1\s*\{[^}]*margin:\s*\.?1rem auto 0/s);
  assert.match(engineCss, /header p\s*\{[^}]*margin:\s*\.?15rem auto 0/s);
  assert.match(engineCss, /max-width:\s*480px/);
});
