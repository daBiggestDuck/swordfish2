/**
 * Drop a payload pet onto the Moon and drive live site reactions.
 * Prefers PayloadPets3D (live / shared farm / capturePetSprite blit); SVG present() is fallback only.
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

/** Catalog / engine aliases → adoptable drop id (Triddy/trident is not adoptable). */
const DROP_ALIASES = Object.freeze({
  lister: 'lister',
  retro: 'retro',
  lra: 'retro',
  LRA: 'retro',
  retroreflector: 'retro',
  eds: 'eds',
  EDS: 'eds',
  'ln-1': 'ln-1',
  ln1: 'ln-1',
  nodey: 'ln-1',
  Nodey: 'ln-1',
});

/** Normalize catalog aliases to a drop id; returns null for Triddy/unknown. */
export function resolveDropPetId(id) {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (DROP_IDS.has(trimmed)) return trimmed;
  const aliased = DROP_ALIASES[trimmed] || DROP_ALIASES[trimmed.toLowerCase()];
  return aliased && DROP_IDS.has(aliased) ? aliased : null;
}

export function isDropPet(id) {
  return resolveDropPetId(id) != null;
}

export function getDropPet(id) {
  const resolved = resolveDropPetId(id);
  return resolved ? DROP_PETS.find((p) => p.id === resolved) || null : null;
}

export function readSelectedPetId(fallback = 'lister') {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.selectedPet);
    const resolved = resolveDropPetId(raw);
    if (resolved) return resolved;
  } catch {
    /* ignore */
  }
  return resolveDropPetId(fallback) || DROP_PETS[0].id;
}

export function writeSelectedPetId(petId) {
  const resolved = resolveDropPetId(petId);
  if (!resolved) return;
  try {
    localStorage.setItem(STORAGE_KEYS.selectedPet, resolved);
  } catch {
    /* ignore */
  }
  broadcast({ type: 'selectedPet', petId: resolved });
}

export function readPlacedPet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.placedPet);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const resolved = resolveDropPetId(parsed?.petId);
    if (!parsed || !resolved) return null;
    if (parsed.petId !== resolved) return { ...parsed, petId: resolved };
    return parsed;
  } catch {
    return null;
  }
}

export function writePlacedPet(record) {
  const resolved = resolveDropPetId(record?.petId);
  if (!record || !resolved) return null;
  const payload = {
    ...record,
    petId: resolved,
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
 * Dispose a PayloadPets3D handle stashed on a host element.
 */
export function disposePetVisual(host) {
  if (!host) return;
  const handle = host._pets3dHandle;
  if (handle && typeof handle.dispose === 'function') {
    try {
      handle.dispose();
    } catch {
      /* ignore */
    }
  }
  host._pets3dHandle = null;
  host.replaceChildren();
  host.classList.remove(
    'pets3d-mount',
    'pets3d-surface',
    'pets3d-ok',
    'pets3d-error',
    'moon-pet-visual',
    'power-glow',
    'signal-stress',
  );
  for (const cls of [...host.classList]) {
    if (cls.startsWith('anim-')) host.classList.remove(cls);
  }
  delete host.dataset.petVisual;
  delete host.dataset.mood;
}

/**
 * Mount pet visual into host. Prefers sibling 3D API; else SVG from present().
 * Reuses an existing PayloadPets3D handle via update() when the pet id is unchanged.
 * Options:
 *   forceSvg — never mount WebGL
 *   mode — "live" | "shared" (shared = farm blit; safe beside globe surface live context)
 *   surface — transparent billboard for globe-surface anchoring
 * @returns {'3d'|'svg'|'empty'}
 */
export async function mountPetVisual(host, petId, skyCurrent, options = {}) {
  if (!host) return 'empty';
  const resolved = resolveDropPetId(petId) || (ART_PETS.some((p) => p.id === petId) ? petId : null);
  if (!resolved) {
    disposePetVisual(host);
    return 'empty';
  }

  const pose = poseForSite(resolved, skyCurrent, options);
  const reaction = pose.reaction;
  const forceSvg = Boolean(options.forceSvg);
  const surface = Boolean(options.surface);
  const mode = options.mode === 'shared' ? 'shared' : options.mode === 'live' ? 'live' : undefined;
  const opts3d = {
    signal: reaction.signal,
    powerGlow: reaction.powerGlow,
    signalStress: reaction.signalStress,
    phaseId: reaction.phaseId,
    autoRotate: surface ? options.autoRotate === true : options.autoRotate !== false,
    interactive: Boolean(options.interactive),
    surface,
    transparent: surface || Boolean(options.transparent),
    ...(mode ? { mode } : {}),
  };

  if (!forceSvg) {
    const three = await waitForPayloadPets3D(options.readyTimeoutMs ?? 8000);
    if (typeof three?.renderPet3D === 'function') {
      try {
        const existing = host._pets3dHandle;
        if (existing && typeof existing.update === 'function' && existing.petId === resolved) {
          existing.update(reaction.moodId, opts3d);
          if (typeof existing.setSignal === 'function') existing.setSignal(reaction.signal);
          applyHostReactionClass(host, reaction, '3d');
          return '3d';
        }
        applyHostReactionClass(host, reaction, '3d');
        await three.renderPet3D(resolved, reaction.moodId, host, {
          ...opts3d,
          showError: true,
        });
        return '3d';
      } catch (err) {
        console.warn('[pet_moon] PayloadPets3D.renderPet3D failed', err);
        // Surface billboards must not silently swap to SVG (wrong layer).
        if (surface) {
          if (typeof three.showPets3DError === 'function') {
            three.showPets3DError(
              host,
              err instanceof Error ? err.message : '3D pet failed to load',
              {
                onRetry: () => {
                  void mountPetVisual(host, petId, skyCurrent, options);
                },
              },
            );
          }
          applyHostReactionClass(host, reaction, '3d');
          return 'empty';
        }
      }
    } else if (surface) {
      const msg = three?.loadError?.message || '3D library not ready — check network for Three.js.';
      console.warn('[pet_moon] PayloadPets3D missing for surface mount', msg);
      host.replaceChildren();
      const wrap = document.createElement('div');
      wrap.className = 'pets3d-error-box';
      const p = document.createElement('p');
      p.className = 'mount-fallback';
      p.textContent = msg;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pets3d-retry';
      btn.textContent = 'Retry 3D';
      btn.addEventListener('click', () => {
        void mountPetVisual(host, petId, skyCurrent, options);
      });
      wrap.append(p, btn);
      host.append(wrap);
      host.classList.add('pets3d-mount', 'pets3d-error');
      return 'empty';
    }
  }

  if (host._pets3dHandle) disposePetVisual(host);
  host.replaceChildren();
  applyHostReactionClass(host, reaction, 'svg');
  host.append(drawPoseSvg(pose, options.idPrefix || 'moon-pet'));
  return 'svg';
}

/**
 * Resolve PayloadPets3D after install.js finishes loading Three (or null on timeout).
 * @param {number} timeoutMs
 */
async function waitForPayloadPets3D(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const api = globalThis.PayloadPets3D;
    if (api?.ready) {
      try {
        await Promise.race([
          api.ready,
          new Promise((_, rej) =>
            setTimeout(
              () => rej(new Error('timeout')),
              Math.max(0, timeoutMs - (Date.now() - start)),
            ),
          ),
        ]);
        return api;
      } catch {
        return api; // may still have renderPet3D after a partial load
      }
    }
    if (typeof api?.renderPet3D === 'function') return api;
    await new Promise((r) => setTimeout(r, 40));
  }
  return globalThis.PayloadPets3D || null;
}

/**
 * Compact 2D marker for flat/south-pole map overlays.
 * Prefers a PayloadPets3D blit PNG (same instrument geometry as globe 3D);
 * falls back to SVG face art only when no spriteUrl is provided yet.
 *
 * @param {object} pose present()-compatible pose from poseForSite
 * @param {number} x
 * @param {number} y
 * @param {number} [scale]
 * @param {{ label?: boolean, pin?: boolean, spriteUrl?: string|null, spriteSize?: number }} [opts]
 */
export function buildOverlayMarkerGroup(pose, x, y, scale = 0.28, opts = {}) {
  const g = document.createElementNS(SVG_NS, 'g');
  const anim = pose.reaction?.animation || pose.mood.animation;
  g.setAttribute('class', `moon-pet-marker moon-pet-sprite anim-${anim}`);
  g.setAttribute('transform', `translate(${x} ${y})`);
  g.setAttribute('data-pet-id', pose.pet.id);
  g.setAttribute('data-mood', pose.reaction?.moodId || pose.mood.id);
  g.setAttribute('role', 'img');
  g.setAttribute('aria-label', `${pose.pet.name} · ${pose.mood.label}`);

  if (opts.pin !== false) {
    const pin = document.createElementNS(SVG_NS, 'circle');
    pin.setAttribute('cx', '0');
    pin.setAttribute('cy', '0');
    pin.setAttribute('r', '5');
    pin.setAttribute('fill', '#ffe7ad');
    pin.setAttribute('stroke', '#ffb84d');
    pin.setAttribute('stroke-width', '2');
    pin.setAttribute('class', 'moon-pet-pin');
    g.append(pin);
  }

  const art = document.createElementNS(SVG_NS, 'g');
  art.setAttribute('class', 'moon-pet-sprite-art');

  const reaction = pose.reaction;
  const spriteUrl = typeof opts.spriteUrl === 'string' && opts.spriteUrl ? opts.spriteUrl : null;
  // Blit frames are square (~160px). Scale maps the old 200×SVG face budget onto that.
  const spritePx = Math.max(48, Math.round(Number(opts.spriteSize) || 200 * scale));

  if (spriteUrl) {
    art.setAttribute('transform', `translate(${-spritePx / 2} ${-spritePx * 0.78})`);
    g.setAttribute('data-pet-visual', 'blit');
    if (reaction?.powerGlow) {
      const glow = document.createElementNS(SVG_NS, 'circle');
      glow.setAttribute('cx', String(spritePx / 2));
      glow.setAttribute('cy', String(spritePx * 0.55));
      glow.setAttribute('r', String(spritePx * 0.42));
      glow.setAttribute('fill', '#ffe7ad');
      glow.setAttribute('opacity', '0.35');
      glow.setAttribute('class', 'pet-power-glow');
      art.append(glow);
    }
    if (reaction?.signalStress) {
      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('cx', String(spritePx / 2));
      ring.setAttribute('cy', String(spritePx * 0.55));
      ring.setAttribute('r', String(spritePx * 0.48));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#ff6b6b');
      ring.setAttribute('stroke-width', '3');
      ring.setAttribute('stroke-dasharray', '8 6');
      ring.setAttribute('opacity', '0.85');
      ring.setAttribute('class', 'pet-signal-stress');
      art.append(ring);
    }
    const img = document.createElementNS(SVG_NS, 'image');
    img.setAttribute('href', spriteUrl);
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', spriteUrl);
    img.setAttribute('x', '0');
    img.setAttribute('y', '0');
    img.setAttribute('width', String(spritePx));
    img.setAttribute('height', String(spritePx));
    img.setAttribute('class', 'moon-pet-sprite-blit');
    img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    art.append(img);
  } else {
    art.setAttribute('transform', `scale(${scale}) translate(-100 -118)`);
    g.setAttribute('data-pet-visual', 'svg');
    if (reaction?.powerGlow) {
      const glow = document.createElementNS(SVG_NS, 'circle');
      glow.setAttribute('cx', '100');
      glow.setAttribute('cy', '120');
      glow.setAttribute('r', '70');
      glow.setAttribute('fill', '#ffe7ad');
      glow.setAttribute('opacity', '0.35');
      glow.setAttribute('class', 'pet-power-glow');
      art.append(glow);
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
      art.append(ring);
    }
    for (const node of pose.scene.parts) {
      art.append(drawNode(node));
    }
  }
  g.append(art);

  if (opts.label !== false) {
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', '0');
    const labelLift = spriteUrl ? Math.round(spritePx * 0.82) + 4 : Math.round(118 * scale) + 6;
    label.setAttribute('y', String(-labelLift));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#ffe7ad');
    label.setAttribute('font-size', '11');
    label.setAttribute('font-weight', '700');
    label.setAttribute('class', 'moon-pet-sprite-label');
    label.textContent = `${pose.pet.name} · ${pose.mood.label}`;
    g.append(label);
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
  signature:
    'renderPet3D(petId, moodId, hostElement, { signal, powerGlow, signalStress, phaseId, surface, transparent })',
  dropPetIds: DROP_PETS.map((p) => p.id),
  mapModes: Object.freeze({
    globe3d: 'surface mount via #surface-pet-layer',
    flatOrPole: 'PayloadPets3D.capturePetSprite blit PNG in buildOverlayMarkerGroup',
  }),
  capture: 'capturePetSprite(petId, moodId, { signal, powerGlow, signalStress, size })',
});
