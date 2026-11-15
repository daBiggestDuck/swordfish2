import { LunarGlobeGL } from "@web/globe_gl.js";
import { BUNDLED_MAP_DATA } from "@web/map_data_bundle.js";
import { buildMapDataset, handleClientApi, normalizeSiteId } from "@web/map_engine_client.js";

export const DEFAULT_SAMPLE_INDEX = 141;

const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let cachedInitialDataset = null;

export function getInitialDataset() {
  if (!cachedInitialDataset) {
    cachedInitialDataset = buildMapDataset({
      main: BUNDLED_MAP_DATA.main,
      quickmap: BUNDLED_MAP_DATA.quickmap,
      trekSites: BUNDLED_MAP_DATA.trekSites,
      trekPsr: BUNDLED_MAP_DATA.trekPsr,
      lola: BUNDLED_MAP_DATA.lola,
      horizons: BUNDLED_MAP_DATA.horizons,
    });
  }
  return cachedInitialDataset;
}

async function fetchApiWithFallback(apiPath, timeoutMs = 800) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(apiPath, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Offline/static fallback handled below via bundled NASA physics engine.
  }
  return await handleClientApi(apiPath);
}

export async function loadMoonBootstrap(sampleIndex = DEFAULT_SAMPLE_INDEX) {
  const initial = getInitialDataset();
  let data = initial;
  try {
    const remote = await fetchApiWithFallback("/api/map/data");
    if (remote && Array.isArray(remote.sites) && remote.sites.length > 0) {
      data = {
        ...initial,
        ...remote,
        quickmap: remote.quickmap || initial.quickmap,
        psrZones: remote.psrZones || initial.psrZones,
      };
    }
  } catch {
    // Retain synchronous initial bundle if API fetch rejects.
  }
  const ephemeris = Array.isArray(data?.ephemeris) ? data.ephemeris : [];
  const safeIdx = Math.max(0, Math.min(sampleIndex, Math.max(0, ephemeris.length - 1)));
  const ep = ephemeris[safeIdx] || null;
  return {
    data,
    sampleIndex: safeIdx,
    ephemerisSample: ep,
  };
}

export async function evaluateDropCoordinates(lat, lon, sampleIndex = DEFAULT_SAMPLE_INDEX) {
  const clampedLat = Math.max(-90, Math.min(90, Number(lat)));
  const normLon = ((((Number(lon) + 180) % 360) + 360) % 360) - 180;
  const query = `/api/map/evaluate?lat=${encodeURIComponent(clampedLat.toFixed(4))}&lon=${encodeURIComponent(normLon.toFixed(4))}&sample=${encodeURIComponent(sampleIndex)}`;
  return await fetchApiWithFallback(query);
}

export function formatCoordinates(lat, lon) {
  const nLat = Number(lat) || 0;
  const nLon = Number(lon) || 0;
  const latStr = `${Math.abs(nLat).toFixed(2)}° ${nLat >= 0 ? "N" : "S"}`;
  const lonStr = `${Math.abs(nLon).toFixed(2)}° ${nLon >= 0 ? "E" : "W"}`;
  return `${latStr}, ${lonStr}`;
}

/** Remove duplicate trailing coordinate parentheticals from custom/landmark names so titles fit cleanly. */
export function formatDropDisplayTitle(drop, loading = false) {
  if (!drop?.name) {
    return loading ? "Sampling Lunar Point..." : "Selected Drop Point";
  }
  if (drop.matchedKnownSite) {
    return drop.name;
  }
  // e.g. "Custom Drop Point (13.52N, 124.49E)" or "Tycho Crater (43.31S, 11.36W)"
  return String(drop.name)
    .replace(/\s*\(\d+(?:\.\d+)?[NS],\s*\d+(?:\.\d+)?[EW]\)\s*$/i, "")
    .trim() || "Custom Drop Point";
}

function formatIsoDatePlain(isoStr, short = false) {
  if (!isoStr) return "";
  const parts = String(isoStr).split("-");
  if (parts.length !== 3) return String(isoStr);
  const yr = parts[0];
  const mIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const mName = (short ? SHORT_MONTHS : FULL_MONTHS)[mIdx];
  if (!mName || Number.isNaN(day)) return String(isoStr);
  return short ? `${mName} ${yr}` : `${mName} ${day}, ${yr}`;
}

function formatMissionWhenPlain(m) {
  if (!m) return "";
  if (m.status === "LANDED" && m.landed) return `Landed ${formatIsoDatePlain(m.landed)}`;
  if (m.status === "NO_LANDING") {
    return m.launched
      ? `Launched ${formatIsoDatePlain(m.launched)} (Did not land)`
      : `${m.year} (Did not land)`;
  }
  return `Planned ${m.year}`;
}

export function getSiteMissions(siteId, missions = []) {
  const canon = normalizeSiteId(siteId);
  if (!canon) return [];
  return (missions || []).filter((m) => normalizeSiteId(m.siteId) === canon);
}

export function getPrimarySiteStatus(siteId, missions = []) {
  const siteMissions = getSiteMissions(siteId, missions);
  if (siteMissions.some((m) => m.status === "LANDED")) return "LANDED";
  if (siteMissions.some((m) => m.status === "NO_LANDING")) return "NO_LANDING";
  return "PLANNED";
}

export function formatSiteShortSchedule(siteId, missions = []) {
  const siteMissions = getSiteMissions(siteId, missions);
  if (!siteMissions.length) return "NASA Candidate Site";
  const parts = siteMissions.map((m) => {
    if (m.status === "LANDED" && m.landed) return `Landed ${formatIsoDatePlain(m.landed, true)}`;
    if (m.status === "NO_LANDING") return `Missed ${m.year}`;
    return `Planned ${m.year}`;
  });
  const vendors = [...new Set(siteMissions.map((m) => m.vendor))].join(" / ");
  return `${parts.join(" · ")} (${vendors})`;
}

export function extractDropSiteContext(drop, dataset) {
  if (!drop) return null;
  const activeDataset = dataset || getInitialDataset();
  const sites = activeDataset?.sites || [];
  const missions = activeDataset?.missions || [];
  const regionLabel = String(drop.region || "NEAR_SIDE").replace(/_/g, " ");

  const matchedSite =
    drop.matchedKnownSite && drop.nearestSiteId
      ? sites.find((s) => normalizeSiteId(s.id) === normalizeSiteId(drop.nearestSiteId))
      : drop.matchedKnownSite && drop.id
        ? sites.find((s) => normalizeSiteId(s.id) === normalizeSiteId(drop.id))
        : null;

  if (matchedSite) {
    const siteMissions = getSiteMissions(matchedSite.id, missions);
    const status = getPrimarySiteStatus(matchedSite.id, missions);
    const landed = siteMissions.filter((m) => m.status === "LANDED");
    const missed = siteMissions.filter((m) => m.status === "NO_LANDING");
    const planned = siteMissions.filter((m) => m.status === "PLANNED");

    const scheduleParts = [];
    if (landed.length) {
      scheduleParts.push(
        `Landed: ${landed.map((m) => `${m.name} (${formatIsoDatePlain(m.landed, true)})`).join(", ")}`
      );
    }
    if (missed.length) {
      scheduleParts.push(
        `Attempted: ${missed.map((m) => `${m.name} (${m.year} — did not land)`).join(", ")}`
      );
    }
    if (planned.length) {
      scheduleParts.push(
        `Planned: ${planned.map((m) => `${m.name} (${m.year})`).join(", ")}`
      );
    }

    return {
      isOfficialSite: true,
      regionLabel,
      siteStatus: status,
      statusBadge:
        status === "LANDED"
          ? "CLPS · LANDED"
          : status === "NO_LANDING"
            ? "CLPS · MISSED"
            : "CLPS · PLANNED",
      kicker: "Official NASA CLPS / Artemis Site",
      scheduleSummary:
        scheduleParts.join(" · ") || `${matchedSite.name} is an official NASA candidate site.`,
      missions: siteMissions.map((m) => ({
        id: m.id,
        name: m.name,
        vendor: m.vendor,
        taskOrder: m.taskOrder,
        when: formatMissionWhenPlain(m),
        note: m.note,
      })),
      terrainSummary: matchedSite.terrainSummary || drop.terrainSummary,
      scienceGoal: matchedSite.scienceGoal || "",
      nearestPsr:
        matchedSite.nearestPsrName && matchedSite.nearestPsrKm != null
          ? `${matchedSite.nearestPsrName} (${Number(matchedSite.nearestPsrKm).toFixed(1)} km)`
          : null,
      primaryNote: siteMissions[0]?.note || "",
    };
  }

  const closestDist =
    drop.nearestSiteKm != null ? `${Math.round(Number(drop.nearestSiteKm)).toLocaleString()} km` : "";
  const closestSched = drop.nearestSiteId
    ? formatSiteShortSchedule(drop.nearestSiteId, missions)
    : "";

  return {
    isOfficialSite: false,
    regionLabel,
    siteStatus: "CUSTOM",
    statusBadge: `CUSTOM · ${regionLabel}`,
    kicker: "Custom Moon Drop Coordinates",
    scheduleSummary: drop.nearestSiteName
      ? `Closest NASA site: ${drop.nearestSiteName}${closestDist ? ` (${closestDist} away` : ""}${closestSched ? ` · ${closestSched})` : closestDist ? ")" : ""}`
      : "Custom lunar coordinates outside scheduled NASA CLPS landing ellipses.",
    missions: [],
    terrainSummary: drop.terrainSummary || "",
    scienceGoal: "",
    nearestPsr:
      drop.nearestPsrName && drop.nearestPsrKm != null
        ? `${drop.nearestPsrName} (${Number(drop.nearestPsrKm).toFixed(1)} km)`
        : null,
    primaryNote: Array.isArray(drop.warnings) && drop.warnings.length > 0 ? drop.warnings[0] : "",
  };
}

export function extractDropMetrics(drop) {
  const cur = drop?.sky?.current || {};
  const win = drop?.sky?.windows || {};

  const sunPct =
    win.computedSunlitTerrainPct != null
      ? `${Math.round(Number(win.computedSunlitTerrainPct))}%`
      : "—";
  const sunlightState = cur.sunlit ? "Sunlit" : "Shadow";
  const sunlightPower =
    cur.panelPowerPct != null ? `${Math.round(Number(cur.panelPowerPct))}% pwr` : "";

  const tempNow =
    cur.surfaceTempK != null ? `${Math.round(Number(cur.surfaceTempK))} K` : "—";
  const tempRange =
    drop?.divinerMinTempK != null && drop?.divinerMaxTempK != null
      ? `${Math.round(drop.divinerMinTempK)}–${Math.round(drop.divinerMaxTempK)} K range`
      : "Diviner surface model";

  const slopeStr =
    drop?.slopeDegrees != null ? `${Number(drop.slopeDegrees).toFixed(1)}° slope` : "—";
  const elevMeters = Number(drop?.elevationMeters);
  const elevStr = Number.isFinite(elevMeters)
    ? `${elevMeters >= 0 ? "+" : ""}${Math.round(elevMeters).toLocaleString()} m elev`
    : "LOLA relief";

  const dtePct =
    win.dteCoveragePct != null ? `${Math.round(Number(win.dteCoveragePct))}%` : "—";
  const signalState = cur.earthVisible ? "Direct Earth" : "Relay Needed";

  return {
    sunlight: {
      label: "Sunlight",
      value: `${sunlightState} · ${sunPct}`,
      sub: sunlightPower || `${sunPct} terrain lit`,
      good: Boolean(cur.sunlit) || Number(win.computedSunlitTerrainPct) >= 55,
    },
    temperature: {
      label: "Temperature",
      value: tempNow,
      sub: tempRange,
      good: Number(cur.surfaceTempK) >= 110 && Number(cur.surfaceTempK) <= 340,
    },
    ground: {
      label: "Ground",
      value: slopeStr,
      sub: elevStr,
      good: Number(drop?.slopeDegrees) < 10,
    },
    earthSignal: {
      label: "Earth Signal",
      value: `${signalState} · ${dtePct}`,
      sub: cur.earthVisible ? "Line-of-sight OK" : "No direct LOS",
      good: Boolean(cur.earthVisible) && Number(win.dteCoveragePct) >= 50,
    },
  };
}

export function buildSelectedDropPayload(drop) {
  const metrics = extractDropMetrics(drop);
  return {
    id: drop.id,
    name: drop.name,
    displayName: formatDropDisplayTitle(drop),
    lat: Number(drop.lat),
    lon: Number(drop.lon),
    region: drop.region,
    matchedKnownSite: Boolean(drop.matchedKnownSite),
    custom: !drop.matchedKnownSite,
    nearestSiteId: drop.nearestSiteId || null,
    nearestSiteName: drop.nearestSiteName || null,
    slopeDegrees: drop.slopeDegrees,
    elevationMeters: drop.elevationMeters,
    divinerMinTempK: drop.divinerMinTempK,
    divinerMaxTempK: drop.divinerMaxTempK,
    decayMultipliers: drop.decayMultipliers || null,
    careMultipliers: drop.careMultipliers || null,
    scores: drop.scores || null,
    sky: drop.sky || null,
    metrics,
    confirmedAt: new Date().toISOString(),
  };
}

export function persistDropSelection(payload) {
  try {
    localStorage.setItem("payloadPets.selectedDrop", JSON.stringify(payload));
    const siteId = payload.matchedKnownSite
      ? normalizeSiteId(payload.id)
      : payload.nearestSiteId
        ? normalizeSiteId(payload.nearestSiteId)
        : "SHACKLETON_RIM";
    localStorage.setItem("payloadPets.selectedSite", siteId);
  } catch {
    // Ignore storage quota errors in restricted frames.
  }

  try {
    const params = new URLSearchParams(window.location.search);
    params.set("lat", payload.lat.toFixed(4));
    params.set("lon", payload.lon.toFixed(4));
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  } catch {
    // Ignore history state restrictions.
  }

  try {
    window.dispatchEvent(new CustomEvent("payloadpets:drop-selected", { detail: payload }));
  } catch {
    // Ignore event dispatch failure.
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: "payloadpets:drop-selected", drop: payload },
        "*"
      );
    }
  } catch {
    // Ignore cross-origin parent frame restrictions.
  }

  return payload;
}

export { LunarGlobeGL };
