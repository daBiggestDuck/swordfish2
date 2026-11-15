# Engine (Aku)

Game rules and meter balance for Payload Pets. It's Java with no libraries, like the story branch. It runs entirely on your computer: the server only listens on `localhost` and never contacts any website.

```bash
./run-engine.sh      # play it: http://localhost:8082
./test-engine.sh     # 15 tests + balance report
```

The only requirement is a JDK (Java 17 or newer). In VS Code you can also open `EngineServer.java` or `EngineTest.java` and press **Run** or **Debug** ([guide](https://code.visualstudio.com/docs/java/java-debugging)).

## The game

You pick a payload pet (a real CLPS instrument) and a landing site, then keep the pet alive from sunrise, through the 346-hour lunar day, and into the night.

| Meter | What changes it |
|---|---|
| Power | Solar charges it in daylight (less with dust, the sunshade or a tipped lander); staying awake and the heater drain it |
| Temperature | Drifts toward the ground temperature. Heater +130 K, sunshade −130 K. Outside the pet's safe range it takes damage |
| Dust | Builds up from landing and over time. Blocks solar power and LRA laser returns |
| Data | Science collected. LISTER and EDS must **send** it home; LRA pings are recorded by the orbiter |
| Health | Drops outside the safe temperature range; slowly heals inside it |

| Pet | Real instrument | Science action |
|---|---|---|
| LISTER | Heat-flow drill, Blue Ghost 1 | Drill 8 stops down to 1 m |
| LRA | Passive retroreflector, IM-1 and IM-2. Needs no power | Catch a laser ping every LRO pass (2 h) |
| EDS | Dust shield, Blue Ghost 1 | Dust test (also cleans) |

Milestones to beat: IM-2 (1 day), IM-1 (7 days), sunset (346 h), Blue Ghost 1 (5 h into night).

## Files

| File | What's in it |
|---|---|
| `Rules.java` | **Every tunable number.** `[REAL]` = sourced, `[GAME]` = chosen for play. Balance here |
| `Sources.java` | All sources and the facts taken from them (shown on the website) |
| `Sites.java` / `Pet.java` | Landing sites (real temperatures) and payload pets |
| `Game.java` | The rules: `tick(hours)`, `act(actionId)`, `mood()`, `toJson()` |
| `EngineServer.java` | Local web server and JSON API |
| `web/engine.html`, `engine.js`, `engine.css` | The engine's page |
| `test/engine/EngineTest.java` | Tests + balance report |

## Hooks for the other branches

- **story:** call `storyEngine.advance(game.dayProgress())` every tick (0.0 at sunrise to 1.0 at sunset). `game.earthDays()` feeds the Pet Passport. Site and pet ids match story's (`MARE_CRISIUM`, `MALAPERT_A`, `MONS_MOUTON`, `REINER_GAMMA`, `LRA`, `LISTER`, `EDS`).
- **pets:** draw one face or animation per mood: `happy`, `night`, `dusty`, `sleepy`, `freezing`, `overheating`, `fainted`, `proud`.
- **data:** replace `Sites.ALL` and add facts to `Sources.java`. Each fact must cite a source id; a test checks this.
- **map:** `GET /api/engine/sites` lists every site with its temperatures and sunlight.
- **ui:** restyle `web/engine.css`. All events are listed in `Event.java`.

## API (all GET, JSON)

| Path | Returns |
|---|---|
| `/api/engine/sites`, `/pets`, `/facts` | Data lists |
| `/api/engine/new?site=&pet=&name=&tipped=` | `{id, state}` |
| `/api/engine/tick?id=&hours=` | `{events, state}` (max 48 h per call) |
| `/api/engine/act?id=&action=` | `{result:{ok,error,events}, state}`. Actions: `work`, `send`, `clean`, `heater`, `shade` |
| `/api/engine/state?id=` | state |

## Where the real numbers come from

- 346 h daylight, 5 h into night, 119 GB / 51 GB data: [Firefly](https://fireflyspace.com/news/firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon)
- ~400 K equator noon, <100 K night, 220 K polar rims, 25 K shadowed craters: [Diviner](https://www.diviner.ucla.edu/science)
- Polar max 40–360 K, min 20–100 K: [NASA LRO fact sheet](https://science.nasa.gov/wp-content/uploads/2024/01/lrolitho7temperaturevariation27may2014.pdf)
- Polar peaks lit >80% of the time, LRO passes every ~2 h: [LROC](https://lroc.im-ldi.com/visit/exhibits/1/gallery/41)
- LISTER 1 m, 8 depths: [PDS LISTER](https://pds-geosciences.wustl.edu/missions/clps/to19d_lister.htm)
- LRA passive, 8 reflectors, 20 g: [PDS LRA](https://pds-geosciences.wustl.edu/missions/clps/lra.htm)
- IM-1 seven days; IM-2 tipped and died the next day: [Scientific American](https://www.scientificamerican.com/article/blue-ghost-lander-successfully-completes-historic-lunar-mission/)
- CLPS instrument list: [PDS CLPS archive](https://pds-geosciences.wustl.edu/missions/clps/index.htm)

Safe temperature ranges, power drain and charge rates are game values: none of the sources publish them.

Java help: [dev.java tutorials](https://dev.java/learn/) · [records](https://dev.java/learn/records/)
