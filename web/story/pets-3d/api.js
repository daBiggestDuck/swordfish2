/**
 * Id / mood helpers shared by the Three.js renderer and the drop sibling.
 * No WebGL dependency — safe to import from Node tests.
 *
 * Catalog-cleanup four: lister, retro, eds, ln-1.
 * Drop sibling also uses trident — kept in EXTRA_PETS / ALL_PETS.
 */

/** Four adoptable catalog pets (js-pets after cleanup). */
export const CANONICAL_PETS = Object.freeze([
  Object.freeze({
    id: "lister",
    name: "LISTER",
    kind: "Heat-flow drill",
    silhouette: "drill",
    aliases: Object.freeze(["LISTER"]),
  }),
  Object.freeze({
    id: "retro",
    name: "Retro",
    kind: "Laser retroreflector",
    silhouette: "reflector",
    aliases: Object.freeze(["lra", "LRA", "retroreflector"]),
  }),
  Object.freeze({
    id: "eds",
    name: "EDS",
    kind: "Electrodynamic dust shield",
    silhouette: "shield",
    aliases: Object.freeze(["EDS"]),
  }),
  Object.freeze({
    id: "ln-1",
    name: "Nodey",
    kind: "Navigation beacon (LN-1)",
    silhouette: "beacon",
    aliases: Object.freeze(["LN-1", "ln1", "nodey"]),
  }),
]);

/** Ice-drill model for moon-drop (DROP_PETS includes trident even if art catalog drops it). */
export const EXTRA_PETS = Object.freeze([
  Object.freeze({
    id: "trident",
    name: "Triddy",
    kind: "Ice drill (TRIDENT)",
    silhouette: "ice-drill",
    aliases: Object.freeze(["TRIDENT", "triddy"]),
  }),
]);

export const ALL_PETS = Object.freeze([...CANONICAL_PETS, ...EXTRA_PETS]);

export const MOODS = Object.freeze(["happy", "shivering", "sleeping", "cold"]);
export const PHASES = Object.freeze(["day", "sunset", "night"]);

const ALIAS_TO_ID = (() => {
  const map = new Map();
  for (const pet of ALL_PETS) {
    map.set(pet.id.toLowerCase(), pet.id);
    for (const alias of pet.aliases) map.set(String(alias).toLowerCase(), pet.id);
  }
  return map;
})();

const MOOD_FROM_PHASE = Object.freeze({
  day: "happy",
  sunset: "shivering",
  night: "cold",
});

/**
 * Normalize catalog / engine / story ids to a pets-3d id.
 * @param {string} id
 * @returns {string}
 */
export function resolvePetId(id) {
  if (typeof id !== "string") throw new Error("Pet id must be a string");
  const resolved = ALIAS_TO_ID.get(id.trim().toLowerCase());
  if (!resolved) throw new Error(`Unknown instrument: ${id}`);
  return resolved;
}

/**
 * Accept mood ids or sun phases (day/sunset/night). Passive pets sleep at night
 * when options.passiveNight is true (default for retro).
 * @param {string} moodOrPhase
 * @param {{ petId?: string, passiveNight?: boolean }} [options]
 */
export function resolveMood(moodOrPhase, options = {}) {
  if (typeof moodOrPhase !== "string") throw new Error("Mood must be a string");
  const key = moodOrPhase.trim().toLowerCase();
  if (MOODS.includes(key)) return key;
  if (PHASES.includes(key)) {
    const petId = options.petId ? resolvePetId(options.petId) : null;
    const passive =
      options.passiveNight !== undefined
        ? options.passiveNight
        : petId === "retro";
    if (key === "night" && passive) return "sleeping";
    return MOOD_FROM_PHASE[key];
  }
  throw new Error(`Unknown mood/phase: ${moodOrPhase}`);
}
