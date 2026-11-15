# Payload Pets · 3D instruments

Procedural Three.js models for the CLPS instrument pets. No GLB downloads — geometry is built so each silhouette reads as real hardware.

## Catalog four (+ drop ice-drill)

| Id | Name | Reads as | Notes |
| --- | --- | --- | --- |
| `lister` | LISTER | Heat-flow drill | Catalog + drop |
| `retro` | Retro | Corner-cube reflector | Aliases: `lra`, `LRA` |
| `eds` | EDS | Dust-shield panel | Catalog |
| `ln-1` | Nodey | Ranging beacon | Catalog + drop (Signal) |
| `trident` | Triddy | Ice auger | Moon-drop `DROP_PETS` |

## How to view

From the repo root (needs network once for the Three.js CDN import map):

```bash
python3 -m http.server 8788
```

Open:

- Gallery: http://127.0.0.1:8788/web/pets-3d/
- Shortcut: http://127.0.0.1:8788/demos/js-pets/3d.html
- On the Map tab after `./run_map.sh`: drop a pet — `pet_moon` prefers `window.PayloadPets3D` when installed (map.html loads `pets-3d/install.js`).

Click an instrument, scrub moods, drag the main viewport to orbit.

## API for moon-drop sibling

`web/pet_moon.js` already looks for:

```js
await window.PayloadPets3D.renderPet3D(petId, moodId, host, {
  signal,
  powerGlow,
  signalStress,
  phaseId,
});
```

`map.html` loads `pets-3d/install.js` so that global is present. Direct import also works:

```js
import {
  renderPet3D,
  CANONICAL_PETS,
  resolvePetId,
  resolveMood,
  installPayloadPets3D,
} from "./pets3d.js";

installPayloadPets3D(window); // optional if using the global hook

const handle = await renderPet3D("lister", "happy", mountEl, {
  autoRotate: true,
  interactive: true,
  signal: 40,
});

handle.update("sunset");
handle.setPet("LRA");     // → retro
handle.setSignal(90);     // Nodey tip glow when >= 70
handle.dispose();
```

Demos re-export: `demos/js-pets/src/pets3d.js`.

Pure helpers (Node-safe, no WebGL): `api.js` → `resolvePetId`, `resolveMood`, `CANONICAL_PETS`.

### Handle shape

| Field / method | Meaning |
| --- | --- |
| `petId` | Resolved id |
| `mood` | Current mood id |
| `update(moodOrPhase, opts?)` | Retarget lighting / motion |
| `setPet(id)` | Swap instrument geometry |
| `setSignal(n)` | Drive Nodey tip emissive |
| `dispose()` | Tear down WebGL + listeners |

Does **not** own the SVG pet catalog or moon-drop UX — mount beside those siblings.

## Tests

```bash
node --test web/pets-3d/api.test.js
```
