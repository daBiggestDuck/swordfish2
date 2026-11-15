/**
 * Drop a payload pet onto the Moon and drive live site reactions.
 * SVG via demos/js-pets present(); mounts sibling 3D when window.PayloadPets3D.renderPet3D exists.
 *
 * Canonical drop set (4): LISTER, Retro, EDS, Nodey — Power / Passive / Dust / Signal.
 */

import { present, PETS as ART_PETS, TAGS } from '../demos/js-pets/src/pets.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const STORAGE_KEYS = Object.freeze({
  selectedPet: 'payloadPets.selectedPet',
  placedPet: 'payloadPets.placedPet',
  selectedSite: 'payloadPets.selectedSite',
  selectedDrop: 'payloadPets.selectedDrop',
  channel: 'payloadPets',
});

/** Four judge-facing droppable pets (art ids match demos/js-pets). */
export const DROP_PETS = Object.freeze([
  freeze({
    id: 'lister',
    name: 'LISTER',
    kind: 'Heat-flow probe',
    role: 'Power',
    blurb: 'Needs solar power to drill and measure heat.',
  }),
  freeze({
    id: 'retro',
    name: 'Retro',
    kind: 'Laser retroreflector',
    role: 'Passive',
    blurb: 'Needs no power — sleeps through lunar night.',
  }),
  freeze({
    id: 'eds',
    name: 'EDS',
    kind: 'Electrodynamic dust shield',
    role: 'Power',
    blurb: 'Electric fields lift dust — needs power through the night.',
  }),
  freeze({
    id: 'ln-1',
    name: 'Nodey',
    kind: 'Navigation beacon (LN-1)',
    role: 'Signal',
    blurb: 'Radio moth — antenna stress when Earth is blocked.',
  }),
]);

const DROP_IDS = new Set(DROP_PETS.map((p) => p.id));

export function isDropPet(id) {
  return typeof id === 'string' && DROP_IDS.has(id);
}

export function getDropPet(id) {
  return DROP_PETS.find((p) => p.id === id) || null;
}

export function readSelectedPetId(fallback = 'lister') {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.selectedPet);
    if (isDropPet(raw)) return raw;
  } catch {
    /* ignore */
  }
  return isDropPet(fallback) ? fallback : DROP_PETS[0].id;
}

export function writeSelectedPetId(petId) {
  if (!isDropPet(petId)) return;
  try {
    localStorage.setItem(STORAGE_KEYS.selectedPet, petId);
  } catch {
    /* ignore */
  }
  broadcast({ type: 'selectedPet', petId });
}

export function readPlacedPet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.placedPet);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !isDropPet(parsed.petId)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePlacedPet(record) {
  if (!record || !isDropPet(record.petId)) return null;
  const payload = {
    ...record,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEYS.placedPet, JSON.stringify(payload));
    if (payload.siteId) {
      localStorage.setItem(STORAGE_KEYS.selectedSite, String(payload.siteId));
    }
  } catch {
    /* ignore */
  }
  broadcast({ type: 'placedPet', placed: payload });
  return payload;
}

export function clearPlacedPet() {
  try {
    localStorage.removeItem(STORAGE_KEYS.placedPet);
  } catch {
    /* ignore */
  }
  broadcast({ type: 'placedPet', placed: null });
}

/**
 * Map live sky / ephemeris sample → pet phase + signal for present().
 * sun → happy/power glow; night → cold/sleep; weak Earth → signal stress (Nodey).
 */
export function conditionsToReaction(petId, skyCurrent = {}, options = {}) {
  const pet = getDropPet(petId) || ART_PETS.find((p) => p.id === petId);
  const name = pet?.name || petId;
  const sunlit = Boolean(skyCurrent?.sunlit);
  const earthVisible = Boolean(skyCurrent?.earthVisible);
  const sunEl = Number(skyCurrent?.sunElevationDeg);
  const powerPct = Number(skyCurrent?.panelPowerPct);
  const safeSunEl = Number.isFinite(sunEl) ? sunEl : sunlit ? 12 : -5;
  const safePower = Number.isFinite(powerPct) ? powerPct : sunlit ? 70 : 0;

  let phaseId = 'day';
  if (!sunlit) phaseId = 'night';
  else if (safeSunEl < 6 || safePower < 32) phaseId = 'sunset';

  // Signal 0–100 for Nodey antenna blink; weak Earth → stress.
  let signal = earthVisible ? Math.max(55, Math.min(100, safePower + 20)) : 18;
  if (options.signal != null && Number.isFinite(Number(options.signal))) {
    signal = Number(options.signal);
  }

  const signalStress = petId === 'ln-1' && !earthVisible;
  const powerGlow = sunlit && phaseId === 'day' && !signalStress;

  let moodId = phaseId === 'day' ? 'happy' : phaseId === 'sunset' ? 'shivering' : petId === 'retro' ? 'sleeping' : 'cold';
  let animation = moodId === 'happy' ? 'bob' : moodId === 'shivering' ? 'shiver' : moodId === 'sleeping' ? 'sleep' : 'huddle';
  let label = moodId === 'happy' ? 'Happy' : moodId === 'shivering' ? 'Shivering' : moodId === 'sleeping' ? 'Sleeping' : 'Cold';
  let reason;

  if (signalStress && sunlit) {
    // Daylight but no Earth: Nodey stays powered yet antenna-stressed.
    phaseId = 'sunset';
    moodId = 'shivering';
    animation = 'shiver';
    label = 'Signal stress';
    reason = `Earth is blocked from this site. ${name} has power but the radio beacon cannot reach home — antenna tips go quiet.`;
    signal = 12;
  } else if (!sunlit) {
    reason =
      petId === 'retro'
        ? `Lunar night at the drop site. ${name} sleeps — a retroreflector needs no power.`
        : `Lunar night at the drop site. ${name} huddles cold without solar power.`;
  } else if (phaseId === 'sunset') {
    reason = `Sun is skimming the horizon (${safeSunEl.toFixed(0)}°). ${name} shivers as panel power falls to ${safePower.toFixed(0)}%.`;
  } else {
    reason = `Full sun on the site (${safePower.toFixed(0)}% solar). ${name} glows happy${
      earthVisible ? ' with a clear Earth signal' : ''
    }.`;
  }

  return freeze({
    petId,
    phaseId,
    moodId,
    label,
    animation,
    reason,
    signal,
    signalStress,
    powerGlow,
    sunlit,
    earthVisible,
    sunElevationDeg: safeSunEl,
    panelPowerPct: safePower,
  });
}

/**
 * Build a present()-compatible pose, with signal-stress copy override when needed.
 */
export function poseForSite(petId, skyCurrent, options = {}) {
  const reaction = conditionsToReaction(petId, skyCurrent, options);
  const pose = present(petId, reaction.phaseId, { signal: reaction.signal });
  return {
    ...pose,
    reaction,
    mood: freeze({
      id: reaction.moodId,
      label: reaction.label,
      animation: reaction.animation,
    }),
    reason: reaction.reason,
  };
}

function applyHostReactionClass(host, reaction, visual) {
  host.dataset.petVisual = visual;
  host.dataset.mood = reaction.moodId;
  host.dataset.powerGlow = reaction.powerGlow ? '1' : '0';
  host.dataset.signalStress = reaction.signalStress ? '1' : '0';
  host.classList.add('moon-pet-visual');
  for (const cls of [...host.classList]) {
    if (cls.startsWith('anim-') || cls === 'power-glow' || cls === 'signal-stress') {
      host.classList.remove(cls);
    }
  }
  host.classList.add(`anim-${reaction.animation}`);
  host.classList.toggle('power-glow', Boolean(reaction.powerGlow));
  host.classList.toggle('signal-stress', Boolean(reaction.signalStress));
}

/**
 * Mount pet visual into host. Prefers sibling 3D API; else SVG from present().
 * Reuses an existing PayloadPets3D handle via update() when the pet id is unchanged.
 * @returns {'3d'|'svg'|'empty'}
 */
export async function mountPetVisual(host, petId, skyCurrent, options = {}) {
  if (!host) return 'empty';
  if (!isDropPet(petId) && !ART_PETS.some((p) => p.id === petId)) {
    host.replaceChildren();
    return 'empty';
  }

  const pose = poseForSite(petId, skyCurrent, options);
  const reaction = pose.reaction;
  const opts3d = {
    signal: reaction.signal,
    powerGlow: reaction.powerGlow,
    signalStress: reaction.signalStress,
    phaseId: reaction.phaseId,
    autoRotate: options.autoRotate !== false,
    interactive: Boolean(options.interactive),
  };

  const three = globalThis.PayloadPets3D;
  if (typeof three?.renderPet3D === 'function') {
    try {
      const existing = host._pets3dHandle;
      if (existing && typeof existing.update === 'function' && existing.petId === petId) {
        existing.update(reaction.moodId, opts3d);
        if (typeof existing.setSignal === 'function') existing.setSignal(reaction.signal);
        applyHostReactionClass(host, reaction, '3d');
        return '3d';
      }
      applyHostReactionClass(host, reaction, '3d');
      await three.renderPet3D(petId, reaction.moodId, host, opts3d);
      return '3d';
    } catch (err) {
      console.warn('[pet_moon] PayloadPets3D.renderPet3D failed; using SVG', err);
    }
  }

  host.replaceChildren();
  applyHostReactionClass(host, reaction, 'svg');
  host.append(drawPoseSvg(pose, options.idPrefix || 'moon-pet'));
  return 'svg';
}

/** Compact marker fragment for globe/map overlays (foreignObject-friendly HTML string avoided — returns SVG group). */
export function buildOverlayMarkerGroup(pose, x, y, scale = 0.22) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', `moon-pet-marker anim-${pose.reaction?.animation || pose.mood.animation}`);
  g.setAttribute('transform', `translate(${x} ${y}) scale(${scale}) translate(-100 -110)`);
  g.setAttribute('data-pet-id', pose.pet.id);
  const reaction = pose.reaction;
  if (reaction?.powerGlow) {
    const glow = document.createElementNS(SVG_NS, 'circle');
    glow.setAttribute('cx', '100');
    glow.setAttribute('cy', '120');
    glow.setAttribute('r', '70');
    glow.setAttribute('fill', '#ffe7ad');
    glow.setAttribute('opacity', '0.35');
    glow.setAttribute('class', 'pet-power-glow');
    g.append(glow);
  }
  if (reaction?.signalStress) {
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('cx', '100');
    ring.setAttribute('cy', '120');
    ring.setAttribute('r', '78');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#ff6b6b');
    ring.setAttribute('stroke-width', '6');
    ring.setAttribute('stroke-dasharray', '10 8');
    ring.setAttribute('opacity', '0.85');
    ring.setAttribute('class', 'pet-signal-stress');
    g.append(ring);
  }
  for (const node of pose.scene.parts) {
    g.append(drawNode(node));
  }
  return g;
}

export function drawPoseSvg(pose, idPrefix = 'pet') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', pose.scene.viewBox);
  svg.setAttribute('class', 'pet-frame');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-labelledby', `${idPrefix}-title ${idPrefix}-desc`);
  const title = document.createElementNS(SVG_NS, 'title');
  title.id = `${idPrefix}-title`;
  title.textContent = `${pose.pet.name} is ${pose.mood.label}`;
  const desc = document.createElementNS(SVG_NS, 'desc');
  desc.id = `${idPrefix}-desc`;
  desc.textContent = pose.reason;
  svg.append(title, desc);
  for (const node of pose.scene.parts) svg.append(drawNode(node));
  return svg;
}

export function subscribePlacedPet(handler) {
  const onStorage = (event) => {
    if (event.key && event.key !== STORAGE_KEYS.placedPet && event.key !== STORAGE_KEYS.selectedPet) return;
    handler(readPlacedPet(), readSelectedPetId());
  };
  window.addEventListener('storage', onStorage);

  let channel = null;
  try {
    channel = new BroadcastChannel(STORAGE_KEYS.channel);
    channel.onmessage = (event) => {
      if (!event?.data) return;
      handler(readPlacedPet(), readSelectedPetId());
    };
  } catch {
    /* BroadcastChannel unavailable */
  }

  return () => {
    window.removeEventListener('storage', onStorage);
    try {
      channel?.close();
    } catch {
      /* ignore */
    }
  };
}

function broadcast(detail) {
  try {
    const channel = new BroadcastChannel(STORAGE_KEYS.channel);
    channel.postMessage(detail);
    channel.close();
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent('payloadPets:placed', { detail }));
  } catch {
    /* ignore */
  }
}

function drawNode(node) {
  if (Object.prototype.hasOwnProperty.call(node, 'text')) {
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

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Hook documentation for the 3D sibling. */
export const PET_3D_HOOK = Object.freeze({
  global: 'PayloadPets3D',
  method: 'renderPet3D',
  signature: 'renderPet3D(petId, moodId, hostElement, { signal, powerGlow, signalStress, phaseId })',
  dropPetIds: DROP_PETS.map((p) => p.id),
});
