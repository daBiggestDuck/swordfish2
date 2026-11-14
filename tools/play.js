// Play the engine in the terminal. Runs fully offline: no website, no network.
//   npm start
// The clock runs in real time (1 game second per real second). Type `wait 60`
// to skip ahead.

import readline from 'node:readline';
import {
  createGame,
  tick,
  performAction,
  startMission,
  changeSite,
  getMood,
  missionProgress,
  meterLevel,
  config,
  SAMPLE_SITES,
  SAMPLE_MISSIONS,
} from '../src/engine/index.js';

let game = createGame({ pet: { name: 'Luna', species: 'moon-cat' }, site: SAMPLE_SITES[0] });

const COLORS = { ok: '\x1b[32m', low: '\x1b[33m', critical: '\x1b[31m', reset: '\x1b[0m' };

function bar(value) {
  const filled = Math.round(value / 5);
  const color = COLORS[meterLevel(value)];
  return `${color}${'█'.repeat(filled)}${'░'.repeat(20 - filled)}${COLORS.reset} ${value.toFixed(0).padStart(3)}`;
}

function status() {
  const lines = [
    '',
    `${game.pet.name} at ${game.site.name}  |  time ${formatTime(game.time)}  |  mood: ${getMood(game)}`,
    `  Health     ${bar(game.health)}`,
  ];
  for (const key of config.METER_KEYS) lines.push(`  ${config.METERS[key].label.padEnd(10)} ${bar(game.meters[key])}`);
  if (game.mission) lines.push(`  Mission: ${game.mission.name} ${(missionProgress(game) * 100).toFixed(0)}%`);
  const cds = Object.entries(game.cooldowns).map(([a, s]) => `${a} ${s.toFixed(0)}s`);
  if (cds.length) lines.push(`  Cooldowns: ${cds.join(', ')}`);
  console.log(lines.join('\n'));
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;
}

function logEvents(events) {
  for (const e of events) {
    if (e.type === 'actionPerformed') continue;
    const detail = e.meter ?? e.missionId ?? e.siteId ?? (e.to ? `${e.from} → ${e.to}` : '');
    console.log(`  ⚑ ${e.type} ${detail}`);
  }
}

function apply(result) {
  if (result.error) return console.log(`  ✗ ${result.error}`);
  game = result.state;
  logEvents(result.events);
}

function help() {
  console.log(`
Commands:
  ${Object.keys(config.ACTIONS).join(', ')}
  missions           list missions
  mission <id>       start a mission
  sites              list sites
  site <id>          move to a site
  wait <seconds>     skip time forward
  status             show meters
  help, quit`);
}

function handle(line) {
  const [cmd, arg] = line.trim().split(/\s+/);
  if (!cmd) return status();
  if (config.ACTIONS[cmd]) apply(performAction(game, cmd));
  else if (cmd === 'missions') SAMPLE_MISSIONS.forEach((m) => console.log(`  ${m.id} (${m.name}) at ${m.siteId}, ${m.duration}s`));
  else if (cmd === 'mission') {
    const m = SAMPLE_MISSIONS.find((x) => x.id === arg);
    m ? apply(startMission(game, m)) : console.log('  ✗ Unknown mission. Type `missions`.');
  } else if (cmd === 'sites') SAMPLE_SITES.forEach((s) => console.log(`  ${s.id} (${s.name})`));
  else if (cmd === 'site') {
    const s = SAMPLE_SITES.find((x) => x.id === arg);
    s ? apply(changeSite(game, s)) : console.log('  ✗ Unknown site. Type `sites`.');
  } else if (cmd === 'wait') apply(tick(game, Number(arg) || 60));
  else if (cmd === 'status') {}
  else if (cmd === 'help') return help();
  else if (cmd === 'quit' || cmd === 'exit') return rl.close();
  else console.log('  ✗ Unknown command. Type `help`.');
  status();
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });

// Real-time clock: advance the game every second and print any events.
const timer = setInterval(() => {
  const r = tick(game, 1);
  game = r.state;
  if (r.events.length) {
    logEvents(r.events);
    rl.prompt(true);
  }
  if (!game.alive) {
    status();
    console.log(`\n${game.pet.name} fainted. Game over.`);
    rl.close();
  }
}, 1000);

rl.on('line', (line) => {
  handle(line);
  if (game.alive) rl.prompt();
});
rl.on('close', () => {
  clearInterval(timer);
  process.exit(0);
});

console.log('NASA Space Pet: engine playground (offline). Type `help`.');
status();
rl.prompt();
