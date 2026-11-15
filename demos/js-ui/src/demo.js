/**
 * Intro and demo-layout state for one sped-up lunar day.
 *
 * The clock only drives this screen: which phase is showing, how high the
 * sun sits, and whether the intro, the demo, or the end banner is up.
 * It does not score power, warmth, or signal. Those rules belong to the
 * engine branch. Site blurbs here are stage labels, not the data catalog.
 *
 * A lunar day is about 14 Earth days. The demo plays that whole day in
 * `durationMs` of real time.
 */

export const LUNAR_DAY_EARTH_DAYS = 14;
export const DEFAULT_DURATION_MS = 28_000;
export const MIN_DURATION_MS = 1_000;
export const MAX_DURATION_MS = 180_000;

const INVISIBLE =
  /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF]/g;

export const SITES = Object.freeze([
  Object.freeze({
    id: "mare-crisium",
    name: "Mare Crisium",
    line: "Near side. A long, ordinary lunar day.",
  }),
  Object.freeze({
    id: "malapert-a",
    name: "Malapert A",
    line: "South pole. Low sun and long shadows.",
  }),
  Object.freeze({
    id: "mons-mouton",
    name: "Mons Mouton",
    line: "Polar ridge. Light grazes the high ground.",
  }),
  Object.freeze({
    id: "reiner-gamma",
    name: "Reiner Gamma",
    line: "Near-side swirl. Day and night still trade places.",
  }),
]);

export const INSTRUMENTS = Object.freeze([
  Object.freeze({
    id: "heat-flow-drill",
    name: "Heat-flow drill",
    line: "A drill that needs a long, quiet day in the ground.",
  }),
  Object.freeze({
    id: "laser-retroreflector",
    name: "Laser retroreflector",
    line: "It reflects light from Earth and needs no power of its own.",
  }),
  Object.freeze({
    id: "dust-shield",
    name: "Dust shield",
    line: "It stands between the lander and kicked-up lunar dust.",
  }),
  Object.freeze({
    id: "trident",
    name: "Triddy",
    line: "TRIDENT ice-drill pup. Tried to pull about a meter of regolith and sniff for water ice with MSOLO.",
  }),
  Object.freeze({
    id: "ln-1",
    name: "Nodey",
    line: "LN-1 radio-beacon moth. Broadcast ranging so later vehicles could find the lander at Malapert A.",
  }),
]);

export const PHASES = Object.freeze([
  Object.freeze({ id: "dawn", start: 0, end: 0.15, label: "Dawn" }),
  Object.freeze({ id: "day", start: 0.15, end: 0.62, label: "Day" }),
  Object.freeze({ id: "dusk", start: 0.62, end: 0.78, label: "Dusk" }),
  Object.freeze({ id: "night", start: 0.78, end: 1, label: "Night" }),
]);

const NOON = 0.385;

export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function clampDurationMs(value) {
  if (typeof value === "string" && value.trim() === "") return DEFAULT_DURATION_MS;
  if (value == null || value === "") return DEFAULT_DURATION_MS;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return DEFAULT_DURATION_MS;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, n));
}

export function phaseAt(progress) {
  const p = clamp01(progress);
  if (p >= 1) return PHASES[PHASES.length - 1];
  for (const phase of PHASES) {
    if (p >= phase.start && p < phase.end) return phase;
  }
  return PHASES[PHASES.length - 1];
}

/** 0 at dawn and deep night, 1 at local noon. Layout preview only. */
export function sunlightPreview(progress) {
  const p = clamp01(progress);
  const distance = Math.abs(p - NOON);
  return clamp01(1 - distance / NOON);
}

export function earthDayLabel(progress) {
  const day = clamp01(progress) * LUNAR_DAY_EARTH_DAYS;
  const shown = (Math.round(day * 10) / 10).toFixed(1);
  return `Earth day ${shown} of ${LUNAR_DAY_EARTH_DAYS}`;
}

function cleanDisplay(raw) {
  return String(raw ?? "")
    .replace(INVISIBLE, "")
    .trim()
    .slice(0, 48);
}

function normalizeKey(raw) {
  return cleanDisplay(raw)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function resolveChoice(raw, catalog, noun) {
  const cleaned = cleanDisplay(raw);
  if (raw == null || cleaned === "") {
    return { choice: catalog[0], notice: null };
  }
  const key = normalizeKey(cleaned);
  const found = catalog.find(
    (item) => normalizeKey(item.id) === key || normalizeKey(item.name) === key,
  );
  if (!found) {
    return {
      choice: catalog[0],
      notice: `No demo ${noun} matches “${cleaned}”. Showing ${catalog[0].name}.`,
    };
  }
  return { choice: found, notice: null };
}

export function resolveSite(raw) {
  const result = resolveChoice(raw, SITES, "site");
  return { site: result.choice, notice: result.notice };
}

export function resolveInstrument(raw) {
  const result = resolveChoice(raw, INSTRUMENTS, "instrument");
  return { instrument: result.choice, notice: result.notice };
}

function asChoice(value, resolve, noun) {
  if (value == null || value === "") {
    const result = resolve(null);
    return { choice: result[noun], notice: null };
  }
  const raw = typeof value === "object" && value.id ? value.id : value;
  const result = resolve(raw);
  return { choice: result[noun], notice: result.notice };
}

function parseFlag(raw) {
  if (raw == null) return false;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function durationFromQuery(raw) {
  if (raw == null) return DEFAULT_DURATION_MS;
  const text = String(raw).trim();
  if (text === "") return DEFAULT_DURATION_MS;
  const seconds = Number(text);
  if (!Number.isFinite(seconds)) return DEFAULT_DURATION_MS;
  // Clamp in seconds first. 1e306 * 1000 is Infinity and would miss the max.
  const clampedSeconds = Math.min(
    MAX_DURATION_MS / 1000,
    Math.max(MIN_DURATION_MS / 1000, seconds),
  );
  return clampDurationMs(clampedSeconds * 1000);
}

export function readLaunchOptions(search = "") {
  const text = String(search ?? "");
  const query = text.startsWith("?") ? text.slice(1) : text;
  const params = new URLSearchParams(query);
  const site = resolveSite(params.has("site") ? params.get("site") : null);
  const instrument = resolveInstrument(
    params.has("instrument") ? params.get("instrument") : null,
  );
  return {
    site: site.site,
    siteNotice: site.notice,
    instrument: instrument.instrument,
    instrumentNotice: instrument.notice,
    skipIntro: parseFlag(params.get("skipIntro")),
    durationMs: durationFromQuery(params.get("duration")),
  };
}

export function createSession(launch = {}) {
  const durationMs = clampDurationMs(launch.durationMs);
  const initialSite = asChoice(launch.site, resolveSite, "site");
  const initialInstrument = asChoice(
    launch.instrument,
    resolveInstrument,
    "instrument",
  );
  let status = launch.skipIntro ? "playing" : "intro";
  let progress = 0;
  let site = initialSite.choice;
  let instrument = initialInstrument.choice;
  let siteNotice = launch.siteNotice ?? initialSite.notice;
  let instrumentNotice = launch.instrumentNotice ?? initialInstrument.notice;

  function snapshot() {
    return {
      status,
      progress,
      phase: phaseAt(progress),
      sunlight: sunlightPreview(progress),
      dayLabel: earthDayLabel(progress),
      site,
      instrument,
      siteNotice,
      instrumentNotice,
      durationMs,
    };
  }

  function applySelection(kind, raw) {
    const cleaned = cleanDisplay(raw);
    if (raw == null || cleaned === "") {
      const article = kind === "instrument" ? "an" : "a";
      const notice = `Pick ${article} ${kind} from the list.`;
      if (kind === "site") siteNotice = notice;
      else instrumentNotice = notice;
      return snapshot();
    }
    const resolved =
      kind === "site" ? resolveSite(cleaned) : resolveInstrument(cleaned);
    if (kind === "site") {
      site = resolved.site;
      siteNotice = resolved.notice;
    } else {
      instrument = resolved.instrument;
      instrumentNotice = resolved.notice;
    }
    return snapshot();
  }

  return {
    snapshot,
    start() {
      if (status === "paused" || status === "playing") return snapshot();
      if (status === "ended") progress = 0;
      status = "playing";
      return snapshot();
    },
    pause() {
      if (status === "playing") status = "paused";
      return snapshot();
    },
    resume() {
      if (status === "paused") status = "playing";
      return snapshot();
    },
    toggleRun() {
      if (status === "playing") status = "paused";
      else if (status === "paused") status = "playing";
      else {
        if (status === "ended") progress = 0;
        status = "playing";
      }
      return snapshot();
    },
    replay() {
      progress = 0;
      status = "playing";
      return snapshot();
    },
    showIntro() {
      progress = 0;
      status = "intro";
      return snapshot();
    },
    selectSite(raw) {
      return applySelection("site", raw);
    },
    selectInstrument(raw) {
      return applySelection("instrument", raw);
    },
    tick(deltaMs) {
      if (status !== "playing") return snapshot();
      const delta = Number(deltaMs);
      if (!Number.isFinite(delta) || delta <= 0) return snapshot();
      progress = Math.min(1, progress + delta / durationMs);
      if (progress >= 1) {
        progress = 1;
        status = "ended";
      }
      return snapshot();
    },
  };
}
