// Moon textures live once in web/assets/moon (built by scripts/build-moon-textures.mjs).
// Dev server: Vite serves web/assets at "/". Built game: web/game/index.html → ../assets/.
const base = import.meta.env.DEV ? "/" : "../assets/";

export const MOON_TEXTURES = {
  color: `${base}moon/moon_color_4k.jpg`,
  normal: `${base}moon/moon_normal_4k.jpg`,
  southNormal: `${base}moon/moon_south_normal.jpg`,
};
