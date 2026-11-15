# Pet instruments · 3D moods

Four adoptable CLPS payload pets: **LISTER**, **Retro**, **EDS**, **Nodey** (`ln-1`).

`src/pets.js` decides mood from sun phase. `src/ui.js` mounts procedural Three.js
models via `web/pets-3d` (`renderPet3D` / `window.PayloadPets3D`) — no SVG faces on this page.

```bash
node --test src/pets.test.js
./run-v0.sh   # Pets tab → http://127.0.0.1:8765/#pets
```

Standalone 3D gallery: [web/pets-3d/](../../web/pets-3d/) (or [3d.html](./3d.html) redirect).
