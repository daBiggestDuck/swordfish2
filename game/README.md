# CLPS Pet Game — landing screen

The entry screen of the new game flow: a real WebGL Moon (the v1 map
globe), a deep-space starfield, and the game pitch from the story
section. Next up (separate work): map site selection and the 3D game,
built on the engine and pets data.

## Stack

Vite + React + Tailwind CSS v4 + Motion. The Moon is `src/lib/globe_gl.js` —
the map screen's raw-WebGL lunar globe (LROC WAC albedo + LOLA elevation
rasters, parallax-occluded relief, terminator lighting, 3-tier starfield),
mounted as a React component. UI building blocks sourced from the
[Watermelon UI](https://ui.watermelon.sh) catalog's hero-31 motion patterns.

## Run

```sh
cd game
npm install
npm run dev      # http://localhost:8768
```

Start is a placeholder until the map site-selection + 3D game screens land.

## Palette

Same client tokens as the Data/Missions branch: `#0B1320` ground,
`#1F2937` panel, `#D1D5DB` text, `#F97316` accent, `#64748B` borders —
secondary text lifted to `#94A3B8` for 4.5:1 contrast.
