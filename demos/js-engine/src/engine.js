/**
 * Game rules and meter balance for one sped-up lunar day.
 *
 * A run is 14 Earth days of daylight, then a 3-day night coda. Each call to
 * advance() is one Earth day. Power, Warmth, and Signal are integers from
 * 0 to 100. The three controls are panel tilt, the heater, and waiting for
 * the Earth link.
 *
 * The curves are playable stand-ins for the sites named on the planning
 * page. They are not a LOLA illumination product and they are not the
 * mission catalog (that catalog is the data branch).
 */

export const RULES = Object.freeze({
  daylightDays: 14,
  nightDays: 3,
  startPower: 86,
  startWarmth: 78,
  startSignal: 42,
  solar: 54,
  panelFloor: 0.22,
  nightBus: 6,
  heaterPower: 14,
  sunWarm: 22,
  heaterWarm: 30,
  warmthLeak: 8,
  darkLeak: 16,
  nightLeak: 11,
  waitGain: 40,
  waitOverhead: 6,
  idleDrop: 14,
  sunsetDay: 12,
  sunsetSun: 0.4,
  happySun: 0.5,
  happyPower: 50,
  happyWarmth: 50,
  darkPower: 15,
  chillyWarmth: 28,
  holdingWarmth: 35,
  lowSignal: 30,
  listerDraw: 30,
  edsDraw: 20,
  tridentDraw: 34,
  ln1Draw: 18,
  reinerDust: 0.86,
  malapertPeak: 0.46,
  monsBase: 0.58,
  monsSwing: 0.2,
  suggestWarmth: 40,
  suggestPowerReserve: 18,
  suggestSignal: 85,
  suggestEarth: 0.3,
});

const CLPS = source(
  "NASA — Commercial Lunar Payload Services",
  "https://www.nasa.gov/commercial-lunar-payload-services/",
);
const LUNAR_DATA = source(
  "NASA — Lunar science data",
  "https://science.nasa.gov/lunar-science/data/",
);

export const PETS = Object.freeze([
  freeze({
    id: "lister",
    name: "LISTER",
    kind: "Heat-flow drill",
    needsPower: true,
    draw: RULES.listerDraw,
    summary:
      "Heat-flow drill. While the Sun is up it draws more than EDS or Nodey, but less than Triddy. In the dark only the survival bus remains.",
  }),
  freeze({
    id: "retro",
    name: "Retro",
    kind: "Laser retroreflector",
    needsPower: false,
    draw: 0,
    summary:
      "Laser retroreflector. It needs no power, so Power and Warmth never move. At night it sleeps. Signal still changes, because waiting for Earth is the lander's radio, not the mirror.",
  }),
  freeze({
    id: "eds",
    name: "EDS",
    kind: "Electrodynamic dust shield",
    needsPower: true,
    draw: RULES.edsDraw,
    summary:
      "Electrodynamic dust shield. It draws less than LISTER or Triddy while the Sun is up, and it drops to the same survival bus in the dark.",
  }),
  freeze({
    id: "trident",
    name: "Triddy",
    kind: "Ice drill (TRIDENT)",
    needsPower: true,
    draw: RULES.tridentDraw,
    summary:
      "TRIDENT ice drill from IM-2 at Mons Mouton. It draws more than LISTER while the Sun is up. In the dark only the survival bus remains, so night is a cold huddle, not sleep.",
    passport:
      "Tried to pull about 1 meter of regolith and sniff for water ice with MSOLO.",
  }),
  freeze({
    id: "ln-1",
    name: "Nodey",
    kind: "Navigation beacon (LN-1)",
    needsPower: true,
    preferWait: true,
    draw: RULES.ln1Draw,
    summary:
      "LN-1 navigation beacon from IM-1 at Malapert A. It draws less than EDS while the Sun is up. Night is still a cold huddle. The tutor leans toward waiting for Earth, because ranging is the point of the instrument.",
    passport:
      "Broadcast ranging so later vehicles could find the landed asset at Malapert A.",
  }),
]);

export const SITES = Object.freeze([
  freeze({
    id: "mare-crisium",
    name: "Mare Crisium",
    region: "Near side",
    dust: 1,
    earthDay: 0.92,
    earthNight: 0.84,
    summary:
      "Near-side basin. The Sun is a 14-day sine: dim at dawn and sunset, nearly full at noon. Earth stays easy to see.",
    sun(day) {
      return daylightSine(day, RULES.daylightDays);
    },
  }),
  freeze({
    id: "malapert-a",
    name: "Malapert A",
    region: "South pole",
    dust: 1,
    earthDay: 0.38,
    earthNight: 0.2,
    summary:
      "South-pole crater, the IM-1 region. The Sun is the same 14-day shape as Mare Crisium, scaled to a low peak, so a drill's daylight draw is never covered. Earth sits low.",
    sun(day) {
      return RULES.malapertPeak * daylightSine(day, RULES.daylightDays);
    },
  }),
  freeze({
    id: "mons-mouton",
    name: "Mons Mouton",
    region: "South pole",
    dust: 1,
    earthDay: 0.62,
    earthNight: 0.5,
    summary:
      "South-pole plateau. The Sun stays high for all 14 days, a stand-in for the planning page's note that annual south-pole sunlight is about 70–80%. This is not a terrain illumination model. The night coda still runs, so the heater can be tried.",
    sun(day) {
      return RULES.monsBase + RULES.monsSwing * daylightSine(day, RULES.daylightDays);
    },
  }),
  freeze({
    id: "reiner-gamma",
    name: "Reiner Gamma",
    region: "Near side",
    dust: RULES.reinerDust,
    earthDay: 0.9,
    earthNight: 0.8,
    summary:
      "Near-side site. It uses Mare Crisium's Sun. Dust scales solar power only. The dust number is a game penalty, not a measured optical depth. Earth view stays strong.",
    sun(day) {
      return daylightSine(day, RULES.daylightDays);
    },
  }),
]);

export const SOURCES = Object.freeze([CLPS, LUNAR_DATA]);

export function createRun({ petId, siteId } = {}) {
  const pet = requirePet(petId);
  const site = requireSite(siteId);
  return freeze({
    petId: pet.id,
    siteId: site.id,
    phase: "ready",
    day: 0,
    night: 0,
    power: RULES.startPower,
    warmth: RULES.startWarmth,
    signal: RULES.startSignal,
    panel: 1,
    heater: false,
    wait: false,
    alive: true,
    ended: false,
    causes: [],
    sun: 0,
    earth: 0,
    dust: site.dust,
    status: "ready",
    note: "Choose a panel tilt, the heater, and whether to wait for Earth. The first step is Earth day 1.",
    flags: { lowPower: false, lowWarmth: false, lowSignal: false },
    books: null,
    ignored: [],
  });
}

export function lookAhead(state) {
  assertRun(state);
  if (state.phase === "lost" || state.ended) return null;
  const clock = nextClock(state);
  const site = requireSite(state.siteId);
  const sun = clock.phase === "night" ? 0 : round4(site.sun(clock.day));
  const earth = clock.phase === "night" ? site.earthNight : site.earthDay;
  return freeze({
    day: clock.day,
    night: clock.night,
    phase: clock.phase,
    sun,
    earth,
    dust: site.dust,
  });
}

export function suggestAction(state) {
  assertRun(state);
  if (state.phase === "lost" || state.ended) {
    return freeze({ panel: 1, heater: false, wait: false });
  }
  const pet = requirePet(state.petId);
  const ahead = lookAhead(state);
  if (!pet.needsPower) {
    return freeze({
      panel: 1,
      heater: false,
      wait: state.signal < RULES.suggestSignal && ahead.earth > 0,
    });
  }
  const cold = ahead.phase === "night" || state.warmth < RULES.suggestWarmth;
  const heater = cold && state.power > RULES.suggestPowerReserve;
  const earthOk = pet.preferWait ? ahead.earth > 0 : ahead.earth >= RULES.suggestEarth;
  const wait = state.signal < RULES.suggestSignal && earthOk;
  return freeze({ panel: 1, heater, wait });
}

export function advance(state, action) {
  assertRun(state);
  if (state.phase === "lost") throw new Error("The pet is already lost.");
  if (state.ended) throw new Error("The run is already over.");

  const choice = readAction(action);
  const clock = nextClock(state);
  const pet = requirePet(state.petId);
  const site = requireSite(state.siteId);
  const sun = clock.phase === "night" ? 0 : round4(site.sun(clock.day));
  const earth = clock.phase === "night" ? site.earthNight : site.earthDay;
  const ignored = [];
  const heaterOn = choice.heater && pet.needsPower;
  if (choice.heater && !pet.needsPower) ignored.push("heater");

  let solarGain = 0;
  let powerDraw = 0;
  let warmthGain = 0;
  let warmthLeak = 0;
  if (pet.needsPower) {
    const align = RULES.panelFloor + (1 - RULES.panelFloor) * choice.panel;
    solarGain = sun * align * site.dust * RULES.solar;
    const bus = sun > 0 ? pet.draw : RULES.nightBus;
    powerDraw = bus + (heaterOn ? RULES.heaterPower : 0);
    warmthGain = sun * RULES.sunWarm + (heaterOn ? RULES.heaterWarm : 0);
    warmthLeak =
      RULES.warmthLeak +
      (1 - sun) * RULES.darkLeak +
      (clock.phase === "night" ? RULES.nightLeak : 0);
  }
  const signalDelta = choice.wait ? earth * RULES.waitGain - RULES.waitOverhead : -RULES.idleDrop;

  const power = pet.needsPower ? clampMeter(state.power + solarGain - powerDraw) : state.power;
  const warmth = pet.needsPower ? clampMeter(state.warmth + warmthGain - warmthLeak) : state.warmth;
  const signal = clampMeter(state.signal + signalDelta);

  const causes = [];
  if (pet.needsPower && power === 0) causes.push("power");
  if (pet.needsPower && warmth === 0) causes.push("warmth");
  const lost = causes.length > 0;
  const ended = lost || clock.night === RULES.nightDays;
  const phase = lost ? "lost" : clock.phase;
  const status = statusOf({ pet, phase: clock.phase, day: clock.day, sun, power, warmth, lost });

  return freeze({
    petId: pet.id,
    siteId: site.id,
    phase,
    day: clock.day,
    night: clock.night,
    power,
    warmth,
    signal,
    panel: choice.panel,
    heater: heaterOn,
    wait: choice.wait,
    alive: !lost,
    ended,
    causes,
    sun,
    earth,
    dust: site.dust,
    status,
    note: noteFor({ pet, status, causes, ended }),
    flags: {
      lowPower: pet.needsPower && power < RULES.darkPower,
      lowWarmth: pet.needsPower && warmth < RULES.chillyWarmth,
      lowSignal: signal < RULES.lowSignal,
    },
    books: {
      solarGain: round4(solarGain),
      powerDraw: round4(powerDraw),
      warmthGain: round4(warmthGain),
      warmthLeak: round4(warmthLeak),
      signalDelta: round4(signalDelta),
      powerApplied: power - state.power,
      warmthApplied: warmth - state.warmth,
      signalApplied: signal - state.signal,
    },
    ignored,
  });
}

export function play(state, policy = suggestAction) {
  assertRun(state);
  if (typeof policy !== "function") throw new TypeError("Policy must be a function.");
  const trace = [];
  let current = state;
  const cap = RULES.daylightDays + RULES.nightDays;
  while (current.phase !== "lost" && !current.ended) {
    current = advance(current, policy(current));
    trace.push(current);
    if (trace.length > cap) throw new Error("Run did not end.");
  }
  return trace;
}

function statusOf({ pet, phase, day, sun, power, warmth, lost }) {
  if (lost) return "lost";
  if (!pet.needsPower && phase === "night") return "asleep";
  if (phase === "day" && day >= RULES.sunsetDay && sun < RULES.sunsetSun) return "shiver";
  if (pet.needsPower && power < RULES.darkPower) return "dark";
  if (pet.needsPower && phase === "night" && warmth >= RULES.holdingWarmth) return "holding";
  if (pet.needsPower && warmth < RULES.chillyWarmth) return "chilly";
  if (sun >= RULES.happySun && (!pet.needsPower || (power >= RULES.happyPower && warmth >= RULES.happyWarmth))) {
    return "happy";
  }
  return "steady";
}

function noteFor({ pet, status, causes, ended }) {
  let note;
  if (status === "lost") {
    note = `${pet.name} reached zero ${causes.join(" and ")}. This run is over.`;
  } else if (status === "asleep") {
    note = `${pet.name} sleeps through the night. A retroreflector needs no power, so Power and Warmth stay put.`;
  } else if (status === "shiver") {
    note = "The Sun is low late in the day. The pet shivers as sunset gets close.";
  } else if (status === "dark") {
    note = "Power is nearly gone. Tilting the panels only helps while the Sun is up.";
  } else if (status === "holding") {
    note = "Night. The pet huddles instead of sleeping. The heater spends power to keep warmth from falling.";
  } else if (status === "chilly") {
    note = "Warmth is low, a cold huddle. The heater can buy it back if power remains.";
  } else if (status === "happy") {
    note = "The Sun is high and the meters are healthy.";
  } else {
    note = "The meters are moving, and nothing has failed.";
  }
  if (ended && status !== "lost") note += " This was the last step.";
  return note;
}

function nextClock(state) {
  if (state.phase === "ready") return { day: 1, night: 0, phase: "day" };
  if (state.phase === "day" && state.day < RULES.daylightDays) {
    return { day: state.day + 1, night: 0, phase: "day" };
  }
  if (state.phase === "day" && state.day === RULES.daylightDays) {
    return { day: RULES.daylightDays, night: 1, phase: "night" };
  }
  if (state.phase === "night" && state.night < RULES.nightDays) {
    return { day: RULES.daylightDays, night: state.night + 1, phase: "night" };
  }
  throw new Error("The run is already over.");
}

function daylightSine(day, span) {
  if (!Number.isInteger(day) || day < 1 || day > span) return 0;
  return Math.sin((Math.PI * (day - 0.5)) / span);
}

function readAction(action) {
  if (action == null) action = {};
  if (typeof action !== "object" || Array.isArray(action)) {
    throw new TypeError("Action must be an object.");
  }
  return {
    panel: readPanel(action.panel),
    heater: readBool(action.heater, "Heater", false),
    wait: readBool(action.wait, "Wait", false),
  };
}

function readPanel(value) {
  if (value == null) return 1;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError("Panel must be a number from 0 to 1.");
  }
  return value;
}

function readBool(value, name, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "boolean") throw new TypeError(`${name} must be true or false.`);
  return value;
}

function requirePet(id) {
  if (typeof id !== "string") throw new Error(`Unknown instrument: ${echo(id)}`);
  const pet = PETS.find((item) => item.id === id);
  if (!pet) throw new Error(`Unknown instrument: ${echo(id)}`);
  return pet;
}

function requireSite(id) {
  if (typeof id !== "string") throw new Error(`Unknown landing site: ${echo(id)}`);
  const site = SITES.find((item) => item.id === id);
  if (!site) throw new Error(`Unknown landing site: ${echo(id)}`);
  return site;
}

function assertRun(state) {
  if (!state || typeof state !== "object" || typeof state.petId !== "string") {
    throw new TypeError("That is not a run.");
  }
  requirePet(state.petId);
  requireSite(state.siteId);
  assertMeter(state.power, "Power");
  assertMeter(state.warmth, "Warmth");
  assertMeter(state.signal, "Signal");
}

function assertMeter(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}

function clampMeter(value) {
  assertMeter(value, "Meter");
  return Math.min(100, Math.max(0, Math.round(value)));
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function echo(value) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, 40);
  return text || "blank";
}

function source(label, url) {
  return freeze({ label, url });
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
