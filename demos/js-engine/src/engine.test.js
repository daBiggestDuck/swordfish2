import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PETS,
  RULES,
  SITES,
  SOURCES,
  advance,
  createRun,
  lookAhead,
  play,
  suggestAction,
} from "./engine.js";
import { logLine } from "./ui.js";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

function runOf(petId = "lister", siteId = "mare-crisium") {
  return createRun({ petId, siteId });
}

test("rejects unknown instruments, sites, and actions", () => {
  assert.throws(() => createRun({ petId: "viper", siteId: "mare-crisium" }), /Unknown instrument: viper/);
  assert.throws(() => createRun({ petId: "lister", siteId: "shackleton" }), /Unknown landing site: shackleton/);
  assert.throws(() => createRun({}), /Unknown instrument: blank/);
  assert.throws(() => createRun({ petId: 4, siteId: "mare-crisium" }), /Unknown instrument/);
  const huge = "z".repeat(80);
  let message = "";
  try {
    createRun({ petId: huge, siteId: "mare-crisium" });
  } catch (err) {
    message = err.message;
  }
  assert.match(message, /Unknown instrument/);
  assert.equal(message.includes("z".repeat(40)), true);
  assert.equal(message.includes("z".repeat(41)), false);
  const state = runOf();
  assert.throws(() => advance(state, []), /Action must be an object/);
  assert.throws(() => advance(state, { panel: Number.NaN }), /0 to 1/);
  assert.throws(() => advance(state, { panel: -0.001 }), /0 to 1/);
  assert.throws(() => advance(state, { panel: 1.001 }), /0 to 1/);
  assert.throws(() => advance(state, { heater: "true" }), /Heater must be true or false/);
  assert.throws(() => advance(state, { wait: 1 }), /Wait must be true or false/);
  assert.throws(() => play(state, "tilt"), /Policy must be a function/);
  assert.throws(() => advance(null, {}), /not a run/);
  for (const key of ["power", "warmth", "signal"]) {
    const label = key[0].toUpperCase() + key.slice(1);
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      assert.throws(() => advance({ ...state, [key]: value }), new RegExp(`${label} must be a finite number`));
    }
  }
});

test("defaults and boundaries", () => {
  const omitted = advance(runOf());
  const explicit = advance(runOf(), { panel: 1, heater: false, wait: false });
  assert.equal(omitted.power, explicit.power);
  assert.equal(omitted.warmth, explicit.warmth);
  assert.equal(omitted.signal, explicit.signal);
  const partial = advance(runOf(), { wait: true });
  const full = advance(runOf(), { panel: 1, heater: false, wait: true });
  assert.equal(partial.power, full.power);
  assert.equal(partial.signal, full.signal);
  assert.equal(advance(runOf(), { panel: 0, heater: false, wait: false }).panel, 0);
  assert.equal(advance(runOf(), { panel: 1, heater: false, wait: false }).panel, 1);
});

test("a step does not mutate the previous state", () => {
  const state = runOf();
  const before = JSON.stringify(state);
  const next = advance(state, { panel: 0, heater: true, wait: true });
  assert.equal(JSON.stringify(state), before);
  assert.equal(Object.isFrozen(next), true);
  assert.throws(() => {
    next.power = 1;
  }, TypeError);
  assert.notEqual(next.power, state.power);
});

test("day 1 at Mare Crisium matches the published balance", () => {
  const next = advance(runOf(), { panel: 1, heater: false, wait: true });
  assert.equal(next.day, 1);
  assert.equal(next.night, 0);
  assert.equal(next.phase, "day");
  assert.equal(next.sun, 0.112);
  assert.equal(next.power, 62);
  assert.equal(next.warmth, 58);
  assert.equal(next.signal, 73);
  assert.equal(next.status, "steady");
  assert.equal(next.books.powerDraw, RULES.listerDraw);
  assert.equal(next.books.powerApplied, next.power - RULES.startPower);
  assert.equal(next.books.warmthApplied, next.warmth - RULES.startWarmth);
  assert.equal(next.books.signalApplied, next.signal - RULES.startSignal);
  assert.ok(Math.abs(next.books.solarGain - next.sun * RULES.solar) < 0.001);
  assert.ok(next.signal > RULES.startSignal);
});

test("waiting raises signal and idling lowers it", () => {
  const waited = advance(runOf(), { panel: 1, heater: false, wait: true });
  const idled = advance(runOf(), { panel: 1, heater: false, wait: false });
  assert.ok(waited.signal > RULES.startSignal);
  assert.ok(idled.signal < RULES.startSignal);
  const malapert = advance(runOf("lister", "malapert-a"), { panel: 1, heater: false, wait: true });
  assert.ok(malapert.signal > RULES.startSignal);
  assert.ok(malapert.signal < waited.signal);
});

test("Reiner Gamma has the same sun and less power than Mare Crisium", () => {
  const action = { panel: 1, heater: false, wait: false };
  const mare = advance(runOf(), action);
  const reiner = advance(runOf("lister", "reiner-gamma"), action);
  assert.equal(mare.sun, reiner.sun);
  assert.equal(reiner.dust, RULES.reinerDust);
  assert.ok(reiner.power < mare.power);
});

function sunOn(siteId, day) {
  let state = runOf("retro", siteId);
  while (state.phase === "ready" || state.day < day) {
    state = advance(state, { panel: 1, heater: false, wait: false });
  }
  return state.sun;
}

test("site sun curves stay in the shapes the page describes", () => {
  assert.ok(sunOn("mare-crisium", 7) > sunOn("mare-crisium", 1));
  assert.ok(sunOn("mare-crisium", 7) > sunOn("malapert-a", 7));
  assert.equal(sunOn("mare-crisium", 7), sunOn("reiner-gamma", 7));
  const monsDawn = sunOn("mons-mouton", 1);
  const monsNoon = sunOn("mons-mouton", 7);
  assert.ok(monsDawn > 0.55);
  assert.ok(monsNoon < 0.85);
  assert.ok(monsNoon > monsDawn);
});

test("the suggestion keeps a tracking drill alive at Mare Crisium and Mons Mouton", () => {
  const mare = play(runOf());
  const mons = play(runOf("lister", "mons-mouton"));
  for (const trace of [mare, mons]) {
    assert.equal(trace.filter((step) => step.phase === "day").length, RULES.daylightDays);
    assert.equal(trace.filter((step) => step.phase === "night").length, RULES.nightDays);
    assert.equal(trace.at(-1).alive, true);
    assert.equal(trace.at(-1).ended, true);
    assert.equal(trace.at(-1).night, 3);
    assert.ok(trace.every((step) => step.power >= 0 && step.power <= 100));
    assert.ok(trace.every((step) => step.warmth >= 0 && step.warmth <= 100));
    assert.ok(trace.every((step) => step.signal >= 0 && step.signal <= 100));
  }
  assert.ok(mons.at(-1).power > mare.at(-1).power);
  assert.equal(mare.find((step) => step.day === 13 && step.phase === "day").status, "shiver");
  assert.notEqual(mare.find((step) => step.day === 12 && step.phase === "day").status, "shiver");
  assert.equal(mare.find((step) => step.day === 8 && step.phase === "day").status, "happy");
  assert.equal(mare.find((step) => step.night === 1).status, "holding");
  assert.equal(mare.find((step) => step.night === 3).status, "dark");
  assert.throws(() => advance(mare.at(-1), {}), /already over/);
});

test("the suggestion also finishes Reiner Gamma and the brighter dust-shield sites", () => {
  const finished = [
    ["lister", "reiner-gamma"],
    ["eds", "mare-crisium"],
    ["eds", "mons-mouton"],
    ["eds", "reiner-gamma"],
  ];
  for (const [petId, siteId] of finished) {
    const last = play(runOf(petId, siteId)).at(-1);
    assert.equal(last.alive, true, `${petId} at ${siteId}`);
    assert.equal(last.ended, true, `${petId} at ${siteId}`);
    assert.equal(last.night, RULES.nightDays, `${petId} at ${siteId}`);
  }
});

test("hard sites and bad habits lose a powered pet", () => {
  const malapert = play(runOf("lister", "malapert-a"));
  assert.equal(malapert.at(-1).alive, false);
  assert.equal(malapert.at(-1).status, "lost");
  assert.ok(malapert.at(-1).causes.includes("power"));
  assert.ok(malapert.at(-1).day < RULES.daylightDays);
  assert.throws(() => advance(malapert.at(-1), { panel: 1, heater: true, wait: true }), /already lost/);

  const both = play(runOf("eds", "malapert-a"));
  assert.deepEqual(both.at(-1).causes, ["power", "warmth"]);

  const flat = play(runOf(), () => ({ panel: 0, heater: false, wait: false }));
  assert.equal(flat.at(-1).alive, false);
  assert.ok(flat.at(-1).causes.includes("power"));
  assert.ok(flat.at(-1).day < RULES.daylightDays);

  const alwaysHeat = play(runOf(), () => ({ panel: 1, heater: true, wait: true }));
  assert.equal(alwaysHeat.at(-1).alive, false);
  assert.ok(alwaysHeat.at(-1).causes.includes("power"));

  const neverHeat = play(runOf(), () => ({ panel: 1, heater: false, wait: true }));
  assert.equal(neverHeat.at(-1).alive, false);
  assert.ok(neverHeat.at(-1).causes.includes("warmth"));
});

test("a retroreflector ignores power and warmth and sleeps at night", () => {
  for (const site of SITES) {
    let state = runOf("retro", site.id);
    const trace = [];
    while (!state.ended) {
      const action = suggestAction(state);
      assert.equal(action.heater, false);
      assert.equal(action.panel, 1);
      const ahead = lookAhead(state);
      assert.equal(action.wait, state.signal < RULES.suggestSignal && ahead.earth > 0);
      state = advance(state, { panel: 0, heater: true, wait: action.wait });
      trace.push(state);
      assert.equal(state.power, RULES.startPower);
      assert.equal(state.warmth, RULES.startWarmth);
      assert.equal(state.heater, false);
      assert.deepEqual(state.ignored, ["heater"]);
      assert.equal(state.flags.lowPower, false);
      assert.equal(state.flags.lowWarmth, false);
    }
    assert.equal(trace.at(-1).status, "asleep");
    assert.equal(trace.at(-1).alive, true);
    assert.equal(trace.at(-1).ended, true);
    const sunset = trace.find((step) => step.day === 13 && step.phase === "day").status;
    if (site.id === "mons-mouton") assert.equal(sunset, "happy");
    else assert.equal(sunset, "shiver");
    assert.equal(play(trace.at(-1)).length, 0);
  }
});

test("an idle retroreflector can reach signal 0 and stay alive", () => {
  const trace = play(runOf("retro"), () => ({ panel: 1, heater: false, wait: false }));
  const quiet = trace.find((step) => step.signal === 0);
  assert.equal(quiet.alive, true);
  assert.equal(trace.at(-1).signal, 0);
  assert.equal(trace.at(-1).alive, true);
});

test("one cold night after the suggestion is chilly", () => {
  let state = runOf();
  while (state.night < 1) state = advance(state, suggestAction(state));
  state = advance(state, { panel: 1, heater: false, wait: false });
  assert.equal(state.status, "chilly");
});

test("a lost night is logged as night", () => {
  const lost = play(runOf(), () => ({ panel: 1, heater: false, wait: true })).at(-1);
  const day = advance(runOf());
  assert.equal(lost.phase, "lost");
  assert.equal(lost.night, 2);
  assert.equal(lost.day, 14);
  assert.equal(logLine(lost), `Night 2. lost. Power ${lost.power}, Warmth ${lost.warmth}, Signal ${lost.signal}.`);
  assert.equal(logLine(day), `Day ${day.day}. ${day.status}. Power ${day.power}, Warmth ${day.warmth}, Signal ${day.signal}.`);
});

test("a powered pet does not wait when Earth is below suggestEarth", () => {
  const drill = {
    ...runOf("lister", "malapert-a"),
    phase: "day",
    day: RULES.daylightDays,
    night: 0,
    signal: 40,
    power: 40,
    warmth: 50,
  };
  const ahead = lookAhead(drill);
  assert.equal(ahead.phase, "night");
  assert.ok(ahead.earth > 0);
  assert.ok(ahead.earth < RULES.suggestEarth);
  assert.equal(suggestAction(drill).wait, false);
  assert.equal(suggestAction(drill).heater, true);
});

test("the dust shield is lighter than the drill on the same site", () => {
  const action = { panel: 1, heater: false, wait: false };
  const drill = advance(runOf("lister", "mare-crisium"), action);
  const shield = advance(runOf("eds", "mare-crisium"), action);
  assert.ok(shield.power > drill.power);
  assert.equal(shield.books.powerDraw, RULES.edsDraw);
  assert.ok(RULES.edsDraw < RULES.listerDraw);
});

test("Triddy draws more than LISTER and finishes Mons Mouton cold, not asleep", () => {
  const action = { panel: 1, heater: false, wait: false };
  const lister = advance(runOf("lister", "mons-mouton"), action);
  const triddy = advance(runOf("trident", "mons-mouton"), action);
  assert.equal(triddy.books.powerDraw, RULES.tridentDraw);
  assert.ok(RULES.tridentDraw > RULES.listerDraw);
  assert.ok(triddy.power < lister.power);
  const pet = PETS.find((item) => item.id === "trident");
  assert.equal(pet.name, "Triddy");
  assert.equal(pet.needsPower, true);
  assert.equal(pet.preferWait, undefined);
  const trace = play(runOf("trident", "mons-mouton"));
  assert.equal(trace.at(-1).alive, true);
  assert.equal(trace.at(-1).ended, true);
  assert.equal(trace.at(-1).night, RULES.nightDays);
  const night = trace.find((step) => step.night === 1);
  assert.notEqual(night.status, "asleep");
  assert.ok(["holding", "chilly", "dark"].includes(night.status));
});

test("Nodey draws less than EDS and the tutor waits on weak Malapert Earth", () => {
  const action = { panel: 1, heater: false, wait: false };
  const shield = advance(runOf("eds", "mare-crisium"), action);
  const nodey = advance(runOf("ln-1", "mare-crisium"), action);
  assert.equal(nodey.books.powerDraw, RULES.ln1Draw);
  assert.ok(RULES.ln1Draw < RULES.edsDraw);
  assert.ok(nodey.power > shield.power);
  const pet = PETS.find((item) => item.id === "ln-1");
  assert.equal(pet.name, "Nodey");
  assert.equal(pet.needsPower, true);
  assert.equal(pet.preferWait, true);

  const beacon = {
    ...runOf("ln-1", "malapert-a"),
    phase: "day",
    day: RULES.daylightDays,
    night: 0,
    signal: 40,
    power: 40,
    warmth: 50,
  };
  const ahead = lookAhead(beacon);
  assert.equal(ahead.phase, "night");
  assert.ok(ahead.earth > 0);
  assert.ok(ahead.earth < RULES.suggestEarth);
  assert.equal(suggestAction(beacon).wait, true);
  assert.equal(suggestAction({ ...beacon, petId: "lister" }).wait, false);

  const lost = play(runOf("ln-1", "malapert-a"));
  assert.equal(lost.at(-1).alive, false);
  assert.ok(lost.at(-1).causes.includes("power"));
  const nightish = lost.find((step) => step.phase === "night" || step.status === "holding" || step.status === "chilly");
  if (nightish) assert.notEqual(nightish.status, "asleep");
});

test("look-ahead names the next day and is empty when the run is over", () => {
  const ahead = lookAhead(runOf());
  assert.equal(ahead.day, 1);
  assert.equal(ahead.phase, "day");
  assert.equal(ahead.sun, 0.112);
  const done = play(runOf("retro", "mare-crisium"));
  assert.equal(lookAhead(done.at(-1)), null);
});

test("copy and sources stay plain and on NASA hosts", () => {
  const hosts = new Set(["www.nasa.gov", "science.nasa.gov"]);
  for (const item of SOURCES) {
    const url = new URL(item.url);
    assert.equal(url.protocol, "https:");
    assert.ok(hosts.has(url.hostname), url.hostname);
  }
  const blobs = [
    ...PETS.flatMap((pet) => [pet.name, pet.kind, pet.summary, pet.passport].filter(Boolean)),
    ...SITES.flatMap((site) => [site.name, site.summary]),
  ];
  for (const text of blobs) assert.equal(text.includes("<"), false);
  assert.match(PETS.find((pet) => pet.id === "trident").passport, /MSOLO/);
  assert.match(PETS.find((pet) => pet.id === "ln-1").passport, /Malapert A/);
  const trace = play(runOf());
  for (const step of trace) assert.equal(step.note.includes("<"), false);
});

test("the README quotes the rules and the status order", () => {
  const ui = readFileSync(new URL("./ui.js", import.meta.url), "utf8");
  const warmth = "sun × sunWarm + heaterWarm − (warmthLeak + (1 − sun) × darkLeak + nightLeak)";
  assert.ok(readme.includes(warmth));
  assert.ok(ui.includes(warmth));
  assert.ok(readme.includes("The heater term is 0 when the heater is off."));
  assert.ok(ui.includes("The heater term is 0 when the heater is off."));
  assert.ok(ui.includes("A retroreflector skips warmth."));
  assert.ok(ui.includes('rel: "noopener noreferrer"'));
  for (const [key, value] of Object.entries(RULES)) {
    assert.ok(readme.includes(`${key} = ${value}`), `${key} = ${value}`);
  }
  for (const site of SITES) {
    assert.ok(readme.includes(`${site.name} earth day ${site.earthDay}`));
    assert.ok(readme.includes(`${site.name} earth night ${site.earthNight}`));
    assert.ok(readme.includes(`${site.name} dust ${site.dust}`));
  }
  const priority = ["lost", "asleep", "shiver", "dark", "holding", "chilly", "happy", "steady"];
  let from = 0;
  for (const name of priority) {
    const at = readme.indexOf(`\`${name}\``, from);
    assert.ok(at >= from, name);
    from = at + name.length;
  }
});
