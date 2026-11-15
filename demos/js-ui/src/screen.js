/**
 * Binds the demo session to the intro page.
 * The module is safe to import under Node: it only touches the document
 * when one exists.
 */

import {
  INSTRUMENTS,
  SITES,
  createSession,
  phaseAt,
  readLaunchOptions,
} from "./demo.js";

const FRAME_CAP_MS = 250;
const COARSE_STEP_MS = 1000;

function must(doc, id) {
  const node = doc.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node;
}

function writeText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function writeAttr(node, name, value) {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

function writeTitle(doc, value) {
  if (doc.title === undefined || doc.title === value) return;
  doc.title = value;
}

function prefersReducedMotion() {
  if (typeof globalThis.matchMedia !== "function") return false;
  const query = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
  return Boolean(query && query.matches);
}

function nowMs() {
  const perf = globalThis.performance;
  if (perf && typeof perf.now === "function") return perf.now();
  return Date.now();
}

/**
 * Wake on the next phase boundary or once a second, whichever is sooner,
 * so reduced motion jumps the sun instead of interpolating every frame.
 */
function nextWakeMs(progress, durationMs) {
  const phase = phaseAt(progress);
  const untilPhase =
    phase.end > progress ? (phase.end - progress) * durationMs : COARSE_STEP_MS;
  return Math.max(32, Math.min(COARSE_STEP_MS, untilPhase));
}

function fillChoices(container, items, kind, onPick) {
  container.replaceChildren();
  for (const item of items) {
    const button = container.ownerDocument.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.dataset.choice = kind;
    button.dataset.id = item.id;
    button.textContent = item.name;
    button.addEventListener("click", () => onPick(item.id));
    container.append(button);
  }
}

function setPressed(doc, kind, id) {
  for (const button of doc.querySelectorAll(`[data-choice="${kind}"]`)) {
    writeAttr(button, "aria-pressed", button.dataset.id === id ? "true" : "false");
  }
}

export function mount(doc, session) {
  const intro = must(doc, "intro");
  const demo = must(doc, "demo");
  const start = must(doc, "start");
  const toggle = must(doc, "toggle");
  const replay = must(doc, "replay");
  const back = must(doc, "back");
  const demoTitle = must(doc, "demo-title");
  const skip = must(doc, "skip");
  const instrumentName = must(doc, "instrument-name");
  const instrumentLine = must(doc, "instrument-line");
  const placeLine = must(doc, "place-line");
  const dayLabel = must(doc, "day-label");
  const phaseLabel = must(doc, "phase-label");
  const sunReadout = must(doc, "sun-readout");
  const introNotice = must(doc, "intro-notice");
  const demoNotice = must(doc, "demo-notice");
  const endBanner = must(doc, "end-banner");
  const live = must(doc, "live");
  const windowEl = must(doc, "sky");

  fillChoices(must(doc, "intro-sites"), SITES, "site", (id) => {
    session.selectSite(id);
    render();
  });
  fillChoices(must(doc, "demo-sites"), SITES, "site", (id) => {
    session.selectSite(id);
    render();
  });
  fillChoices(must(doc, "intro-instruments"), INSTRUMENTS, "instrument", (id) => {
    session.selectInstrument(id);
    render();
  });
  fillChoices(must(doc, "demo-instruments"), INSTRUMENTS, "instrument", (id) => {
    session.selectInstrument(id);
    render();
  });

  let previousStatus = null;
  let previousPhase = null;
  let paintedLight = null;
  let running = false;
  let frame = 0;
  let timer = 0;
  let last = null;

  function noticeText(state) {
    return [state.siteNotice, state.instrumentNotice].filter(Boolean).join(" ");
  }

  function paintSun(light) {
    if (paintedLight === light) return;
    paintedLight = light;
    doc.documentElement.style.setProperty("--sunlight", light);
    windowEl.style.setProperty("--sunlight", light);
  }

  function render() {
    const state = session.snapshot();
    const onIntro = state.status === "intro";
    const phaseId = onIntro ? "intro" : state.phase.id;
    if (doc.body.dataset.phase !== phaseId) doc.body.dataset.phase = phaseId;
    intro.hidden = !onIntro;
    demo.hidden = onIntro;
    paintSun(state.sunlight.toFixed(3));

    writeText(instrumentName, state.instrument.name);
    writeText(instrumentLine, state.instrument.line);
    writeText(placeLine, `${state.site.name}. ${state.site.line}`);
    writeText(dayLabel, state.dayLabel);
    writeText(phaseLabel, state.phase.label);
    writeText(sunReadout, `Sunlight on this screen ${Math.round(state.sunlight * 100)}%`);

    const notice = noticeText(state);
    writeText(introNotice, notice);
    writeText(demoNotice, notice);
    setPressed(doc, "site", state.site.id);
    setPressed(doc, "instrument", state.instrument.id);

    const ended = state.status === "ended";
    endBanner.hidden = !ended;
    writeText(
      endBanner,
      ended
        ? `That was one lunar day at ${state.site.name} with the ${state.instrument.name}.`
        : "",
    );
    toggle.hidden = onIntro || ended;
    writeText(toggle, state.status === "paused" ? "Resume" : "Pause");
    replay.hidden = onIntro;
    back.hidden = onIntro;
    writeAttr(skip, "href", onIntro ? "#intro-title" : "#demo-title");
    writeText(skip, onIntro ? "Skip to content" : "Skip to demo");

    if (state.status !== previousStatus || state.phase.id !== previousPhase) {
      if (onIntro) {
        writeText(live, "Intro. Pick a site and an instrument, then start the demo.");
      } else if (ended) writeText(live, endBanner.textContent);
      else writeText(live, `${state.phase.label}. ${state.dayLabel}. ${state.site.name}.`);
    }

    if (previousStatus !== state.status) {
      if (state.status === "intro" && previousStatus) start.focus();
      else if (previousStatus === "intro") demoTitle.focus();
      else if (state.status === "ended") endBanner.focus();
    }

    writeTitle(doc, onIntro ? "Payload Pets — intro" : `Payload Pets — ${state.phase.label}`);
    previousStatus = state.status;
    previousPhase = state.phase.id;
  }

  function stopLoop() {
    running = false;
    if (frame && typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(frame);
    }
    frame = 0;
    if (timer) globalThis.clearTimeout(timer);
    timer = 0;
  }

  function onFrame(now) {
    frame = 0;
    if (!running || session.snapshot().status !== "playing") {
      running = false;
      return;
    }
    if (last == null) last = now;
    const delta = Math.min(FRAME_CAP_MS, Math.max(0, now - last));
    last = now;
    if (delta > 0) session.tick(delta);
    render();
    if (running && session.snapshot().status === "playing") {
      frame = globalThis.requestAnimationFrame(onFrame);
    } else running = false;
  }

  function scheduleReduced() {
    const state = session.snapshot();
    const delay = nextWakeMs(state.progress, state.durationMs);
    timer = globalThis.setTimeout(onReduced, delay);
  }

  function onReduced() {
    timer = 0;
    if (!running || session.snapshot().status !== "playing") {
      running = false;
      return;
    }
    const now = nowMs();
    if (last == null) last = now;
    const delta = Math.min(COARSE_STEP_MS, Math.max(0, now - last));
    last = now;
    if (delta > 0) session.tick(delta);
    render();
    if (running && session.snapshot().status === "playing") scheduleReduced();
    else running = false;
  }

  function startLoop() {
    if (running || session.snapshot().status !== "playing") return;
    running = true;
    last = null;
    if (prefersReducedMotion()) {
      last = nowMs();
      scheduleReduced();
      return;
    }
    if (typeof globalThis.requestAnimationFrame !== "function") {
      running = false;
      return;
    }
    frame = globalThis.requestAnimationFrame(onFrame);
  }

  function paint() {
    render();
    if (session.snapshot().status === "playing") startLoop();
    else stopLoop();
  }

  function restartLoop() {
    stopLoop();
    paint();
  }

  start.addEventListener("click", () => {
    session.start();
    paint();
  });
  toggle.addEventListener("click", () => {
    session.toggleRun();
    paint();
  });
  replay.addEventListener("click", () => {
    session.replay();
    restartLoop();
  });
  back.addEventListener("click", () => {
    session.showIntro();
    paint();
  });

  doc.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    const typingTarget =
      target &&
      (target.tagName === "BUTTON" || target.tagName === "A" || target.tagName === "INPUT");
    const space = event.key === " " || event.key === "Spacebar";
    if (typingTarget && (space || event.key === "Enter")) return;

    if (event.key === "Enter" && session.snapshot().status === "intro") {
      session.start();
      paint();
      event.preventDefault();
      return;
    }
    if (space) {
      if (session.snapshot().status === "intro") return;
      session.toggleRun();
      paint();
      event.preventDefault();
      return;
    }
    if (event.key === "r" || event.key === "R") {
      if (session.snapshot().status !== "intro") {
        session.replay();
        restartLoop();
      }
      return;
    }
    if (event.key === "Escape") {
      session.showIntro();
      paint();
      return;
    }
    if (/^[1-4]$/.test(event.key)) {
      session.selectSite(SITES[Number(event.key) - 1].id);
      paint();
    }
  });

  paint();

  return {
    session,
    render: paint,
    stop() {
      stopLoop();
    },
  };
}

if (typeof document !== "undefined") {
  mount(document, createSession(readLaunchOptions(window.location.search)));
}
