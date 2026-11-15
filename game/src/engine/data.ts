// In-browser copy of the engine's tunables and catalog. Source of truth: src/engine/{Rules,Sites,Pet,Sources}.java.
// tests/parity.mjs runs the same scenarios through Java and this port and fails if any number drifts.

export const Rules = {
  // Time
  DAY_HOURS: 346,
  NIGHT_HOURS: 362,
  GAME_HOURS: 346 + 362,
  STEP_HOURS: 0.25,
  // Power
  BATTERY_MAX: 100,
  SOLAR_PER_HOUR: 5.0,
  HEATER_PER_HOUR: 2.0,
  TIPPED_SOLAR: 0.25,
  POWER_LOW: 25,
  POWER_CRITICAL: 10,
  // Temperature
  START_TEMP_K: 293,
  THERMAL_RATE: 0.15,
  HEATER_BOOST_K: 130,
  SHADE_DROP_K: 130,
  SHADE_SOLAR: 0.6,
  TEMP_CURVE: 0.25,
  // Health
  DAMAGE_PER_K: 0.08,
  MAX_DAMAGE_PER_HOUR: 8,
  REGEN_PER_HOUR: 1,
  // Dust
  LANDING_DUST: 15,
  DUST_PER_HOUR: 0.12,
  DUSTY: 60,
  // Rover
  MOON_RADIUS_KM: 1737.4,
  ROVER_KMH: 35.9 / (4 + 26 / 60.0),
  DRIVE_DUST_PER_HOUR: 0.5,
  // Science
  LISTER_DEPTH_STOPS: 8,
  LISTER_MAX_DEPTH_M: 1.0,
  LRO_PASS_HOURS: 2,
  DATA_BUFFER_MAX: 100,
  CLEAN_AMOUNT: 35,
  DRILL_DATA: 12,
  DUST_TEST_DATA: 6,
  DUST_TEST_CLEAN: 30,
  PING_DATA: 4,
  PASSIVE_CLEAN_COOLDOWN: 24,
} as const;

export interface ActionRule {
  id: string;
  label: string;
  powerCost: number;
  cooldownHours: number;
}

export const ACTIONS = {
  HEATER: { id: "heater", label: "Heater on/off", powerCost: 0, cooldownHours: 0 },
  SHADE: { id: "shade", label: "Sunshade on/off", powerCost: 0, cooldownHours: 0 },
  CLEAN: { id: "clean", label: "Shake off dust", powerCost: 4, cooldownHours: 8 },
  SEND: { id: "send", label: "Send data to Earth", powerCost: 6, cooldownHours: 4 },
  DRILL: { id: "work", label: "Drill deeper", powerCost: 12, cooldownHours: 24 },
  DUST_TEST: { id: "work", label: "Run a dust test", powerCost: 5, cooldownHours: 6 },
  PING: { id: "work", label: "Catch a laser ping", powerCost: 0, cooldownHours: Rules.LRO_PASS_HOURS },
} satisfies Record<string, ActionRule>;

export interface Milestone {
  id: string;
  mission: string;
  hours: number;
  text: string;
  sourceId: string;
}

export const MILESTONES: Milestone[] = [
  { id: "im-2", mission: "IM-2 (Athena)", hours: 24, text: "Outlasted IM-2, which tipped over and was declared dead the day after landing.", sourceId: "sciam-bg1" },
  { id: "im-1", mission: "IM-1 (Odysseus)", hours: 7 * 24, text: "Matched IM-1, which operated seven Earth days.", sourceId: "sciam-bg1" },
  { id: "sunset", mission: "Lunar day", hours: Rules.DAY_HOURS, text: "Survived all 346 hours of lunar daylight.", sourceId: "firefly-bg1" },
  { id: "blue-ghost-1", mission: "Blue Ghost Mission 1", hours: Rules.DAY_HOURS + 5, text: "Matched Blue Ghost 1, which kept working about 5 hours into the lunar night.", sourceId: "firefly-bg1" },
];

export interface Site {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  dayMaxK: number;
  nightMinK: number;
  sunlight: number;
  note: string;
  coordSourceId: string;
  sourceIds: string[];
}

export const SITES: Site[] = [
  { id: "MARE_CRISIUM", name: "Mare Crisium", region: "Near side, mid-latitude", lat: 18.5623, lon: 61.8103, dayMaxK: 400, nightMinK: 95, sunlight: 1.0, note: "Blue Ghost Mission 1 landed here and ran 346 hours of daylight.", coordSourceId: "leag-bg1", sourceIds: ["diviner", "firefly-bg1", "sciam-bg1"] },
  { id: "REINER_GAMMA", name: "Reiner Gamma", region: "Near side, near the equator", lat: 7.39, lon: -58.96, dayMaxK: 400, nightMinK: 95, sunlight: 1.0, note: "Bright swirls on a dark plain. A planned IM-3 landing site.", coordSourceId: "moontrek-clps", sourceIds: ["diviner"] },
  { id: "MALAPERT_A", name: "Malapert A", region: "South polar region", lat: -80.13, lon: 1.44, dayMaxK: 220, nightMinK: 90, sunlight: 0.55, note: "IM-1 (Odysseus) landed near here and worked seven Earth days.", coordSourceId: "nasa-lro-im1", sourceIds: ["diviner", "lro-temps", "lroc-sunlight", "sciam-bg1"] },
  { id: "MONS_MOUTON", name: "Mons Mouton", region: "South polar region", lat: -84.7906, lon: 29.1957, dayMaxK: 220, nightMinK: 90, sunlight: 0.55, note: "IM-2 (Athena) landed near the south pole and tipped onto its side.", coordSourceId: "lroc-im2", sourceIds: ["diviner", "lro-temps", "lroc-sunlight", "sciam-bg1", "lroc-im2"] },
  { id: "SHADOWED_CRATER", name: "Shackleton Crater floor", region: "South pole, permanently shadowed", lat: -89.67, lon: 129.78, dayMaxK: 40, nightMinK: 25, sunlight: 0.0, note: "Shackleton's floor never sees the Sun. Only the passive retroreflector can live here.", coordSourceId: "usgs-shackleton", sourceIds: ["diviner", "lro-temps", "lroc-sunlight", "nasa-shackleton"] },
];

export interface Pet {
  id: string;
  name: string;
  fullName: string;
  flewOn: string;
  passive: boolean;
  minSafeK: number;
  maxSafeK: number;
  drawPerHour: number;
  workLabel: string;
  sourceId: string | null;
}

export const PETS: Pet[] = [
  { id: "LISTER", name: "LISTER", fullName: "Lunar Instrumentation for Subsurface Thermal Exploration with Rapidity", flewOn: "Blue Ghost Mission 1", passive: false, minSafeK: 200, maxSafeK: 340, drawPerHour: 1.0, workLabel: "Drill deeper", sourceId: "pds-lister" },
  { id: "LRA", name: "Retro", fullName: "Laser Retroreflector Array", flewOn: "IM-1 and IM-2", passive: true, minSafeK: 0, maxSafeK: 1000, drawPerHour: 0, workLabel: "Catch a laser ping", sourceId: "pds-lra" },
  { id: "EDS", name: "EDS", fullName: "Electrodynamic Dust Shield", flewOn: "Blue Ghost Mission 1", passive: false, minSafeK: 210, maxSafeK: 350, drawPerHour: 0.8, workLabel: "Run a dust test", sourceId: null },
  { id: "LN-1", name: "Nodey", fullName: "Lunar Node-1 Navigation Demonstrator", flewOn: "IM-1 at Malapert A", passive: false, minSafeK: 200, maxSafeK: 340, drawPerHour: 0.6, workLabel: "Broadcast a ranging ping", sourceId: null },
];

export interface Source {
  id: string;
  title: string;
  url: string;
}

export const SOURCES: Source[] = [
  { id: "firefly-bg1", title: "Firefly: Blue Ghost completes 14 days of surface operations", url: "https://fireflyspace.com/news/firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon" },
  { id: "diviner", title: "Diviner Lunar Radiometer: science results (UCLA)", url: "https://www.diviner.ucla.edu/science" },
  { id: "lro-temps", title: "NASA LRO fact sheet: polar temperature variation", url: "https://science.nasa.gov/wp-content/uploads/2024/01/lrolitho7temperaturevariation27may2014.pdf" },
  { id: "lroc-sunlight", title: "LROC: south pole illumination", url: "https://lroc.im-ldi.com/visit/exhibits/1/gallery/41" },
  { id: "pds-lister", title: "NASA PDS: LISTER (Blue Ghost Mission 1)", url: "https://pds-geosciences.wustl.edu/missions/clps/to19d_lister.htm" },
  { id: "pds-lra", title: "NASA PDS: Laser Retroreflector Array", url: "https://pds-geosciences.wustl.edu/missions/clps/lra.htm" },
  { id: "sciam-bg1", title: "Scientific American: Blue Ghost completes historic lunar mission", url: "https://www.scientificamerican.com/article/blue-ghost-lander-successfully-completes-historic-lunar-mission/" },
  { id: "pds-clps", title: "NASA PDS: CLPS data archive", url: "https://pds-geosciences.wustl.edu/missions/clps/index.htm" },
  { id: "nssdc-lrv", title: "NASA NSSDC: Apollo Lunar Roving Vehicle", url: "https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html" },
  { id: "nasa-moon-facts", title: "NASA NSSDC: Moon fact sheet", url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html" },
  { id: "leag-bg1", title: "LEAG 2025: Blue Ghost Mission 1 science highlights", url: "https://www.hou.usra.edu/meetings/leag2025/presentations/Wednesday/1030_Banks.pdf" },
  { id: "nasa-lro-im1", title: "NASA: LRO images Intuitive Machines' Odysseus lander", url: "https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/" },
  { id: "lroc-im2", title: "LROC: IM-2 Athena seen obliquely", url: "https://lroc.im-ldi.com/images/1408" },
  { id: "moontrek-clps", title: "NASA Moon Trek: CLPS sites layer", url: "https://trek.nasa.gov/moon/trekarcgis3/rest/services/CLPS_sites/MapServer/0/query" },
  { id: "usgs-shackleton", title: "USGS Gazetteer of Planetary Nomenclature: Shackleton", url: "https://planetarynames.wr.usgs.gov/Feature/5450" },
  { id: "nasa-shackleton", title: "NASA: Shackleton crater's illuminated rim and shadowed interior", url: "https://science.nasa.gov/resource/shackleton-craters-illuminated-rim-shadowed-interior/" },
];

export interface Fact {
  topic: string;
  text: string;
  sourceId: string;
}

export const FACTS: Fact[] = [
  { topic: "Blue Ghost 1", text: "Operated more than 14 days on the surface, including 346 hours of daylight.", sourceId: "firefly-bg1" },
  { topic: "Blue Ghost 1", text: "Kept working just over 5 hours into the lunar night after sunset on March 16, 2025.", sourceId: "firefly-bg1" },
  { topic: "Blue Ghost 1", text: "Sent home more than 119 GB of data, including 51 GB of science and technology data.", sourceId: "firefly-bg1" },
  { topic: "Blue Ghost 1", text: "10 NASA instruments operated and collected science data.", sourceId: "firefly-bg1" },
  { topic: "Blue Ghost 1", text: "Landed March 2, 2025 in Mare Crisium, a basaltic plain on the Moon's near side.", sourceId: "sciam-bg1" },
  { topic: "Temperature", text: "Noon at the lunar equator: almost 400 K (about 127 °C).", sourceId: "diviner" },
  { topic: "Temperature", text: "Night at the equator: below 100 K (about −173 °C).", sourceId: "diviner" },
  { topic: "Temperature", text: "Permanently shadowed polar craters: as low as 25 K (about −248 °C).", sourceId: "diviner" },
  { topic: "Temperature", text: "Sunlit crater rims near the poles stay roughly constant at about 220 K (about −53 °C).", sourceId: "diviner" },
  { topic: "Temperature", text: "35 cm underground is 40–45 K warmer on average than the surface; at 80 cm the daily swing is imperceptible.", sourceId: "diviner" },
  { topic: "Temperature", text: "Polar maps: daily maximum temperatures range from about 40 K to 360 K, minimums from about 20 K to 100 K.", sourceId: "lro-temps" },
  { topic: "Sunlight", text: "The Moon's axis tilts only 1.54°, so it has no seasons.", sourceId: "lroc-sunlight" },
  { topic: "Sunlight", text: "Some peaks near the south pole are sunlit more than 80% of the time, while low areas stay in constant shadow.", sourceId: "lroc-sunlight" },
  { topic: "Sunlight", text: "LRO passes over each pole about every two hours.", sourceId: "lroc-sunlight" },
  { topic: "LISTER", text: "Lunar Instrumentation for Subsurface Thermal Exploration with Rapidity, flown on Blue Ghost Mission 1 to Mare Crisium.", sourceId: "pds-lister" },
  { topic: "LISTER", text: "The first robotically deployed subsurface thermal probe that actively digs into lunar regolith.", sourceId: "pds-lister" },
  { topic: "LISTER", text: "Reached 1 m deep, measuring temperature and thermal conductivity at 8 different depths.", sourceId: "pds-lister" },
  { topic: "LRA", text: "8 corner-cube reflectors, each 1.27 cm across, on an aluminum dome 5.0 cm wide and 1.6 cm tall, weighing 20 g.", sourceId: "pds-lra" },
  { topic: "LRA", text: "A passive optical instrument that needs no power. It is a target for laser ranging from lunar orbit that pins down the lander's position.", sourceId: "pds-lra" },
  { topic: "IM-1", text: "Odysseus landed in February 2024 and operated seven Earth days before going dark.", sourceId: "sciam-bg1" },
  { topic: "IM-2", text: "Athena landed near the south pole on March 6, 2025, tipped onto its side just after touchdown and was declared dead on March 7.", sourceId: "sciam-bg1" },
  { topic: "CLPS archive", text: "NASA's PDS holds CLPS data from Peregrine 1 (LETS, NIRVSS, NSS, PITMS), IM-1 (LRA, ROLSES, SCALPSS), IM-2 (LRA, MSOLO) and Blue Ghost 1 (LISTER, LMS, LPV, RAC, RadPC, SCALPSS).", sourceId: "pds-clps" },
  { topic: "Rover", text: "On Apollo 17 the rover went 35.9 km in 4 hours 26 minutes of total drive time, about 8.1 km/h.", sourceId: "nssdc-lrv" },
  { topic: "Rover", text: "Apollo 17's longest rover traverse was 20.1 km, and the rover never got more than 7.6 km from the lunar module.", sourceId: "nssdc-lrv" },
  { topic: "Rover", text: "The Moon's volumetric mean radius is 1,737.4 km.", sourceId: "nasa-moon-facts" },
  { topic: "Sites", text: "Blue Ghost Mission 1 landed at 18.5623° N, 61.8103° E in Mare Crisium.", sourceId: "leag-bg1" },
  { topic: "Sites", text: "NASA's LRO places the IM-1 (Odysseus) landing at 80.13° S, 1.44° E, near Malapert A.", sourceId: "nasa-lro-im1" },
  { topic: "Sites", text: "LROC found IM-2 (Athena) at 84.7906° S, 29.1957° E, on its side in a crater about 20 m across.", sourceId: "lroc-im2" },
  { topic: "Sites", text: "Shackleton crater is centred at 89.67° S, 129.78° E and is about 21 km across.", sourceId: "usgs-shackleton" },
  { topic: "Sites", text: "Peaks on Shackleton's rim get almost continual sunlight, while its interior is perpetually in shadow.", sourceId: "nasa-shackleton" },
];

/** Great-circle distance over the lunar surface, in km. Mirrors Site.distanceKm in Java. */
export function distanceKm(a: Site, b: Site): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dp = p2 - p1;
  const dl = toRad(b.lon - a.lon);
  const h =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * Rules.MOON_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function siteById(id: string): Site | undefined {
  const key = (id ?? "").trim().toLowerCase();
  return SITES.find((s) => s.id.toLowerCase() === key);
}

export function petById(id: string): Pet | undefined {
  const key = (id ?? "").trim().toLowerCase();
  return PETS.find((p) => p.id.toLowerCase() === key);
}
