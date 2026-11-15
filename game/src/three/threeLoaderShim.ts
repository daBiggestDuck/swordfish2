// Drop-in replacement for web/pets-3d/three-loader.js inside the Rover Run bundle.
// The Pets tab loads three@0.170.0 from CDNs at runtime; Rover Run bundles the same version, so the
// shared pet models (web/pets-3d/pets3d.js) use this copy: one three.js, works offline.
// Wired in vite.config.ts via a resolve.alias on "./three-loader.js".

import * as THREE from "three";

export const THREE_CDN_URLS: readonly string[] = Object.freeze([]);

export function loadThree(): Promise<typeof THREE> {
  return Promise.resolve(THREE);
}

export function getThreeSync(): typeof THREE {
  return THREE;
}

export function getThreeLoadError(): Error | null {
  return null;
}

export function preloadThree(): Promise<typeof THREE> {
  return loadThree();
}

export async function ensureThree(): Promise<typeof THREE> {
  return THREE;
}
