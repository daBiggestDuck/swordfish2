# Payload Pets — Data-First Build Plan

**Status:** planning only. Nothing implemented.
**One-liner:** Adopt a real CLPS instrument, keep it alive through one real lunar day at a real landing site — and let the map prove every number is real.

---

## 1. The decision (read this first)

Ship **one product** with four surfaces, not five products:

| Surface | Role | Why it exists |
|---|---|---|
| **Payload Pets** | hero / emotional hook | wins Creativity + Presentation + Inspirational |
| **Moon Map** | home screen, site picker, comparison tool | satisfies the brief's "planning tool" requirements + Best Use of Data |
| **Archive** (Lost & Found) | mission drawer, real outcomes | storytelling depth, cheap to build |
| **Manifest** (Recipe Box) | one small panel in the site card | shows engineering constraints, not a second game |

Night Nightlight is **not a page** — it is the night phase of the pet loop.

The differentiator is not the cute pet. It is that the pet's Power / Warmth / Signal meters are driven by **JPL Horizons ephemeris + LOLA terrain**, and the UI shows the math. Every competing team will have a pet. Almost none will have a defensible data spine.

---

## 2. What the links actually give us (verified today)

Everything below was fetched live and confirmed working. Status column = observed HTTP behaviour.

### 2.1 The goldmine: NASA Moon Trek ArcGIS services

`https://trek.nasa.gov/moon/trekarcgis/rest/services` → **279 lunar layers**, all queryable with `exportImage`, no key, no CORS problem for build-time use.

| Dataset | Endpoint | Gives us | Use in product |
|---|---|---|---|
| **CLPS landing sites** | `trekarcgis3/rest/services/CLPS_sites/MapServer/0/query?where=1=1&outFields=*&f=json` | **7 sites with real lat/lon**, lander, task order, vendor, payload page URL | site markers + site cards (authoritative coords) ✅ 200 |
| **LOLA DEM global** | `.../LRO_LOLA_DEM_Global_256ppd_v06/ImageServer/exportImage` | float32 elevation patches (~118 m/px) | elevation + slope for every site ✅ 200 |
| **LOLA DEM polar 100 m** | `.../LRO_LOLA_DEM_SPole45_100mp_v04/ImageServer` | 100 m/px within 45° of pole | Malapert, Mons Mouton, Shackleton ✅ 200 |
| **LOLA DEM polar 30 m / 5 m** | `.../LRO_LOLA_DEM_SPole75_30mp_v04`, `.../SPole875_5mp_v04` | 30 m and 5 m/px near pole | high-res horizon around the south pole ✅ 200 |
| **LOLA DEM 10 m** | `.../ldem_85s_10m_Spole_float/ImageServer` | 10 m/px south of 83°S | precision horizon ray-march ✅ 200 |
| **LROC WAC basemap** | `.../LRO_WAC_Mosaic_Global_303ppd_v02/ImageServer` | 100 m/px grayscale imagery | site card images, hillshade underlay ✅ 200 |
| **Polar WAC** | `.../LRO_WAC_Mosaic_SPole60_100m_v02` | 100 m/px polar imagery | south-pole map view ✅ listed |
| **PSRs** | `.../PSR_SP/MapServer/0/query` | **164 permanently-shadowed polygons** | "distance to water-ice target" ✅ 200 |
| **Diviner cold traps** | `.../DIVINER_summer_Max_Temp_SP_below110K_240mp/ImageServer` | regions max-temp < 110 K | resource proximity, science score ✅ listed |
| **Ice / radar** | `SP_IceLoc_280m`, `LRO_MiniRF_CPR_SPole70_118mp` | ice-location + CPR (ice proxy) rasters | "why this site matters" ✅ listed |
| **Historical landings** | `trekarcgis2/rest/services/Lunar_Landing_Impact_Sites/MapServer` | impact + soft-landing sites | Archive layer ✅ 200 |

**Verified coordinate output** (lat, lon) — from the CLPS layer:

```
Sinus Viscositatis  (-40.99,  35.26)  Peregrine        TO2-AB
Nobile Region       ( 53.27, -85.28)  Griffin          TO20A
Malapert A          (  1.44, -80.13)  Nova-C / IM-1    TO2-IM
Shackleton Ridge    (132.32, -89.63)  Nova-C / IM-2    TO-PRIME1
Reiner Gamma        (-58.96,   7.39)  Nova-C / IM-3    CP-11
Mare Crisium        ( 59.10,  16.18)  Blue Ghost 1     TO19D
Schrödinger Basin   (132.93, -74.73)  Draper SERIES-2  CS-11
```

This layer is a 2024/25 snapshot — **treat as coordinates, not status.** Status comes from the mission pages.

### 2.2 The physics: JPL Horizons

`https://ssd.jpl.nasa.gov/api/horizons.api` with `COMMAND='301'`, `CENTER='500@399'`, `QUANTITIES='14,15'` returns, in one table:

- `ObsSub-LON / ObsSub-LAT` → **sub-Earth point** → comms geometry
- `SunSub-LON / SunSub-LAT` → **sub-solar point** → power/thermal geometry

One request covers a full year at 1 h steps: **646 KB, 8,761 rows.** No key. ✅

⚠️ **No CORS headers** → cannot be called from the browser. Must be a build-time fetch, shipped as a static JSON. (This is a feature: the demo works offline.)

### 2.3 The content: NASA CLPS pages

| Source | Gives us |
|---|---|
`science.nasa.gov/lunar-discovery/deliveries` | 11 delivery detail pages, one-line status each |
`science.nasa.gov/lunar-science/clps-deliveries/<id>/` | **per-instrument**: summary, instrument type, key measurement, PI, lead org, task order, image |
`nasa.gov/commercial-lunar-payload-services/` | program facts: 17 deliveries, 60+ payloads, 5 vendors, 13 eligible companies, $2.6B through Nov 2028 |
`.../landing-sites/` | landing-sites graphic + 3D map link |
**CLPS timeline PDF** `wp-content/uploads/2025/07/clps-timeline-graphic-1.pdf` | **the manifest skeleton, text-extracted successfully** (see below) |
`science.nasa.gov/lunar-science/data/` | PDS links per task order (TO2-AB, TO2-IM, PRIME-1, TO19D) → "the science it sent home" |
`pds-geosciences.wustl.edu/missions/clps/index.htm` | PDS Geosciences CLPS node, per-instrument data pages |
`pds.mcp.nasa.gov/investigations/urn:nasa:pds:...` | PDS4 investigation/instrument registry per TO |

**Extracted from the official timeline PDF** (exact strings):

```
2024  Peregrine      launched Jan 8, 2024      no lunar landing
2024  IM-1           launched Feb 15, 2024     landed Feb 22, 2024
2025  Blue Ghost 1   launched Jan 15, 2025     landed Mar 2, 2025
2025  IM-2           launched Feb 27, 2025     landed Mar 6, 2025
2026  Griffin-1, Blue Moon MK1, Blue Ghost 3, IM-3, Blue Ghost 2, Draper-1, IM-4
2027  (remaining)
2028  (remaining)
```

Note the PDF says *future deliveries are placed by year only*. That is a gift: the "filter by year" feature is honest by construction.

### 2.4 Offline / fallback assets

| Asset | URL | Size | Use |
|---|---|---|---|
`lroc_color_poles_2k.tif` (SVS CGI Moon Kit) | `svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/` | 3.3 MB | equirectangular basemap, no network needed ✅ |
`ldem_4.tif` | same | 4.2 MB | coarse global relief for the globe ✅ |
`mooninfo_2024.json` | `.../a005100/a005187/mooninfo_2024.json` | 2.1 MB | hourly subsolar table, independent check on Horizons ✅ |

### 2.5 Dead ends — do not build on these

| Thing | Status |
|---|---|
QuickMap WMS `/wms` | returns the SPA HTML, not a service |
`lroc-tiles.actgate.com` | **NXDOMAIN** (tiles referenced in QuickMap's bundle) |
`dem-tiles.b-cdn.net/lunar/qts_demstack/*` | 404 for every guessed path |
`trek.nasa.gov/moon/wms` | 404 |
`planetarymaps.usgs.gov` mapserv | map file missing on server |

**Conclusion:** use Moon Trek's ArcGIS REST, not QuickMap tiles. QuickMap stays a citation link only ("view this site in LROC QuickMap").

---

## 3. The mechanic that makes it real

Three numbers, three real datasets. This is the whole product.

### 3.1 Power ← sun elevation

```
sin(h) = sin φ · sin δ + cos φ · cos δ · cos(λ☉ − λ)
```
φ, λ = site; δ, λ☉ = `SunSub-LAT`, `SunSub-LON` from Horizons.

At any site this yields a clean, real day/night curve over 29.5 days. Verified over 2026:

| Site | sun > 0° | sun > 5° | Earth > 0° |
|---|---|---|---|
Malapert A | 51.5 % | 47.5 % | 100 % |
Mare Crisium | 48.9 % | 43.4 % | 100 % |
Reiner Gamma | 50.8 % | 45.5 % | 100 % |
Schrödinger (farside) | 49.2 % | 44.9 % | **0 %** |
Mons Mouton | 49.7 % | 46.6 % | 79 % |
Shackleton Ridge | 49.0 % | 45.1 % | 49 % |

### 3.2 Signal ← Earth elevation (same formula, sub-Earth point)

Schrödinger gets **zero** direct-to-Earth time. That is not a designer's invention — it is why farside missions need a relay (Blue Ghost 2 carries one). The Signal meter becomes a real constraint, and the farside site becomes the "hard mode" with an in-fiction reason.

### 3.3 Warmth ← illumination + a one-layer thermal model

```
T⁴ = (S·(1−A)·cos z + Q_earth) / (σ·ε)      → clamp, add heater term
```
Calibrate A/ε once per site against Diviner-derived extrema. **Label it "thermal model calibrated to Diviner", never "Diviner data".**

### 3.4 Terrain horizon (the part that separates us from every other team)

At polar sites the sun never rises more than ~4°, so nearby ridges decide everything. Ray-march a LOLA DEM patch around each site, build a 180-bin horizon profile, and compare sun elevation against the horizon in the same azimuth bin.

**What I actually got when I ran it** (Malapert A, 30 km patch, 100 m/px, bilinear + median filter):

```
flat model       51.5 % illuminated
terrain-aware    48.8 % illuminated   (horizon max 16.4°, mean 4.8°)
```

That is a real, defensible result: Malapert A sits in a crater, not on the summit, so it does **not** get the famous 70–80 %. The number now distinguishes sites instead of every site reading "50 %".

**Gotchas found the hard way — put these in the build script:**
1. Always request `interpolation=RSP_BilinearInterpolation`. Nearest-neighbour gives 1-pixel spikes and a nonsense 89° horizon.
2. 3×3 median filter the DEM before ray-marching.
3. *EQ* variants use `32767` as nodata → mask it.
4. Poleward of ~85° a geographic bbox wraps the pole and produces garbage. Fetch in native polar stereographic, or use the 10 m `ldem_85s` service.
5. Units differ per service (global = metres vs sphere; polar = metres vs local datum). Read `minValues/maxValues` and sanity-check against a known crater.

**Fallback rule:** if a computed illumination fraction disagrees with published LOLA/NASA values by >10 %, ship the published value for that site and mark it `published` in the UI. Never ship a wrong number that looks precise.

### 3.5 Science value ← resource proximity

Geodesic distance from site → nearest PSR polygon (`PSR_SP`, 164 polygons), nearest ice-location pixel, plus MiniRF CPR. Drives an in-game bonus and the "why here?" line on the site card.

---

## 4. Data model (bake once, ship static)

```
scripts/build_data.py            # runs offline, committed artifacts
data/
  sites.json                     # 8 sites: coords, elev, slope, horizon, illum, earth%, psr_km, temp range
  missions.json                  # 17 deliveries: TO, vendor, lander, site, launch, landing, status, as_of
  payloads.json                  # 60+ instruments: type, key measurement, PI, org, mass/power (where published)
  ephemeris.json                 # global sub-solar + sub-Earth table, 2024-2028 @ 1h  (~400 KB gz)
  horizons/<site>.json           # 180-bin horizon profile (~2 KB each)
public/
  moon/equirect-4k.jpg
  moon/south-pole.jpg
  sites/<slug>-wac.jpg | -hillshade.jpg
```

Each record carries provenance:

```jsonc
{
  "illumination": { "value": 48.8, "unit": "%", "method": "horizon-raycast",
                    "source": "MOON_TREK:SPole45_100mp_v04", "computed": "2026-11-14" }
}
```

The UI renders `method` + `source` on hover. That single habit is worth more to "Best Use of Data" than any extra feature.

**Rule: no runtime API calls.** Horizons has no CORS, NASA rate-limits, and the demo must survive conference Wi-Fi.

---

## 5. Product surfaces

### 5.1 Moon Map (home)
- d3-geo canvas: equirectangular world + azimuthal-equidistant south pole.
- Site markers coloured by status; PSR overlays; ice layer toggle.
- Filters: **time window** (past / upcoming / year), **region** (polar / nearside / farside), **status**, **payload type**.
- Compare tray: pin 2–3 sites → columns for lat, elevation, slope, illumination %, Earth-visibility %, nearest PSR km, missions, payload count.
- Every row has a source chip.

### 5.2 Site card
Real WAC image, real terrain stats, the day/night curve, "why this site was chosen", list of missions that went there, distance to ice. Button: **Adopt a payload here**.

### 5.3 Payload Pets (the game)
- 6 pets, all real instrument archetypes: **LISTER** (heat-flow drill), **LRA** (passive retroreflector), **RAC** (dust), **MSolo** (mass spec, high power), **SCALPSS** (camera, hates plume dust), **PlanetVac** (sample).
- Passive pets (LRA) genuinely don't need power at night — the real instrument is passive. That is a mechanic and a fact at once.
- 1 lunar day = 29.53 days compressed to ~4 min (configurable 3–6).
- Meters: Power, Warmth, Signal (+ hidden Science).
- Actions: tilt array, heater on/off, transmit, deploy, sleep.
- Difficulty comes from the site table above, not from tuning.
- Events fire from the real manifest (IM-1 tilted, IM-2 in a crater, Blue Ghost 1's sunset image, Peregrine's leak).

### 5.4 Archive drawer
Manifest timeline + outcome stories, each with a NASA link. Not a page: a slide-over from any mission marker.

### 5.5 Manifest panel (Recipe Box, mini)
Pick site + mass/power budget → the panel says which payloads fit and **why**, citing the site's science goal ("this site targets volatiles → drill fits better than a camera"). 4 site profiles, hard constraints, no solver.

### 5.6 Pet Passport
Site, days survived, data returned, illumination encountered, citations, shareable PNG. Downloads without a backend.

---

## 6. Stack & architecture

- **Vite + React + TypeScript + Tailwind + zustand**, static deploy. No backend, no DB, no auth.
- **d3-geo + canvas** for the map. Rationale: no tile infrastructure to break (QuickMap's is already broken), exact control of the polar projection, and it looks custom rather than "Mapbox with a moon texture".
- Sim loop: fixed timestep, `useReducer` or zustand store, seeded RNG so a run is reproducible for the demo.
- Motion: `motion` for UI transitions only; the pet itself is CSS/SVG so it stays at 60 fps during the sim.
- `scripts/build_data.py`: numpy + Pillow + requests. Python is only a build dependency; the committed JSON/images mean the web build needs nothing.

```
src/
  data/           generated JSON (imported, typed)
  map/            projections, layers, filters, compare
  sim/            ephemeris, solar, thermal, power, comms, events, reducer
  game/           pet sprites, meters, controls, timeline scrubber
  archive/        manifest timeline, mission drawer
  passport/       result card + PNG export
  provenance/     source chip, method modal, citations page
```

---

## 7. Award mapping (what the judges actually see)

| Award | The artefact that wins it |
|---|---|
**Best Use of Data** | A "Data & Sources" page: every dataset, endpoint, what it changed, and a "show the math" toggle on the game screen |
**Best Mission Concept** | Compare tray + manifest panel: real terrain, real illumination, real comms, real mass/power limits |
**Most Inspirational** | The pet's first lunar night, and the real mission that didn't make it |
**Creativity / Presentation** | One lunar day in four minutes, Pet Passport |
**Galactic Impact** | The map answers "where is NASA actually going, and why there" |

Cheapest high-value credibility features, in order:
1. `source` chip on every number (half a day).
2. Methodology modal with the two formulas (2 hours).
3. "as of" date on the manifest (10 minutes).
4. Comparison of flat-model vs terrain-aware illumination (already computed — it is a great story).

---

## 8. 48-hour schedule

| Block | Work | Owner |
|---|---|---|
**H0–2** | Lock scope, build `build_data.py`: sites, manifest, ephemeris | A.A |
**H2–6** | DEM patches → elevation, slope, horizon, illumination; validate vs published | A.A |
**H4–10** | Map shell, projections, markers, filters | Y.G |
**H8–14** | Site card + compare tray + provenance chips | Y.G / A.A |
**H12–22** | Sim engine (solar → power, thermal → warmth, comms → signal), tuned on 2 sites | A.A |
**H16–26** | Game UI, pet states, controls, day scrubber | Y.G |
**H22–30** | Archive drawer + mission content + Manifest panel | A.R |
**H28–34** | Pet Passport, share card, endings | A.R / Y.G |
**H32–38** | Data & Sources page, methodology modal, copy pass | A.R |
**H38–43** | Edge cases: every site × every pet, offline test, projector test | all |
**H43–48** | Demo script (90 s), video, submission text | A.R |

Critical path is **H0–6**. If the data pipeline slips, cut the Manifest panel and the Archive before cutting the map.

---

## 9. Scope guardrails

**Do not build:** live API calls, Cesium/3D globe, full PDS ingestion, user accounts, a second game, a CMS.

**Cap:** 8 sites, 6 pets, 17 missions, 4 filter dimensions.

**Yes/no test for any new idea:** does it make a number on screen more trustworthy, or the pet more lovable? If neither, it doesn't ship.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
Illumination model challenged by a lunar scientist | Publish method + formula; ship flat-vs-terrain comparison; fall back to published values per site |
Mission status drifts during the event | `as_of` field, statuses in JSON not code, 10-minute re-check before demo |
Demo network failure | 100 % static; preload basemap + all JSON |
"Another cute pet app" first impression | Open on the map with real site stats; the pet is the second click, not the first |
Scope creep from 5 merged ideas | The four-surface rule in §1 |

---

## 11. Open questions for the team

1. Is the submission **Payload Pets** with the map inside it, or **the map** with pets inside it? (Recommend the former — the map alone is a crowded category.)
2. Do we adopt the "computed vs published" badge everywhere, even where it's unglamorous? (Recommend yes.)
3. Which two sites get the deepest polish for the demo? (Recommend **Mare Crisium** = success story, **Malapert A** = tilted lander + crater shadows.)
4. Does the Archive include Peregrine's failure? (Recommend yes — "Landing on the Moon is hard" is NASA's own line.)
