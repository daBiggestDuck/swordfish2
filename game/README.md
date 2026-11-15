# CLPS Pet Game — landing screen

The entry screen of the one-tab UI overhaul: a real WebGL Moon (the v1 map
globe), a deep-space starfield, and the game pitch from the story section.

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

Start leads to the showcase shell's Story tab (`:8767` in dev, `../index.html`
from a built app). Grab the sky to spin the Moon.

## Palette

Same client tokens as the Data/Missions branch: `#0B1320` ground,
`#1F2937` panel, `#D1D5DB` text, `#F97316` accent, `#64748B` borders —
secondary text lifted to `#94A3B8` for 4.5:1 contrast.
