import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DUST_CY,
  MOODS,
  PETS,
  PHASES,
  SIGNAL_BLINK_AT,
  present,
  nextPhase,
  listSources,
} from "./pets.js";

const MATRIX = {
  lister: { day: "happy", sunset: "shivering", night: "cold" },
  retro: { day: "happy", sunset: "shivering", night: "sleeping" },
  eds: { day: "happy", sunset: "shivering", night: "cold" },
  "ln-1": { day: "happy", sunset: "shivering", night: "cold" },
};

const ANIMATION = {
  happy: "bob",
  shivering: "shiver",
  sleeping: "sleep",
  cold: "huddle",
};

const PANEL = { top: 78, bottom: 156 };
const ALLOWED_HOSTS = new Set(["www.nasa.gov", "science.nasa.gov"]);
const POWERED = ["lister", "eds", "ln-1"];

test("sunlight picks one mood, and only the retroreflector sleeps", () => {
  assert.equal(PETS.filter((pet) => pet.passive).map((pet) => pet.id).join(), "retro");
  for (const pet of PETS) {
    for (const phase of PHASES) {
      const pose = present(pet.id, phase.id);
      const moodId = MATRIX[pet.id][phase.id];
      assert.equal(pose.mood.id, moodId);
      assert.equal(pose.mood.animation, ANIMATION[moodId]);
      assert.equal(pose.scene.animation, ANIMATION[moodId]);
      assert.equal(pose.scene.title, `${pet.name} is ${pose.mood.label}`);
      assert.equal(pose.scene.reason, pose.reason);
      assert.equal(pose.phase.id, phase.id);
    }
  }
});

test("night copy follows the power fact, and daylight copy does not", () => {
  const retroNight = present("retro", "night");
  assert.match(retroNight.reason, /sleeps through it/);
  assert.match(retroNight.reason, /needs no power/);
  assert.doesNotMatch(retroNight.reason, /huddles/);

  for (const id of POWERED) {
    const night = present(id, "night");
    assert.match(night.reason, /huddles instead of sleeping/);
    assert.match(night.reason, /needs power/);
    assert.doesNotMatch(night.reason, /needs no power/);
    assert.doesNotMatch(night.reason, /sleeps through it/);
  }

  for (const pet of PETS) {
    for (const phase of ["day", "sunset"]) {
      const pose = present(pet.id, phase);
      assert.doesNotMatch(pose.reason, /sleeps|huddles|needs no power/);
    }
    assert.match(present(pet.id, "day").reason, /looks happy/);
    assert.match(present(pet.id, "sunset").reason, /shivers/);
  }
});

test("rejects unknown ids and the wrong types", () => {
  assert.throws(() => present("viper", "day"), /Unknown instrument: viper/);
  assert.throws(() => present(" retro", "day"), /Unknown instrument/);
  assert.throws(() => present("RETRO", "day"), /Unknown instrument/);
  assert.throws(() => present("", "day"), /Unknown instrument/);
  assert.throws(() => present("retro", "noon"), /Unknown sun phase: noon/);
  assert.throws(() => present("retro", "Night"), /Unknown sun phase/);
  assert.throws(() => present("retro", "day "), /Unknown sun phase/);
  assert.throws(() => present(null, "day"), /Instrument id must be a string/);
  assert.throws(() => present(undefined, "day"), /Instrument id must be a string/);
  assert.throws(() => present(1, "day"), /Instrument id must be a string/);
  assert.throws(() => present({ id: "retro" }, "day"), /Instrument id must be a string/);
  assert.throws(() => present("retro", null), /Sun phase must be a string/);
  assert.throws(() => present("retro", undefined), /Sun phase must be a string/);
  assert.throws(() => nextPhase("dawn"), /Unknown sun phase/);
  assert.throws(() => nextPhase(0), /Sun phase must be a string/);
});

test("a lunar day cycles full sun, sunset, night, then full sun", () => {
  assert.deepEqual(PHASES.map((phase) => phase.id), ["day", "sunset", "night"]);
  assert.equal(nextPhase("day"), "sunset");
  assert.equal(nextPhase("sunset"), "night");
  assert.equal(nextPhase("night"), "day");
  let phase = "day";
  for (let step = 0; step < 3; step += 1) phase = nextPhase(phase);
  assert.equal(phase, "day");
});

test("poses are frozen and do not share a scene array", () => {
  const first = present("lister", "day");
  const second = present("lister", "day");
  assert.notEqual(first.scene.parts, second.scene.parts);
  assert.throws(() => {
    first.mood.id = "sleeping";
  }, TypeError);
  assert.throws(() => {
    first.scene.parts.push({ tag: "rect" });
  }, TypeError);
  assert.equal(present("lister", "day").mood.id, "happy");
});

test("the drawing changes with the mood", () => {
  for (const pet of PETS) {
    const day = shapes(present(pet.id, "day"));
    const sunset = shapes(present(pet.id, "sunset"));
    const night = shapes(present(pet.id, "night"));
    assert.equal(count(day, "sun", "up"), 1);
    assert.equal(attr(day, "sun", "cy"), "28");
    assert.equal(count(sunset, "sun", "low"), 1);
    assert.ok(Number(attr(sunset, "sun", "cy")) > PANEL.bottom);
    assert.equal(count(night, "sun", "down"), 1);
    assert.equal(count(day, "eye", "open"), 2);
    assert.equal(count(sunset, "eye", "squint"), 2);
    assert.equal(attr(day, "mouth", "data-shape"), "smile");
    assert.equal(attr(sunset, "mouth", "data-shape"), "tense");
    assert.equal(count(day, "frost"), 0);
    assert.equal(count(sunset, "frost"), 3);
    assert.equal(count(day, "zzz"), 0);
    assert.equal(count(sunset, "zzz"), 0);
    assert.notDeepEqual(signature(day), signature(night));
  }

  const retroNight = shapes(present("retro", "night"));
  const listerNight = shapes(present("lister", "night"));
  const edsNight = shapes(present("eds", "night"));
  assert.equal(count(retroNight, "eye", "shut"), 2);
  assert.equal(attr(retroNight, "mouth", "data-shape"), "soft");
  assert.equal(count(retroNight, "zzz"), 3);
  assert.deepEqual(
    retroNight.filter((shape) => shape.attrs["data-role"] === "zzz").map((shape) => shape.children[0].text),
    ["z", "z", "z"],
  );
  assert.equal(count(retroNight, "frost"), 0);
  assert.equal(count(retroNight, "glint"), 0);
  assert.equal(count(shapes(present("retro", "day")), "glint"), 1);
  assert.equal(count(listerNight, "eye", "heavy"), 2);
  assert.equal(count(listerNight, "zzz"), 0);
  assert.equal(attr(listerNight, "mouth", "data-shape"), "flat");
  assert.equal(count(listerNight, "frost"), 3);
  assert.equal(count(edsNight, "eye", "heavy"), 2);
  assert.equal(count(edsNight, "zzz"), 0);
  assert.equal(attr(edsNight, "mouth", "data-shape"), "flat");
  assert.ok(count(listerNight, "bit") >= 1);
  assert.equal(count(retroNight, "bit"), 0);
  assert.equal(count(edsNight, "bit"), 0);

  const nodeyDay = shapes(present("ln-1", "day"));
  const nodeyLow = shapes(present("ln-1", "day", { signal: 0 }));
  const nodeyHigh = shapes(present("ln-1", "sunset", { signal: SIGNAL_BLINK_AT }));
  assert.equal(count(nodeyDay, "antenna"), 2);
  assert.equal(count(nodeyDay, "antenna-tip", "blink"), 2);
  assert.equal(count(nodeyLow, "antenna-tip", "idle"), 2);
  assert.equal(count(nodeyHigh, "antenna-tip", "blink"), 2);
  assert.equal(present("ln-1", "day", { signal: SIGNAL_BLINK_AT - 1 }).signalHigh, false);
  assert.equal(present("ln-1", "day", { signal: SIGNAL_BLINK_AT }).signalHigh, true);
});

test("Nodey is a radio-beacon moth whose teal tips blink on high Signal", () => {
  assert.equal(present("ln-1", "day").pet.name, "Nodey");
  assert.match(present("ln-1", "day").pet.passport, /Malapert A/);
  assert.equal(present("ln-1", "night").mood.id, "cold");
  assert.doesNotMatch(present("ln-1", "night").reason, /sleeps/);
  for (const phase of PHASES) {
    const nodes = shapes(present("ln-1", phase.id));
    assert.equal(count(nodes, "wing"), 2);
    assert.equal(count(nodes, "antenna"), 2);
    assert.equal(count(nodes, "antenna-tip"), 2);
    assert.equal(count(nodes, "zzz"), 0);
  }
  const day = present("ln-1", "day");
  assert.equal(day.signalHigh, true);
  assert.equal(count(shapes(day), "antenna-tip", "blink"), 2);
  const sunset = present("ln-1", "sunset");
  assert.equal(sunset.signalHigh, false);
  assert.equal(count(shapes(sunset), "antenna-tip", "idle"), 2);

  const high = present("ln-1", "sunset", { signal: SIGNAL_BLINK_AT });
  assert.equal(high.signalHigh, true);
  assert.equal(count(shapes(high), "antenna-tip", "blink"), 2);
  assert.ok(shapes(high).filter((n) => n.attrs["data-role"] === "antenna-tip").every((n) => n.attrs.class === "signal-blink"));

  const low = present("ln-1", "day", { signal: SIGNAL_BLINK_AT - 1 });
  assert.equal(low.signalHigh, false);
  assert.equal(count(shapes(low), "antenna-tip", "idle"), 2);

  const tip = shapes(present("ln-1", "day")).find((n) => n.attrs["data-role"] === "antenna-tip");
  assert.match(tip.attrs.fill, /#8fd0c4|#6a9a94|#5a7a78/i);
});

test("dust lifts in full sun, settles at sunset, and rests at night", () => {
  for (const moodId of ["happy", "shivering", "cold"]) {
    assert.equal(DUST_CY[moodId].length, 4);
  }
  const lifted = dustCy(present("eds", "day"));
  const settling = dustCy(present("eds", "sunset"));
  const rested = dustCy(present("eds", "night"));
  assert.deepEqual(lifted, [...DUST_CY.happy]);
  assert.deepEqual(settling, [...DUST_CY.shivering]);
  assert.deepEqual(rested, [...DUST_CY.cold]);
  assert.ok(lifted.every((cy) => cy < PANEL.top));
  assert.ok(settling.every((cy) => cy > PANEL.top && cy < PANEL.bottom));
  assert.ok(rested.every((cy) => cy > 140 && cy <= PANEL.bottom));
  const happy = shapes(present("eds", "day"));
  const motes = happy.filter((shape) => shape.attrs["data-role"] === "dust");
  assert.ok(motes.every((shape) => shape.attrs.class.startsWith("dust-float")));
  const head = happy.find((shape) => shape.attrs["data-role"] === "head");
  const eyes = happy.filter((shape) => shape.attrs["data-role"] === "eye");
  for (const mote of motes) {
    assert.equal(circlesOverlap(mote, head), false);
    for (const eye of eyes) assert.equal(circlesOverlap(mote, eye), false);
  }
  assert.ok(shapes(present("eds", "night")).every((shape) => shape.attrs.class !== "dust-float" && !String(shape.attrs.class || "").includes("dust-float")));
  assert.equal(count(shapes(present("lister", "day")), "dust"), 0);
  assert.equal(count(shapes(present("retro", "night")), "dust"), 0);
  assert.equal(count(shapes(present("ln-1", "day")), "dust"), 0);
});

test("scenes stay inside the shape allowlist", () => {
  const tags = new Set(["g", "rect", "circle", "ellipse", "path", "line", "polygon", "text"]);
  for (const pet of PETS) {
    for (const phase of PHASES) {
      for (const shape of shapes(present(pet.id, phase.id))) {
        assert.ok(tags.has(shape.tag), shape.tag);
        for (const value of Object.values(shape.attrs)) {
          assert.equal(value.includes("<"), false);
          assert.equal(/javascript:/i.test(value), false);
        }
        for (const child of shape.children) {
          if (child.text != null) assert.equal(child.text.includes("<"), false);
        }
      }
    }
  }
});

test("catalog links stay on the cited NASA hosts", () => {
  assert.equal(new Set(PETS.map((pet) => pet.id)).size, 4);
  assert.deepEqual(
    PETS.map((pet) => pet.id),
    ["lister", "retro", "eds", "ln-1"],
  );
  assert.equal(Object.keys(MOODS).length, 4);
  for (const pet of PETS) {
    assert.equal(pet.passive, pet.id === "retro");
    assert.equal(pet.nightNeed == null, pet.passive);
    assert.ok(pet.blurb.length > 0);
  }
  const urls = new Set();
  for (const item of listSources()) {
    const url = new URL(item.url);
    assert.equal(url.protocol, "https:");
    assert.ok(ALLOWED_HOSTS.has(url.hostname), url.hostname);
    assert.ok(item.label.length > 0);
    urls.add(item.url);
  }
  assert.ok(urls.size >= 4);
  assert.equal(SIGNAL_BLINK_AT, 70);
});

function shapes(pose) {
  const out = [];
  walk(pose.scene.parts, out);
  return out;
}

function walk(nodes, out) {
  for (const node of nodes) {
    if (node.text != null) continue;
    out.push(node);
    walk(node.children || [], out);
  }
}

function count(nodes, role, shape) {
  return nodes.filter((node) => {
    if (node.attrs["data-role"] !== role) return false;
    if (shape && node.attrs["data-shape"] !== shape) return false;
    return true;
  }).length;
}

function attr(nodes, role, name) {
  const found = nodes.find((node) => node.attrs["data-role"] === role);
  assert.ok(found, role);
  return found.attrs[name];
}

function circlesOverlap(a, b) {
  const reach = Number(a.attrs.r) + Number(b.attrs.r);
  const dx = Number(a.attrs.cx) - Number(b.attrs.cx);
  const dy = Number(a.attrs.cy) - Number(b.attrs.cy);
  return dx * dx + dy * dy <= reach * reach;
}

function dustCy(pose) {
  return shapes(pose)
    .filter((node) => node.attrs["data-role"] === "dust")
    .map((node) => Number(node.attrs.cy));
}

function signature(nodes) {
  return nodes.map((node) => `${node.tag}:${node.attrs["data-role"] || ""}:${node.attrs["data-shape"] || ""}:${node.attrs.d || ""}:${node.attrs.cy || ""}`);
}
