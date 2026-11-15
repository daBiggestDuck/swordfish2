/**
 * Side-effect module: installs window.PayloadPets3D for web/pet_moon.js.
 * Load before (or with) map.js — module scripts run in document order.
 */
import { installPayloadPets3D } from "./pets3d.js";

installPayloadPets3D(typeof window !== "undefined" ? window : globalThis);
