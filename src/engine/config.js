// All tunable numbers for the game live here.
// Balancing the game = editing this file. Rules live in engine.js.

export const METER_MIN = 0;
export const METER_MAX = 100;

// Each meter drains over time. `decayPerMinute` is the base drain before
// site modifiers are applied.
export const METERS = {
  oxygen: { label: 'Oxygen', start: 100, decayPerMinute: 2.0 },
  power: { label: 'Power', start: 100, decayPerMinute: 1.5 },
  food: { label: 'Food', start: 80, decayPerMinute: 1.0 },
  happiness: { label: 'Happiness', start: 70, decayPerMinute: 0.8 },
};

export const METER_KEYS = Object.keys(METERS);

// Below `low` a meter is a warning; below `critical` it hurts health.
export const THRESHOLDS = {
  low: 30,
  critical: 10,
};

// Health is not drained directly. It drops while any meter is critical
// and slowly recovers while every meter is above `low`.
export const HEALTH = {
  start: 100,
  damagePerMinutePerCriticalMeter: 5,
  regenPerMinute: 1,
};

// Player actions: instant meter changes plus a cooldown in seconds.
export const ACTIONS = {
  feed: { label: 'Feed', effects: { food: +25, happiness: +3 }, cooldown: 10 },
  play: { label: 'Play', effects: { happiness: +20, power: -5, oxygen: -3 }, cooldown: 15 },
  recharge: { label: 'Recharge', effects: { power: +30 }, cooldown: 20 },
  refillOxygen: { label: 'Refill O₂', effects: { oxygen: +35 }, cooldown: 20 },
  rest: { label: 'Rest', effects: { happiness: +5, power: +10 }, cooldown: 30 },
};

// Mood is worked out from the meters, in this order; the first match wins.
// The pets branch draws one art/animation per mood id.
export const MOODS = [
  { id: 'critical', when: (s) => s.health <= 25 },
  { id: 'suffocating', when: (s) => s.meters.oxygen < THRESHOLDS.critical },
  { id: 'hungry', when: (s) => s.meters.food < THRESHOLDS.low },
  { id: 'tired', when: (s) => s.meters.power < THRESHOLDS.low },
  { id: 'sad', when: (s) => s.meters.happiness < THRESHOLDS.low },
  { id: 'exploring', when: (s) => s.mission !== null },
  { id: 'happy', when: (s) => s.meters.happiness >= 75 },
  { id: 'content', when: () => true },
];

// Used when a site has no modifiers of its own.
export const DEFAULT_SITE = {
  id: 'default',
  name: 'Lunar Surface',
  decayMultipliers: {},
};
