import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));

// Builds the Rover Run game into ../web/game so the existing static servers
// (./run-v0.sh on :8765, the Java engine on :8082) serve it with no Node at demo time.
// Moon textures live once in ../web/assets and are referenced relatively (see src/lib/assets.ts).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@pets3d", replacement: path.resolve(here, "../web/pets-3d/pets3d.js") },
      { find: "@", replacement: path.resolve(here, "src") },
      // The shared pet models (web/pets-3d/pets3d.js, the Pets tab's renderer) load three from CDNs via
      // ./three-loader.js. Inside this bundle, hand them our pinned three@0.170.0 instead (offline-safe).
      { find: /^\.\/three-loader\.js$/, replacement: path.resolve(here, "src/three/threeLoaderShim.ts") },
      { find: /^three$/, replacement: path.resolve(here, "node_modules/three/build/three.module.js") },
    ],
  },
  publicDir: path.resolve(here, "../web/assets"),
  build: {
    outDir: path.resolve(here, "../web/game"),
    emptyOutDir: true,
    copyPublicDir: false,
    chunkSizeWarningLimit: 1600,
    sourcemap: false,
  },
  server: {
    port: 5173,
    fs: { allow: [path.resolve(here, "..")] },
  },
});
