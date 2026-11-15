# nasa space pet

the ultimate pet

## Story branch (Yeshwin)

Mission pop-ups and the Pet Passport. Java server (JDK only, no libraries) plus a web page (`src/story/StoryServer.java`, `web/story.js`).

## Map & 3D Lunar Explorer (`map` branch)

An interactive 3D WebGL lunar globe, mission planning sandbox, and survival/care simulation powered by authentic NASA Lunar Reconnaissance Orbiter (LRO), JPL Horizons, Moon Trek, and Commercial Lunar Payload Services (CLPS) datasets.

## Quick Start

- **Run Local Map & Web Server (Node.js)**:
  ```powershell
  node tools/serve_map.mjs
  ```
- **Validate Local Datasets Offline**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\fetch_maps.ps1 -OfflineValidate
  ```
- **Refresh Live NASA Datasets & Rasters**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\fetch_maps.ps1
  ```
- **Run Unit & Integration Tests**:
  ```powershell
  node --test test/map.test.mjs
  ```

---

## Data Sources, Citations & Attribution

All planetary imagery, digital elevation models, ephemeris tables, landing coordinates, and payload manifests in this repository originate from publicly accessible NASA and USGS/IAU scientific archives.

### 1. NASA Goddard Scientific Visualization Studio (SVS) — CGI Moon Kit (#4720)
- **Credits**: *Ernie Wright (USRA), Noah Petro (NASA/GSFC), LRO LROC Science Team (Arizona State University), and LRO LOLA Science Team (NASA/GSFC/MIT).*
- **Portal URL**: https://svs.gsfc.nasa.gov/4720
- **Datasets Used**:
  - **LROC WAC Global Color/Albedo Mosaic** (`lroc_color_2k.jpg`, 2048×1024): https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg -> [`web/assets/lroc_wac_global.jpg`](web/assets/lroc_wac_global.jpg)
  - **LRO LOLA Global Digital Elevation Model (DEM)** (`ldem_3_8bit.jpg`, 1024×512): https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg -> [`web/assets/lola_dem_global.jpg`](web/assets/lola_dem_global.jpg)
- **Usage in Project**: Drives the 3D WebGL globe's surface albedo texture (`uTex`), 96×192 3D sphere vertex displacement (`buildSphereMesh`), Sobel tangent-space slope normals (`buildNormalSlopeCanvas`), 10-step Steep Parallax Occlusion Mapping (POM), and 6-step crater-rim self-shadowing (`uHeightTex`) in `web/globe_gl.js`.

### 2. NASA / LROC QuickMap (GSFC / Arizona State University / ACT-REACT)
- **Attribution**: *NASA / Goddard Space Flight Center / Arizona State University / ACT-REACT — Lunar Reconnaissance Orbiter Camera (LROC) QuickMap.*
- **Portal & Stack 3314 URL**: https://quickmap.lroc.im-ldi.com/?prjExtent=-2456929.2929293%2C-1737400%2C2456929.2929293%2C1737400&earthShadowEnabled=true&proj=10&stack=3314&defs=N4IgzGCMAsIFygPYAcCGBjAlgFwJ70gF9Cg
- **Local Raw Artifact**: [`data/maps/raw/quickmap_lroc_stack3314.json`](data/maps/raw/quickmap_lroc_stack3314.json)
- **Usage in Project**:
  - Equirectangular selenographic coordinate frame (`proj=10`, `IAU2000:30100` / `EPSG:104903`, mean lunar radius $R = 1,737.4\text{ km}$).
  - Catalog of **22** lunar maria and impact basins (`notableAlbedoFeatures`) and **43** named craters, central peaks, mountain massifs, volcanic domes, and magnetic swirls (`cratersAndMassifs`) with LOLA rim uplift and floor depths for custom drop-point terrain evaluation and per-site QuickMap deep-links.

### 3. NASA Moon Trek (JPL-Caltech / SSERVI)
- **Attribution**: *NASA / Jet Propulsion Laboratory (JPL-Caltech) / Solar System Exploration Research Virtual Institute (SSERVI) — Moon Trek.*
- **Portal URL**: https://trek.nasa.gov/moon/#v=0.1&x=0&y=0&z=1&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104903
- **ArcGIS REST Endpoints & Data Layers**:
  - **CLPS Landing Sites** (`CLPS_sites/MapServer/0`): https://trek.nasa.gov/moon/trekarcgis3/rest/services/CLPS_sites/MapServer/0/query?where=1%3D1&outFields=*&f=json -> [`data/maps/raw/trek_clps_sites.json`](data/maps/raw/trek_clps_sites.json)
  - **South Pole Permanently Shadowed Regions** (`PSR_SP/MapServer/0`): https://trek.nasa.gov/moon/trekarcgis/rest/services/PSR_SP/MapServer/0/query?where=1%3D1&outFields=*&f=json -> [`data/maps/raw/trek_south_pole_psr.json`](data/maps/raw/trek_south_pole_psr.json)
  - **LRO LOLA Digital Elevation Models** (`LRO_LOLA_DEM_Global_256ppd_v06`, `LRO_LOLA_DEM_SPole45_100mp_v04`) & **LRO Diviner Lunar Radiometer Cold Traps** (`DIVINER_summer_Max_Temp_SP_below110K_240mp`) -> [`data/maps/raw/trek_lola_terrain_profiles.json`](data/maps/raw/trek_lola_terrain_profiles.json)
  - **Moon Trek Raster ImageServers** (fallback metadata): `LRO_WAC_Mosaic_Global_303ppd_v02/ImageServer`, `LRO_LOLA_DEM_Global_256ppd_v06/ImageServer`, `LRO_WAC_Mosaic_SPole60_100m_v02/ImageServer`, `LRO_LOLA_DEM_SPole45_100mp_v04/ImageServer`
- **Usage in Project**: Authoritative CLPS landing coordinates, 36-bin (10° azimuth step) LOLA terrain horizon masks, site elevation/slope/roughness metrics, 8 South Pole PSR cold-trap polygons, and Diviner-calibrated surface temperature extrema (K).

### 4. NASA / JPL Horizons On-Line Ephemeris System (Solar System Dynamics Group)
- **Attribution**: *NASA / Jet Propulsion Laboratory Solar System Dynamics Group — JPL Horizons On-Line Ephemeris System (DE441).*
- **Portal & API Docs**: https://ssd.jpl.nasa.gov/horizons/ | https://ssd-api.jpl.nasa.gov/doc/horizons.html
- **API Query (`COMMAND='301'`, `CENTER='500@399'`, `QUANTITIES='14,15'`)**:
  `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='301'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&CENTER='500@399'&START_TIME='2026-11-10'&STOP_TIME='2026-12-09%2012:00'&STEP_SIZE='4%20h'&QUANTITIES='14,15'&CSV_FORMAT='YES'`
- **Local Raw Artifact**: [`data/maps/raw/horizons_lunar_ephemeris.json`](data/maps/raw/horizons_lunar_ephemeris.json)
- **Usage in Project**: **178-sample** (4-hour step across a 29.5-day synodic lunation, Nov 10 – Dec 9, 2026) time series of sub-solar (`SunSub-LON`, `SunSub-LAT`) and sub-Earth (`ObsSub-LON`, `ObsSub-LAT`) selenographic coordinates driving 3D solar illumination, terminator shading, Earthshine, Direct-to-Earth (DTE) libration visibility, and terrain-masked solar power estimation.

### 5. NASA Commercial Lunar Payload Services (CLPS) & PDS Geosciences Node
- **Attribution**: *National Aeronautics and Space Administration (NASA) — Science Mission Directorate (SMD) CLPS Program & Planetary Data System (PDS) Geosciences Node at Washington University in St. Louis.*
- **Program & Archive URLs**:
  - https://www.nasa.gov/commercial-lunar-payload-services/
  - https://science.nasa.gov/lunar-science/data/
  - https://pds-geosciences.wustl.edu/missions/clps/index.htm
- **Local Artifacts**: [`data/maps/lunar_map_data.json`](data/maps/lunar_map_data.json) and [`web/map_data_bundle.js`](web/map_data_bundle.js)
- **Usage in Project**: **8** CLPS target landing sites, **11** manifested CLPS deliveries (2024–2028), **12** NASA CLPS payload instruments (mass, power, thermal/DTE constraints), LunarLink dependency cascade simulator, and Regolith Recipe Box payload recommendations.

### 6. USGS Astrogeology Science Center & IAU WGPSN Nomenclature
- **Attribution**: *International Astronomical Union (IAU) Working Group for Planetary System Nomenclature (WGPSN) / USGS Astrogeology Science Center — Gazetteer of Planetary Nomenclature.*
- **URL**: https://planetarynames.wr.usgs.gov/Page/MOON/target
- **Usage in Project**: Official selenographic names, center coordinates, and dimensions for lunar maria, impact basins, craters, mountain massifs, domes, and albedo swirls.

---

## Summary of Local Data Artifacts

| File | Source / Instrument | Role |
| :--- | :--- | :--- |
| [`web/assets/lroc_wac_global.jpg`](web/assets/lroc_wac_global.jpg) | NASA SVS #4720 / LRO LROC WAC | 2048×1024 photographic lunar surface albedo mosaic |
| [`web/assets/lola_dem_global.jpg`](web/assets/lola_dem_global.jpg) | NASA SVS #4720 / LRO LOLA | 1024×512 global laser-altimetry DEM for POM, self-shadowing & 3D relief |
| [`data/maps/lunar_map_data.json`](data/maps/lunar_map_data.json) | NASA CLPS / PDS / Moon Trek | Consolidated dataset of sites, missions, payloads, and sources |
| [`data/maps/raw/quickmap_lroc_stack3314.json`](data/maps/raw/quickmap_lroc_stack3314.json) | LROC QuickMap / USGS IAU | Equirectangular projection state + 65 cataloged lunar surface features |
| [`data/maps/raw/trek_clps_sites.json`](data/maps/raw/trek_clps_sites.json) | NASA Moon Trek (`CLPS_sites`) | ArcGIS FeatureSet of CLPS landing site coordinates & attributes |
| [`data/maps/raw/trek_south_pole_psr.json`](data/maps/raw/trek_south_pole_psr.json) | NASA Moon Trek (`PSR_SP`) | ArcGIS FeatureSet of 8 South Pole Permanently Shadowed Regions |
| [`data/maps/raw/trek_lola_terrain_profiles.json`](data/maps/raw/trek_lola_terrain_profiles.json) | LRO LOLA DEM / Diviner | 36-bin (10°) horizon profiles, slope/elevation & thermal calibration extrema |
| [`data/maps/raw/horizons_lunar_ephemeris.json`](data/maps/raw/horizons_lunar_ephemeris.json) | NASA/JPL Horizons (Target `301`) | 178-sample synodic ephemeris (`SunSub-LON/LAT`, `ObsSub-LON/LAT`) |
| [`web/map_data_bundle.js`](web/map_data_bundle.js) | Generated from `data/maps/` | Offline-resilient ES module bundle for browser / VS Code Live Server |
| [`data/maps/NOTICE.md`](data/maps/NOTICE.md) | NASA Public Domain Attribution | Formal provenance notice and public-domain licensing terms |

---

## Licensing & Public Domain Notice

Under **17 U.S.C. § 105** and NASA Media Usage Guidelines, datasets, digital elevation models, ephemeris outputs, and imagery produced by NASA (LROC, SVS, Moon Trek, LOLA, Diviner, JPL Horizons, and CLPS program pages) are in the **public domain** in the United States, provided appropriate credit is given and NASA endorsement is not implied. See [`data/maps/NOTICE.md`](data/maps/NOTICE.md) for complete provenance notes.

- **Derived Metrics Note**: Terrain-masked illumination windows (`horizon-raycast`) combine LOLA horizon elevation bins with JPL Horizons ephemeris tables, and surface temperature estimates (`calibrated-diviner`) are radiative-equilibrium model estimates calibrated to Diviner extrema rather than raw radiance scans.
