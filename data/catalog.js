"use strict";

const fs = require("fs");
const path = require("path");

const WINDOWS = ["past", "upcoming", "all"];
const STATUSES = ["planned", "completed", "failed", "cancelled"];
const REGIONS = ["polar", "near-side", "far-side"];
const PAYLOAD_TYPES = [
  "retroreflector",
  "heat-flow",
  "dust-shield",
  "camera",
  "navigation",
  "radio",
  "mass-spectrometer",
  "drill",
  "sampler",
  "gnss",
  "computer",
  "suite",
  "relay",
  "other",
];
const PAYLOAD_KINDS = [
  "plume",
  "plasma",
  "propellant",
  "heliophysics",
  "geophysics",
  "dust",
  "avionics",
  "volatiles",
  "magnetic",
  "geology",
];
const PAYLOAD_TOKENS = [...PAYLOAD_TYPES, ...PAYLOAD_KINDS];
const WATER_ICE = ["target", "regional", "not-a-target"];
const COMMS = ["direct-earth", "far-side-needs-relay", "polar-variable"];
const OUTCOMES = ["success", "partial", "no-landing", "scheduled"];
const OUTCOME_BY_STATUS = {
  failed: ["no-landing"],
  planned: ["scheduled"],
  cancelled: ["scheduled"],
  completed: ["success", "partial"],
};
const PET_MOODS = ["happy", "shivering", "cold", "sleeping"];
const PET_RARITIES = ["Common", "Uncommon", "Rare", "Legendary"];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function loadCatalog(file = path.join(__dirname, "catalog.json")) {
  const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
  const result = validateCatalog(catalog);
  if (!result.ok) {
    throw catalogError(result.errors.join("\n"), result.errors);
  }
  return catalog;
}

function validateCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    return { ok: false, errors: ["catalog must be an object"] };
  }
  checkDate(catalog.asOf, "asOf", errors);

  const sources = collect(catalog.sources, "sources", "source", errors);
  for (const source of records(catalog.sources)) {
    if (!isHttpsUrl(source.url)) {
      errors.push(`source ${idOf(source)} needs an https URL`);
    }
  }

  const sites = collect(catalog.sites, "sites", "site", errors);
  const siteList = Array.isArray(catalog.sites) ? catalog.sites : [];
  for (const site of records(catalog.sites)) {
    checkEnum(site.region, REGIONS, `site ${site.id} region`, errors);
    checkEnum(site.resources && site.resources.waterIce, WATER_ICE, `site ${site.id} waterIce`, errors);
    checkEnum(site.comms, COMMS, `site ${site.id} comms`, errors);
    checkCoords(site, errors);
    if (
      typeof site.terrain !== "string" ||
      !site.illumination ||
      typeof site.illumination.summary !== "string" ||
      site.illumination.annualSunlightPercent !== null ||
      !site.resources ||
      typeof site.resources.summary !== "string"
    ) {
      errors.push(
        `site ${site.id} needs terrain, resource text, and illumination.annualSunlightPercent set to null`
      );
    }
    checkRefs(site.sourceIds, sources, `site ${site.id}`, errors);
  }

  const payloads = collect(catalog.payloads, "payloads", "payload", errors);
  for (const payload of records(catalog.payloads)) {
    checkEnum(payload.type, PAYLOAD_TYPES, `payload ${payload.id} type`, errors);
    checkRefs(payload.sourceIds, sources, `payload ${payload.id}`, errors);
  }

  collect(catalog.pets, "pets", "pet", errors);
  for (const pet of records(catalog.pets)) {
    if (pet.power !== "required" && pet.power !== "none") {
      errors.push(`pet ${pet.id} power must be "required" or "none"`);
    }
    if (pet.nightBehavior !== "needs-power" && pet.nightBehavior !== "passive") {
      errors.push(`pet ${pet.id} nightBehavior must be "needs-power" or "passive"`);
    }
    if (pet.power === "none" && pet.nightBehavior !== "passive") {
      errors.push(`pet ${pet.id} needs no power, so nightBehavior must be passive`);
    }
    if (pet.power === "required" && pet.nightBehavior === "passive") {
      errors.push(`pet ${pet.id} requires power, so it cannot be passive at night`);
    }
    if (pet.passive === true && pet.nightBehavior !== "passive") {
      errors.push(`pet ${pet.id} passive true requires nightBehavior passive`);
    }
    if (pet.passive === false && pet.nightBehavior === "passive") {
      errors.push(`pet ${pet.id} passive false cannot use nightBehavior passive`);
    }
    if (pet.power === "required" && pet.passive === true) {
      errors.push(`pet ${pet.id} requires power, so it cannot be passive`);
    }
    if (pet.power === "none" && pet.passive === false) {
      errors.push(`pet ${pet.id} needs no power, so passive must be true`);
    }
    if (pet.moods != null) {
      if (!pet.moods || typeof pet.moods !== "object" || Array.isArray(pet.moods)) {
        errors.push(`pet ${pet.id} moods must be an object`);
      } else {
        for (const phase of ["day", "sunset", "night"]) {
          if (pet.moods[phase] != null) {
            checkEnum(pet.moods[phase], PET_MOODS, `pet ${pet.id} moods.${phase}`, errors);
          }
        }
        if (pet.passive === false && pet.moods.night === "sleeping") {
          errors.push(`pet ${pet.id} is not passive, so night mood cannot be sleeping`);
        }
        if (pet.passive === true && pet.moods.night === "cold") {
          errors.push(`pet ${pet.id} is passive, so night mood should not be cold`);
        }
      }
    }
    if (pet.rarity != null) checkEnum(pet.rarity, PET_RARITIES, `pet ${pet.id} rarity`, errors);
    if (pet.engineDraw != null) {
      if (!pet.engineDraw || typeof pet.engineDraw !== "object" || Array.isArray(pet.engineDraw)) {
        errors.push(`pet ${pet.id} engineDraw must be an object`);
      } else if (typeof pet.engineDraw.value !== "number" || !Number.isFinite(pet.engineDraw.value)) {
        errors.push(`pet ${pet.id} engineDraw.value must be a finite number`);
      } else if (pet.engineDraw.key != null && typeof pet.engineDraw.key !== "string") {
        errors.push(`pet ${pet.id} engineDraw.key must be a string or null`);
      }
    }
    if (pet.homeSiteId != null && !sites.has(pet.homeSiteId)) {
      errors.push(`pet ${pet.id} homeSiteId ${pet.homeSiteId} is not a site`);
    }
    checkRefs(pet.payloadIds, payloads, `pet ${pet.id} payload`, errors);
    checkRefs(pet.sourceIds, sources, `pet ${pet.id}`, errors);
  }

  const missions = collect(catalog.missions, "missions", "mission", errors);
  for (const pet of records(catalog.pets)) {
    if (pet.homeMissionId != null && !missions.has(pet.homeMissionId)) {
      errors.push(`pet ${pet.id} homeMissionId ${pet.homeMissionId} is not a mission`);
    }
  }
  for (const mission of records(catalog.missions)) {
    checkEnum(mission.status, STATUSES, `mission ${mission.id} status`, errors);
    if (mission.outcome != null) {
      checkEnum(mission.outcome, OUTCOMES, `mission ${mission.id} outcome`, errors);
    }
    const allowedOutcomes = OUTCOME_BY_STATUS[mission.status];
    if (allowedOutcomes && !allowedOutcomes.includes(mission.outcome)) {
      errors.push(
        `mission ${mission.id} status ${mission.status} requires outcome ${allowedOutcomes.join(" or ")}`
      );
    }
    if (mission.region != null) {
      checkEnum(mission.region, REGIONS, `mission ${mission.id} region`, errors);
    }
    if (mission.launchDate != null) checkDate(mission.launchDate, `mission ${mission.id} launchDate`, errors);
    if (mission.landingDate != null) checkDate(mission.landingDate, `mission ${mission.id} landingDate`, errors);
    if (mission.launchDate && mission.landingDate && mission.landingDate < mission.launchDate) {
      errors.push(`mission ${mission.id} landingDate is before launchDate`);
    }
    if ((mission.status === "completed" || mission.status === "failed") && !mission.launchDate) {
      errors.push(`mission ${mission.id} is ${mission.status} and needs a launchDate`);
    }
    if ((mission.status === "planned" || mission.status === "cancelled") && mission.landingDate) {
      errors.push(`mission ${mission.id} is ${mission.status} and cannot have a landingDate`);
    }
    if (mission.status === "failed" && mission.landingDate) {
      errors.push(`mission ${mission.id} failed before landing, so landingDate must be empty`);
    }
    if (mission.status === "completed" && !mission.landingDate) {
      errors.push(`mission ${mission.id} is completed and needs a landingDate`);
    }
    if (mission.siteId != null && !sites.has(mission.siteId)) {
      errors.push(`mission ${mission.id} siteId ${mission.siteId} is not a site`);
    }
    if (mission.siteId != null && mission.region != null) {
      const site = siteList.find((item) => item && item.id === mission.siteId);
      if (site && site.region !== mission.region) {
        errors.push(`mission ${mission.id} region does not match site ${site.id}`);
      }
    }
    const namedPayloads = Array.isArray(mission.payloadIds) ? mission.payloadIds.length : 0;
    if (mission.nasaPayloadCount != null) {
      if (!Number.isInteger(mission.nasaPayloadCount) || mission.nasaPayloadCount < namedPayloads) {
        errors.push(`mission ${mission.id} nasaPayloadCount is below the named payload list`);
      }
    }
    if (
      Number.isInteger(mission.nasaPayloadCount) &&
      mission.nasaPayloadCount > namedPayloads &&
      (typeof mission.payloadNote !== "string" || mission.payloadNote.trim() === "")
    ) {
      errors.push(`mission ${mission.id} names fewer payloads than NASA's count and needs payloadNote`);
    }
    checkRefs(mission.payloadIds, payloads, `mission ${mission.id} payload`, errors, false);
    if (namedPayloads === 0 && (typeof mission.payloadNote !== "string" || mission.payloadNote.trim() === "")) {
      errors.push(`mission ${mission.id} names no payloads and needs payloadNote`);
    }
    checkRefs(mission.sourceIds, sources, `mission ${mission.id}`, errors, true);
  }

  checkVendorCounts(catalog, sources, errors);

  return { ok: errors.length === 0, errors };
}

function filterMissions(catalog, query = {}, options = {}) {
  assertMissions(catalog);
  const normalized = normalizeQuery(query);
  const asOf = readAsOf(catalog, options.asOf);
  const payloads = new Map((catalog.payloads || []).map((payload) => [payload.id, payload]));

  return catalog.missions
    .filter((mission) => missionMatches(mission, normalized, asOf, payloads))
    .slice()
    .sort(compareMissions);
}

function compareSites(catalog, siteIds) {
  if (!catalog || !Array.isArray(catalog.sites)) {
    throw catalogError("catalog.sites is required");
  }
  if (!Array.isArray(siteIds) || siteIds.length === 0) {
    throw filterError("compareSites needs at least one site id");
  }

  const ordered = [];
  const seen = new Set();
  for (const raw of siteIds) {
    if (typeof raw !== "string" || raw.trim() === "") {
      throw filterError("site ids must be non-empty strings");
    }
    const id = raw.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }

  const sitesById = new Map(catalog.sites.map((site) => [site.id, site]));
  const missing = ordered.filter((id) => !sitesById.has(id));
  const sites = ordered.filter((id) => sitesById.has(id)).map((id) => siteProfile(catalog, sitesById.get(id)));
  return { sites, missing, notes: contrastNotes(sites) };
}

function describeMission(catalog, id) {
  assertMissions(catalog);
  if (typeof id !== "string" || id.trim() === "") return null;
  const mission = catalog.missions.find((item) => item.id === id.trim());
  if (!mission) return null;
  const site = (catalog.sites || []).find((item) => item.id === mission.siteId) || null;
  const payloads = (mission.payloadIds || []).map((payloadId) => {
    return (catalog.payloads || []).find((item) => item.id === payloadId) || { id: payloadId, missing: true };
  });
  const pets = (catalog.pets || []).filter((pet) =>
    (pet.payloadIds || []).some((payloadId) => (mission.payloadIds || []).includes(payloadId))
  );
  const sources = resolveSources(catalog, mission.sourceIds);
  return { mission, site, payloads, pets, sources };
}

function describeSite(catalog, id) {
  if (!catalog || !Array.isArray(catalog.sites) || typeof id !== "string") return null;
  const site = catalog.sites.find((item) => item.id === id.trim());
  if (!site) return null;
  return siteProfile(catalog, site);
}

function describePet(catalog, id) {
  if (!catalog || !Array.isArray(catalog.pets) || typeof id !== "string") return null;
  const pet = catalog.pets.find((item) => item.id === id.trim());
  if (!pet) return null;
  const payloads = (pet.payloadIds || []).map((payloadId) => {
    return (catalog.payloads || []).find((item) => item.id === payloadId) || { id: payloadId, missing: true };
  });
  const missions = (catalog.missions || [])
    .filter((mission) =>
      (mission.payloadIds || []).some((payloadId) => (pet.payloadIds || []).includes(payloadId))
    )
    .slice()
    .sort(compareMissions);
  return { pet, payloads, missions, sources: resolveSources(catalog, pet.sourceIds) };
}

function listSources(catalog) {
  if (!catalog || !Array.isArray(catalog.sources)) {
    throw catalogError("catalog.sources is required");
  }
  return catalog.sources.slice();
}

function missionMatches(mission, query, asOf, payloads) {
  if (query.window !== "all" && windowOf(mission, asOf) !== query.window) return false;
  if (query.year != null && missionYear(mission) !== query.year) return false;
  if (query.region && mission.region !== query.region) return false;
  if (query.siteId && mission.siteId !== query.siteId) return false;
  if (query.status && mission.status !== query.status) return false;
  if (query.payloadType && !hasPayloadType(mission, payloads, query.payloadType)) return false;
  return true;
}

function windowOf(mission, asOf) {
  if (mission.status === "cancelled") return "cancelled";
  if (mission.launchDate) return mission.launchDate <= asOf ? "past" : "upcoming";
  if (mission.status === "planned") return "upcoming";
  if (mission.status === "completed" || mission.status === "failed") return "past";
  return "unknown";
}

function missionYear(mission) {
  if (mission.launchDate) return Number(mission.launchDate.slice(0, 4));
  return Number.isInteger(mission.nasaTimelineYear) ? mission.nasaTimelineYear : null;
}

function hasPayloadType(mission, payloads, type) {
  return (mission.payloadIds || []).some((payloadId) => {
    const payload = payloads.get(payloadId);
    return payload && (payload.type === type || payload.kind === type);
  });
}

function normalizeQuery(query) {
  if (query == null || typeof query !== "object" || Array.isArray(query)) {
    throw filterError("query must be an object");
  }
  return {
    window: readEnum(query.window, WINDOWS, "window", "all"),
    year: readYear(query.year),
    region: readEnum(query.region, REGIONS, "region", null),
    siteId: readId(query.siteId, "site"),
    status: readEnum(query.status, STATUSES, "status", null),
    payloadType: readToken(query.payloadType, PAYLOAD_TOKENS, "payload"),
  };
}

function readEnum(value, allowed, label, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "string") throw filterError(`${label} must be a string`);
  const trimmed = value.trim();
  if (trimmed === "") return fallback;
  const token = trimmed.toLowerCase();
  if (!allowed.includes(token)) {
    throw filterError(`${label} must be one of: ${allowed.join(", ")}`);
  }
  return token;
}

function readToken(value, allowed, label) {
  return readEnum(value, allowed, label, null);
}

function readYear(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    if (!/^-?\d+$/.test(trimmed)) throw filterError("year must be an integer");
    return Number(trimmed);
  }
  if (typeof value === "number" && Number.isInteger(value)) return value;
  throw filterError("year must be an integer");
}

function readId(value, label) {
  if (value == null) return null;
  if (typeof value !== "string") throw filterError(`${label} id must be a string`);
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function readAsOf(catalog, override) {
  const value = override == null || override === "" ? catalog.asOf : override;
  if (typeof value !== "string" || !isIsoDate(value)) {
    throw filterError("asOf must be YYYY-MM-DD");
  }
  return value;
}

function siteProfile(catalog, site) {
  if (!site.resources || !site.illumination) {
    throw catalogError(`site ${site.id} is missing resources or illumination`);
  }
  const missions = (catalog.missions || [])
    .filter((mission) => mission.siteId === site.id)
    .slice()
    .sort(compareMissions)
    .map((mission) => ({
      id: mission.id,
      name: mission.name,
      status: mission.status,
      outcome: mission.outcome || null,
      launchDate: mission.launchDate || null,
    }));
  return {
    id: site.id,
    name: site.name,
    region: site.region,
    terrain: site.terrain,
    illumination: site.illumination,
    resources: site.resources,
    comms: site.comms,
    coordinates: coordinatesOf(site),
    missions,
    sources: resolveSources(catalog, site.sourceIds),
  };
}

function coordinatesOf(site) {
  if (site.latitude == null && site.longitude == null) return null;
  return {
    latitude: site.latitude,
    longitude: site.longitude,
    longitudeConvention: site.longitudeConvention,
    kind: site.coordinateKind || null,
    elevationM: site.elevationM == null ? null : site.elevationM,
  };
}

function contrastNotes(sites) {
  if (sites.length < 2) return [];
  const notes = [];
  const regions = unique(sites.map((site) => site.region));
  if (regions.length > 1) {
    notes.push(
      `Regions differ: ${sites.map((site) => `${site.name} is ${site.region}`).join("; ")}.`
    );
  }
  const terrains = unique(sites.map((site) => site.terrain));
  if (terrains.length > 1) {
    notes.push(
      `Terrain differs: ${sites.map((site) => `${site.name} is ${site.terrain}`).join("; ")}.`
    );
  }
  const regimes = unique(sites.map((site) => site.illumination && site.illumination.regime));
  if (regimes.length > 1) {
    notes.push(
      `Illumination regime differs: ${sites
        .map((site) => `${site.name} is ${site.illumination.regime}`)
        .join("; ")}.`
    );
  }
  const ice = unique(sites.map((site) => site.resources.waterIce));
  if (ice.length > 1) {
    notes.push(
      `Water-ice relation differs: ${sites
        .map((site) => `${site.name} is ${icePhrase(site.resources.waterIce)}`)
        .join("; ")}.`
    );
  }
  const comms = unique(sites.map((site) => site.comms));
  if (comms.length > 1) {
    notes.push(
      `Earth link differs: ${sites.map((site) => `${site.name} is ${commsPhrase(site.comms)}`).join("; ")}.`
    );
  }
  if (sites.every((site) => site.illumination.annualSunlightPercent == null)) {
    notes.push("No site in this comparison has a stored annual sunlight percent.");
  }
  return notes;
}

function icePhrase(value) {
  if (value === "target") return "a water-ice science target";
  if (value === "regional") return "in a polar region, but not recorded as a PSR landing";
  return "not a water-ice target in this catalog";
}

function commsPhrase(value) {
  if (value === "direct-earth") return "on the near side with a direct Earth view";
  if (value === "far-side-needs-relay") return "on the far side and needs a relay";
  return "in the polar class, where Earth visibility depends on the exact spot and is not stored as a number";
}

function compareMissions(a, b) {
  const aDate = a.launchDate || "9999-99-99";
  const bDate = b.launchDate || "9999-99-99";
  if (aDate !== bDate) return aDate < bDate ? -1 : 1;
  const aYear = Number.isInteger(a.nasaTimelineYear) ? a.nasaTimelineYear : 9999;
  const bYear = Number.isInteger(b.nasaTimelineYear) ? b.nasaTimelineYear : 9999;
  if (aYear !== bYear) return aYear - bYear;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function resolveSources(catalog, ids) {
  return (ids || [])
    .map((sourceId) => (catalog.sources || []).find((source) => source.id === sourceId))
    .filter(Boolean);
}

function collect(list, label, noun, errors) {
  const ids = new Map();
  if (!Array.isArray(list)) {
    errors.push(`${label} must be an array`);
    return ids;
  }
  for (const item of list) {
    if (!item || typeof item.id !== "string" || item.id.trim() === "") {
      errors.push(`every ${noun} needs a string id`);
      continue;
    }
    if (item.id !== item.id.trim()) errors.push(`${noun} id ${JSON.stringify(item.id)} has surrounding space`);
    if (ids.has(item.id)) errors.push(`duplicate ${noun} id ${item.id}`);
    ids.set(item.id, item);
  }
  return ids;
}

function checkRefs(ids, known, label, errors, required = true) {
  if (!Array.isArray(ids)) {
    errors.push(`${label} references must be an array`);
    return;
  }
  if (required && ids.length === 0) {
    errors.push(`${label} needs at least one reference`);
    return;
  }
  for (const id of ids) {
    if (!known.has(id)) errors.push(`${label} references unknown id ${id}`);
  }
}

function checkEnum(value, allowed, label, errors) {
  if (!allowed.includes(value)) errors.push(`${label} must be one of: ${allowed.join(", ")}`);
}

function checkDate(value, label, errors) {
  if (!isIsoDate(value)) errors.push(`${label} must be a real YYYY-MM-DD date`);
}

function checkVendorCounts(catalog, sources, errors) {
  const program = catalog.program;
  const counts = program && program.eligibleVendorCounts;
  if (!isRecord(program) || !Array.isArray(counts)) {
    errors.push("program.eligibleVendorCounts must be an array");
    return;
  }
  counts.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`program.eligibleVendorCounts[${index}] must be an object`);
      return;
    }
    if (typeof entry.sourceId !== "string" || !sources.has(entry.sourceId)) {
      errors.push(`program vendor count ${index + 1} sourceId ${entry.sourceId} is not a source`);
    }
  });
}

function checkCoords(site, errors) {
  const hasLat = site.latitude != null;
  const hasLon = site.longitude != null;
  if (hasLat !== hasLon) {
    errors.push(`site ${site.id} needs both latitude and longitude, or neither`);
    return;
  }
  if (!hasLat) return;
  if (!Number.isFinite(site.latitude) || site.latitude < -90 || site.latitude > 90) {
    errors.push(`site ${site.id} latitude is out of range`);
  }
  if (!Number.isFinite(site.longitude)) {
    errors.push(`site ${site.id} longitude is out of range`);
  } else if (site.longitudeConvention === "signed") {
    if (site.longitude < -180 || site.longitude > 180) {
      errors.push(`site ${site.id} signed longitude is out of range`);
    }
  } else if (site.longitudeConvention === "east-positive-0-360") {
    if (site.longitude < 0 || site.longitude > 360) {
      errors.push(`site ${site.id} east longitude is out of range`);
    }
  } else {
    errors.push(`site ${site.id} longitudeConvention is missing`);
  }
  if (site.coordinateKind !== "landing-fix" && site.coordinateKind !== "published-ellipse") {
    errors.push(`site ${site.id} coordinateKind must be landing-fix or published-ellipse`);
  }
}

function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "";
  } catch {
    return false;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(isRecord);
}

function isIsoDate(value) {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function assertMissions(catalog) {
  if (!catalog || !Array.isArray(catalog.missions)) {
    throw catalogError("catalog.missions is required");
  }
}

function unique(values) {
  return [...new Set(values)];
}

function idOf(item) {
  return item && item.id ? item.id : "(missing id)";
}

function filterError(message) {
  const error = new Error(message);
  error.code = "INVALID_FILTER";
  return error;
}

function catalogError(message, errors) {
  const error = new Error(message);
  error.code = "INVALID_CATALOG";
  if (errors) error.errors = errors;
  return error;
}

module.exports = {
  WINDOWS,
  STATUSES,
  REGIONS,
  PAYLOAD_TYPES,
  loadCatalog,
  validateCatalog,
  filterMissions,
  compareSites,
  describeMission,
  describeSite,
  describePet,
  listSources,
  windowOf,
  missionYear,
};
