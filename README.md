# Payload Pets — User Guide

Explore real NASA lunar landing sites, compare solar power and Earth communications across the Moon's South Pole, and discover how real spaceflight instruments survive a lunar day.

Built for the **NASA Space Apps Challenge** ([Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/)), **Payload Pets** pairs an interactive 3D lunar planning map with four adoptable science instruments inspired by NASA's [Commercial Lunar Payload Services (CLPS)](https://www.nasa.gov/commercial-lunar-payload-services/) program.

---

## Inside the App (Navigation Tabs)

| Tab | What You Can Do |
|---|---|
| **Map / Sites** | Spin the 3D Moon Globe, switch to Flat Map or South Pole views, play or scrub the lunar Sun clock, inspect any spot on the Moon, and drop a payload pet onto the surface. |
| **Navigator** | Compare two South Pole landing sites side-by-side for any UTC date — track Sun elevation for solar power and Earth visibility for direct radio communications over real LOLA terrain ridges. |
| **Story / Passport** | Follow a guided lunar day with your adopted pet, encounter pop-up dispatches from real CLPS landers, and earn a shareable **Pet Passport** at sunset. |
| **Engine / Care** | Keep your instrument pet warm, powered, dust-free, and connected to Earth through changing sunlight and shadow. |
| **Pets** | Meet all four adoptable NASA CLPS payload pets and preview how each reacts across **Full Sun**, **Sunset**, and **Lunar Night**. |
| **Data / Missions** | Browse the verified catalog of NASA CLPS landers, landing sites, scheduled launch windows, and payload instruments. |
| **About** | See how every app screen maps to lunar mission-planning questions and NASA data sources. |

---

## Meet the Four NASA CLPS Payload Pets

Each pet represents a real hardware instrument flown or manifested on NASA CLPS landers:

| Pet | Real Instrument & Mission | What Teaches Power & Comms |
|---|---|---|
| **LISTER** | Lunar Instrumentation for Subsurface Thermal Exploration with Rapidity (*Blue Ghost 1*, Mare Crisium) | Active heat-flow drill that relies on solar power — thrives in sunlight and shivers when shadow falls. |
| **Retro** (`LRA`) | Laser Retroreflector Array (*IM-1 / IM-2 / Blue Ghost 1*) | Passive optical prism mirror — needs **zero** electrical power and calmly sleeps through lunar night. |
| **EDS** | Electrodynamic Dust Shield (*Blue Ghost 1*, Mare Crisium) | Clears sharp lunar regolith dust from solar panels and optics while powered by the Sun. |
| **Nodey** (`LN-1`) | Lunar Node-1 Navigation Demonstrator (*IM-1*, Malapert A) | Radio positioning beacon that teaches **Signal & Earth Line-of-Sight** — waits for a clear view of Earth (or a relay) before transmitting. |

---

## Exploring the Moon & Picking Landing Spots

Use **Map / Sites** to switch between three synchronized views while keeping your selected spot pinned:

- **3D Globe** — Drag to spin with smooth momentum, scroll to zoom, toggle the live Day & Night terminator, lunar grid lines, Polar Permanently Shadowed Regions (**Ice Craters**), and **Mission Links**.
- **Flat Map** — Full equirectangular projection (`180°W` to `180°E`) showing global daylight patterns and landing zones at once.
- **South Pole** — Top-down polar projection centered on `90°S`, highlighting permanently shadowed cold traps and nearby rim ridges.

Click any curated mission pin or **click anywhere on the Moon** to open a **Landing Spot Check**:

1. **NASA Mission Status** — Shows whether a spot is a planned or completed CLPS/Artemis landing site (plus launch window details) or a custom spot with the nearest official NASA landing site.
2. **Sunlight & Power** — Displays current Sun elevation above local terrain ridges and monthly sunlit coverage.
3. **Temperature** — Shows surface thermal conditions calibrated to NASA Diviner lunar temperature measurements.
4. **Ground Slope & Earth Signal** — Checks landing slope safety and whether Earth is directly visible or needs an orbital communications relay (essential on the lunar far side).

---

## Quick 90-Second Walkthrough

1. Open **Map / Sites**, choose a payload pet (like **LISTER** or **Nodey**), click a South Pole site such as **Shackleton Crater Rim** or **Malapert A**, and press **Select This Spot**.
2. Press **Play** on the Sun Clock (or drag the slider) to watch sunlight sweep across polar crater rims and see how your pet's Power and Signal respond.
3. Switch to **Navigator** to compare two South Pole sites across a 14-day window and check exact solar power and Earth communication windows.
4. Visit **Pets** and **Data / Missions** to explore moods and mission histories behind each instrument.

---

## NASA Open Data & Credits

All coordinates, ephemeris angles, lunar elevation profiles, and imagery are sourced from public NASA datasets (including JPL Horizons, NASA Moon Trek, LROC WAC, LOLA DEM, Diviner, and NASA CLPS mission records).

Read the full source citations and attribution notice in [`data/maps/NOTICE.md`](data/maps/NOTICE.md).
