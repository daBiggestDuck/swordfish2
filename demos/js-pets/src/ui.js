import { PETS, PHASES, TAGS, listSources, nextPhase, present } from "./pets.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DAY_MS = 2800;
const PAUSE_TEXT = "Playback paused.";

const app = document.querySelector("#app");
const colophon = document.querySelector("#colophon");

let petId = PETS[0].id;
let phaseId = PHASES[0].id;
let playing = false;
let stepTimer = null;
let livePoseKey = "";

boot();

function boot() {
  renderSources();
  render();
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !playing) return;
    pause();
    render({ pauseNotice: true });
  });
}

function render(options = {}) {
  const focusKey = document.activeElement?.getAttribute?.("data-focus-key");
  const pose = present(petId, phaseId);
  const playingNow = playing;
  if (options.pauseNotice) announcePause();
  else announcePose(pose);
  app.replaceChildren(
    el("section", { class: "stage", id: "stage", tabindex: "-1" }, [
      el("div", { class: "stage-copy" }, [
        el("p", { class: "eyebrow" }, ["Now showing"]),
        el("h2", { id: "pet-name" }, [pose.pet.name]),
        el("p", { class: "kind" }, [pose.pet.kind]),
        el("p", { class: "mood", id: "mood-label" }, [pose.mood.label]),
        el("p", { class: "reason", id: "mood-reason" }, [pose.reason]),
        el("p", { class: "blurb" }, [pose.pet.blurb]),
        ...(pose.pet.passport
          ? [el("p", { class: "passport", id: "pet-passport" }, [`Passport. ${pose.pet.passport}`])]
          : []),
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
          "Play steps from full sun to sunset to lunar night. Choosing a pet or a phase pauses it. Esc pauses too.",
        ]),
      ]),
      el("div", { class: `stage-art anim-${pose.mood.animation}`, id: "art" }, [
        draw(pose, "stage-pet"),
      ]),
    ]),
    el("section", { class: "gallery-wrap" }, [
      el("h2", {}, [`All ${PETS.length * PHASES.length} poses`]),
      el("p", { class: "hint" }, [
        "Same instruments, same three times of the lunar day. Pick any cell to show it above.",
      ]),
      el("div", { class: "gallery" }, gallery()),
    ]),
  );
  wire();
  if (focusKey) {
    app.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
  }
}

function wire() {
  const petButtons = [...app.querySelectorAll('[aria-label="Instrument"] button')];
  PETS.forEach((pet, index) => {
    petButtons[index].addEventListener("click", () => {
      pause();
      petId = pet.id;
      render();
    });
  });
  const phaseButtons = [...app.querySelectorAll('[aria-label="Sunlight"] button')];
  PHASES.forEach((phase, index) => {
    phaseButtons[index].addEventListener("click", () => {
      pause();
      phaseId = phase.id;
      render();
    });
  });
  app.querySelector("#play").addEventListener("click", () => {
    if (playing) {
      pause();
      render({ pauseNotice: true });
    } else {
      play();
      render();
    }
  });
  [...app.querySelectorAll(".cell")].forEach((cell) => {
    cell.addEventListener("click", () => {
      pause();
      petId = cell.getAttribute("data-pet");
      phaseId = cell.getAttribute("data-phase");
      render();
    });
  });
}

function gallery() {
  const cells = [];
  for (const pet of PETS) {
    for (const phase of PHASES) {
      const pose = present(pet.id, phase.id);
      const on = pet.id === petId && phase.id === phaseId;
      const button = el(
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
          el("span", { class: `thumb anim-${pose.mood.animation}` }, [draw(pose, `${pet.id}-${phase.id}`)]),
          el("span", { class: "cell-label" }, [`${pet.name} · ${pose.mood.label}`]),
        ],
      );
      cells.push(button);
    }
  }
  return cells;
}

function play() {
  pause();
  playing = true;
  const step = () => {
    if (!playing) return;
    phaseId = nextPhase(phaseId);
    paintPhase();
    if (!playing) return;
    stepTimer = setTimeout(step, DAY_MS);
  };
  stepTimer = setTimeout(step, DAY_MS);
}

function paintPhase() {
  const pose = present(petId, phaseId);
  announcePose(pose);
  const art = app.querySelector("#art");
  art.className = `stage-art anim-${pose.mood.animation}`;
  art.replaceChildren(draw(pose, "stage-pet"));
  app.querySelector("#mood-label").textContent = pose.mood.label;
  app.querySelector("#mood-reason").textContent = pose.reason;
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
    el("p", {}, ["Sources for the instruments and for why the retroreflector can sleep."]),
    list,
  );
}

function draw(pose, idPrefix) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", pose.scene.viewBox);
  svg.setAttribute("class", "pet-frame");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", `${idPrefix}-title ${idPrefix}-desc`);
  const title = document.createElementNS(SVG_NS, "title");
  title.id = `${idPrefix}-title`;
  title.textContent = pose.scene.title;
  const desc = document.createElementNS(SVG_NS, "desc");
  desc.id = `${idPrefix}-desc`;
  desc.textContent = pose.reason;
  svg.append(title, desc);
  for (const node of pose.scene.parts) svg.append(drawNode(node));
  return svg;
}

function drawNode(node) {
  if (Object.prototype.hasOwnProperty.call(node, "text")) {
    return document.createTextNode(node.text);
  }
  if (!TAGS.has(node.tag)) throw new Error(`Bad shape <${node.tag}>`);
  const shape = document.createElementNS(SVG_NS, node.tag);
  for (const [key, value] of Object.entries(node.attrs)) {
    shape.setAttribute(key, value);
  }
  for (const child of node.children || []) shape.append(drawNode(child));
  return shape;
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
