# Mission, site, and pet data

This is the `data` branch of Payload Pets. The planning page's branch table says this branch holds mission, site, and pet data, and the sources for them.

The page also says the tool should show CLPS missions, compare landing sites by terrain, illumination, and proximity to water ice, browse provider, payloads, dates, and status, and filter by past versus upcoming, year, and region. This branch is that data and the filters. It does not draw the map, run the care meters, animate a pet, or write the Pet Passport.

The catalog date is 14 November 2026 (`asOf` in `catalog.json`). Facts come from the NASA pages linked on each record. Where two NASA pages disagree, the record says so and leaves the contested field empty instead of picking a winner.

## How it works

`catalog.json` is the dataset. `catalog.js` loads it, checks it, and answers questions. `cli.js` is a thin command over those functions. Nothing here fetches the network at runtime.

A record is one of five lists:

- **sources** — an `https` URL with a host, a title, and a publisher.
- **sites** — region (`polar`, `near-side`, `far-side`), terrain, illumination, water-ice relation, and how Earth is reached.
- **payloads** — one real instrument or suite, with a `type` such as `retroreflector`, `heat-flow`, or `dust-shield`, and a `kind`. The kind can match the type, or it can be a narrower token such as `volatiles` or `geophysics`.
- **pets** — the adoptable instruments. The planning page started with three: the heat-flow drill (LISTER), the laser retroreflector (LRA and NGLR), and the dust shield (EDS). v0 ships exactly four adoptable pets: LISTER, Retro (LRA/NGLR), EDS, and Nodey (LN-1). Optional game fields include `passive`, `care`, `engineDraw`, `moods`, `rarity`, `passport`, `vibe`, `preferWait`, `signalBias`, `homeMissionId`, and `homeSiteId`.
- **missions** — provider, lander, task order, dates, status, site, and payload ids.

`filterMissions` keeps a mission only when every filter that was set matches. Filters that are omitted, blank, or only whitespace are ignored. `past` and `upcoming` are decided from `asOf`, which defaults to the catalog date and can be overridden.

- A mission with a launch date is **past** when that date is on or before `asOf`, and **upcoming** when it is after. The launch date wins. `planned`, `completed`, and `failed` do not override it, so a planned mission whose launch date is already on or before `asOf` is past.
- A planned mission with no launch date is **upcoming**.
- A completed or failed mission with no launch date is **past**. The shipped catalog does not contain that case. Validation requires a launch date for both.
- A **cancelled** mission is neither past nor upcoming, even when it has a launch date. It still appears when the status filter is `cancelled`, or when the window is `all`.

The year filter uses the calendar year of `launchDate` when that date exists. Otherwise it uses `nasaTimelineYear`, which is only the year bucket printed on NASA's timeline. A mission with neither `launchDate` nor `nasaTimelineYear` is skipped by a year filter. No year is invented for that row. Griffin and Blue Moon Mark 1 stay in the 2025 bucket because NASA's encyclopedia, updated 21 October 2026, still files them there and still says they will fly. That bucket is not a launch date.

Region, status, and payload filters are matched after trimming and lowercasing. Site ids are trimmed and then matched exactly, so `Malapert-A` does not match `malapert-a`. A payload filter matches `payload.type` or `payload.kind`. `normalizeQuery` and the CLI `--payload` flag accept the union of those tokens, so both `retroreflector` and a kind-only token such as `volatiles` or `geophysics` are valid. Any other token is rejected.

Status in this catalog:

- `failed` means it did not land. Peregrine is the only failed mission.
- `completed` means it reached the surface. `outcome` then says whether the cited NASA page treats the surface mission as a success.
- IM-1 is `completed` with `outcome` `success`. NASA's encyclopedia calls that delivery completed. The seven-day surface stay is in the summary. No tilt angle is stored.
- IM-2 is `completed` with `outcome` `partial`, because NASA says the lander was on its side and PRIME-1 could not accomplish its goals. It is not in the failed filter.
- Blue Ghost 1 is `completed` with `outcome` `success`.
- Everything not yet launched is `planned`.

`compareSites` returns each requested site once, in the order given, with its terrain, illumination, water-ice text, Earth link, and the missions that use that `siteId`. Unknown ids go in `missing` and do not throw. Two or more found sites also get short contrast notes when region, terrain, illumination regime, water ice, or Earth link differ. Illumination `regime` is free text stored on the site, not a closed list. When the regime strings differ, the note quotes them. It does not invent an annual sunlight percent. The polar Earth-link class means visibility depends on the exact spot. The note does not claim Earth is below the horizon, and it does not store a visibility percent. Every shipped site has `annualSunlightPercent: null`, and the notes say that no sunlight score is stored. One site produces no contrast notes.

`describeMission`, `describeSite`, and `describePet` join the ids. A miss returns `null`. `describeMission` returns `site: null` when the mission has no `siteId`. `describePet` returns that pet's missions in the same order as a site profile: launch date, then NASA timeline year, then id.

Validation returns `{ ok: false, errors }` and does not throw when a collection is not an array or an entry is not an object. It refuses a catalog that has duplicate ids, a source URL that does not parse as `https:` with a host, a dangling source, site, or payload id, a missing `program.eligibleVendorCounts` array, a vendor `sourceId` that is not a source, a planned, cancelled, or failed mission with a landing date, a completed mission without a landing date, a landing before launch, a status and outcome that disagree (`failed` must be `no-landing`, `planned` and `cancelled` must be `scheduled`, `completed` must be `success` or `partial`), a mission region that disagrees with its site, a sunlight percent, a latitude or longitude that is not a finite number in range, a payload count smaller than the named list, unnamed payloads without a `payloadNote`, or a pet whose power, night behavior, and `passive` flag disagree. A pet with `power: "none"` must be passive at night. A pet that requires power cannot be passive. When moods are present, a non-passive pet cannot sleep through the night, and a passive pet is not marked cold. Optional `homeSiteId` and `homeMissionId` must name real sites and missions.

## What the numbers do and do not say

NASA's 21 October 2026 encyclopedia gives the contract ceiling as $2.6 billion through 2028 and counts 14 eligible vendors (nine in November 2018, five more a year later). The February 2025 IM-2 press kit says 13 companies and says the ceiling runs through November 2028. Both vendor counts are stored, and the November wording is kept as a note rather than a second ceiling. The planning page's "17 deliveries," "60+ payloads," and "5 vendors" are not copied in as program totals.

No site stores an annual illumination percent. Mons Mouton's note that some nearby permanently shadowed regions stay below 110 K is from a 2026 landing-site paper, and it is about those nearby sites, not an IM-2 coordinate. This catalog does not have an IM-2 latitude and longitude.

Draper Mission 1 has no `siteId` and no `region`. The October 2026 encyclopedia says the lunar South Pole. Earlier NASA CLPS and PRISM pages say Schrödinger Basin. `describeMission` returns `site: null` for that row. CS-11 is a separate row because NASA lists it as its own Schrödinger delivery with the lander still to be chosen.

Blue Ghost Mission 2 names no instruments. The encyclopedia says two NASA surface payloads plus a relay, and the deliveries page says three. Blue Moon's payload count is also left unset: the encyclopedia names SCALPSS, the deliveries page says two payloads, and the 2025 press kit says one.

Griffin does not carry the laser retroreflector in this catalog. NASA's LRA page ties that instrument to the old VIPER task order, and VIPER is not asserted as flying on Griffin.

Coordinates that are stored:

- Malapert A, 80.13°S, 1.44°E, elevation 2,579 m. NASA LRO landing fix for IM-1.
- Mare Crisium, 18.5623°N, 61.8103°E. Landing fix from NASA's LEAG 2025 Blue Ghost 1 science highlights.
- Gruithuisen Domes, 36.45715°N, 319.20398°E. Published Lunar-VISE ellipse, not a landed fix. Longitude is the paper's 0-to-360 east value.

The pets follow the instruments. Engine draw numbers are playable stand-ins kept next to the pet so the care meters stay aligned with this catalog; they are not NASA watt ratings:

- Heat-flow drill: LISTER, power required, stops at night without power. Flown on Blue Ghost 1. NASA describes a 2-to-3-meter heat-flow probe. Engine draw key `listerDraw` ≈ 30.
- Laser retroreflector: LRA and NGLR, no power, still there at night. The small LRA is for spacecraft. NGLR is the Earth-ranging one on Blue Ghost 1.
- Dust shield: EDS, power required, does not keep cleaning through the night by itself. Engine draw key `edsDraw` ≈ 20.
- Nodey: LN-1 on IM-1 at Malapert A (80.13°S, 1.44°E). Power required, night mood cold. Lighter than EDS (`ln1Draw` ≈ 18). Uncommon. Prefers waiting on Signal. Passport line covers broadcast ranging for later vehicles.

## Two datasets on this branch

This worktree carries **two** data layers that must stay id-compatible for Triddy and Nodey:

1. **`catalog.json` (+ `catalog.js`)** — source of truth for the game branches (`engine` / `pets` / `ui` / `map`). Mission ids are `im-1` / `im-2`. Pet ids are `trident` (Triddy) and `ln-1` (Nodey), with `engineDraw` keys `tridentDraw` / `ln1Draw`, `preferWait` on Nodey, and homes `mons-mouton` / `malapert-a`.
2. **Java pipeline JSON** (`payloads.json`, `missions.json`, `pet-archetypes.json`, `sites.json`, …) — built from `src/data/*.java`. Mission ids are task-order style (`to2-im` ↔ IM-1, `to-prime1` ↔ IM-2). Payload ids `trident` and `ln-1` map to pet archetypes of the same ids (not `lister` / `scalpss`).

Crosswalk used by the game:

| Game (`catalog.json`) | Pipeline JSON | Notes |
| --- | --- | --- |
| `im-1` @ `malapert-a` | `to2-im` @ `malapert-a` | Nodey / `ln-1` |
| `im-2` @ `mons-mouton` | `to-prime1` @ `mons-mouton` | Triddy / `trident` + MSolo |
| `tridentDraw` 34 | archetype `trident` `basePowerDraw` 34 | relative game draw, not NASA watts |
| `ln1Draw` 18 + `preferWait` | archetype `ln-1` `basePowerDraw` 18 | tutor waits for Earth |

LISTER / retroreflector / EDS pets remain in `catalog.json` for the meter engine. The Java archetypes still include Digby / Retroflector Rex / Dusty (RAC) for the broader payload set.

## Two datasets on this branch

This worktree carries **two** data layers that must stay id-compatible for Triddy and Nodey:

1. **`catalog.json` (+ `catalog.js`)** — source of truth for the game branches (`engine` / `pets` / `ui` / `map`). Mission ids are `im-1` / `im-2`. Pet ids are `trident` (Triddy) and `ln-1` (Nodey), with `engineDraw` keys `tridentDraw` / `ln1Draw`, `preferWait` on Nodey, and homes `mons-mouton` / `malapert-a`.
2. **Java pipeline JSON** (`payloads.json`, `missions.json`, `pet-archetypes.json`, `sites.json`, …) — built from `src/data/*.java`. Mission ids are task-order style (`to2-im` ↔ IM-1, `to-prime1` ↔ IM-2). Payload ids `trident` and `ln-1` map to pet archetypes of the same ids (not `lister` / `scalpss`).

Crosswalk used by the game:

| Game (`catalog.json`) | Pipeline JSON | Notes |
| --- | --- | --- |
| `im-1` @ `malapert-a` | `to2-im` @ `malapert-a` | Nodey / `ln-1` |
| `im-2` @ `mons-mouton` | `to-prime1` @ `mons-mouton` | Triddy / `trident` + MSolo |
| `tridentDraw` 34 | archetype `trident` `basePowerDraw` 34 | relative game draw, not NASA watts |
| `ln1Draw` 18 + `preferWait` | archetype `ln-1` `basePowerDraw` 18 | tutor waits for Earth |

LISTER / retroreflector / EDS pets remain in `catalog.json` for the meter engine. The Java archetypes still include Digby / Retroflector Rex / Dusty (RAC) for the broader payload set.

## Run it

From the repository root:

```bash
node --test data/catalog.test.js
node data/cli.js validate
node data/cli.js missions --window past
node data/cli.js missions --window upcoming --year 2028
node data/cli.js missions --region polar --status completed --payload retroreflector
node data/cli.js missions --payload volatiles
node data/cli.js mission im-2
node data/cli.js site mons-mouton
node data/cli.js pet retroreflector
node data/cli.js pet ln-1
node data/cli.js pet ln-1
node data/cli.js compare malapert-a mare-crisium mons-mouton
node data/cli.js sources
```

`missions` prints a short record for each match: id, name, status, outcome, dates, timeline year, region, site, and provider. The library function `filterMissions` returns the full mission objects. `mission`, `site`, `pet`, and `compare` print the joined records, including source URLs. Filters are flags. A bare word after `missions`, `validate`, or `sources` is rejected, so `missions polar` does not return every mission. `compare` exits 1 with `NOT_FOUND` when every requested site id is missing. If at least one requested site exists, it exits 0 and lists the unknown ids in `missing`. A bad filter, an unexpected positional argument, or an unknown option exits 1 with `INVALID_FILTER`. An unknown subcommand exits 1 with `UNKNOWN_COMMAND`. An unknown mission, site, or pet id exits 1 with `NOT_FOUND`. Stderr is `{ "error", "code" }`.

There is no package install. The commands use Node's built-in test runner.

## What this branch does not do

The lunar map, the filter screen, pet art, meter balance, mission pop-ups, and the Pet Passport are other branches. This page does not claim a landing coordinate, a payload name, a sunlight percent, or a water-ice distance that the cited source does not give.
