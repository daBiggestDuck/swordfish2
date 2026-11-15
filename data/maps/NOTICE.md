# NASA Space Apps Lunar Challenge — Map Data Attribution & Provenance Notice

This repository contains lunar cartography, terrain elevation, ephemeris, and Commercial Lunar Payload Services (CLPS) mission datasets preserved under `data/maps/` for offline-resilient educational and mission-planning use in the **Payload Pets / Lunar Map** application.

## Data Sources & Official Credits

### 1. NASA / LROC QuickMap (GSFC / Arizona State University / ACT-REACT)
- **URL**: `https://quickmap.lroc.im-ldi.com/?prjExtent=-2456929.2929293%2C-1737400%2C2456929.2929293%2C1737400&earthShadowEnabled=true&proj=10&stack=3314&defs=N4IgzGCMAsIFygPYAcCGBjAlgFwJ70gF9Cg`
- **Local Raw Artifact**: `data/maps/raw/quickmap_lroc_stack3314.json`
- **Coverage & Parameters**:
  - Projection: Equirectangular (`proj=10`), Lunar Reference Radius $R = 1,737,400\text{ m}$ (`IAU2000:30100` / `EPSG:104903`)
  - Extent: `[-2456929.2929293, -1737400, 2456929.2929293, 1737400]`
  - Stack ID: `3314` (`earthShadowEnabled=true`)
- **Attribution**: *NASA / Goddard Space Flight Center / Arizona State University — Lunar Reconnaissance Orbiter Camera (LROC) QuickMap.*

### 2. NASA Moon Trek (JPL-Caltech / SSERVI)
- **Portal URL**: `https://trek.nasa.gov/moon/#v=0.1&x=0&y=0&z=1&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104903&d=&locale=&b=moon&e=-227.81249575048437%2C-156.621090828458%2C227.81249575048437%2C156.621090828458&sfz=&w=`
- **REST Endpoints**:
  - CLPS Landing Sites: `https://trek.nasa.gov/moon/trekarcgis3/rest/services/CLPS_sites/MapServer/0/query?where=1=1&outFields=*&f=json`
  - South Pole Permanently Shadowed Regions (PSRs): `https://trek.nasa.gov/moon/trekarcgis/rest/services/PSR_SP/MapServer/0/query?where=1=1&outFields=*&f=json`
  - LOLA Digital Elevation Models: `LRO_LOLA_DEM_Global_256ppd_v06/ImageServer` & `LRO_LOLA_DEM_SPole45_100mp_v04/ImageServer`
  - Diviner Cold Traps (< 110 K): `DIVINER_summer_Max_Temp_SP_below110K_240mp/ImageServer`
- **Local Raw Artifacts**:
  - `data/maps/raw/trek_clps_sites.json`
  - `data/maps/raw/trek_south_pole_psr.json`
  - `data/maps/raw/trek_lola_terrain_profiles.json`
- **Attribution**: *NASA / Jet Propulsion Laboratory (JPL) / Solar System Exploration Research Virtual Institute (SSERVI) — Moon Trek.*

### 3. NASA/JPL Horizons Ephemeris System (Solar System Dynamics Group)
- **Web & API Docs**:
  - `https://ssd.jpl.nasa.gov/horizons/`
  - `https://ssd-api.jpl.nasa.gov/doc/horizons.html`
- **API Query**: `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='301'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&CENTER='500@399'&QUANTITIES='14,15'&CSV_FORMAT='YES'`
- **Local Raw Artifact**: `data/maps/raw/horizons_lunar_ephemeris.json`
- **Attribution**: *NASA / Jet Propulsion Laboratory Solar System Dynamics Group — JPL Horizons On-Line Ephemeris System.*

### 4. NASA Commercial Lunar Payload Services (CLPS) & PDS Geosciences Node
- **Program & Manifest**: `https://www.nasa.gov/commercial-lunar-payload-services/`
- **Science Data & Archives**:
  - `https://science.nasa.gov/lunar-science/data/`
  - `https://pds-geosciences.wustl.edu/missions/clps/index.htm`
- **Attribution**: *National Aeronautics and Space Administration (NASA) — Science Mission Directorate (SMD) CLPS Program & Planetary Data System (PDS) Geosciences Node at Washington University in St. Louis.*

### 5. NASA Goddard Scientific Visualization Studio (SVS) — CGI Moon Kit (#4720)
- **Portal URL**: `https://svs.gsfc.nasa.gov/4720`
- **Global Raster Assets**:
  - LROC WAC Color/Albedo Mosaic (`lroc_color_2k.jpg`, 2048×1024): `https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg` -> `web/assets/lroc_wac_global.jpg`
  - LRO LOLA Global Digital Elevation Model (`ldem_3_8bit.jpg`, 1024×512): `https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg` -> `web/assets/lola_dem_global.jpg`
- **Attribution**: *Ernie Wright (USRA), Noah Petro (NASA/GSFC), LRO LROC Science Team (ASU), and LRO LOLA Science Team (NASA/GSFC/MIT).*

## Licensing & Usage Terms
Under **17 U.S.C. § 105** and NASA Media Usage Guidelines, data and imagery produced by NASA (LROC, Moon Trek, LOLA, Diviner, JPL Horizons, and CLPS program pages) are in the **public domain** and not subject to copyright protection in the United States, provided appropriate credit is given and NASA endorsement is not implied.

## Disclaimer on Derived Metrics
- Terrain-aware solar illumination percentages and horizon obstruction angles are computed from LOLA DEM azimuth profiles combined with JPL Horizons `SunSub-LON`/`SunSub-LAT` and `ObsSub-LON`/`ObsSub-LAT` tables.
- Surface temperature estimates are calibrated to Diviner polar/equatorial extrema and labeled as thermal model estimates (`calibrated-diviner`) rather than direct raw Diviner radiance scans.
