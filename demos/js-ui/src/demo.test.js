import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_DURATION_MS,
  INSTRUMENTS,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  PHASES,
  SITES,
  clamp01,
  clampDurationMs,
  createSession,
  earthDayLabel,
  phaseAt,
  readLaunchOptions,
  resolveInstrument,
  resolveSite,
  sunlightPreview,
} from "./demo.js";
import { mount } from "./screen.js";

function stubDocument() {
  const elements = [];
  const byId = new Map();
  const listeners = [];
  const doc = {
    title: "",
    pressedWrites: 0,
    documentElement: {
      style: {
        setProperty() {},
      },
    },
    createElement(tag) {
      const el = {
        tagName: String(tag || "div").toUpperCase(),
        hidden: false,
        textContent: "",
        className: "",
        type: "",
        dataset: {},
        style: { setProperty() {} },
        ownerDocument: doc,
        attrs: new Map(),
        setAttribute(name, value) {
          el.attrs.set(name, String(value));
          if (name === "aria-pressed") doc.pressedWrites += 1;
        },
        getAttribute(name) {
          return el.attrs.has(name) ? el.attrs.get(name) : null;
        },
        addEventListener() {},
        focus() {},
        replaceChildren() {},
        append(child) {
          elements.push(child);
        },
      };
      return el;
    },
    getElementById(id) {
      return byId.get(id) ?? null;
    },
    querySelectorAll(selector) {
      const kind = /data-choice="([^"]+)"/.exec(selector)?.[1];
      return elements.filter((el) => el.dataset.choice === kind);
    },
    addEventListener(type, fn) {
      listeners.push({ type, fn });
    },
    dispatchEvent(event) {
      for (const entry of listeners) {
        if (entry.type === event.type) entry.fn(event);
      }
    },
  };
  doc.body = doc.createElement("body");
  for (const id of [
    "intro",
    "demo",
    "start",
    "toggle",
    "replay",
    "back",
    "demo-title",
    "skip",
    "instrument-name",
    "instrument-line",
    "place-line",
    "day-label",
    "phase-label",
    "sun-readout",
    "intro-notice",
    "demo-notice",
    "end-banner",
    "live",
    "sky",
    "intro-sites",
    "demo-sites",
    "intro-instruments",
    "demo-instruments",
  ]) {
    const el = doc.createElement("div");
    el.id = id;
    byId.set(id, el);
  }
  return doc;
}

function press(doc, key, extra = {}) {
  let prevented = false;
  const event = {
    type: "keydown",
    key,
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: { tagName: "BODY" },
    ...extra,
    preventDefault() {
      prevented = true;
    },
  };
  doc.dispatchEvent(event);
  return prevented;
}

test("space on the intro does not start, and enter does", () => {
  const doc = stubDocument();
  const skip = doc.getElementById("skip");
  skip.setAttribute("href", "#demo-title");
  skip.textContent = "Skip to demo";
  const view = mount(doc, createSession());
  const status = () => view.session.snapshot().status;

  assert.equal(status(), "intro");
  assert.equal(doc.getElementById("intro").hidden, false);
  assert.equal(doc.getElementById("demo").hidden, true);
  assert.equal(skip.getAttribute("href"), "#intro-title");
  assert.equal(skip.textContent, "Skip to content");
  assert.equal(press(doc, " "), false);
  assert.equal(press(doc, "Spacebar"), false);
  assert.equal(press(doc, "Enter", { repeat: true }), false);
  assert.equal(status(), "intro");

  assert.equal(press(doc, "Enter"), true);
  assert.equal(status(), "playing");
  assert.equal(doc.getElementById("demo").hidden, false);
  assert.equal(skip.getAttribute("href"), "#demo-title");
  assert.equal(skip.textContent, "Skip to demo");

  assert.equal(press(doc, "Spacebar", { target: { tagName: "BUTTON" } }), false);
  assert.equal(status(), "playing");
  assert.equal(press(doc, " ", { repeat: true }), false);
  assert.equal(status(), "playing");
  assert.equal(press(doc, " "), true);
  assert.equal(status(), "paused");
  assert.equal(press(doc, "Spacebar"), true);
  assert.equal(status(), "playing");

  press(doc, "Escape");
  assert.equal(status(), "intro");
  assert.equal(skip.getAttribute("href"), "#intro-title");
  assert.equal(press(doc, " "), false);
  assert.equal(status(), "intro");
  view.stop();
});

test("unchanged status text, title, and aria-pressed are not rewritten", () => {
  const doc = stubDocument();
  let titleWrites = 0;
  let title = "Payload Pets — intro";
  Object.defineProperty(doc, "title", {
    configurable: true,
    get() {
      return title;
    },
    set(value) {
      titleWrites += 1;
      title = String(value);
    },
  });
  const notice = doc.getElementById("intro-notice");
  let noticeWrites = 0;
  let noticeText = "";
  Object.defineProperty(notice, "textContent", {
    configurable: true,
    get() {
      return noticeText;
    },
    set(value) {
      noticeWrites += 1;
      noticeText = String(value);
    },
  });
  const view = mount(doc, createSession());
  const pressed = doc.pressedWrites;
  assert.equal(titleWrites, 0);
  assert.equal(noticeWrites, 0);
  view.render();
  view.render();
  assert.equal(titleWrites, 0);
  assert.equal(noticeWrites, 0);
  assert.equal(doc.pressedWrites, pressed);
  view.stop();
});

test("frames run only while the demo is playing", () => {
  const previousRAF = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  let pending = null;
  globalThis.requestAnimationFrame = (fn) => {
    pending = fn;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {
    pending = null;
  };
  try {
    const doc = stubDocument();
    const view = mount(doc, createSession({ durationMs: 1000 }));
    assert.equal(pending, null);
    press(doc, " ");
    assert.equal(view.session.snapshot().status, "intro");
    assert.equal(pending, null);
    press(doc, "Enter");
    assert.equal(typeof pending, "function");
    pending(0);
    const next = pending;
    next(200);
    assert.ok(view.session.snapshot().progress > 0);
    press(doc, " ");
    assert.equal(view.session.snapshot().status, "paused");
    assert.equal(pending, null);
    view.stop();
  } finally {
    if (previousRAF === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRAF;
    if (previousCancel === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = previousCancel;
  }
});

test("reduced motion jumps the clock without animation frames", () => {
  const previous = {
    matchMedia: globalThis.matchMedia,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    now: globalThis.performance.now,
  };
  let frames = 0;
  let queued = null;
  let delay = 0;
  let clock = 5_000;
  globalThis.matchMedia = (query) => ({
    matches: String(query).includes("prefers-reduced-motion") && String(query).includes("reduce"),
  });
  globalThis.requestAnimationFrame = () => {
    frames += 1;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.setTimeout = (fn, ms) => {
    queued = fn;
    delay = ms;
    return 1;
  };
  globalThis.clearTimeout = () => {
    queued = null;
  };
  globalThis.performance.now = () => clock;
  try {
    const doc = stubDocument();
    const sky = doc.getElementById("sky");
    const lights = [];
    sky.style.setProperty = (name, value) => {
      if (name === "--sunlight") lights.push(value);
    };
    const view = mount(doc, createSession({ skipIntro: true, durationMs: 10_000 }));
    assert.equal(frames, 0);
    assert.equal(typeof queued, "function");
    assert.equal(delay, 1000);
    const first = queued;
    clock += delay;
    first();
    assert.equal(frames, 0);
    assert.ok(Math.abs(view.session.snapshot().progress - 0.1) < 1e-9);
    assert.equal(view.session.snapshot().phase.id, "dawn");
    assert.ok(Math.abs(delay - 500) < 1);
    const second = queued;
    clock += delay;
    second();
    assert.equal(view.session.snapshot().phase.id, "day");
    assert.ok(lights.some((value) => value !== "0.000"));
    press(doc, "r");
    assert.equal(view.session.snapshot().progress, 0);
    assert.equal(view.session.snapshot().status, "playing");
    assert.equal(delay, 1000);
    const afterReplay = queued;
    clock += delay;
    afterReplay();
    assert.ok(Math.abs(view.session.snapshot().progress - 0.1) < 1e-9);
    view.stop();
    assert.equal(queued, null);
    assert.equal(frames, 0);
  } finally {
    if (previous.matchMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = previous.matchMedia;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.cancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.setTimeout = previous.setTimeout;
    globalThis.clearTimeout = previous.clearTimeout;
    globalThis.performance.now = previous.now;
  }
});

test("missing matchMedia keeps the animation frame loop", () => {
  const previous = {
    matchMedia: globalThis.matchMedia,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    setTimeout: globalThis.setTimeout,
  };
  let frames = 0;
  let timers = 0;
  delete globalThis.matchMedia;
  globalThis.requestAnimationFrame = () => {
    frames += 1;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.setTimeout = (fn, ms) => {
    timers += 1;
    return previous.setTimeout(fn, ms);
  };
  try {
    const doc = stubDocument();
    const view = mount(doc, createSession({ skipIntro: true }));
    assert.equal(frames, 1);
    assert.equal(timers, 0);
    view.stop();
  } finally {
    if (previous.matchMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = previous.matchMedia;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.cancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.setTimeout = previous.setTimeout;
  }
});

test("phases cover the lunar day without gaps", () => {
  for (let i = 0; i <= 1000; i += 1) {
    const phase = phaseAt(i / 1000);
    assert.ok(PHASES.some((item) => item.id === phase.id));
  }
  assert.equal(phaseAt(0).id, "dawn");
  assert.equal(phaseAt(0.149999).id, "dawn");
  assert.equal(phaseAt(0.15).id, "day");
  assert.equal(phaseAt(0.619999).id, "day");
  assert.equal(phaseAt(0.62).id, "dusk");
  assert.equal(phaseAt(0.78).id, "night");
  assert.equal(phaseAt(1).id, "night");
  assert.equal(phaseAt(-4).id, "dawn");
  assert.equal(phaseAt(8).id, "night");
  assert.equal(phaseAt(Number.NaN).id, "dawn");
  assert.equal(phaseAt("nope").id, "dawn");
});

test("sunlight preview peaks at noon and is dark at both ends", () => {
  assert.equal(sunlightPreview(0), 0);
  assert.equal(sunlightPreview(1), 0);
  assert.equal(sunlightPreview(0.385), 1);
  assert.ok(sunlightPreview(0.2) > sunlightPreview(0.05));
  assert.equal(sunlightPreview(Number.NaN), 0);
  assert.equal(clamp01("nope"), 0);
});

test("earth-day label uses a 14-day lunar day", () => {
  assert.equal(earthDayLabel(0), "Earth day 0.0 of 14");
  assert.equal(earthDayLabel(0.5), "Earth day 7.0 of 14");
  assert.equal(earthDayLabel(1), "Earth day 14.0 of 14");
  assert.equal(earthDayLabel(-1), "Earth day 0.0 of 14");
  assert.equal(earthDayLabel(3), "Earth day 14.0 of 14");
});

test("site and instrument names accept the planning-page spellings", () => {
  assert.equal(resolveSite(null).site.id, "mare-crisium");
  assert.equal(resolveSite(null).notice, null);
  assert.equal(resolveSite("   ").notice, null);
  assert.equal(resolveSite("Malapert A").site.id, "malapert-a");
  assert.equal(resolveSite("MALAPERT-A").site.id, "malapert-a");
  assert.equal(resolveSite("reiner_gamma").site.id, "reiner-gamma");
  assert.equal(resolveSite("Mons  Mouton").site.id, "mons-mouton");
  assert.equal(resolveSite("Malapert\u200b A").site.id, "malapert-a");
  assert.equal(resolveSite("\u202eMalapert A").site.id, "malapert-a");

  const unknown = resolveSite("  atlantis  ");
  assert.equal(unknown.site.id, "mare-crisium");
  assert.match(unknown.notice, /atlantis/);
  assert.match(unknown.notice, /Mare Crisium/);

  assert.equal(resolveInstrument("dust shield").instrument.id, "dust-shield");
  assert.equal(
    resolveInstrument("Laser Retroreflector").instrument.id,
    "laser-retroreflector",
  );
  assert.equal(resolveInstrument("Triddy").instrument.id, "trident");
  assert.equal(resolveInstrument("trident").instrument.id, "trident");
  assert.equal(resolveInstrument("Nodey").instrument.id, "ln-1");
  assert.equal(resolveInstrument("LN-1").instrument.id, "ln-1");
  const badInstrument = resolveInstrument("<script>");
  assert.equal(badInstrument.instrument.id, "heat-flow-drill");
  assert.match(badInstrument.notice, /<script>/);
});

test("launch query clamps duration and ignores empty or junk values", () => {
  const defaults = readLaunchOptions("");
  assert.equal(defaults.site.id, "mare-crisium");
  assert.equal(defaults.skipIntro, false);
  assert.equal(defaults.durationMs, DEFAULT_DURATION_MS);
  assert.equal(defaults.siteNotice, null);

  const picked = readLaunchOptions(
    "?site=Reiner%20Gamma&instrument=dust%20shield&skipIntro=yes&duration=12",
  );
  assert.equal(picked.site.id, "reiner-gamma");
  assert.equal(picked.instrument.id, "dust-shield");
  assert.equal(picked.skipIntro, true);
  assert.equal(picked.durationMs, 12_000);

  assert.equal(readLaunchOptions("?skipIntro=0").skipIntro, false);
  assert.equal(readLaunchOptions("?skipIntro=TRUE").skipIntro, true);
  assert.equal(readLaunchOptions("?duration=").durationMs, DEFAULT_DURATION_MS);
  assert.equal(readLaunchOptions("?duration=nope").durationMs, DEFAULT_DURATION_MS);
  assert.equal(readLaunchOptions("?duration=0").durationMs, MIN_DURATION_MS);
  assert.equal(readLaunchOptions("?duration=-4").durationMs, MIN_DURATION_MS);
  assert.equal(readLaunchOptions("?duration=9999").durationMs, MAX_DURATION_MS);
  assert.equal(readLaunchOptions("?duration=1e306").durationMs, MAX_DURATION_MS);
  assert.equal(readLaunchOptions("?duration=%20%20").durationMs, DEFAULT_DURATION_MS);
  assert.equal(readLaunchOptions("?site=").siteNotice, null);
  assert.match(readLaunchOptions("?site=nowhere").siteNotice, /nowhere/);
  const unknownInstrument = readLaunchOptions("?instrument=seagull");
  assert.equal(unknownInstrument.instrument.id, "heat-flow-drill");
  assert.match(unknownInstrument.instrumentNotice, /seagull/);
  assert.match(unknownInstrument.instrumentNotice, /Heat-flow drill/);
  assert.equal(clampDurationMs(undefined), DEFAULT_DURATION_MS);
  assert.equal(clampDurationMs("Infinity"), DEFAULT_DURATION_MS);
  assert.equal(clampDurationMs("   "), DEFAULT_DURATION_MS);
  assert.equal(clampDurationMs("\n\t"), DEFAULT_DURATION_MS);
  assert.equal(clampDurationMs("  5000  "), 5_000);

  const launched = createSession(readLaunchOptions("?site=nowhere&skipIntro=1&duration=4"));
  assert.equal(launched.snapshot().status, "playing");
  assert.equal(launched.snapshot().site.id, "mare-crisium");
  assert.match(launched.snapshot().siteNotice, /nowhere/);
  assert.equal(launched.snapshot().durationMs, 4_000);
});

test("the clock does not run until the demo starts", () => {
  const session = createSession({ durationMs: 1000 });
  assert.equal(session.snapshot().status, "intro");
  session.tick(5000);
  assert.equal(session.snapshot().progress, 0);
  assert.equal(session.snapshot().status, "intro");
  session.start();
  assert.equal(session.snapshot().status, "playing");
  session.start();
  assert.equal(session.snapshot().status, "playing");
});

test("playback pauses, ignores junk ticks, and ends exactly at one day", () => {
  const session = createSession({ durationMs: 1000, skipIntro: true });
  assert.equal(session.snapshot().status, "playing");
  session.tick(100);
  session.pause();
  session.tick(9000);
  session.tick(Number.NaN);
  session.tick(-20);
  session.tick(0);
  session.tick("fast");
  assert.ok(Math.abs(session.snapshot().progress - 0.1) < 1e-9);
  assert.equal(session.snapshot().status, "paused");
  session.start();
  assert.equal(session.snapshot().status, "paused");
  session.resume();
  session.tick(899);
  assert.equal(session.snapshot().status, "playing");
  session.tick(1);
  assert.equal(session.snapshot().status, "ended");
  assert.equal(session.snapshot().progress, 1);
  assert.equal(session.snapshot().phase.id, "night");
  session.tick(500);
  assert.equal(session.snapshot().progress, 1);
});

test("a huge tick finishes the day instead of running past it", () => {
  const session = createSession({ durationMs: 1000, skipIntro: true });
  session.tick(100_000);
  assert.equal(session.snapshot().status, "ended");
  assert.equal(session.snapshot().progress, 1);
});

test("replay, intro, and choices keep a coherent screen", () => {
  const session = createSession({
    durationMs: 1000,
    skipIntro: true,
    site: "mons-mouton",
    instrument: "dust-shield",
  });
  assert.equal(session.snapshot().site.id, "mons-mouton");
  assert.equal(session.snapshot().instrument.id, "dust-shield");
  session.tick(1000);
  assert.equal(session.snapshot().status, "ended");
  session.replay();
  assert.equal(session.snapshot().status, "playing");
  assert.equal(session.snapshot().progress, 0);
  session.pause();
  session.replay();
  assert.equal(session.snapshot().status, "playing");
  session.showIntro();
  assert.equal(session.snapshot().status, "intro");
  assert.equal(session.snapshot().progress, 0);
  session.tick(1000);
  assert.equal(session.snapshot().status, "intro");

  session.selectSite("");
  assert.equal(session.snapshot().site.id, "mons-mouton");
  assert.match(session.snapshot().siteNotice, /Pick a site/);
  session.selectSite("malapert a");
  assert.equal(session.snapshot().site.id, "malapert-a");
  assert.equal(session.snapshot().siteNotice, null);
  session.selectInstrument("not-a-real-instrument");
  assert.equal(session.snapshot().instrument.id, "heat-flow-drill");
  assert.match(session.snapshot().instrumentNotice, /not-a-real-instrument/);
  session.toggleRun();
  assert.equal(session.snapshot().status, "playing");
  session.toggleRun();
  assert.equal(session.snapshot().status, "paused");
  session.toggleRun();
  assert.equal(session.snapshot().status, "playing");
});

test("toggle from the end starts a new day at zero", () => {
  const session = createSession({ durationMs: 1000, skipIntro: true });
  session.tick(1000);
  session.toggleRun();
  const state = session.snapshot();
  assert.equal(state.status, "playing");
  assert.equal(state.progress, 0);
  assert.equal(state.phase.id, "dawn");
});

test("launch objects are resolved through the catalog", () => {
  const spoofed = createSession({
    site: { id: "atlantis", name: "Atlantis" },
    instrument: { id: "seagull", name: "Seagull" },
  });
  assert.equal(spoofed.snapshot().site.id, "mare-crisium");
  assert.equal(spoofed.snapshot().site.name, "Mare Crisium");
  assert.match(spoofed.snapshot().siteNotice, /atlantis/);
  assert.equal(spoofed.snapshot().instrument.id, "heat-flow-drill");
  assert.equal(spoofed.snapshot().instrument.name, "Heat-flow drill");
  assert.match(spoofed.snapshot().instrumentNotice, /seagull/);

  const known = createSession({
    site: { id: "mons-mouton", name: "Not Mons" },
    instrument: { id: "dust-shield", name: "Not dust" },
  });
  assert.equal(known.snapshot().site.name, "Mons Mouton");
  assert.equal(known.snapshot().instrument.name, "Dust shield");
  assert.equal(known.snapshot().siteNotice, null);
  assert.equal(known.snapshot().instrumentNotice, null);
});

test("blank selection during play does not wipe a valid choice", () => {
  const session = createSession({ skipIntro: true });
  session.selectInstrument("   ");
  assert.equal(session.snapshot().instrument.id, INSTRUMENTS[0].id);
  assert.match(session.snapshot().instrumentNotice, /Pick an instrument/);
  session.selectSite("reiner gamma");
  assert.equal(session.snapshot().site.name, "Reiner Gamma");
});

test("the page still points at the screen module and the phase styles", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(html, /src="src\/screen\.js"/);
  assert.match(html, /href="styles\.css"/);
  for (const id of [
    "intro",
    "start",
    "demo",
    "demo-title",
    "toggle",
    "replay",
    "back",
    "intro-sites",
    "demo-sites",
    "intro-instruments",
    "demo-instruments",
    "end-banner",
    "skip",
    "intro-title",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="skip"[^>]*href="#intro-title"/);
  assert.match(html, /id="intro-title" tabindex="-1"/);
  assert.doesNotMatch(html, /data-view/);
  assert.doesNotMatch(css, /data-view/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  for (const phase of ["intro", "dawn", "day", "dusk", "night"]) {
    assert.match(css, new RegExp(`data-phase="${phase}"`));
  }
  assert.equal(SITES.length, 4);
  assert.equal(INSTRUMENTS.length, 5);
  assert.equal(INSTRUMENTS.map((item) => item.id).join(","), "heat-flow-drill,laser-retroreflector,dust-shield,trident,ln-1");
  assert.match(INSTRUMENTS.find((item) => item.id === "trident").line, /MSOLO/);
  assert.match(INSTRUMENTS.find((item) => item.id === "ln-1").line, /Malapert A/);
});
