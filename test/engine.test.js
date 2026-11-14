import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  tick,
  performAction,
  startMission,
  changeSite,
  getMood,
  missionProgress,
  config,
  SAMPLE_SITES,
  SAMPLE_MISSIONS,
} from '../src/engine/index.js';

const [rim, psr] = SAMPLE_SITES;
const [iceSurvey] = SAMPLE_MISSIONS;

test('new game starts with configured meters and is alive', () => {
  const g = createGame();
  assert.equal(g.alive, true);
  assert.equal(g.meters.oxygen, config.METERS.oxygen.start);
  assert.equal(g.health, 100);
});

test('tick drains meters and does not mutate input', () => {
  const g = createGame();
  const { state } = tick(g, 60);
  assert.equal(g.meters.oxygen, 100);
  assert.ok(Math.abs(state.meters.oxygen - 98) < 1e-9);
  assert.equal(state.time, 60);
});

test('site multipliers change decay', () => {
  const a = tick(createGame({ site: rim }), 60).state;
  const b = tick(createGame({ site: psr }), 60).state;
  assert.ok(a.meters.power > b.meters.power);
});

test('actions apply effects and cooldowns', () => {
  let g = tick(createGame(), 600).state;
  const before = g.meters.food;
  const r = performAction(g, 'feed');
  assert.equal(r.error, null);
  assert.ok(r.state.meters.food > before);
  assert.ok(performAction(r.state, 'feed').error);
  g = tick(r.state, config.ACTIONS.feed.cooldown).state;
  assert.equal(performAction(g, 'feed').error, null);
});

test('meters never leave 0–100', () => {
  const g = performAction(createGame(), 'refillOxygen').state;
  assert.equal(g.meters.oxygen, 100);
  const drained = tick(createGame(), 60 * 60 * 10).state;
  for (const v of Object.values(drained.meters)) assert.ok(v >= 0);
});

test('meterLow and meterCritical events fire once on crossing', () => {
  const { events } = tick(createGame(), 60 * 50);
  const lows = events.filter((e) => e.type === 'meterLow' && e.meter === 'oxygen');
  const crits = events.filter((e) => e.type === 'meterCritical' && e.meter === 'oxygen');
  assert.equal(lows.length, 1);
  assert.equal(crits.length, 1);
});

test('neglected pet faints and stops simulating', () => {
  const { state, events } = tick(createGame(), 60 * 60 * 3);
  assert.equal(state.alive, false);
  assert.equal(getMood(state), 'fainted');
  assert.equal(events.filter((e) => e.type === 'petFainted').length, 1);
  assert.ok(performAction(state, 'feed').error);
});

test('mission lifecycle: requirements, cost, progress, reward', () => {
  let g = createGame({ site: rim });
  assert.match(startMission(g, iceSurvey).error, /different site/);

  g = createGame({ site: psr });
  const started = startMission(g, iceSurvey);
  assert.equal(started.error, null);
  assert.equal(started.state.meters.power, 80);
  assert.equal(getMood(started.state), 'exploring');
  assert.ok(performAction(started.state, 'play').error);

  const half = tick(started.state, 30).state;
  assert.equal(missionProgress(half), 0.5);

  const { state, events } = tick(half, 30);
  assert.equal(state.mission, null);
  assert.deepEqual(state.completedMissions, ['ice-survey']);
  assert.ok(events.some((e) => e.type === 'missionComplete'));
});

test('mission requirements block a weak pet', () => {
  const g = tick(createGame({ site: psr }), 60 * 30).state;
  assert.match(startMission(g, iceSurvey).error, /Needs Power/);
});

test('cannot change site mid-mission', () => {
  const g = startMission(createGame({ site: psr }), iceSurvey).state;
  assert.ok(changeSite(g, rim).error);
});

test('mood reacts to meters', () => {
  const g = createGame();
  g.meters.food = 5;
  assert.equal(getMood(g), 'hungry');
  g.meters.food = 100;
  g.meters.happiness = 90;
  assert.equal(getMood(g), 'happy');
});
