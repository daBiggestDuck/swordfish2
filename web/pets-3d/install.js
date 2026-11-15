/**
 * Side-effect module: installs window.PayloadPets3D for web/pet_moon.js.
 * Load before (or with) map.js — module scripts run in document order.
 * `PayloadPets3D.ready` resolves once Three.js + model warm-cache finish.
 */
import { installPayloadPets3D } from "./pets3d.js";

const api = installPayloadPets3D(
  typeof window !== "undefined" ? window : globalThis,
);

// Surface install failures early in the console (mount sites also show Retry UI).
api.ready.catch((err) => {
  console.warn("[pets-3d/install] Three.js preload failed", err);
});
