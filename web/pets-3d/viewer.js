import {
  ALL_PETS,
  CANONICAL_PETS,
  EXTRA_PETS,
  preloadPets3D,
  renderPet3D,
  showPets3DError,
} from "./pets3d.js";

const app = document.querySelector("#app");
const PETS = [...CANONICAL_PETS, ...EXTRA_PETS];

let petId = CANONICAL_PETS[0].id;
let mood = "happy";
/** @type {Awaited<ReturnType<typeof renderPet3D>> | null} */
let main = null;
/** @type {Map<string, Awaited<ReturnType<typeof renderPet3D>>>} */
const thumbs = new Map();

boot();

async function boot() {
  renderShell();
  try {
    await preloadPets3D(PETS.map((p) => p.id));
  } catch (err) {
    console.warn("[pets-3d/viewer] preload failed", err);
    const viewport = document.querySelector("#viewport");
    if (viewport) {
      showPets3DError(
        viewport,
        err instanceof Error ? err.message : "Three.js failed to load",
        { onRetry: () => void boot() },
      );
    }
    return;
  }
  await mountMain();
  await mountThumbs();
}

function renderShell() {
  const pet = PETS.find((p) => p.id === petId) || PETS[0];
  app.replaceChildren(
    section("stage", [
      el("div", { class: "viewport", id: "viewport" }),
      el("div", { class: "copy" }, [
        el("p", { class: "eyebrow" }, ["Instrument model"]),
        el("h2", { id: "pet-name" }, [pet.name]),
        el("p", { class: "kind", id: "pet-kind" }, [pet.kind]),
        el("p", { class: "mood", id: "mood-label" }, [moodLabel(mood)]),
        el("p", { class: "blurb" }, [
          "Procedural Three.js geometry — drill, corner-cube reflector, dust-shield panel, ice auger, or ranging beacon. Drag to orbit.",
        ]),
        el("div", { class: "controls", role: "group", "aria-label": "Instrument" }, [
          ...PETS.map((p) =>
            el(
              "button",
              {
                type: "button",
                class: p.id === petId ? "is-on" : "",
                "data-pet": p.id,
                "aria-pressed": p.id === petId ? "true" : "false",
              },
              [p.name],
            ),
          ),
        ]),
        el("div", { class: "controls", role: "group", "aria-label": "Mood" }, [
          ...["happy", "shivering", "sleeping", "cold"].map((m) =>
            el(
              "button",
              {
                type: "button",
                class: m === mood ? "is-on" : "",
                "data-mood": m,
                "aria-pressed": m === mood ? "true" : "false",
              },
              [moodLabel(m)],
            ),
          ),
        ]),
        el("p", { class: "hint" }, [
          "Catalog four: LISTER · Retro · EDS · Nodey. Triddy (ice-drill) is mounted for moon-drop.",
        ]),
      ]),
    ]),
    el("div", { class: "strip", id: "strip" }, [
      ...PETS.map((p) =>
        el(
          "button",
          {
            type: "button",
            class: p.id === petId ? "thumb is-on" : "thumb",
            "data-thumb": p.id,
          },
          [
            el("div", { class: "thumb-view", id: `thumb-${p.id}` }),
            el("span", { class: "thumb-label" }, [p.name]),
            el("span", { class: "thumb-kind" }, [p.silhouette || p.kind]),
          ],
        ),
      ),
    ]),
  );

  for (const btn of app.querySelectorAll("[data-pet]")) {
    btn.addEventListener("click", () => {
      petId = btn.getAttribute("data-pet");
      sync();
    });
  }
  for (const btn of app.querySelectorAll("[data-mood]")) {
    btn.addEventListener("click", () => {
      mood = btn.getAttribute("data-mood");
      sync();
    });
  }
  for (const btn of app.querySelectorAll("[data-thumb]")) {
    btn.addEventListener("click", () => {
      petId = btn.getAttribute("data-thumb");
      sync();
    });
  }
}

async function mountMain() {
  try {
    main?.dispose();
  } catch {
    /* ignore */
  }
  const viewport = document.querySelector("#viewport");
  try {
    main = await renderPet3D(petId, mood, viewport, {
      autoRotate: true,
      interactive: true,
      mode: "live",
      showError: true,
      signal: petId === "ln-1" ? 90 : 40,
    });
  } catch (err) {
    console.warn("[pets-3d/viewer] main mount failed", err);
    main = null;
  }
}

async function mountThumbs() {
  for (const handle of thumbs.values()) {
    try {
      handle.dispose();
    } catch {
      /* ignore */
    }
  }
  thumbs.clear();
  for (const pet of PETS) {
    const elNode = document.querySelector(`#thumb-${pet.id}`);
    if (!elNode) continue;
    try {
      const handle = await renderPet3D(pet.id, "happy", elNode, {
        autoRotate: true,
        interactive: false,
        mode: "shared",
        showError: true,
        signal: pet.id === "ln-1" ? 90 : 40,
      });
      thumbs.set(pet.id, handle);
    } catch (err) {
      console.warn(`[pets-3d/viewer] thumb ${pet.id} failed`, err);
    }
  }
}

function sync() {
  const pet = PETS.find((p) => p.id === petId) || PETS[0];
  document.querySelector("#pet-name").textContent = pet.name;
  document.querySelector("#pet-kind").textContent = pet.kind;
  document.querySelector("#mood-label").textContent = moodLabel(mood);

  for (const btn of app.querySelectorAll("[data-pet]")) {
    const on = btn.getAttribute("data-pet") === petId;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  for (const btn of app.querySelectorAll("[data-mood]")) {
    const on = btn.getAttribute("data-mood") === mood;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  for (const btn of app.querySelectorAll("[data-thumb]")) {
    btn.classList.toggle("is-on", btn.getAttribute("data-thumb") === petId);
  }

  if (!main || main.petId !== petId) void mountMain();
  else {
    main.update(mood);
    if (petId === "ln-1") main.setSignal(mood === "happy" ? 90 : 40);
  }
}

function section(className, children) {
  return el("section", { class: className }, children);
}

function moodLabel(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}
