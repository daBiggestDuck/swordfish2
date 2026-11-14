// Meter-balance report. Runs fully offline.
//   npm run balance
// Simulates each site twice: a neglected pet, and a simple "caretaker" bot
// that uses an action whenever a meter goes low. Edit src/engine/config.js
// and re-run to see how the numbers change.

import {
  createGame,
  tick,
  performAction,
  canPerformAction,
  config,
  SAMPLE_SITES,
} from '../src/engine/index.js';

const HOURS = 3;
const STEP = 5; // seconds per simulation step

// Which action fixes which meter.
const FIX = { oxygen: 'refillOxygen', power: 'recharge', food: 'feed', happiness: 'play' };

function run(site, caretaker) {
  let g = createGame({ site });
  let actions = 0;
  let lowestHealth = g.health;
  for (let t = 0; t < HOURS * 3600 && g.alive; t += STEP) {
    if (caretaker) {
      const lowMeter = config.METER_KEYS
        .filter((k) => g.meters[k] < config.THRESHOLDS.low + 10)
        .sort((a, b) => g.meters[a] - g.meters[b])[0];
      if (lowMeter && !canPerformAction(g, FIX[lowMeter])) {
        g = performAction(g, FIX[lowMeter]).state;
        actions++;
      }
    }
    g = tick(g, STEP).state;
    lowestHealth = Math.min(lowestHealth, g.health);
  }
  return { g, actions, lowestHealth };
}

const fmt = (s) => `${Math.floor(s / 60)}m`;

console.log(`Balance report (${HOURS}h simulated per run)\n`);
for (const site of SAMPLE_SITES) {
  const neglect = run(site, false);
  const care = run(site, true);
  console.log(site.name);
  console.log(`  Neglected:  ${neglect.g.alive ? `alive after ${HOURS}h` : `fainted at ${fmt(neglect.g.time)}`}`);
  console.log(
    `  Caretaker:  ${care.g.alive ? 'alive' : `fainted at ${fmt(care.g.time)}`}, ` +
      `${care.actions} actions (~1 every ${fmt((HOURS * 3600) / Math.max(1, care.actions))}), ` +
      `lowest health ${care.lowestHealth.toFixed(0)}`,
  );
  console.log();
}
