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

const root = typeof document === "undefined" ? null : document;
const app = root && root.querySelector("#app");
const rules = root && root.querySelector("#rules");
const sources = root && root.querySelector("#sources");

const petById = new Map(PETS.map((pet) => [pet.id, pet]));
const siteById = new Map(SITES.map((site) => [site.id, site]));

let run = null;
let panel = 1;
let heater = false;
let wait = false;

if (root) boot();

function boot() {
  renderRules();
  renderSources();
  renderSetup();
}

function renderRules() {
  const align = "panelFloor + (1 − panelFloor) × panel";
  rules.replaceChildren(
    el("p", { class: "eyebrow" }, ["Balance"]),
    el("p", {}, [
      `Power change = sun × (${align}) × dust × solar − draw. Draw is the instrument draw while the sun is up, and nightBus in the dark. The heater adds heaterPower when it is on. A retroreflector skips Power and Warmth.`,
    ]),
    el("p", {}, [
      "Warmth change = sun × sunWarm + heaterWarm − (warmthLeak + (1 − sun) × darkLeak + nightLeak). The heater term is 0 when the heater is off. nightLeak is added only on the night coda. A retroreflector skips warmth.",
    ]),
    el("p", {}, [
      "Signal change = earth × waitGain − waitOverhead while waiting, or −idleDrop while idle. Meters use Math.round, then clamp to 0–100.",
    ]),
    el("ul", { class: "const-list" }, Object.entries(RULES).map(([key, value]) => el("li", {}, [`${key} = ${value}`]))),
  );
}

function renderSources() {
  const list = el("ul");
  for (const item of SOURCES) {
    const link = el("a", { href: item.url, rel: "noopener noreferrer" }, [item.label]);
    list.append(el("li", {}, [link]));
  }
  sources.replaceChildren(el("p", {}, ["Program context for this model. The curves themselves are game rules."]), list);
}

function renderSetup(message = "") {
  run = null;
  const form = el("form", { id: "adopt", class: "sheet" });
  form.append(
    el("p", { class: "eyebrow" }, ["Engine"]),
    el("h2", {}, ["Balance the meters"]),
    el("p", { class: "lede" }, [
      "One lunar day is 14 Earth days of daylight, then 3 night steps. Tilt the panels, switch the heater, or wait for Earth.",
    ]),
    choiceGroup("pet", "Instrument", PETS, (pet) => [
      pet.name,
      pet.kind,
      pet.summary,
      pet.passport ? `Passport. ${pet.passport}` : null,
    ]),
    choiceGroup("site", "Landing site", SITES, (site) => [
      site.name,
      site.region,
      site.summary,
    ]),
    el("p", { id: "form-error", class: "form-error", role: "alert" }, [message]),
    el("button", { type: "submit", class: "primary", id: "start-run" }, ["Start the run"]),
  );
  form.addEventListener("submit", onStart);
  app.replaceChildren(form);
}

function onStart(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const petId = data.get("pet");
  const siteId = data.get("site");
  const problems = [];
  if (!petId) problems.push("Pick an instrument.");
  if (!siteId) problems.push("Pick a landing site.");
  if (problems.length) {
    document.querySelector("#form-error").textContent = problems.join(" ");
    return;
  }
  try {
    run = createRun({ petId, siteId });
  } catch (err) {
    document.querySelector("#form-error").textContent = err.message;
    return;
  }
  panel = 1;
  heater = false;
  wait = false;
  renderStage();
}

function renderStage() {
  const pet = petById.get(run.petId);
  const site = siteById.get(run.siteId);
  const stage = el("section", { class: "sheet stage" });
  stage.append(
    el("p", { class: "eyebrow" }, ["Run"]),
    el("h2", { id: "day-label" }, [dayText(run)]),
    el("p", { class: "who" }, [`${pet.name} at ${site.name}`]),
    el("p", { id: "status", class: `status is-${run.status}` }, [run.status]),
    el("p", { id: "note", class: "note", role: "status", "aria-live": "polite" }, [run.note]),
    el("div", { class: "meters" }, [
      meter("power", "Power", run.power),
      meter("warmth", "Warmth", run.warmth),
      meter("signal", "Signal", run.signal),
    ]),
    el("p", { id: "ahead", class: "ahead" }, [aheadText(run)]),
    controls(pet),
    el("div", { class: "actions" }, [
      el("button", { type: "button", id: "step", class: "primary" }, ["Step with these controls"]),
      el("button", { type: "button", id: "suggest-step" }, ["Step the suggestion"]),
      el("button", { type: "button", id: "play-out" }, ["Finish with the suggestion"]),
      el("button", { type: "button", id: "new-run" }, ["New run"]),
    ]),
    el("p", { id: "step-error", class: "form-error", role: "alert" }, [""]),
    el("h3", {}, ["This step"]),
    el("p", { id: "books", class: "books" }, ["No step yet. Sun, draw, and the meter changes show up here."]),
    el("h3", {}, ["Log"]),
    el("ol", { id: "log", class: "log" }),
  );
  stage.querySelector("#step").addEventListener("click", () => step(readControls()));
  stage.querySelector("#suggest-step").addEventListener("click", () => step(suggestAction(run)));
  stage.querySelector("#play-out").addEventListener("click", finishSuggested);
  stage.querySelector("#new-run").addEventListener("click", () => renderSetup());
  app.replaceChildren(stage);
  syncHeater(pet);
}

function controls(pet) {
  const panelInput = el("input", {
    id: "panel",
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    value: String(Math.round(panel * 100)),
  });
  const panelReadout = el("span", { id: "panel-readout" }, [percent(panel)]);
  panelInput.addEventListener("input", () => {
    panel = Number(panelInput.value) / 100;
    panelReadout.textContent = percent(panel);
  });
  const heaterInput = el("input", { id: "heater", type: "checkbox" });
  heaterInput.checked = heater;
  heaterInput.disabled = !pet.needsPower;
  heaterInput.addEventListener("change", () => {
    heater = heaterInput.checked;
  });
  const waitInput = el("input", { id: "wait", type: "checkbox" });
  waitInput.checked = wait;
  waitInput.addEventListener("change", () => {
    wait = waitInput.checked;
  });
  return el("fieldset", { class: "controls" }, [
    el("legend", {}, ["Controls for the next Earth day"]),
    el("label", { class: "slider", for: "panel" }, ["Panel tilt ", panelReadout]),
    panelInput,
    el("label", { class: "check" }, [heaterInput, pet.needsPower ? " Heater on" : " Heater does nothing for a retroreflector"]),
    el("label", { class: "check" }, [waitInput, " Wait for the Earth link"]),
  ]);
}

function readControls() {
  const pet = petById.get(run.petId);
  return { panel, heater: pet.needsPower ? heater : false, wait };
}

function syncHeater(pet) {
  if (!pet.needsPower) heater = false;
}

function step(action) {
  const error = document.querySelector("#step-error");
  try {
    run = advance(run, action);
  } catch (err) {
    error.textContent = err.message;
    return;
  }
  error.textContent = "";
  panel = run.panel;
  heater = run.heater;
  wait = run.wait;
  paint();
  document.querySelector("#log").append(el("li", {}, [logLine(run)]));
}

function finishSuggested() {
  const error = document.querySelector("#step-error");
  let trace;
  try {
    trace = play(run, suggestAction);
  } catch (err) {
    error.textContent = err.message;
    return;
  }
  if (!trace.length) {
    error.textContent = run.phase === "lost" ? "The pet is already lost." : "The run is already over.";
    return;
  }
  error.textContent = "";
  const log = document.querySelector("#log");
  for (const stepState of trace) log.append(el("li", {}, [logLine(stepState)]));
  run = trace.at(-1);
  panel = run.panel;
  heater = run.heater;
  wait = run.wait;
  paint();
}

function paint() {
  const pet = petById.get(run.petId);
  document.querySelector("#day-label").textContent = dayText(run);
  const status = document.querySelector("#status");
  status.textContent = run.status;
  status.className = `status is-${run.status}`;
  document.querySelector("#note").textContent = run.note;
  setMeter("power", run.power);
  setMeter("warmth", run.warmth);
  setMeter("signal", run.signal);
  document.querySelector("#ahead").textContent = aheadText(run);
  document.querySelector("#books").textContent = booksText(run);
  const panelInput = document.querySelector("#panel");
  panelInput.value = String(Math.round(panel * 100));
  document.querySelector("#panel-readout").textContent = percent(panel);
  const heaterInput = document.querySelector("#heater");
  heaterInput.checked = heater;
  heaterInput.disabled = !pet.needsPower;
  document.querySelector("#wait").checked = wait;
  const ended = run.ended || run.phase === "lost";
  for (const id of ["step", "suggest-step", "play-out", "panel", "wait"]) {
    document.querySelector(`#${id}`).disabled = ended;
  }
  if (!pet.needsPower || ended) heaterInput.disabled = true;
}

function dayText(state) {
  if (state.phase === "ready") return "Before dawn";
  if (state.phase === "night") return `Night ${state.night} of ${RULES.nightDays}`;
  if (state.phase === "lost") {
    return state.night > 0 ? `Lost on night ${state.night}` : `Lost on Earth day ${state.day}`;
  }
  return `Earth day ${state.day} of ${RULES.daylightDays}`;
}

function aheadText(state) {
  const ahead = lookAhead(state);
  if (!ahead) return "No further step.";
  const when = ahead.phase === "night" ? `night ${ahead.night}` : `Earth day ${ahead.day}`;
  return `Next step is ${when}. Sun ${percent(ahead.sun)}. Earth view ${percent(ahead.earth)}. Dust ${ahead.dust}.`;
}

function booksText(state) {
  if (!state.books) return "No step yet.";
  const books = state.books;
  const ignored = state.ignored.length ? ` Ignored: ${state.ignored.join(", ")}.` : "";
  return `Sun ${percent(state.sun)}. Solar +${books.solarGain}, draw ${books.powerDraw}, power ${signed(books.powerApplied)}. Warmth gain ${books.warmthGain}, leak ${books.warmthLeak}, warmth ${signed(books.warmthApplied)}. Signal ${signed(books.signalApplied)}.${ignored}`;
}

export function logLine(state) {
  const when = state.night > 0 ? `Night ${state.night}` : `Day ${state.day}`;
  return `${when}. ${state.status}. Power ${state.power}, Warmth ${state.warmth}, Signal ${state.signal}.`;
}

function setMeter(name, value) {
  const meterNode = document.querySelector(`#${name}-meter`);
  meterNode.setAttribute("aria-valuenow", String(value));
  meterNode.querySelector(".meter-fill").style.width = `${value}%`;
  document.querySelector(`#${name}-value`).textContent = String(value);
}

function meter(name, label, value) {
  return el("div", { class: "meter" }, [
    el("div", { class: "meter-top" }, [
      el("span", {}, [label]),
      el("span", { id: `${name}-value` }, [String(value)]),
    ]),
    el("div", {
      id: `${name}-meter`,
      class: "meter-track",
      role: "meter",
      "aria-label": label,
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": String(value),
    }, [el("div", { class: `meter-fill ${name}`, style: `width:${value}%` })]),
  ]);
}

function choiceGroup(name, legend, items, lines) {
  const group = el("fieldset", { class: "choices" });
  group.append(el("legend", {}, [legend]));
  for (const item of items) {
    const [title, meta, body, passport] = lines(item);
    const input = el("input", { type: "radio", name, value: item.id });
    if (item.id === "lister" || item.id === "mare-crisium") input.checked = true;
    const copy = [
      el("span", { class: "choice-name" }, [title]),
      el("span", { class: "choice-meta" }, [meta]),
      el("span", { class: "choice-body" }, [body]),
    ];
    if (passport) copy.push(el("span", { class: "choice-passport" }, [passport]));
    group.append(
      el("label", { class: "choice" }, [
        input,
        el("span", { class: "choice-copy" }, copy),
      ]),
    );
  }
  return group;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}
