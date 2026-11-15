// Story client: the one thing other branches need to use the story.
//
// Used by the standalone story page (story.js) and meant for the engine/ui game loop. When a Java
// StoryServer (:8081) is unreachable or when running under a static server (VS Code Live Server),
// all endpoints transparently fall back to matching offline CLPS story data + map_engine_client.
//
// Pop-up objects look like { id, mission, title, text, dayStart, sourceUrl }.

import { handleClientApi, normalizeSiteId } from '../map_engine_client.js';

// Engine milestone ids (src/engine/Rules.java MILESTONES) -> Passport lines.
const MILESTONES = {
  'im-2': 'Outlasted IM-2 (Athena): more than 1 day on the Moon',
  'im-1': 'Outlasted IM-1 (Odysseus): more than 7 days on the Moon',
  sunset: 'Survived the whole lunar day',
  'blue-ghost-1': 'Beat Blue Ghost Mission 1: still working 5 hours into the night',
};

const CLPS_PAGE = 'https://www.nasa.gov/commercial-lunar-payload-services/';
const DELIVERIES = 'https://science.nasa.gov/lunar-science/clps-deliveries/';
const BG1_LANDING =
  'https://www.nasa.gov/news-release/touchdown-carrying-nasa-science-fireflys-blue-ghost-lands-on-moon/';
const BG1_END =
  'https://www.nasa.gov/news-release/nasa-science-continues-after-fireflys-first-moon-mission-concludes/';
const BG1_ECLIPSE =
  'https://www.nasa.gov/blogs/missions/2025/03/14/nasa-science-data-received-blue-ghost-captures-eclipse-from-moon/';
const IM1_LRO =
  'https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/';
const IM2_KIT =
  'https://www.nasa.gov/wp-content/uploads/2025/02/np-2025-02-005-jsc-clps-intuitive-machines-press-kit-508-2-25-25.pdf';
const PEREGRINE_KIT =
  'https://www.nasa.gov/wp-content/uploads/2023/12/np-2023-12-017-jsc-clps-astrobotic-press-kit-update-508.pdf';
const CT3 = 'https://science.nasa.gov/lunar-science/clps-deliveries/ct-3-science/';
const LN1_BEACON =
  'https://www.nasa.gov/centers-and-facilities/marshall/nasa-lights-beacon-on-moon-with-autonomous-navigation-system-test/';
const IM1_PROGRESS =
  'https://www.nasa.gov/blogs/missions/2024/02/21/intuitive-machines-nasa-science-progress-toward-moon-landing/';

const STORY_MISSIONS = [
  { id: 'peregrine-1', name: 'Peregrine Mission One', vendor: 'Astrobotic Technology', launched: '2024-01-08', landed: null, status: 'NO_LANDING', siteId: 'SINUS_VISCOSITATIS', note: 'Launched Jan. 8, 2024. No lunar landing.' },
  { id: 'im-1', name: 'IM-1 Mission', vendor: 'Intuitive Machines', launched: '2024-02-15', landed: '2024-02-22', status: 'LANDED', siteId: 'MALAPERT_A', note: 'Landed tilted on its side.' },
  { id: 'blue-ghost-1', name: 'Blue Ghost Mission 1', vendor: 'Firefly Aerospace', launched: '2025-01-15', landed: '2025-03-02', status: 'LANDED', siteId: 'MARE_CRISIUM', note: 'Worked through a lunar day.' },
  { id: 'im-2', name: 'IM-2 Mission', vendor: 'Intuitive Machines', launched: '2025-02-27', landed: '2025-03-06', status: 'LANDED', siteId: 'MONS_MOUTON', note: null },
  { id: 'blue-moon-1', name: 'Blue Moon Mark 1 Mission', vendor: 'Blue Origin', launched: null, landed: null, status: 'PLANNED', siteId: 'SHACKLETON_RIDGE', note: 'Will deliver two NASA payloads (SCALPSS, LRA) to the south pole.' },
  { id: 'griffin-1', name: 'Griffin Mission One', vendor: 'Astrobotic Technology', launched: null, landed: null, status: 'PLANNED', siteId: 'MONS_MOUTON', note: null },
  { id: 'im-3', name: 'IM-3 Mission', vendor: 'Intuitive Machines', launched: null, landed: null, status: 'PLANNED', siteId: 'REINER_GAMMA', note: null },
  { id: 'blue-ghost-2', name: 'Blue Ghost Mission 2', vendor: 'Firefly Aerospace', launched: null, landed: null, status: 'PLANNED', siteId: 'FAR_SIDE', note: null },
  { id: 'draper-1', name: 'Draper Mission 1', vendor: 'Draper', launched: null, landed: null, status: 'PLANNED', siteId: null, note: null },
  { id: 'im-4', name: 'IM-4 Mission', vendor: 'Intuitive Machines', launched: null, landed: null, status: 'PLANNED', siteId: 'MONS_MOUTON', note: null },
  { id: 'blue-ghost-3', name: 'Blue Ghost Mission 3', vendor: 'Firefly Aerospace', launched: null, landed: null, status: 'PLANNED', siteId: 'GRUITHUISEN_DOMES', note: null },
];

const STORY_PETS = [
  {
    id: 'LISTER',
    name: 'LISTER',
    vendor: 'Honeybee Robotics',
    missionId: 'blue-ghost-1',
    face: '🔩',
    tagline: "Hungry heat-flow drill. Measures warmth under the regolith — needs power at night.",
    defaultSite: 'MARE_CRISIUM',
    sleepsAtNight: false,
    science: [
      "Drilled to measure heat flowing from the Moon's interior",
      'Needed lander power to keep working after sunset',
    ],
    instrument: 'LISTER heat-flow probe',
  },
  {
    id: 'LRA',
    name: 'Retro',
    vendor: 'NASA GSFC',
    missionId: 'im-1',
    face: '💠',
    tagline: 'Quiet corner-cube mirror. Needs no power, so it sleeps through lunar night.',
    defaultSite: 'MALAPERT_A',
    sleepsAtNight: true,
    science: [
      'Bounced laser light so orbiters could pin down the lander',
      'Slept through the night — passive optics draw zero watts',
    ],
    instrument: 'LRA laser retroreflector',
  },
  {
    id: 'EDS',
    name: 'EDS',
    vendor: 'NASA',
    missionId: 'blue-ghost-1',
    face: '✨',
    tagline: 'Dust-shield panel. Electric fields lift lunar dust — only while power lasts.',
    defaultSite: 'MARE_CRISIUM',
    sleepsAtNight: false,
    science: [
      'Lifted lunar dust off glass and radiators with electric fields',
      'Stopped cleaning when the Sun set and power ran low',
    ],
    instrument: 'EDS electrodynamic dust shield',
  },
  {
    id: 'LN-1',
    name: 'Nodey',
    vendor: 'Intuitive Machines',
    missionId: 'im-1',
    face: '📡',
    tagline: 'Chatty navigation beacon. Prefers waiting for Earth before it transmits.',
    defaultSite: 'MALAPERT_A',
    sleepsAtNight: false,
    science: [
      'Lit a navigation beacon on the Moon for future explorers',
      "Backed up its lander's own navigation system",
    ],
    instrument: 'LN-1 navigation beacon',
  },
];

const STORY_SITES = [
  { id: 'MARE_CRISIUM', name: 'Mare Crisium', lat: 18.56, lon: 61.81 },
  { id: 'MALAPERT_A', name: 'Malapert A', lat: -80.13, lon: 1.44 },
  { id: 'MONS_MOUTON', name: 'Mons Mouton', lat: -84.8, lon: 29.2 },
  { id: 'REINER_GAMMA', name: 'Reiner Gamma', lat: 7.5, lon: -59.0 },
  { id: 'SHACKLETON_RIDGE', name: 'Shackleton Connecting Ridge', lat: -89.5, lon: 0.0 },
];

const BUILT_IN_MOMENTS = [
  { id: 'bg1-sunrise', siteId: 'MARE_CRISIUM', mission: 'Blue Ghost Mission 1', title: 'Hello, Mare Crisium!', text: "Firefly's Blue Ghost 1 landed near Mons Latreille in Mare Crisium on Mar. 2, 2025, carrying 10 NASA instruments. Your pet is following in its footsteps.", dayStart: 0.02, sourceUrl: BG1_LANDING, petId: 'ANY' },
  { id: 'bg1-eclipse', siteId: 'MARE_CRISIUM', mission: 'Blue Ghost Mission 1', title: 'An eclipse from the Moon', text: "Blue Ghost 1 captured a total solar eclipse from the Moon's surface, when Earth passed in front of the Sun.", dayStart: 0.65, sourceUrl: BG1_ECLIPSE, petId: 'ANY' },
  { id: 'bg1-sunset', siteId: 'MARE_CRISIUM', mission: 'Blue Ghost Mission 1', title: 'Sunset is coming', text: "Blue Ghost 1's team planned to watch how lunar dust reacts to the Sun at dusk. The cold night is close, so keep your pet warm!", dayStart: 0.88, sourceUrl: BG1_LANDING, petId: 'ANY' },
  { id: 'im1-tilt', siteId: 'MALAPERT_A', mission: 'IM-1 Mission', title: 'Wobbly landing', text: "Intuitive Machines' IM-1 launched Feb. 15, 2024 and landed Feb. 22, 2024 near Malapert A, on ground sloped about 12 degrees, and came to rest tilted. Panel angle really matters!", dayStart: 0.1, sourceUrl: IM1_LRO, petId: 'ANY' },
  { id: 'im2-mouton', siteId: 'MONS_MOUTON', mission: 'IM-2 Mission', title: 'Ice hunters', text: "IM-2 launched Feb. 27, 2025 and landed Mar. 6, 2025, aiming for Mons Mouton near the Moon's south pole, where scientists look for water ice. Your pet is a tiny scientist too!", dayStart: 0.1, sourceUrl: IM2_KIT, petId: 'ANY' },
  { id: 'reiner-gamma', siteId: 'REINER_GAMMA', mission: 'IM-3 Mission', title: 'A swirly mystery', text: 'IM-3 is a planned delivery. Reiner Gamma is famous for bright swirls on the surface, a great place to explore.', dayStart: 0.1, sourceUrl: DELIVERIES, petId: 'ANY' },
  { id: 'shackleton', siteId: 'SHACKLETON_RIDGE', mission: 'Blue Moon Mark 1 Mission', title: 'At the very bottom', text: "Shackleton Connecting Ridge is near the Moon's south pole. The Sun skims along the horizon here, so every bit of power counts.", dayStart: 0.1, sourceUrl: CT3, petId: 'ANY' },

  { id: 'peregrine-nolanding', siteId: 'ANY', mission: 'Peregrine Mission One', title: 'Not every trip lands', text: "Astrobotic's Peregrine launched Jan. 8, 2024 but never landed on the Moon. NASA says every failure brings lessons that improve the next mission.", dayStart: 0.3, sourceUrl: PEREGRINE_KIT, petId: 'ANY' },
  { id: 'earth-link', siteId: 'ANY', mission: 'Any CLPS lander', title: 'Calling Earth', text: 'Landers can only send data home when Earth is above the horizon and the antenna points right. Real operators wait for the link too.', dayStart: 0.5, sourceUrl: DELIVERIES, petId: 'ANY' },

  { id: 'lister-hello', siteId: 'ANY', mission: 'Blue Ghost Mission 1', title: 'Meet LISTER', text: "LISTER is a heat-flow probe that flew on Firefly's Blue Ghost 1. It drills into regolith to measure warmth from the Moon's interior — hungry work!", dayStart: 0.03, sourceUrl: BG1_LANDING, petId: 'LISTER' },
  { id: 'lister-drill', siteId: 'ANY', mission: 'Blue Ghost Mission 1', title: 'Drilling for heat', text: 'LISTER was designed to dig meters into the surface. Keep it powered: without solar (or lander) power, the drill gets too cold to work.', dayStart: 0.3, sourceUrl: BG1_END, petId: 'LISTER' },
  { id: 'lister-night', siteId: 'ANY', mission: 'Blue Ghost Mission 1', title: 'Into the night', text: "Blue Ghost 1 kept science running through sunset. Active instruments like LISTER need power through the lunar night — huddle, don't sleep!", dayStart: 0.92, sourceUrl: BG1_END, petId: 'LISTER' },

  { id: 'retro-hello', siteId: 'ANY', mission: 'IM-1 Mission', title: 'Meet Retro', text: 'Retro is based on the Laser Retroreflector Array — a handful of glass prisms that bounce laser light back to orbiters. No power, no commands.', dayStart: 0.03, sourceUrl: IM1_LRO, petId: 'LRA' },
  { id: 'retro-mirror', siteId: 'ANY', mission: 'Any CLPS lander', title: 'A mirror for orbiters', text: 'Passive LRA arrays help spacecraft pinpoint exactly where a lander sits. They keep working for decades because they draw zero watts.', dayStart: 0.4, sourceUrl: CLPS_PAGE, petId: 'LRA' },
  { id: 'retro-night', siteId: 'ANY', mission: 'Any CLPS lander', title: 'Sleep through the night', text: 'While powered pets huddle in the cold, Retro sleeps peacefully. Real hardware needs no heater and no battery — just clear glass facets.', dayStart: 0.92, sourceUrl: CLPS_PAGE, petId: 'LRA' },

  { id: 'eds-hello', siteId: 'ANY', mission: 'Blue Ghost Mission 1', title: 'Meet EDS', text: 'EDS is an electrodynamic dust shield from Blue Ghost 1. Electric fields lift lunar dust off glass and radiators — no moving parts.', dayStart: 0.03, sourceUrl: BG1_LANDING, petId: 'EDS' },
  { id: 'eds-dust', siteId: 'ANY', mission: 'Blue Ghost Mission 1', title: 'Dust everywhere', text: 'Lunar dust is electrostatically sticky. EDS cleans surfaces while the Sun (and lander power) can feed it; night stops the cleaning.', dayStart: 0.35, sourceUrl: BG1_END, petId: 'EDS' },
  { id: 'eds-night', siteId: 'ANY', mission: 'Blue Ghost Mission 1', title: 'Fields need power', text: 'Without power the dust shield cannot keep lifting motes. EDS huddles in the lunar night instead of sleeping — same rule as other active payloads.', dayStart: 0.92, sourceUrl: BG1_END, petId: 'EDS' },

  { id: 'nodey-hello', siteId: 'ANY', mission: 'IM-1 Mission', title: 'Meet Nodey', text: "Nodey is based on Lunar Node-1 (LN-1), a navigation beacon NASA flew on IM-1. Its job: help explorers know exactly where they are on the Moon.", dayStart: 0.03, sourceUrl: LN1_BEACON, petId: 'LN-1' },
  { id: 'nodey-dsn', siteId: 'ANY', mission: 'IM-1 Mission', title: 'Talking to Earth', text: "On the way to the Moon, LN-1 made three successful passes with NASA's Deep Space Network, talking with ground stations on Earth.", dayStart: 0.25, sourceUrl: IM1_PROGRESS, petId: 'LN-1' },
  { id: 'nodey-backup', siteId: 'ANY', mission: 'IM-1 Mission', title: 'Helping its lander', text: "LN-1 also gave critical backup to IM-1's own navigation system. Nodey likes to help — and prefers waiting until Earth is in view!", dayStart: 0.5, sourceUrl: LN1_BEACON, petId: 'LN-1' },
  { id: 'nodey-beacon', siteId: 'ANY', mission: 'IM-1 Mission', title: 'A beacon on the Moon', text: 'For 30 minutes in total in February 2024, NASA lit a navigation beacon on the Moon with LN-1, testing a system that could guide future explorers.', dayStart: 0.75, sourceUrl: LN1_BEACON, petId: 'LN-1' },
];

const LUNAR_DAY_EARTH_DAYS = 14.0;
const SITE_MATCH = (a, b) => a === 'ANY' || normalizeSiteId(a) === normalizeSiteId(b);

function phaseToDay(phase) {
  switch (phase) {
    case 'sunrise': return 0.05;
    case 'day': return 0.4;
    case 'sunset': return 0.9;
    case 'night': return 0.96;
    default: return 0.55;
  }
}

let extraMomentsPromise = null;

function loadExtraMoments() {
  if (extraMomentsPromise) return extraMomentsPromise;
  extraMomentsPromise = (async () => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return [];
    try {
      const url = new URL('../../data/mission-events.json', import.meta.url).href;
      const res = await fetch(url);
      if (!res.ok) return [];
      const rows = await res.json();
      if (!Array.isArray(rows)) return [];
      const byId = new Map(STORY_MISSIONS.map((m) => [m.id, m]));
      return rows
        .filter((e) => e && e.id && e.title && e.description)
        .map((e) => {
          const m = byId.get(e.missionId);
          return {
            id: `data-${e.id}`,
            siteId: m?.siteId || 'ANY',
            mission: m ? `${m.name} (${m.vendor})` : 'CLPS mission',
            title: e.title,
            text: e.description,
            dayStart: phaseToDay(e.lunarPhase),
            sourceUrl: e.sourceUrl || CLPS_PAGE,
            petId: 'ANY',
          };
        });
    } catch {
      return [];
    }
  })();
  return extraMomentsPromise;
}

function findPet(id) {
  const key = String(id || '').trim().toUpperCase();
  return STORY_PETS.find((p) => p.id.toUpperCase() === key) || STORY_PETS[0];
}

function passportRating(daysSurvived) {
  if (daysSurvived > LUNAR_DAY_EARTH_DAYS + 1) return 'Night Survivor';
  if (daysSurvived >= LUNAR_DAY_EARTH_DAYS) return 'Lunar Day Legend';
  if (daysSurvived >= 10) return 'Seasoned Explorer';
  if (daysSurvived >= 5) return 'Brave Rookie';
  return 'Fresh Landing';
}

function momentApplies(m, site, pet) {
  const siteOk = m.siteId === 'ANY' || (site && SITE_MATCH(m.siteId, site));
  const petOk = m.petId === 'ANY' || m.petId.toUpperCase() === String(pet || '').toUpperCase();
  return siteOk && petOk;
}

async function enrichedStorySites() {
  let mapSites = [];
  try {
    mapSites = await handleClientApi('/api/sites');
  } catch {
    mapSites = [];
  }
  return STORY_SITES.map((s) => {
    const match = mapSites.find((m) => normalizeSiteId(m.id) === normalizeSiteId(s.id));
    return {
      id: s.id,
      name: s.name,
      lat: match?.lat ?? s.lat,
      lon: match?.lon ?? s.lon,
      region: match?.region,
      illuminationPct: match?.illuminationTerrainPct ?? match?.illuminationPct,
      earthVisibilityPct: match?.earthVisibilityPct,
    };
  });
}

async function fallbackApi(path) {
  const url = new URL(path, 'http://127.0.0.1');
  const pathname = url.pathname;
  const q = url.searchParams;

  if (pathname === '/api/missions') {
    return STORY_MISSIONS;
  }

  if (pathname === '/api/pets') {
    return STORY_PETS.map(({ science, ...rest }) => rest);
  }

  if (pathname === '/api/sites') {
    return enrichedStorySites();
  }

  if (pathname === '/api/sky') {
    const siteId = q.get('site') || 'SHACKLETON_RIDGE';
    const date = q.get('date') || new Date().toISOString().slice(0, 10);
    const enc = encodeURIComponent;
    const [sky, sites] = await Promise.all([
      handleClientApi(`/api/sky?site=${enc(siteId)}&date=${enc(date)}`),
      enrichedStorySites(),
    ]);
    const storySite = sites.find((s) => normalizeSiteId(s.id) === normalizeSiteId(sky.id));
    return {
      ...sky,
      name: storySite?.name || sky.name,
      real: true,
      model: sky.model || 'JPL Horizons + LOLA 36-bin horizon',
      illuminationPct: sky.illuminationPct ?? storySite?.illuminationPct,
      earthVisibilityPct: sky.earthVisibilityPct ?? storySite?.earthVisibilityPct,
    };
  }

  if (pathname === '/api/moments') {
    const site = q.get('site') || '';
    const pet = q.get('pet') || '';
    const rawProg = Number.parseFloat(q.get('progress') ?? '0');
    const prog = Number.isFinite(rawProg) ? Math.max(0, Math.min(1, rawProg)) : 0;
    const all = [...BUILT_IN_MOMENTS, ...(await loadExtraMoments())];
    return all
      .filter((m) => momentApplies(m, site, pet) && m.dayStart <= prog)
      .map(({ id, mission, title, text, dayStart, sourceUrl }) => ({
        id,
        mission,
        title,
        text,
        dayStart,
        sourceUrl,
      }));
  }

  if (pathname === '/api/passport') {
    const site = q.get('site') || '';
    const rawProg = Number.parseFloat(q.get('progress') ?? '0');
    const prog = Number.isFinite(rawProg) ? Math.max(0, Math.min(1, rawProg)) : 0;
    const rawDays = Number.parseFloat(q.get('days') ?? '');
    const daysSurvived = Number.isFinite(rawDays) && rawDays >= 0 && rawDays < 1000
      ? rawDays
      : prog * LUNAR_DAY_EARTH_DAYS;
    const pet = findPet(q.get('pet'));
    const rawName = (q.get('name') || '').trim();
    const petName = (rawName || pet.name).slice(0, 24);
    const missionName = STORY_MISSIONS.find((m) => m.id === pet.missionId)?.name || 'CLPS mission';
    const instrument = pet.instrument ? `${pet.instrument} on ${missionName} (${pet.vendor})` : `${missionName} (${pet.vendor})`;

    const science = [];
    for (const line of (q.get('science') || '').split('|')) {
      const t = line.trim();
      if (t && science.length < 6) science.push(t.slice(0, 100));
    }
    if (!science.length) science.push(...pet.science);

    const sites = await enrichedStorySites();
    const storySite = sites.find((s) => normalizeSiteId(s.id) === normalizeSiteId(site));
    const siteName = storySite?.name || (site || 'Unknown site');

    const all = [...BUILT_IN_MOMENTS, ...(await loadExtraMoments())];
    const matchedMoments = all.filter((m) => momentApplies(m, site, pet.id) && m.dayStart <= prog);
    const sources = [...new Set(matchedMoments.map((m) => m.sourceUrl).filter(Boolean))];

    return {
      petName,
      instrument,
      siteName,
      daysSurvived,
      lunarDayLength: LUNAR_DAY_EARTH_DAYS,
      rating: passportRating(daysSurvived),
      science,
      moments: matchedMoments.map((m) => ({ mission: m.mission, title: m.title })),
      sources,
    };
  }

  return null;
}

export function createStoryClient({ base = '' } = {}) {
  const seen = new Set();
  const extraScience = [];
  let tally = { deepest: null, pings: 0, sends: 0 };
  let ctx = { site: '', pet: '' };
  let useStaticFallback = false;

  async function api(path) {
    if (!useStaticFallback && typeof fetch === 'function') {
      try {
        const res = await fetch(base + path);
        const ct = (res.headers?.get('content-type') || '').toLowerCase();
        if (res.ok && (!ct || ct.includes('json'))) {
          return await res.json();
        }
        useStaticFallback = true;
      } catch {
        useStaticFallback = true;
      }
    }
    const body = await fallbackApi(path);
    if (body === null) throw new Error(`${path} failed (404)`);
    return body;
  }

  const enc = encodeURIComponent;

  return {
    api,

    /** Choose the landing site and pet. Starts a fresh story (nothing counts as seen). */
    setContext(site, pet) {
      ctx = { site, pet };
      this.reset();
    },

    reset() {
      seen.clear();
      extraScience.length = 0;
      tally = { deepest: null, pings: 0, sends: 0 };
    },

    /** Pop-ups that became due at this point in the lunar day. Each is returned only once. */
    async due(dayProgress) {
      const p = Math.max(0, Math.min(1, dayProgress));
      const list = await api(`/api/moments?site=${enc(ctx.site)}&pet=${enc(ctx.pet)}&progress=${p}`);
      const fresh = list.filter((m) => !seen.has(m.id));
      fresh.forEach((m) => seen.add(m.id));
      return fresh;
    },

    /**
     * React to an event from the engine branch. Engine events look like { type, detail, hour }
     * (see src/engine/Event.java). Returns { ended } so the caller knows when to show the Passport.
     *  - fainted / won: the story ends (won = survived the whole game)
     *  - milestone: beating a real mission's record becomes a Passport science line
     *  - drilled / ping / dataSent: counted into one science line each
     * Older event names (petFainted, missionComplete) still work.
     */
    handleEngineEvent(event) {
      if (!event || !event.type) return { ended: false };
      const t = event.type;
      if (t === 'milestone' && event.detail) {
        const line = MILESTONES[event.detail] || `Reached the ${event.detail} milestone`;
        if (!extraScience.includes(line)) extraScience.push(line);
      } else if (t === 'drilled') {
        tally.deepest = event.detail || tally.deepest;
      } else if (t === 'ping') {
        tally.pings += 1;
      } else if (t === 'dataSent') {
        tally.sends += 1;
      } else if (t === 'missionComplete' && event.missionId) {
        extraScience.push(`Finished the ${String(event.missionId).replace(/-/g, ' ')} mission`);
      }
      return { ended: t === 'fainted' || t === 'won' || t === 'petFainted' };
    },

    /**
     * The Pet Passport for how far the pet got. Pass { earthDays } from the engine's state so the
     * days survived include the night (the engine's lunar day is 346 hours).
     */
    passport(dayProgress, petName = '', { earthDays } = {}) {
      const p = Math.max(0, Math.min(1, dayProgress));
      const q = new URLSearchParams({ site: ctx.site, pet: ctx.pet, name: petName, progress: String(p) });
      if (Number.isFinite(earthDays)) q.set('days', String(earthDays));
      const science = [...extraScience];
      if (tally.deepest) science.push(`Drilled down to ${tally.deepest}`);
      if (tally.pings) science.push(`Caught ${tally.pings} laser ping${tally.pings === 1 ? '' : 's'} from Earth's orbiter`);
      if (tally.sends) science.push(`Sent data home to Earth ${tally.sends} time${tally.sends === 1 ? '' : 's'}`);
      if (science.length) q.set('science', science.slice(0, 4).join('|'));
      return api(`/api/passport?${q}`);
    },

    missions: () => api('/api/missions'),
    pets: () => api('/api/pets'),
    sites: () => api('/api/sites'),

    /** Sun and Earth heights for a site over a month starting on date (YYYY-MM-DD). */
    sky(site, date) {
      return api(`/api/sky?site=${enc(site)}&date=${enc(date)}`);
    },
  };
}
