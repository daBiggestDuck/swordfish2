import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import {
  LUNAR_RADIUS_KM,
  RAW_FILE_MAP,
  elevationDeg,
  azimuthDeg,
  horizonElevationAtAzimuth,
  greatCircleDistanceKm,
  formatDurationDaysHours,
  parseHorizonsEphemeris,
  buildMapDataset,
  evaluateDropPoint,
  computeSiteSky,
  filterMissions,
  filterSites,
  compareSites,
  simulateCascade,
  recommendRecipe,
  dispatchMapApi,
  normalizeSiteId,
  findSite,
} from '../web/map_engine_client.js';

export {
  LUNAR_RADIUS_KM,
  RAW_FILE_MAP,
  elevationDeg,
  azimuthDeg,
  horizonElevationAtAzimuth,
  greatCircleDistanceKm,
  formatDurationDaysHours,
  parseHorizonsEphemeris,
  buildMapDataset,
  evaluateDropPoint,
  computeSiteSky,
  filterMissions,
  filterSites,
  compareSites,
  simulateCascade,
  recommendRecipe,
  dispatchMapApi,
  normalizeSiteId,
  findSite,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_MAPS_ROOT = path.join(REPO_ROOT, 'data', 'maps');
const WEB_ROOT = path.join(REPO_ROOT, 'web');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function readJsonOrNull(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadRawSources(mapsRoot = DEFAULT_MAPS_ROOT) {
  const rawDir = path.join(mapsRoot, 'raw');
  const rawSources = {};
  for (const [key, filename] of Object.entries(RAW_FILE_MAP)) {
    rawSources[key] = readJsonOrNull(path.join(rawDir, filename));
  }
  return rawSources;
}

export function loadMapDataset(mapsRoot = DEFAULT_MAPS_ROOT) {
  const main = JSON.parse(fs.readFileSync(path.join(mapsRoot, 'lunar_map_data.json'), 'utf8'));
  const rawSources = loadRawSources(mapsRoot);
  return buildMapDataset({
    main,
    quickmap: rawSources.quickmap || {},
    trekSites: rawSources.trek_sites || {},
    trekPsr: rawSources.trek_psr || {},
    lola: rawSources.lola || {},
    horizons: rawSources.horizons || {},
  });
}

export function createMapRequestHandler(mapsRoot = DEFAULT_MAPS_ROOT, webRoot = WEB_ROOT) {
  const main = JSON.parse(fs.readFileSync(path.join(mapsRoot, 'lunar_map_data.json'), 'utf8'));
  const rawSources = loadRawSources(mapsRoot);
  const bundle = buildMapDataset({
    main,
    quickmap: rawSources.quickmap || {},
    trekSites: rawSources.trek_sites || {},
    trekPsr: rawSources.trek_psr || {},
    lola: rawSources.lola || {},
    horizons: rawSources.horizons || {},
  });

  return (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const apiResult = dispatchMapApi(bundle, rawSources, req.url);
    if (apiResult) {
      res.writeHead(apiResult.status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(apiResult.body));
      return;
    }

    let relPath = url.pathname;
    if (relPath === '/') {
      relPath = fs.existsSync(path.join(webRoot, 'index.html')) ? '/index.html' : '/map.html';
    } else if (relPath === '/map') {
      relPath = '/map.html';
    } else if (relPath === '/story') {
      relPath = fs.existsSync(path.join(webRoot, 'story.html')) ? '/story.html' : '/story/index.html';
    } else if (relPath === '/readme') {
      relPath = '/readme.html';
    }

    const resolveSafeFile = (baseDir, reqPath) => {
      let decoded;
      try {
        decoded = decodeURIComponent(reqPath);
      } catch {
        return null;
      }
      const candidate = path.resolve(baseDir, '.' + decoded);
      if (candidate !== baseDir && !candidate.startsWith(baseDir + path.sep)) return null;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        const indexCandidate = path.join(candidate, 'index.html');
        if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) return indexCandidate;
        return null;
      }
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      return null;
    };

    const resolved =
      relPath === '/readme.html'
        ? resolveSafeFile(REPO_ROOT, relPath) || resolveSafeFile(webRoot, relPath)
        : resolveSafeFile(webRoot, relPath) || resolveSafeFile(REPO_ROOT, url.pathname) || resolveSafeFile(REPO_ROOT, relPath);
    if (!resolved) {
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
