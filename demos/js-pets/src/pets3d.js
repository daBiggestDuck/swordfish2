/**
 * Re-export for demos / moon-drop callers that already import from js-pets.
 * Implementation lives in web/pets-3d (Three.js + import map required in the page).
 * Prefer window.PayloadPets3D via web/pets-3d/install.js on the Map shell.
 */
export {
  ALL_PETS,
  CANONICAL_PETS,
  EXTRA_PETS,
  MOODS,
  PHASES,
  capturePetSprite,
  clearPetSpriteCache,
  installPayloadPets3D,
  preloadPets3D,
  renderPet3D,
  resolveMood,
  resolvePetId,
  showPets3DError,
  whenPayloadPets3DReady,
} from "../../../web/pets-3d/pets3d.js";
