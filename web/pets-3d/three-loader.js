/**
 * Shared Three.js loader with CDN mirrors + retry.
 * Bypasses bare import-map failures (single CDN flake) by trying absolute URLs.
 */

const THREE_VERSION = "0.170.0";

/** Absolute module URLs — tried in order. */
export const THREE_CDN_URLS = Object.freeze([
  `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js`,
  `https://unpkg.com/three@${THREE_VERSION}/build/three.module.js`,
  `https://esm.sh/three@${THREE_VERSION}`,
]);

/** @type {Promise<typeof import("three")> | null} */
let cached = null;
/** @type {typeof import("three") | null} */
let resolved = null;
/** @type {Error | null} */
let lastError = null;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Load Three.js once (cached). Retries each CDN, then moves to the next.
 * @param {{ retriesPerUrl?: number, force?: boolean }} [opts]
 * @returns {Promise<typeof import("three")>}
 */
export function loadThree(opts = {}) {
  const retriesPerUrl = opts.retriesPerUrl ?? 2;
  if (opts.force) {
    cached = null;
    resolved = null;
  }
  if (resolved) return Promise.resolve(resolved);
  if (cached) return cached;

  cached = (async () => {
    lastError = null;
    let err = null;
    for (const url of THREE_CDN_URLS) {
      for (let attempt = 0; attempt <= retriesPerUrl; attempt++) {
        try {
          const mod = await import(/* webpackIgnore: true */ url);
          if (!mod || typeof mod.WebGLRenderer !== "function") {
            throw new Error(`Three.js module missing WebGLRenderer from ${url}`);
          }
          resolved = mod;
          lastError = null;
          return mod;
        } catch (e) {
          err = e instanceof Error ? e : new Error(String(e));
          lastError = err;
          await delay(120 * (attempt + 1));
        }
      }
    }
    cached = null;
    throw err || new Error("Failed to load Three.js from all CDNs");
  })();

  return cached;
}

/** @returns {typeof import("three") | null} */
export function getThreeSync() {
  return resolved;
}

/** @returns {Error | null} */
export function getThreeLoadError() {
  return lastError;
}

/** Warm the cache without mounting WebGL. */
export function preloadThree() {
  return loadThree();
}

/**
 * Prefer a successful load; if cache failed earlier, force another try.
 */
export async function ensureThree() {
  try {
    return await loadThree();
  } catch {
    return loadThree({ force: true });
  }
}
