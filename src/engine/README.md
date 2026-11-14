# Engine

Game rules and meter balance. Owner: Aku (`engine` branch).

- `config.js` holds every tunable number: meters, decay, thresholds, actions and moods. Balance the game here.
- `engine.js` holds the rules. Every function is pure: you pass in a state and get back `{ state, events, error }`. The engine has no timers and doesn't touch the DOM.
- `samples.js` has placeholder sites and missions until the `data` branch lands.

## Running it (offline, no website)

Everything runs locally with Node. There are no dependencies and no network calls.

| Command | What it does |
|---|---|
| `npm start` | Play the pet in the terminal: `feed`, `play`, `mission ice-survey`, `wait 60`, `help` |
| `npm run balance` | Simulates every site for 3 hours and reports when a neglected pet faints and how often a player has to act. Re-run after editing `config.js` |
| `npm test` | Runs the engine tests |

## Using it (ui branch)

```js
import { createGame, tick, performAction, getMood } from './src/engine/index.js';

let game = createGame({ pet: { name: 'Luna', species: 'rover-cat' }, site });
let last = performance.now();

function loop(now) {
  const { state, events } = tick(game, (now - last) / 1000);
  game = state; last = now;
  handle(events);            // story / pets react here
  render(game, getMood(game));
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// On a button press:
const r = performAction(game, 'feed');
if (r.error) showToast(r.error); else { game = r.state; handle(r.events); }
```

## State

```js
{
  time, alive, health,                 // seconds; health 0–100
  pet: { name, species },
  site: { id, name, decayMultipliers },
  meters: { oxygen, power, food, happiness },   // each 0–100
  mission: null | { id, name, duration, elapsed, reward },
  completedMissions: [missionId],
  cooldowns: { actionId: secondsLeft },
}
```

## Events (story and pets branches)

| type | extra fields |
|---|---|
| `meterLow` / `meterCritical` / `meterRecovered` | `meter` |
| `moodChanged` | `from`, `to` |
| `actionPerformed` | `action` |
| `missionStarted` / `missionComplete` | `missionId` |
| `siteChanged` | `siteId` |
| `petFainted` | none |

Every event also has `time`.

## Moods (pets branch)

`fainted`, `critical`, `suffocating`, `hungry`, `tired`, `sad`, `exploring`, `happy`, `content`. Each one needs art.

## Saving (ui branch)

```js
localStorage.setItem('save', serialize(game));
game = deserialize(localStorage.getItem('save'));
game = tick(game, secondsSinceLastVisit).state;   // catch up while away
```

## Data shapes (data branch)

Check your files with `validateSite(site)` / `validateMission(mission)`. Each returns a list of problems, and an empty list means the data is valid.


```js
// Site
{ id: 'shackleton-rim', name: 'Shackleton Crater Rim',
  decayMultipliers: { power: 0.6 } }        // 1 = normal, missing = 1

// Mission
{ id: 'ice-survey', name: 'Water Ice Survey', siteId: 'shackleton-psr',
  duration: 60,                              // seconds
  requires: { power: 40 },                   // minimum meters to start
  cost:     { power: -20 },                  // applied at start
  reward:   { happiness: +25 } }             // applied on completion
```
