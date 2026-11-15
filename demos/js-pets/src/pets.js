/**
 * Pet art, moods, and animations for the four adoptable CLPS payload pets:
 * LISTER, Retro (LRA), EDS, and Nodey (LN-1).
 * Sunlight picks the pose. Care meters and the map live elsewhere.
 * Nodey carries a Passport line from the catalog for the stage copy.
 * Optional present(..., { signal }) drives Nodey's antenna blink (high Signal).
 */

export const TAGS = new Set(["g", "rect", "circle", "ellipse", "path", "line", "polygon", "text"]);
const ATTRS = new Set([
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "d",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "opacity",
  "fill-opacity",
  "transform",
  "font-size",
  "font-family",
  "text-anchor",
  "class",
  "data-role",
  "data-shape",
]);

/** Dust vertical positions. Happy is above the panel; night rests on the lower edge. */
export const DUST_CY = Object.freeze({
  happy: Object.freeze([46, 38, 52, 44]),
  shivering: Object.freeze([90, 108, 96, 120]),
  cold: Object.freeze([146, 152, 142, 150]),
});

/** Happy motes sit beside the face so they stay clear of the eyes. */
const HAPPY_DUST_CX = Object.freeze([54, 68, 132, 146]);

const PANEL = Object.freeze({ top: 78, bottom: 156 });

/** Signal at or above this counts as high for Nodey's antenna tips. */
export const SIGNAL_BLINK_AT = 70;

export const SOURCES = Object.freeze({
  payloads: source(
    "NASA — Ten NASA instruments on Blue Ghost Mission 1",
    "https://www.nasa.gov/missions/artemis/clps/ten-nasa-science-tech-instruments-flying-to-moon-on-firefly-lander/",
  ),
  passive: source(
    "NASA — How NASA uses simple technology to track lunar missions",
    "https://www.nasa.gov/missions/artemis/how-nasa-uses-simple-technology-to-track-lunar-missions/",
  ),
  noPower: source(
    "NASA — LRO pings a lunar retroreflector",
    "https://science.nasa.gov/missions/lro/laser-instrument-on-nasas-lro-successfully-pings-indian-moon-lander/",
  ),
  to2im: source(
    "NASA — TO2-IM Science Payloads (LN-1)",
    "https://science.nasa.gov/lunar-science/clps-deliveries/to2-im/",
  ),
});

export const PHASES = Object.freeze([
  freeze({ id: "day", label: "Full sun" }),
  freeze({ id: "sunset", label: "Sunset" }),
  freeze({ id: "night", label: "Lunar night" }),
]);

export const MOODS = Object.freeze({
  happy: freeze({ id: "happy", label: "Happy", animation: "bob" }),
  shivering: freeze({ id: "shivering", label: "Shivering", animation: "shiver" }),
  sleeping: freeze({ id: "sleeping", label: "Sleeping", animation: "sleep" }),
  cold: freeze({ id: "cold", label: "Cold", animation: "huddle" }),
});

export const PETS = Object.freeze([
  freeze({
    id: "lister",
    name: "LISTER",
    kind: "Heat-flow probe",
    passive: false,
    nightNeed: "power to drill and measure heat",
    blurb:
      "Heat-flow probe from the Blue Ghost Mission 1 payload set. A pneumatic drill carries a needle that measures heat under the regolith.",
    sources: Object.freeze([SOURCES.payloads]),
  }),
  freeze({
    id: "retro",
    name: "Retro",
    kind: "Laser retroreflector",
    passive: true,
    nightNeed: null,
    blurb:
      "A corner-cube mirror of the kind NASA flies as a laser retroreflector. It needs no power, no commands, and no thermal control, so it can sit through the lunar night.",
    sources: Object.freeze([SOURCES.payloads, SOURCES.passive, SOURCES.noPower]),
  }),
  freeze({
    id: "eds",
    name: "EDS",
    kind: "Electrodynamic dust shield",
    passive: false,
    nightNeed: "power to lift dust with electric fields",
    blurb:
      "Electrodynamic dust shield from the Blue Ghost Mission 1 payload set. Electric fields lift lunar dust off glass and radiators. The shield has no moving parts.",
    sources: Object.freeze([SOURCES.payloads]),
  }),
  freeze({
    id: "ln-1",
    name: "Nodey",
    kind: "Navigation beacon (LN-1)",
    passive: false,
    nightNeed: "power to keep the radio beacon alive",
    blurb:
      "LN-1 radio-beacon moth. Gold and amber body with teal antenna tips that blink when Signal is high. Night still needs power, so Nodey huddles instead of sleeping.",
    passport:
      "Broadcast ranging so later vehicles could find the landed asset at Malapert A.",
    sources: Object.freeze([SOURCES.to2im]),
  }),
]);

const PALETTE = Object.freeze({
  happy: freeze({
    body: "#e0b15a",
    ink: "#1c1914",
    line: "#3a2a10",
    frost: "#d5e8f5",
    metal: "#f4f7fb",
    facet: "#c5d0dc",
    dust: "#f3e6cc",
    glass: "#1d4a42",
  }),
  shivering: freeze({
    body: "#d2c0a0",
    ink: "#1c1914",
    line: "#3a2a10",
    frost: "#f4fbff",
    metal: "#d5dee8",
    facet: "#aeb9c6",
    dust: "#cbb892",
    glass: "#24383a",
  }),
  sleeping: freeze({
    body: "#2c3848",
    ink: "#d5deea",
    line: "#9fb0c4",
    frost: "#8fd0c4",
    metal: "#3e4d62",
    facet: "#8fd0c4",
    dust: "#6a7b90",
    glass: "#1a2833",
  }),
  cold: freeze({
    body: "#7f9bb8",
    ink: "#102033",
    line: "#102033",
    frost: "#f7fcff",
    metal: "#c5d4e2",
    facet: "#9eb4c8",
    dust: "#9aafc2",
    glass: "#1a2833",
  }),
});

/** Gold / amber tints for Nodey by mood. Teal tips stay beacon-colored. */
const NODEY_TINT = Object.freeze({
  happy: freeze({ body: "#e0b15a", wing: "#f4d08a", line: "#3a2a10", tip: "#8fd0c4" }),
  shivering: freeze({ body: "#d2c0a0", wing: "#e0d0b0", line: "#3a2a10", tip: "#6a9a94" }),
  cold: freeze({ body: "#7f9bb8", wing: "#9eb4c8", line: "#102033", tip: "#5a7a78" }),
});

/**
 * One pose: the pet, the sun phase, the mood, the sentence, and the drawing.
 * Ids are exact catalog strings. "Day" and " retro " are rejected.
 * options.signal (0–100) turns Nodey's teal antenna tips on when high.
 * If signal is omitted, tips blink in full sun (happy) for the pets page preview.
 */
export function present(petId, phaseId, options = {}) {
  const pet = requirePet(petId);
  const phase = requirePhase(phaseId);
  const mood = pickMood(pet, phase);
  const reason = explain(pet, phase);
  const signalHigh = resolveSignalHigh(options, mood);
  return freeze({
    pet,
    phase: freeze({ id: phase.id, label: phase.label }),
    mood: freeze({ id: mood.id, label: mood.label, animation: mood.animation }),
    reason,
    signalHigh,
    scene: buildScene(pet, phase, mood, reason, signalHigh),
  });
}

/** Next sunlight step. Order is full sun, sunset, lunar night, then full sun again. */
export function nextPhase(phaseId) {
  const phase = requirePhase(phaseId);
  const index = PHASES.findIndex((item) => item.id === phase.id);
  return PHASES[(index + 1) % PHASES.length].id;
}

export function listSources() {
  const seen = new Set();
  const out = [];
  for (const pet of PETS) {
    for (const item of pet.sources) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      out.push(item);
    }
  }
  return out;
}

function pickMood(pet, phase) {
  if (phase.id === "day") return MOODS.happy;
  if (phase.id === "sunset") return MOODS.shivering;
  if (pet.passive) return MOODS.sleeping;
  return MOODS.cold;
}

function resolveSignalHigh(options, mood) {
  const opts = options && typeof options === "object" ? options : {};
  if (typeof opts.signal === "number" && Number.isFinite(opts.signal)) {
    return opts.signal >= SIGNAL_BLINK_AT;
  }
  return mood.id === "happy";
}

function explain(pet, phase) {
  if (phase.id === "day") return `Full sun is on the site. ${pet.name} looks happy.`;
  if (phase.id === "sunset") return `Sunset is close. ${pet.name} shivers as the light leaves.`;
  if (pet.passive) {
    return `It is lunar night. ${pet.name} sleeps through it, because a laser retroreflector needs no power.`;
  }
  return `It is lunar night. ${pet.name} needs ${pet.nightNeed}, so it huddles instead of sleeping.`;
}

function buildScene(pet, phase, mood, reason, signalHigh) {
  const palette = PALETTE[mood.id];
  const anchor = faceAnchor(pet.id);
  const cheek = pet.id === "eds" || pet.id === "ln-1";
  const headFill =
    pet.id === "ln-1" ? (NODEY_TINT[mood.id] || NODEY_TINT.cold).body : undefined;
  const parts = [
    ...sun(phase),
    shadow(),
    ...body(pet, mood, palette, signalHigh),
    ...face(mood, anchor, palette, { cheek, headFill }),
  ];
  if (mood.id === "shivering" || mood.id === "cold") {
    parts.push(...frostMarks(anchor, palette));
  }
  if (pet.id === "eds") parts.push(...dustMotes(mood, palette));
  return {
    viewBox: "0 0 200 220",
    title: `${pet.name} is ${mood.label}`,
    reason,
    animation: mood.animation,
    parts,
  };
}

function faceAnchor(petId) {
  if (petId === "lister") return { cx: 100, cy: 96, frostX: 78, frostY: 64 };
  if (petId === "retro") return { cx: 100, cy: 78, frostX: 70, frostY: 52 };
  if (petId === "ln-1") return { cx: 100, cy: 108, frostX: 66, frostY: 72 };
  return { cx: 100, cy: 52, frostX: 64, frostY: 28 };
}

function sun(phase) {
  if (phase.id === "day") {
    return [
      part("circle", {
        cx: 28,
        cy: 28,
        r: 12,
        fill: "#ffe7ad",
        "data-role": "sun",
        "data-shape": "up",
      }),
    ];
  }
  if (phase.id === "sunset") {
    return [
      part("circle", {
        cx: 28,
        cy: 176,
        r: 12,
        fill: "#e0b15a",
        "data-role": "sun",
        "data-shape": "low",
      }),
    ];
  }
  return [
    part("circle", {
      cx: 28,
      cy: 28,
      r: 7,
      fill: "#9bb0c6",
      opacity: "0.4",
      "data-role": "sun",
      "data-shape": "down",
    }),
  ];
}

function shadow() {
  return part("ellipse", {
    cx: 100,
    cy: 204,
    rx: 54,
    ry: 8,
    fill: "#000000",
    opacity: "0.28",
    "data-role": "shadow",
  });
}

function body(pet, mood, palette, signalHigh) {
  if (pet.id === "lister") return listerBody(palette);
  if (pet.id === "retro") return retroBody(mood, palette);
  if (pet.id === "eds") return edsBody(palette);
  if (pet.id === "ln-1") return nodeyBody(mood, signalHigh);
  return edsBody(palette);
}

function listerBody(palette) {
  return [
    part("rect", {
      x: 68,
      y: 62,
      width: 64,
      height: 96,
      rx: 20,
      fill: palette.body,
      stroke: palette.line,
      "stroke-width": "3",
      "data-role": "body",
    }),
    part("rect", {
      x: 80,
      y: 112,
      width: 40,
      height: 7,
      rx: 2,
      fill: palette.line,
      opacity: "0.35",
      "data-role": "band",
    }),
    part("line", {
      x1: 100,
      y1: 158,
      x2: 100,
      y2: 188,
      stroke: palette.line,
      "stroke-width": "4",
      "stroke-linecap": "round",
      "data-role": "bit",
    }),
    part("polygon", {
      points: "92,188 108,188 100,202",
      fill: palette.line,
      "data-role": "bit",
    }),
  ];
}

function retroBody(mood, palette) {
  const parts = [
    part("polygon", {
      points: "100,46 158,78 100,110 42,78",
      fill: palette.metal,
      stroke: palette.line,
      "stroke-width": "3",
      "data-role": "body",
    }),
    part("polygon", {
      points: "100,110 158,78 158,132 100,164",
      fill: palette.facet,
      stroke: palette.line,
      "stroke-width": "3",
      "data-role": "facet",
    }),
    part("polygon", {
      points: "100,110 42,78 42,132 100,164",
      fill: palette.metal,
      stroke: palette.line,
      "stroke-width": "3",
      opacity: "0.85",
      "data-role": "facet",
    }),
    part("path", {
      d: "M100 70 L128 88 L100 118 L72 88 Z",
      fill: "none",
      stroke: palette.line,
      "stroke-width": "2",
      "data-role": "facet",
    }),
  ];
  if (mood.id === "happy") {
    parts.push(
      part("circle", {
        cx: 124,
        cy: 66,
        r: 3,
        fill: "#fff8e8",
        "data-role": "glint",
      }),
    );
  }
  return parts;
}

function edsBody(palette) {
  return [
    part("rect", {
      x: 46,
      y: PANEL.top,
      width: 108,
      height: PANEL.bottom - PANEL.top,
      rx: 8,
      fill: palette.glass,
      stroke: palette.body,
      "stroke-width": "4",
      "data-role": "body",
    }),
    part("path", {
      d: "M46 104 h108 M46 130 h108 M82 78 v78 M118 78 v78",
      fill: "none",
      stroke: "#8fd0c4",
      "stroke-width": "1.5",
      opacity: "0.75",
      "data-role": "grid",
    }),
  ];
}

/** Radio-beacon moth: gold/amber wings and body, teal antenna tips. */
function nodeyBody(mood, signalHigh) {
  const tint = NODEY_TINT[mood.id] || NODEY_TINT.cold;
  const tipClass = signalHigh ? "signal-blink" : "signal-idle";
  return [
    part("ellipse", {
      cx: 58,
      cy: 118,
      rx: 36,
      ry: 22,
      fill: tint.wing,
      stroke: tint.line,
      "stroke-width": "2.5",
      opacity: "0.92",
      "data-role": "wing",
      "data-shape": "left",
    }),
    part("ellipse", {
      cx: 142,
      cy: 118,
      rx: 36,
      ry: 22,
      fill: tint.wing,
      stroke: tint.line,
      "stroke-width": "2.5",
      opacity: "0.92",
      "data-role": "wing",
      "data-shape": "right",
    }),
    part("ellipse", {
      cx: 100,
      cy: 124,
      rx: 22,
      ry: 36,
      fill: tint.body,
      stroke: tint.line,
      "stroke-width": "3",
      "data-role": "body",
    }),
    part("line", {
      x1: 90,
      y1: 86,
      x2: 72,
      y2: 52,
      stroke: tint.line,
      "stroke-width": "2.2",
      "stroke-linecap": "round",
      "data-role": "antenna",
      "data-shape": "left",
    }),
    part("line", {
      x1: 110,
      y1: 86,
      x2: 128,
      y2: 52,
      stroke: tint.line,
      "stroke-width": "2.2",
      "stroke-linecap": "round",
      "data-role": "antenna",
      "data-shape": "right",
    }),
    part("circle", {
      cx: 72,
      cy: 50,
      r: 5,
      fill: tint.tip,
      stroke: tint.line,
      "stroke-width": "1.5",
      "data-role": "antenna-tip",
      "data-shape": signalHigh ? "blink" : "idle",
      class: tipClass,
    }),
    part("circle", {
      cx: 128,
      cy: 50,
      r: 5,
      fill: tint.tip,
      stroke: tint.line,
      "stroke-width": "1.5",
      "data-role": "antenna-tip",
      "data-shape": signalHigh ? "blink" : "idle",
      class: tipClass,
    }),
  ];
}

function dustMotes(mood, palette) {
  const heights = DUST_CY[mood.id];
  if (!heights) throw new Error(`EDS has no dust pose for ${mood.id}`);
  return heights.map((cy, index) =>
    part("circle", {
      cx: mood.id === "happy" ? HAPPY_DUST_CX[index] : 62 + index * 22,
      cy,
      r: 3.4,
      fill: palette.dust,
      "data-role": "dust",
      class: mood.id === "happy" ? `dust-float d${index}` : "dust-rest",
    }),
  );
}

function face(mood, anchor, palette, { cheek, headFill }) {
  const { cx, cy } = anchor;
  const parts = [];
  if (cheek) {
    parts.push(
      part("circle", {
        cx,
        cy,
        r: 20,
        fill: headFill || palette.body,
        stroke: palette.line,
        "stroke-width": "2",
        "data-role": "head",
      }),
    );
  }
  parts.push(...eyes(mood, cx, cy, palette), mouth(mood, cx, cy, palette));
  if (mood.id === "sleeping") parts.push(...snore(cx, cy, palette));
  return parts;
}

function eyes(mood, cx, cy, palette) {
  if (mood.id === "happy") {
    return [
      eyeCircle(cx - 8, cy - 2, palette, "open"),
      eyeCircle(cx + 8, cy - 2, palette, "open"),
    ];
  }
  if (mood.id === "sleeping") {
    return [
      eyeShut(cx - 12, cy, palette),
      eyeShut(cx + 4, cy, palette),
    ];
  }
  const shape = mood.id === "cold" ? "heavy" : "squint";
  const lift = shape === "heavy" ? 1 : 4;
  return [
    eyeLid(cx - 12, cy, lift, palette, shape),
    eyeLid(cx + 4, cy, lift, palette, shape),
  ];
}

function eyeCircle(cx, cy, palette, shape) {
  return part("circle", {
    cx,
    cy,
    r: 2.5,
    fill: palette.ink,
    "data-role": "eye",
    "data-shape": shape,
  });
}

function eyeLid(x, y, lift, palette, shape) {
  return part("path", {
    d: `M ${x} ${y} q 4 ${-lift} 8 0`,
    fill: "none",
    stroke: palette.ink,
    "stroke-width": "2.2",
    "stroke-linecap": "round",
    "data-role": "eye",
    "data-shape": shape,
  });
}

function eyeShut(x, y, palette) {
  return part("path", {
    d: `M ${x} ${y} q 4 5 8 0`,
    fill: "none",
    stroke: palette.ink,
    "stroke-width": "2.2",
    "stroke-linecap": "round",
    "data-role": "eye",
    "data-shape": "shut",
  });
}

function mouth(mood, cx, cy, palette) {
  const y = cy + 8;
  let d = `M ${cx - 8} ${y} q 8 8 16 0`;
  let shape = "smile";
  if (mood.id === "shivering") {
    d = `M ${cx - 8} ${y} q 4 3 8 0 t 8 0`;
    shape = "tense";
  } else if (mood.id === "cold") {
    d = `M ${cx - 7} ${y + 1} h 14`;
    shape = "flat";
  } else if (mood.id === "sleeping") {
    d = `M ${cx - 6} ${y} q 6 4 12 0`;
    shape = "soft";
  }
  return part("path", {
    d,
    fill: "none",
    stroke: palette.ink,
    "stroke-width": "2",
    "stroke-linecap": "round",
    "data-role": "mouth",
    "data-shape": shape,
  });
}

function snore(cx, cy, palette) {
  return [
    zzz(cx + 26, cy - 8, "12", palette),
    zzz(cx + 38, cy - 22, "16", palette),
    zzz(cx + 50, cy - 10, "11", palette),
  ];
}

function zzz(x, y, size, palette) {
  return part(
    "text",
    {
      x,
      y,
      fill: palette.line,
      "font-size": size,
      "font-family": "Palatino, Georgia, serif",
      "data-role": "zzz",
    },
    [leaf("z")],
  );
}

function frostMarks(anchor, palette) {
  return [0, 1, 2].map((index) =>
    part("line", {
      x1: anchor.frostX + index * 12,
      y1: anchor.frostY,
      x2: anchor.frostX + 7 + index * 12,
      y2: anchor.frostY + 12,
      stroke: palette.frost,
      "stroke-width": "2",
      "stroke-linecap": "round",
      "data-role": "frost",
    }),
  );
}

function part(tag, attrs, children = []) {
  if (!TAGS.has(tag)) throw new Error(`Bad shape <${tag}>`);
  const clean = {};
  for (const [key, value] of Object.entries(attrs || {})) {
    if (!ATTRS.has(key)) throw new Error(`Bad attribute ${key}`);
    const text = String(value);
    if (/[<>]/.test(text) || /javascript:/i.test(text)) {
      throw new Error(`Unsafe attribute ${key}`);
    }
    clean[key] = text;
  }
  return { tag, attrs: clean, children };
}

function leaf(value) {
  const text = String(value);
  if (/[<>]/.test(text)) throw new Error("Unsafe text");
  return { text };
}

function requirePet(id) {
  if (typeof id !== "string") throw new Error("Instrument id must be a string");
  const pet = PETS.find((item) => item.id === id);
  if (!pet) throw new Error(`Unknown instrument: ${id}`);
  return pet;
}

function requirePhase(id) {
  if (typeof id !== "string") throw new Error("Sun phase must be a string");
  const phase = PHASES.find((item) => item.id === id);
  if (!phase) throw new Error(`Unknown sun phase: ${id}`);
  return phase;
}

function source(label, url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error(`Source must be https: ${url}`);
  return freeze({ label, url });
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
