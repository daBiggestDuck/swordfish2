// Placeholder data so the engine can be built and tested before the data
// branch lands. Real sites and missions come from the data branch and
// should follow the same shape.

export const SAMPLE_SITES = [
  {
    id: 'shackleton-rim',
    name: 'Shackleton Crater Rim',
    // Near-constant sunlight on the rim, so power drains slowly.
    decayMultipliers: { power: 0.6 },
  },
  {
    id: 'shackleton-psr',
    name: 'Shackleton Shadowed Floor',
    // Permanently shadowed and very cold: heaters eat power.
    decayMultipliers: { power: 1.8, happiness: 1.2 },
  },
];

export const SAMPLE_MISSIONS = [
  {
    id: 'ice-survey',
    name: 'Water Ice Survey',
    siteId: 'shackleton-psr',
    duration: 60,
    requires: { power: 40, oxygen: 30 },
    cost: { power: -20, oxygen: -10 },
    reward: { happiness: +25, food: +10 },
  },
  {
    id: 'solar-check',
    name: 'Solar Panel Check',
    siteId: 'shackleton-rim',
    duration: 30,
    requires: { oxygen: 20 },
    cost: { oxygen: -8 },
    reward: { power: +30, happiness: +10 },
  },
];
