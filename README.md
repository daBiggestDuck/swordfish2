# nasa space pet — `pranav/pets-triddy-nodey`

Pranav's personal branch: **Triddy** (`trident`) + **Nodey** (`ln-1`) pet work on top of `origin/Data`.

## What's here

| Path | What |
|---|---|
| `data/` + `src/data/` | Data pipeline (Java) with Triddy/Nodey archetype + payload/mission patches |
| `data/catalog.json` (+ `.js` / tests) | Sourced game catalog including Triddy & Nodey passports |
| `demos/js-pets/` | Browser pet art demo (open `index.html`) |
| `demos/js-engine/` | JS meter/tutor demo with Triddy & Nodey |
| `demos/js-ui/` | Intro/stage demo mentioning Triddy & Nodey |

### Quick demo

```bash
# Pets art (no build)
open demos/js-pets/index.html
# or: python3 -m http.server 8765 --directory demos/js-pets

# Catalog unit tests
node --test data/catalog.test.js

# Pets unit tests
node --test demos/js-pets/src/pets.test.js
```

Java `src/` from Data is preserved; JS demos live under `demos/` so they do not overwrite the Java engine/map/story trees.

---

## Data branch (Wonil)

Builds the static JSON every other branch consumes. No runtime API calls —
everything is baked once, offline-friendly, and every number carries a
`provenance` block (`source`, `method`, `url`, `computedDate`).

```bash
./build.sh                                  # or:
javac -d build src/data/*.java
java -cp build data.BuildData               # online (fetches Horizons + Moon Trek)
java -cp build data.BuildData --offline     # placeholders when APIs are down
```

### What's in `data/`

| File | Size | What it is | Consumers |
|---|---|---|---|
| `sites.json` | 5.4 KB | 13 landing sites: real lat/lon, elevation, illumination %, Earth-visibility %, `decayMultipliers` | map, engine, ui |
| `game-missions.json` | 3.7 KB | 22 gameplay missions in the engine's exact shape, derived from the real payload manifest | engine |
| `missions.json` | 7.8 KB | 15 real CLPS deliveries: task order, vendor, lander, site, dates, status, payloadIds | archive, map |
| `payloads.json` | 11 KB | 33 real instruments: type, key measurement, PI, lead org, petArchetype | pets, archive |
| `pet-archetypes.json` | 2.3 KB | the 6 pets (lister, lra, rac, msolo, scalpss, planetvac) with power draw + fun facts | pets, engine |
| `mission-events.json` | 4.2 KB | 12 real pop-up stories with `lunarPhase` trigger + NASA source URL | story |
| `ephemeris.json` | 1.1 MB | 14,617 rows of sub-solar / sub-Earth coords (JPL Horizons, 2024–2029 @ 3 h) | ui (day replay) |
| `horizons/<SITE>.json` | ~1 KB ea | 180-bin terrain horizon profiles for the polar sites (LOLA DEM ray-march) | engine, ui |

### The one-paragraph version

`ephemeris.json` + `horizons/*.json` are the **inputs**; everything else is the
**product**: `sites.json` says how hard each site is, `game-missions.json` says
what your pet does there, `missions.json` / `payloads.json` /
`pet-archetypes.json` say which real NASA hardware your pet is, and
`mission-events.json` narrates it.

### Contracts with the other branches

- **Site ids** use the story branch's convention (`MARE_CRISIUM`, `MALAPERT_A`,
  `FAR_SIDE`, …) — story's `MissionMoments`/`SkyModel` match them exactly.
- **Mission ids** use the story branch's stable ids (`peregrine-1`, `im-1`,
  `blue-ghost-1`, `im-2`, `blue-moon-1`, `griffin-1`, `im-3`, `blue-ghost-2`,
  `draper-1`, `im-4`); the official task order lives in `taskOrder`.
- **Sites + game missions** pass the engine branch's own
  `validateSite()` / `validateMission()`; `decayMultipliers` keys are engine
  meter keys (`power` ← illumination, `happiness` ← Earth visibility).
- **No references dangle**: every `siteId`, `missionId`, `payloadId` resolves.

### Data sources

- Moon Trek ArcGIS services (site coords, DEM patches) — verified 2026-11-14
- JPL Horizons API (ephemeris) — no key, build-time fetch only (no CORS)
- science.nasa.gov CLPS delivery pages (payload manifests, PIs, orgs)
- NASA CLPS timeline PDF (mission dates/statuses)

See `PLAN.md` for the full product plan and the physics behind the numbers.
