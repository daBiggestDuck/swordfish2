# Payload Pets — `v0` showcase

**Showcase branch** that combines the team’s parallel work on [daBiggestDuck/swordfish2](https://github.com/daBiggestDuck/swordfish2) into one tree you can run locally.

Adopt a real NASA [CLPS](https://www.nasa.gov/commercial-lunar-payload-services/) instrument as a pet, pick a real lunar landing site, and keep it alive through one lunar day — with meters driven by real ephemeris and terrain data.

Challenge / planning context: see [`PLAN.md`](PLAN.md) (Payload Pets data-first build plan) and NASA CLPS: https://www.nasa.gov/commercial-lunar-payload-services/

---

## Quick start — unified shell

```bash
./run-v0.sh                 # http://localhost:8765/
./run-v0.sh 9000            # optional custom port
```

Open **http://localhost:8765/** — one page with shared nav and tabs:

| Tab | What you get | Needs |
|---|---|---|
| **Map / Sites** | Interactive lunar explorer (`web/map.html`) | Shell only |
| **Navigator** | South-pole site/date compare — Sun→power, Earth→DTE vs LOLA horizon (`web/navigator.html`) | Shell only |
| **Story / Passport** | Mission pop-ups, Pet Passport, Sun/Earth | `./run-story.sh` → :8081 |
| **Engine / Care** | Care meters / lunar-day loop | `./run-engine.sh` → :8082 |
| **Pets** | Triddy, Nodey & friends art/mood demo | Shell only |
| **Data / Missions** | Catalog browser over `data/catalog.json` | Shell only |
| **About** | Challenge brief (from `PLAN.md`) | Shell only |

Story and Engine tabs iframe the Java apps. Start them in other terminals when you want those surfaces live:

```bash
./run-story.sh              # http://localhost:8081/
./run-engine.sh             # http://localhost:8082/
```

The shell banner (and amber tab dots) tell you when those backends are down. Engine falls back to `demos/js-engine` until `:8082` is up.

---

## What’s new (refresh)

- **Unified `index.html` shell** — tabbed showcase via `./run-v0.sh` (no longer a hard redirect to the map alone).
- **Navigator** — Lunar Landing Site Navigator challenge surface: compare Malapert / Mons Mouton / Shackleton (+ other polar sites) across dates using `data/ephemeris.json` + LOLA horizons.
- **`Data`**: TO2-AB payloads use stable mission id `peregrine-1` (aligned with missions.json).
- **`map`**: interactive NASA lunar explorer — `web/map.html` + globe assets, `run_map.sh` / Node fallback, engine client bridge.
- **`story`**: refreshed story server / Passport client — engine event bridge, localhost CORS, optional `days` for Passport. Default port **8081** on v0.
- **Triddy / Nodey** kept from `pranav/pets-triddy-nodey` (archetypes + `demos/js-*`).

---

## What’s included

| Source branch | SHA (tip) | In this tree |
|---|---|---|
| `main` | `e2a0e5d` | project rename baseline |
| `Data` | `6b45ba1` | `data/*.json`, `src/data/`, `build.sh`, `PLAN.md` |
| `engine` | `7c5db21` | `src/engine/`, `web/engine.*`, `run-engine.sh`, tests |
| `map` | `666ecee` | `src/map/`, `web/map.*`, `data/maps/`, `run_map.sh` |
| `story` | `13f6021` | `src/story/`, `web/story/`, `run-story.sh`, `STORY.md` |
| `pets` | `d921b00` | `petSpriteOutline` (Moon Pals sprite outline) |
| `ui` | `e2a0e5d` | ≡ `main` (no extra files yet) |
| `pranav/pets-triddy-nodey` | `4dd133d` | **Triddy** (`trident`) + **Nodey** (`ln-1`) archetypes, catalog, `demos/js-*` |

Layout:

```
index.html      tabbed showcase shell (entry point)
run-v0.sh       serve the shell on :8765
web/showcase.*  shell chrome (nav, tabs, data/about panels)
data/           baked JSON (sites, missions, pets, ephemeris, horizons, maps, catalog)
src/data/       Java data pipeline
src/engine/     Java game engine + local HTTP server (:8082)
src/map/        Java lunar map server (:8080)
src/story/      Java story / Passport / sky server (:8081)
web/            map + navigator + engine pages (`web/map.html`, `web/navigator.html`, `web/engine.*`)
web/story/      story UI
demos/js-pets/  Triddy/Nodey pet-art browser demo
demos/js-engine/ JS meter/tutor demo (Engine tab fallback)
demos/js-ui/    intro/stage demo
```

---

## Other entry points

Needs **JDK 17+** for the Java servers. Node is optional (map fallback + JS demos/tests).

### Standalone Java surfaces

| Surface | Command | URL |
|---|---|---|
| **Map** (site picker / globe) | `./run.sh` or `./run_map.sh` | http://localhost:8080 |
| **Story** (pop-ups, Passport, Sun/Earth) | `./run-story.sh` | http://localhost:8081 |
| **Engine** (meters / game loop) | `./run-engine.sh` | http://localhost:8082 |

```bash
./run.sh              # map (:8080) — thin alias for ./run_map.sh
./run-story.sh        # story (uses ./data automatically when present)
./run-engine.sh       # engine
```

Pass a port if you need to: `./run-engine.sh 9000`.

### Browser demos (no compile)

```bash
open demos/js-pets/index.html
open demos/js-engine/index.html
open demos/js-ui/index.html
# or serve via ./run-v0.sh and use the Pets / Engine tabs
```

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
node --test test/map.test.mjs
```

---

## Pets of note

- **Triddy** (`trident`) — TRIDENT ice drill (PRIME-1 / IM-2 @ Mons Mouton)
- **Nodey** (`ln-1`) — Lunar Node-1 nav beacon (IM-1 @ Malapert A)
- Plus Digby, Retroflector Rex, Dusty, Sniffer, Shutterbug, Vacuumba from the Data branch archetypes

---

## Limitations

- **Shell is a tabbed host, not a deep merge of the apps.** Map, story, engine, and pets remain separate HTML apps (iframes / panels) sharing `data/` contracts; `ui` tip was still identical to `main`.
- **Story and Engine need their Java servers** for full API-backed UI. Without them, those tabs show a banner (Engine falls back to `demos/js-engine`).
- **Ports on v0:** map `:8080`, story `:8081`, engine `:8082`, showcase shell `:8765`.
- **Staging helper files** (`from-*`, `STAGING*.md`, tip notes) are gitignored / not part of the showcase.
- Some Java pieces are offline-friendly; live Horizons / Moon Trek fetches only happen when you run `./build.sh` online.
- `petSpriteOutline` is a sprite asset from the `pets` tip — full Swing Moon Pals UI may still live only on WIP trees.
- ES-module demos (pets) need HTTP (`./run-v0.sh`), not `file://`.

---

## Source tips used for this merge

```
main     e2a0e5df9c2e49c794a9c13166a3f4baddd107af
Data     6b45ba186ba0220043a8b1b9b9b12ad919f9597e
engine   7c5db21ad61c18b7b4021cd9623ecd2716124aa0
map      666ecee3b9a83cd434299582d3af7a05a1d99ab0
story    12e20f68cd13f33f31085b61897d82faf2ec3dac
pets     d921b00ee2787935c19841c63e398f1c06f039bb
ui       e2a0e5df9c2e49c794a9c13166a3f4baddd107af
pets+    4dd133d9168322b81b2482b12529812b74e7028a  (pranav/pets-triddy-nodey)
```
