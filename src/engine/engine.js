// Game rules. Every function is pure: it takes a state and returns a new
// state plus a list of events. Nothing here touches the DOM, timers or
// storage, so the ui branch owns the game loop and the story branch can
// react to the events.

import {
  METERS,
  METER_KEYS,
  METER_MIN,
  METER_MAX,
  THRESHOLDS,
  HEALTH,
  ACTIONS,
  MOODS,
  DEFAULT_SITE,
} from './config.js';

// Large time jumps (e.g. a backgrounded tab) are simulated in steps of
// this size so threshold events and health damage stay accurate.
const MAX_STEP_SECONDS = 1;

const clamp = (n) => Math.min(METER_MAX, Math.max(METER_MIN, n));

/** 'ok' | 'low' | 'critical' for a meter value. */
export function meterLevel(value) {
  if (value < THRESHOLDS.critical) return 'critical';
  if (value < THRESHOLDS.low) return 'low';
  return 'ok';
}

/** First matching mood id from config.MOODS. */
export function getMood(state) {
  if (!state.alive) return 'fainted';
  return MOODS.find((m) => m.when(state)).id;
}

/** New game. `pet` is { name, species }, `site` follows the site shape in the README. */
export function createGame({ pet = { name: 'Pet', species: 'default' }, site = DEFAULT_SITE } = {}) {
  const meters = {};
  for (const key of METER_KEYS) meters[key] = METERS[key].start;
  return {
    time: 0,
    alive: true,
    pet: { ...pet },
    site: structuredClone(site),
    health: HEALTH.start,
    meters,
    mission: null,
    completedMissions: [],
    cooldowns: {},
  };
}

/** Advance the game by `dtSeconds`. Returns { state, events }. */
export function tick(state, dtSeconds) {
  let next = structuredClone(state);
  const events = [];
  if (!next.alive || dtSeconds <= 0) return { state: next, events };

  const moodBefore = getMood(next);
  let remaining = dtSeconds;
  while (remaining > 0 && next.alive) {
    const step = Math.min(remaining, MAX_STEP_SECONDS);
    step_(next, step, events);
    remaining -= step;
  }

  const moodAfter = getMood(next);
  if (moodAfter !== moodBefore) events.push({ type: 'moodChanged', from: moodBefore, to: moodAfter });
  return { state: next, events };
}

// Mutates `s` (already a clone) by one small step.
function step_(s, dt, events) {
  const minutes = dt / 60;
  s.time += dt;

  // Meter decay, scaled by the site.
  for (const key of METER_KEYS) {
    const mult = s.site.decayMultipliers?.[key] ?? 1;
    const before = s.meters[key];
    const after = clamp(before - METERS[key].decayPerMinute * mult * minutes);
    s.meters[key] = after;
    pushLevelEvent(events, key, before, after, s.time);
  }

  // Health.
  const criticalCount = METER_KEYS.filter((k) => meterLevel(s.meters[k]) === 'critical').length;
  const allOk = METER_KEYS.every((k) => meterLevel(s.meters[k]) === 'ok');
  if (criticalCount > 0) {
    s.health = clamp(s.health - HEALTH.damagePerMinutePerCriticalMeter * criticalCount * minutes);
  } else if (allOk) {
    s.health = clamp(s.health + HEALTH.regenPerMinute * minutes);
  }

  // Cooldowns.
  for (const [action, left] of Object.entries(s.cooldowns)) {
    const l = left - dt;
    if (l <= 0) delete s.cooldowns[action];
    else s.cooldowns[action] = l;
  }

  // Mission progress.
  if (s.mission) {
    s.mission.elapsed += dt;
    if (s.mission.elapsed >= s.mission.duration) completeMission(s, events);
  }

  if (s.health <= 0) {
    s.alive = false;
    s.mission = null;
    events.push({ type: 'petFainted', time: s.time });
  }
}

function pushLevelEvent(events, meter, before, after, time) {
  const a = meterLevel(before);
  const b = meterLevel(after);
  if (a === b) return;
  if (b === 'critical') events.push({ type: 'meterCritical', meter, time });
  else if (b === 'low' && a === 'ok') events.push({ type: 'meterLow', meter, time });
  else if (b === 'ok') events.push({ type: 'meterRecovered', meter, time });
}

function applyEffects(s, effects = {}, events) {
  for (const [key, delta] of Object.entries(effects)) {
    if (!(key in s.meters)) continue;
    const before = s.meters[key];
    s.meters[key] = clamp(before + delta);
    pushLevelEvent(events, key, before, s.meters[key], s.time);
  }
}

/** Why an action can't be done right now, or null if it can. */
export function canPerformAction(state, actionId) {
  if (!state.alive) return 'Pet has fainted';
  if (!ACTIONS[actionId]) return `Unknown action: ${actionId}`;
  if (state.mission) return 'Pet is on a mission';
  if (state.cooldowns[actionId]) return 'On cooldown';
  return null;
}

/** Feed, play, recharge... Returns { state, events, error }. */
export function performAction(state, actionId) {
  const error = canPerformAction(state, actionId);
  if (error) return { state, events: [], error };

  const s = structuredClone(state);
  const events = [];
  const moodBefore = getMood(s);
  const action = ACTIONS[actionId];
  applyEffects(s, action.effects, events);
  s.cooldowns[actionId] = action.cooldown;
  events.push({ type: 'actionPerformed', action: actionId, time: s.time });

  const moodAfter = getMood(s);
  if (moodAfter !== moodBefore) events.push({ type: 'moodChanged', from: moodBefore, to: moodAfter });
  return { state: s, events, error: null };
}

/** Why a mission can't start right now, or null if it can. */
export function canStartMission(state, mission) {
  if (!state.alive) return 'Pet has fainted';
  if (state.mission) return 'Already on a mission';
  if (mission.siteId && mission.siteId !== state.site.id) return 'Mission is at a different site';
  for (const [key, min] of Object.entries(mission.requires ?? {})) {
    if ((state.meters[key] ?? 0) < min) return `Needs ${METERS[key]?.label ?? key} ≥ ${min}`;
  }
  return null;
}

/** Start a mission (shape in README). Cost is paid up front. */
export function startMission(state, mission) {
  const error = canStartMission(state, mission);
  if (error) return { state, events: [], error };

  const s = structuredClone(state);
  const events = [];
  applyEffects(s, mission.cost, events);
  s.mission = {
    id: mission.id,
    name: mission.name,
    duration: mission.duration,
    reward: mission.reward ?? {},
    elapsed: 0,
  };
  events.push({ type: 'missionStarted', missionId: mission.id, time: s.time });
  return { state: s, events, error: null };
}

function completeMission(s, events) {
  const m = s.mission;
  applyEffects(s, m.reward, events);
  s.completedMissions.push(m.id);
  s.mission = null;
  events.push({ type: 'missionComplete', missionId: m.id, time: s.time });
}

/** Move the pet to another site. Not allowed mid-mission. */
export function changeSite(state, site) {
  if (!state.alive) return { state, events: [], error: 'Pet has fainted' };
  if (state.mission) return { state, events: [], error: 'Pet is on a mission' };
  const s = structuredClone(state);
  s.site = structuredClone(site);
  return { state: s, events: [{ type: 'siteChanged', siteId: site.id, time: s.time }], error: null };
}

// ---------- Saving ----------

export const SAVE_VERSION = 1;

/** State -> JSON string, for localStorage or a file. */
export function serialize(state) {
  return JSON.stringify({ version: SAVE_VERSION, state });
}

/**
 * JSON string -> state. Fills in any meters added to config since the save
 * was made. Throws on a save from a newer, unknown version.
 */
export function deserialize(json) {
  const { version, state } = JSON.parse(json);
  if (version !== SAVE_VERSION) throw new Error(`Unsupported save version: ${version}`);
  const fresh = createGame({ pet: state.pet, site: state.site });
  return {
    ...fresh,
    ...state,
    meters: { ...fresh.meters, ...state.meters },
    cooldowns: { ...state.cooldowns },
    completedMissions: [...(state.completedMissions ?? [])],
  };
}

// ---------- Data checks (for the data branch) ----------

/** List of problems with a site object; empty means valid. */
export function validateSite(site) {
  const problems = [];
  if (!site || typeof site !== 'object') return ['Site is not an object'];
  if (typeof site.id !== 'string' || !site.id) problems.push('id must be a non-empty string');
  if (typeof site.name !== 'string' || !site.name) problems.push('name must be a non-empty string');
  for (const [key, mult] of Object.entries(site.decayMultipliers ?? {})) {
    if (!METER_KEYS.includes(key)) problems.push(`decayMultipliers.${key} is not a meter`);
    else if (typeof mult !== 'number' || mult < 0) problems.push(`decayMultipliers.${key} must be a number ≥ 0`);
  }
  return problems;
}

/** List of problems with a mission object; empty means valid. */
export function validateMission(mission) {
  const problems = [];
  if (!mission || typeof mission !== 'object') return ['Mission is not an object'];
  if (typeof mission.id !== 'string' || !mission.id) problems.push('id must be a non-empty string');
  if (typeof mission.name !== 'string' || !mission.name) problems.push('name must be a non-empty string');
  if (typeof mission.duration !== 'number' || mission.duration <= 0) problems.push('duration must be a number > 0 (seconds)');
  for (const field of ['requires', 'cost', 'reward']) {
    for (const [key, n] of Object.entries(mission[field] ?? {})) {
      if (!METER_KEYS.includes(key)) problems.push(`${field}.${key} is not a meter`);
      else if (typeof n !== 'number') problems.push(`${field}.${key} must be a number`);
    }
  }
  return problems;
}

/** 0–1 progress of the current mission, or null. */
export function missionProgress(state) {
  if (!state.mission) return null;
  return Math.min(1, state.mission.elapsed / state.mission.duration);
}
