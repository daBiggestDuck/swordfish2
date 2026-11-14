# nasa space pet

the ultimate pet

## Story branch (Yeshwin)

Mission pop-ups, the pets' story, the Pet Passport, and a Sun & Earth planning view.
Pure-JDK Java server plus a web page; no libraries.

```bash
./run-story.sh                 # http://localhost:8081   (Windows: .\run-story.ps1)
./run-story.sh --data <dir>    # use the data branch's JSON from another folder
```

| Path | What it is |
|---|---|
| `src/story/` | `StoryServer` (API + static files), `StoryEngine`, pets, pop-ups, Passport, `SkyModel`, `DataBranch` |
| `web/story/` | the story page, plus `story-client.js` for the ui branch |
| `STORY.md` | how the story works and how it plugs into the other branches |

### Contracts with the other branches

- **data**: if a `data/` folder is present, story reads `sites.json`, `missions.json`,
  `mission-events.json` and `ephemeris.json` (real JPL Horizons Sun/Earth positions);
  without it, story falls back to its built-in content and a simplified sky model.
- **engine / ui**: `web/story/story-client.js` exposes `setContext`, `due(dayProgress)`,
  `handleEngineEvent(event)` and `passport()`; feed it the engine's tick progress and events.
- **map**: separate folders (`web/story/`, `src/story/`) and port (8081), so nothing collides.
- Site and mission ids are shared with data and map (`MARE_CRISIUM`, `blue-ghost-1`, ...).
