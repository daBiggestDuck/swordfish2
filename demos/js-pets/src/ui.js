import { PETS, PHASES, listSources, nextPhase, present } from "./pets.js";
import {
  isDropPet,
  readPlacedPet,
  subscribePlacedPet,
} from "../../../web/pet_moon.js";
import { renderPet3D } from "../../../web/pets-3d/pets3d.js";

const DAY_MS = 2800;
const PAUSE_TEXT = "Playback paused.";

const app = document.querySelector("#app");
const colophon = document.querySelector("#colophon");

let petId = PETS[0].id;
let phaseId = PHASES[0].id;
let playing = false;
let stepTimer = null;
let livePoseKey = "";
let moonLink = null;
let shellBuilt = false;

/** @type {Awaited<ReturnType<typeof renderPet3D>> | null} */
let stageHandle = null;
/** @type {Map<string, Awaited<ReturnType<typeof renderPet3D>>>} */
const galleryHandles = new Map();
/** @type {Map<string, Awaited<ReturnType<typeof renderPet3D>>>} */
const adoptHandles = new Map();
let mountGeneration = 0;
/** @type {IntersectionObserver | null} */
let galleryObserver = null;
/** Keep gallery WebGL count low (stage + adopt strip already use 5 contexts). */
const GALLERY_MAX_LIVE = 6;

boot();

function boot() {
  syncFromMapPlacement(readPlacedPet());
  subscribePlacedPet((placed) => {
    if (!syncFromMapPlacement(placed)) return;
    pause();
    void syncView({ remountStage: true });
  });
  renderSources();
  void syncView({ rebuild: true });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !playing) return;
    pause();
    void syncView({ pauseNotice: true });
  });
}

function syncFromMapPlacement(placed) {
  if (!placed || !isDropPet(placed.petId)) {
    moonLink = null;
    return false;
  }
  if (!PETS.some((p) => p.id === placed.petId)) return false;
  petId = placed.petId;
  if (placed.phaseId && PHASES.some((p) => p.id === placed.phaseId)) {
    phaseId = placed.phaseId;
  }
  moonLink = placed;
  return true;
}

function moonBannerText() {
  if (!moonLink) {
    return "Judge loop: open Map / Sites → pick a pet → Drop on Moon → scrub the sun clock. Come back here to see the same 3D mood.";
  }
  const mood = moonLink.label || moonLink.moodId || "reacting";
  const site = moonLink.siteName || "the Moon";
  return `Live from Map: ${PETS.find((p) => p.id === moonLink.petId)?.name || moonLink.petId} at ${site} · ${mood}. Scrub Map’s sun clock to watch sun / night / Earth signal drive this model.`;
}

/**
 * @param {{
 *   rebuild?: boolean,
 *   remountStage?: boolean,
 *   pauseNotice?: boolean,
 * }} [options]
 */
async function syncView(options = {}) {
  const focusKey = document.activeElement?.getAttribute?.("data-focus-key");
  const pose = present(petId, phaseId, presentOpts());
  if (options.pauseNotice) announcePause();
  else announcePose(pose);

  if (!shellBuilt || options.rebuild) {
    buildShell(pose);
    shellBuilt = true;
    await mountAll3D(pose);
  } else {
    paintCopy(pose);
    await updateStage3D(pose, options.remountStage);
    markPressed(app.querySelectorAll('[aria-label="Instrument"] button'), (button) => {
      return button.getAttribute("data-focus-key") === `pet:${petId}`;
    });
    markPressed(app.querySelectorAll('[aria-label="Adopt instrument"] button'), (button) => {
      return button.getAttribute("data-pet") === petId;
    });
    markPressed(app.querySelectorAll('[aria-label="Sunlight"] button'), (button) => {
      return button.getAttribute("data-focus-key") === `phase:${phaseId}`;
    });
    markPressed(app.querySelectorAll(".cell"), (cell) => {
      return cell.getAttribute("data-pet") === petId && cell.getAttribute("data-phase") === phaseId;
    });
    const playBtn = app.querySelector("#play");
    if (playBtn) {
      playBtn.textContent = playing ? "Pause" : "Play the lunar day";
      playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
    }
  }

  if (focusKey) {
    app.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
  }
}

function buildShell(pose) {
  disposeAll3D();
  const playingNow = playing;
  app.replaceChildren(
    el("p", {
      class: moonLink ? "moon-link is-live" : "moon-link hint",
      id: "moon-banner",
      role: moonLink ? "status" : undefined,
    }, [moonBannerText()]),
    el("section", { class: "adopt-strip-wrap" }, [
      el("h2", {}, ["Adopt an instrument"]),
      el("p", { class: "hint" }, [
        "3D hardware models — LISTER, Retro, EDS, Nodey. Pick one to preview moods above.",
      ]),
      el("div", { class: "adopt-strip", role: "group", "aria-label": "Adopt instrument" }, adoptCards()),
    ]),
    el("section", { class: "stage", id: "stage", tabindex: "-1" }, [
      el("div", { class: "stage-copy" }, [
        el("p", { class: "eyebrow" }, ["Now showing"]),
        el("h2", { id: "pet-name" }, [pose.pet.name]),
        el("p", { class: "kind" }, [pose.pet.kind]),
        el("p", { class: "mood", id: "mood-label" }, [pose.mood.label]),
        el("p", { class: "reason", id: "mood-reason" }, [
          moonLink?.reason || pose.reason,
        ]),
        el("p", { class: "blurb" }, [pose.pet.blurb]),
        ...(pose.pet.passport
          ? [el("p", { class: "passport", id: "pet-passport" }, [`Passport. ${pose.pet.passport}`])]
          : [el("p", { class: "passport is-empty", id: "pet-passport" }, [])]),
        el("div", { class: "controls", role: "group", "aria-label": "Instrument" }, [
          ...PETS.map((pet) =>
            el(
              "button",
              {
                type: "button",
                class: pet.id === petId ? "is-on" : "",
                "data-focus-key": `pet:${pet.id}`,
                "aria-pressed": pet.id === petId ? "true" : "false",
              },
              [pet.name],
            ),
          ),
        ]),
        el("div", { class: "controls", role: "group", "aria-label": "Sunlight" }, [
          ...PHASES.map((phase) =>
            el(
              "button",
              {
                type: "button",
                class: phase.id === phaseId ? "is-on" : "",
                "data-focus-key": `phase:${phase.id}`,
                "aria-pressed": phase.id === phaseId ? "true" : "false",
              },
              [phase.label],
            ),
          ),
        ]),
        el("div", { class: "controls" }, [
          el(
            "button",
            {
              type: "button",
              class: "primary",
              id: "play",
              "data-focus-key": "play",
              "aria-pressed": playingNow ? "true" : "false",
            },
            [playingNow ? "Pause" : "Play the lunar day"],
          ),
        ]),
        el("p", { class: "hint" }, [
          "Play steps from full sun to sunset to lunar night. The 3D model updates lighting and motion. Choosing a pet or a phase pauses it. Esc pauses too.",
        ]),
      ]),
      el("div", {
        class: "stage-art pets3d-host",
        id: "art",
        "aria-label": `${pose.pet.name} 3D instrument`,
      }),
    ]),
    el("section", { class: "gallery-wrap" }, [
      el("h2", {}, [`All ${PETS.length * PHASES.length} 3D poses`]),
      el("p", { class: "hint" }, [
        "Same instruments, same three times of the lunar day — each cell is a live Three.js model. Pick any cell to show it above.",
      ]),
      el("div", { class: "gallery" }, gallery()),
    ]),
  );
  wire();
}

function adoptCards() {
  return PETS.map((pet) => {
    const on = pet.id === petId;
    return el(
      "button",
      {
        type: "button",
        class: on ? "adopt-card is-on" : "adopt-card",
        "data-pet": pet.id,
        "data-focus-key": `adopt:${pet.id}`,
        "aria-pressed": on ? "true" : "false",
      },
      [
        el("div", {
          class: "adopt-view pets3d-host",
          id: `adopt-${pet.id}`,
          "aria-hidden": "true",
        }),
        el("span", { class: "adopt-name" }, [pet.name]),
        el("span", { class: "adopt-kind" }, [pet.kind]),
      ],
    );
  });
}

function gallery() {
  const cells = [];
  for (const pet of PETS) {
    for (const phase of PHASES) {
      const pose = present(pet.id, phase.id);
      const on = pet.id === petId && phase.id === phaseId;
      const key = `${pet.id}:${phase.id}`;
      cells.push(
        el(
          "button",
          {
            type: "button",
            class: on ? "cell is-on" : "cell",
            "data-pet": pet.id,
            "data-phase": phase.id,
            "data-focus-key": `cell:${pet.id}:${phase.id}`,
            "aria-pressed": on ? "true" : "false",
          },
          [
            el("div", {
              class: "thumb pets3d-host",
              id: `thumb-${key}`,
              "aria-hidden": "true",
            }),
            el("span", { class: "cell-label" }, [`${pet.name} · ${pose.mood.label}`]),
          ],
        ),
      );
    }
  }
  return cells;
}

function wire() {
  const petButtons = [...app.querySelectorAll('[aria-label="Instrument"] button')];
  PETS.forEach((pet, index) => {
    petButtons[index]?.addEventListener("click", () => {
      pause();
      petId = pet.id;
      void syncView();
    });
  });
  for (const card of app.querySelectorAll(".adopt-card")) {
    card.addEventListener("click", () => {
      pause();
      petId = card.getAttribute("data-pet");
      void syncView();
    });
  }
  const phaseButtons = [...app.querySelectorAll('[aria-label="Sunlight"] button')];
  PHASES.forEach((phase, index) => {
    phaseButtons[index]?.addEventListener("click", () => {
      pause();
      phaseId = phase.id;
      void syncView();
    });
  });
  app.querySelector("#play")?.addEventListener("click", () => {
    if (playing) {
      pause();
      void syncView({ pauseNotice: true });
    } else {
      play();
      void syncView();
    }
  });
  for (const cell of app.querySelectorAll(".cell")) {
    cell.addEventListener("click", () => {
      pause();
      petId = cell.getAttribute("data-pet");
      phaseId = cell.getAttribute("data-phase");
      void syncView();
    });
  }
}

function presentOpts() {
  if (!moonLink) return undefined;
  const opts = {};
  if (typeof moonLink.signal === "number") opts.signal = moonLink.signal;
  return opts;
}

function stageOpts(pose) {
  const mood = pose.mood.id;
  const fromMap = Boolean(moonLink && moonLink.petId === pose.pet.id);
  return {
    autoRotate: true,
    interactive: true,
    phaseId: pose.phase.id,
    powerGlow: fromMap
      ? Boolean(moonLink.powerGlow)
      : !pose.pet.passive && pose.phase.id === "day",
    signalStress: fromMap ? Boolean(moonLink.signalStress) : false,
    signal:
      fromMap && typeof moonLink.signal === "number"
        ? moonLink.signal
        : pose.pet.id === "ln-1"
          ? mood === "happy"
            ? 90
            : 35
          : 40,
  };
}

function thumbOpts(pose) {
  return {
    autoRotate: true,
    interactive: false,
    phaseId: pose.phase.id,
    powerGlow: !pose.pet.passive && pose.phase.id === "day",
    signal:
      pose.pet.id === "ln-1" ? (pose.mood.id === "happy" ? 90 : 35) : 40,
  };
}

async function mountAll3D(pose) {
  const gen = ++mountGeneration;
  await mountStage(pose);
  if (gen !== mountGeneration) return;
  await mountAdoptStrip();
  if (gen !== mountGeneration) return;
  await mountGallery();
}

async function mountStage(pose) {
  const art = app.querySelector("#art");
  if (!art) return;
  try {
    stageHandle = await renderPet3D(pose.pet.id, pose.mood.id, art, stageOpts(pose));
  } catch (err) {
    console.warn("[js-pets] stage renderPet3D failed", err);
    art.replaceChildren(
      el("p", { class: "mount-fallback" }, ["3D model unavailable — check network for Three.js."]),
    );
    stageHandle = null;
  }
}

async function updateStage3D(pose, forceRemount = false) {
  const art = app.querySelector("#art");
  if (!art) return;
  const opts = stageOpts(pose);
  if (!forceRemount && stageHandle && typeof stageHandle.update === "function") {
    if (stageHandle.petId !== pose.pet.id && typeof stageHandle.setPet === "function") {
      stageHandle.setPet(pose.pet.id);
    }
    if (stageHandle.petId === pose.pet.id) {
      stageHandle.update(pose.mood.id, opts);
      if (typeof stageHandle.setSignal === "function") {
        stageHandle.setSignal(opts.signal);
      }
      return;
    }
  }
  try {
    stageHandle?.dispose?.();
  } catch {
    /* ignore */
  }
  stageHandle = null;
  await mountStage(pose);
}

async function mountAdoptStrip() {
  for (const handle of adoptHandles.values()) {
    try {
      handle.dispose();
    } catch {
      /* ignore */
    }
  }
  adoptHandles.clear();
  for (const pet of PETS) {
    const host = app.querySelector(`#adopt-${pet.id}`);
    if (!host) continue;
    const pose = present(pet.id, "day");
    try {
      const handle = await renderPet3D(pet.id, pose.mood.id, host, {
        ...thumbOpts(pose),
        autoRotate: true,
      });
      adoptHandles.set(pet.id, handle);
    } catch (err) {
      console.warn(`[js-pets] adopt thumb ${pet.id} failed`, err);
      host.replaceChildren(el("span", { class: "mount-fallback" }, [pet.name]));
    }
  }
}

async function mountGallery() {
  disposeGalleryHandles();
  galleryObserver?.disconnect();
  galleryObserver = null;

  const hosts = [...app.querySelectorAll(".gallery .thumb[id^='thumb-']")];
  if (!hosts.length) return;

  if (typeof IntersectionObserver !== "function") {
    for (const host of hosts.slice(0, GALLERY_MAX_LIVE)) {
      await ensureGalleryMount(host);
    }
    return;
  }

  galleryObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const host = entry.target;
        if (!(host instanceof HTMLElement)) continue;
        if (entry.isIntersecting) void ensureGalleryMount(host);
        else releaseGalleryMount(host);
      }
    },
    { root: null, rootMargin: "80px 0px", threshold: 0.05 },
  );
  for (const host of hosts) galleryObserver.observe(host);
}

async function ensureGalleryMount(host) {
  const key = host.id.replace(/^thumb-/, "");
  if (!key || galleryHandles.has(key)) return;
  while (galleryHandles.size >= GALLERY_MAX_LIVE) {
    const oldest = galleryHandles.keys().next().value;
    if (!oldest) break;
    releaseGalleryMountByKey(oldest);
  }
  const [petKey, phaseKey] = key.split(":");
  if (!PETS.some((p) => p.id === petKey) || !PHASES.some((p) => p.id === phaseKey)) return;
  const pose = present(petKey, phaseKey);
  const gen = mountGeneration;
  try {
    const handle = await renderPet3D(petKey, pose.mood.id, host, thumbOpts(pose));
    if (gen !== mountGeneration) {
      handle.dispose();
      return;
    }
    galleryHandles.set(key, handle);
  } catch (err) {
    console.warn(`[js-pets] gallery ${key} failed`, err);
    host.replaceChildren(el("span", { class: "mount-fallback" }, [pose.mood.label]));
  }
}

function releaseGalleryMount(host) {
  const key = host?.id?.replace(/^thumb-/, "");
  if (key) releaseGalleryMountByKey(key);
}

function releaseGalleryMountByKey(key) {
  const handle = galleryHandles.get(key);
  if (!handle) return;
  galleryHandles.delete(key);
  try {
    handle.dispose();
  } catch {
    /* ignore */
  }
  const host = document.getElementById(`thumb-${key}`);
  if (host && !host.querySelector("canvas")) {
    host.replaceChildren();
  }
}

function disposeGalleryHandles() {
  for (const key of [...galleryHandles.keys()]) releaseGalleryMountByKey(key);
}

function disposeAll3D() {
  mountGeneration += 1;
  galleryObserver?.disconnect();
  galleryObserver = null;
  try {
    stageHandle?.dispose?.();
  } catch {
    /* ignore */
  }
  stageHandle = null;
  for (const handle of adoptHandles.values()) {
    try {
      handle.dispose();
    } catch {
      /* ignore */
    }
  }
  adoptHandles.clear();
  disposeGalleryHandles();
}

function paintCopy(pose) {
  const banner = app.querySelector("#moon-banner");
  if (banner) {
    banner.className = moonLink ? "moon-link is-live" : "moon-link hint";
    if (moonLink) banner.setAttribute("role", "status");
    else banner.removeAttribute("role");
    banner.textContent = moonBannerText();
  }
  const name = app.querySelector("#pet-name");
  if (name) name.textContent = pose.pet.name;
  const kind = app.querySelector(".kind");
  if (kind) kind.textContent = pose.pet.kind;
  const mood = app.querySelector("#mood-label");
  if (mood) mood.textContent = pose.mood.label;
  const reason = app.querySelector("#mood-reason");
  if (reason) reason.textContent = moonLink?.reason || pose.reason;
  const blurb = app.querySelector(".blurb");
  if (blurb) blurb.textContent = pose.pet.blurb;
  const passport = app.querySelector("#pet-passport");
  if (passport) {
    if (pose.pet.passport) {
      passport.classList.remove("is-empty");
      passport.textContent = `Passport. ${pose.pet.passport}`;
    } else {
      passport.classList.add("is-empty");
      passport.textContent = "";
    }
  }
}

function play() {
  pause();
  playing = true;
  const step = () => {
    if (!playing) return;
    phaseId = nextPhase(phaseId);
    void paintPhase();
    if (!playing) return;
    stepTimer = setTimeout(step, DAY_MS);
  };
  stepTimer = setTimeout(step, DAY_MS);
}

async function paintPhase() {
  const pose = present(petId, phaseId, presentOpts());
  announcePose(pose);
  paintCopy(pose);
  await updateStage3D(pose);
  markPressed(app.querySelectorAll('[aria-label="Sunlight"] button'), (button) => {
    return button.getAttribute("data-focus-key") === `phase:${phaseId}`;
  });
  markPressed(app.querySelectorAll(".cell"), (cell) => {
    return cell.getAttribute("data-pet") === petId && cell.getAttribute("data-phase") === phaseId;
  });
}

function markPressed(nodes, isOn) {
  for (const node of nodes) {
    const on = isOn(node);
    node.classList.toggle("is-on", on);
    node.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function announcePose(pose) {
  const live = document.querySelector("#live");
  const key = `${pose.pet.id}:${pose.phase.id}:${pose.mood.id}`;
  const text = `${pose.pet.name}. ${pose.mood.label}. ${pose.reason}`;
  if (key === livePoseKey && live.textContent === text) return;
  livePoseKey = key;
  live.textContent = text;
}

function announcePause() {
  const live = document.querySelector("#live");
  if (live.textContent === PAUSE_TEXT) return;
  live.textContent = PAUSE_TEXT;
}

function pause() {
  playing = false;
  if (stepTimer == null) return;
  clearTimeout(stepTimer);
  stepTimer = null;
}

function renderSources() {
  const list = el("ul");
  for (const item of listSources()) {
    const link = el("a", { href: item.url }, [item.label]);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    list.append(el("li", {}, [link]));
  }
  colophon.replaceChildren(
    el("p", {}, [
      "Sources for the instruments and for why the retroreflector can sleep. Models are procedural Three.js (PayloadPets3D), not SVG faces.",
    ]),
    list,
  );
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (key === "class") node.className = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}
