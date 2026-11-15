# Payload Pets — `v0` showcase

**Showcase branch** that combines the team’s parallel work on [daBiggestDuck/swordfish2](https://github.com/daBiggestDuck/swordfish2) into one tree you can run locally.

Adopt a real NASA [CLPS](https://www.nasa.gov/commercial-lunar-payload-services/) instrument as a pet, pick a real lunar landing site, and keep it alive through one lunar day — with meters driven by real ephemeris and terrain data.

Challenge / planning context: see [`PLAN.md`](PLAN.md) (Payload Pets data-first build plan) and NASA CLPS: https://www.nasa.gov/commercial-lunar-payload-services/

---

## What’s included

| Source branch | SHA (tip) | In this tree |
|---|---|---|
| `main` | `e2a0e5d` | project rename baseline |
| `Data` | `82ee1ff` | `data/*.json`, `src/data/`, `build.sh`, `PLAN.md` |
| `engine` | `7c5db21` | `src/engine/`, `web/engine.*`, `run-engine.sh`, tests |
| `map` | `483cd2f` | `src/map/`, `web/{index.html,map.*}`, `data/maps/`, `run.sh` |
| `story` | `0c1ad26` | `src/story/`, `web/story/`, `run-story.sh`, `STORY.md` |
| `pets` | `d921b00` | `petSpriteOutline` (Moon Pals sprite outline) |
| `ui` | `e2a0e5d` | ≡ `main` (no extra files yet) |
| `pranav/pets-triddy-nodey` | `4dd133d` | **Triddy** (`trident`) + **Nodey** (`ln-1`) archetypes, catalog, `demos/js-*` |

Layout:

```
data/           baked JSON (sites, missions, pets, ephemeris, horizons, maps, catalog)
src/data/       Java data pipeline
src/engine/     Java game engine + local HTTP server
src/map/        Java lunar map server
src/story/      Java story / Passport / sky server
web/            map + engine pages
web/story/      story UI
demos/js-pets/  Triddy/Nodey pet-art browser demo
demos/js-engine/ JS meter/tutor demo
demos/js-ui/    intro/stage demo
```

---

## Quick start — open the showcase

Needs **JDK 17+** for the Java servers. Node is optional (map fallback + JS demos/tests).

### Fastest: browser demos (no compile)

```bash
# Pet art — Triddy & Nodey (open the HTML, or serve it)
open demos/js-pets/index.html
# or: python3 -m http.server 8765 --directory demos/js-pets

open demos/js-engine/index.html
open demos/js-ui/index.html
```

### Java surfaces (run in separate terminals)

| Surface | Command | URL |
|---|---|---|
| **Map** (site picker / globe) | `./run.sh` | http://localhost:8080 |
| **Story** (pop-ups, Passport, Sun/Earth) | `./run-story.sh` | http://localhost:8081 |
| **Engine** (meters / game loop) | `./run-engine.sh` | http://localhost:8082 |

```bash
./run.sh              # map
./run-story.sh        # story (uses ./data automatically when present)
./run-engine.sh       # engine
```

Pass a port if you need to: `./run-engine.sh 9000`.

### Rebuild data (optional)

```bash
./build.sh --offline   # placeholders when APIs are down
./build.sh             # online: JPL Horizons + Moon Trek (network)
```

### Tests

```bash
./test-engine.sh
node --test data/catalog.test.js
node --test demos/js-pets/src/pets.test.js
```

---

## Pets of note

- **Triddy** (`trident`) — TRIDENT ice drill (PRIME-1 / IM-2 @ Mons Mouton)
- **Nodey** (`ln-1`) — Lunar Node-1 nav beacon (IM-1 @ Malapert A)
- Plus Digby, Retroflector Rex, Dusty, Sniffer, Shutterbug, Vacuumba from the Data branch archetypes

---

## Limitations

- **Not a single unified SPA.** Map, story, engine, and JS demos are separate entry points that share `data/` contracts; `ui` tip was still identical to `main`.
- **Engine default port moved to 8082** on this branch so it does not collide with story’s 8081.
- **Staging helper files** (`from-*`, `STAGING*.md`, tip notes) are gitignored / not part of the showcase.
- Some Java pieces are offline-friendly; live Horizons / Moon Trek fetches only happen when you run `./build.sh` online.
- `petSpriteOutline` is a sprite asset from the `pets` tip — full Swing Moon Pals UI may still live only on WIP trees.

---

## Source tips used for this merge

```
main     e2a0e5df9c2e49c794a9c13166a3f4baddd107af
Data     82ee1ffb17c041bd4f51bcce8371968eaf3ab89b
engine   7c5db21ad61c18b7b4021cd9623ecd2716124aa0
map      483cd2f77627704ad2ffdd65a60a0b23d8dbedae
story    0c1ad267781776cb44e5c0990c6d21c164807351
pets     d921b00ee2787935c19841c63e398f1c06f039bb
ui       e2a0e5df9c2e49c794a9c13166a3f4baddd107af
pets+    4dd133d  (pranav/pets-triddy-nodey)
```
