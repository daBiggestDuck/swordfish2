# Payload Pets story: moving on the Moon

`./run-story.sh` then open http://localhost:8081. The story is now a small game (slide 4):

1. Akshay's WebGL Moon (`web/globe_gl.js` from the map) spins behind the start screen.
2. Pick **two** of the pets team's four pets (LISTER, Retro, EDS, Nodey) from the hotbar.
3. The Moon turns to your landing site, pins it, and the lander drops in.
4. Drive the rover with the arrow keys or A/D (Space to hop). Your two pets ride on it, animate,
   and nap or shiver at night. Power and Warmth follow the Sun.
5. Over 14 in-game days, real NASA mission stories pop up and fill the mission log.
6. After day 14 the story screen shows what happened, each pet's real mission outcome, and NASA links.

Files: `web/story/rover.html|css|js` (game), `src/story/*` (the story API it uses). The older
story page is still at /index.html. The Passport is moving to the data branch.

# How the story works (Payload Pets, story branch)

The story turns real CLPS lander missions into a short, friendly journey. A player adopts a pet
that is a real lander, lives through one lunar day, meets real missions along the way, and ends
with a Pet Passport that cites NASA.

## The player's path through the site

1. **Adopt a pet.** The player picks one of four pets, one per real CLPS mission, and can name it.
   - Ghost: Firefly's Blue Ghost Mission 1 (landed Mar. 2, 2025). Ariha.
   - Luna: Blue Origin's Blue Moon Mark 1 (a planned delivery). Ariha.
   - Triddy: TRIDENT, the PRIME-1 ice drill on IM-2 (Mons Mouton). Pranav.
   - Nodey: LN-1, the navigation beacon on IM-1 (Malapert A). Pranav.
   - Choosing a pet preselects its home landing site; the player can change it.
2. **Pick a landing site.** Mare Crisium, Malapert A, Mons Mouton, Reiner Gamma or Shackleton
   Connecting Ridge. The site changes the stories and the sunlight the pet gets.
3. **Plan with the Sun & Earth card.** The player chooses a landing date and sees, for the site
   (and optionally a second site to compare), where the Sun and Earth are above the horizon,
   the estimated solar power, and whether Earth is visible for the radio link. "Best landing
   date" finds the start date with the most average power. This is the planning side of the
   story: why sites and dates matter to real mission planners.
4. **Live one lunar day.** Press Play. A lunar day of daylight is about 14 Earth days, sped up to
   roughly 25 seconds. The pet's mood follows the day: warming up, full sun, cold before sunset,
   and the night.
5. **Meet real missions.** As the day passes, short pop-ups appear (the game pauses while one is
   open). Each names the real mission and links to a NASA page.
6. **Get the Pet Passport.** At the end of the day: the pet, the mission it is based on, the home
   site, days survived, a rating, the science it "sent home", the stories it met, and clickable
   NASA sources. A Copy button shares it as text.

## Where the story comes from (three layers)

Every pop-up is a `MissionMoment` in `src/story/MissionMoments.java` with a trigger time
(`dayStart`, 0.0 sunrise to 1.0 end of day), a source link, and who it applies to:

| Layer | Shown to | Example |
|-------|----------|---------|
| Site stories | any pet at that site | Malapert A: IM-1 landed tilted |
| General stories | every pet, every site | Peregrine never landed; calling Earth |
| Pet stories | only that pet | Luna: SCALPSS cameras film the landing |

`StoryEngine` filters by site and pet, returns each moment once when the day reaches its trigger
time, and remembers what was shown so the Passport can list it.

## How the pieces connect

```
browser (web/story/story.js -> story-client.js)
   GET /api/pets, /api/missions, /api/sites  -> StoryServer (Java, port 8081)
   GET /api/moments?site&pet&progress        -> StoryEngine + MissionMoments (+ data branch stories)
   GET /api/sky?site&date                    -> SkyModel (real ephemeris from data/, else simplified)
   GET /api/passport?site&pet&name&progress&science -> PetPassport
```

All story content and logic live in Java; the page only draws it.

## Data honesty

- Mission dates come from NASA's "Timeline of Past and Future CLPS Deliveries" graphic.
- Pop-up facts cite specific NASA pages (checked against them).
- With the data branch's `data/` folder, Sun and Earth positions come from JPL Horizons
  (includes the Moon's tilt and libration). Local terrain (hills hiding the Sun) is not used yet;
  the data branch's `horizons/*.json` profiles could add it for the polar sites.
- Without `data/`, the Sun and Earth view uses a simplified model and the page says so.

## How story lines up with the other branches (checked 2026-11-14)

| Branch | What it has | How story fits |
|---|---|---|
| data (Wonil) | Java pipeline + JSON in `data/` (13 sites, 15 missions, 12 pop-up stories, JPL ephemeris, horizon profiles) | Story reads it automatically when `data/` exists; same site and mission ids |
| engine (Aku) | Java game rules on its own server (port 8082): power, temperature, dust, data, health; events like `fainted`, `won`, `milestone` | `story-client.js` takes the engine's events (`fainted`/`won` end the story; `milestone`, `drilled`, `ping`, `dataSent` become Passport science) and its `earthDays` for days survived. Story allows calls from localhost pages, so the engine's page can use it |
| map (Akshay) | Java `MapServer` on port 8080, globe in `web/` | Story moved to `web/story/` and port 8081 so the two never collide |
| pets, ui | empty so far | ui drives the game loop and calls `story-client.js`; pets can replace the emoji faces |

Open questions for the team (not changed by story):

- **Pets:** story has the four pets the pets branch is drawing: Ghost (Blue Ghost 1) and Luna
  (Blue Moon Mark 1) from Ariha, Triddy (`trident`) and Nodey (`ln-1`) from Pranav, using
  Pranav's ids. The data branch's 6 instrument archetypes and the engine's LISTER/LRA/EDS
  are different lists the team still needs to line up.
- **Sites that disagree:** data puts IM-2 at SHACKLETON_RIDGE and Blue Moon Mark 1 at
  SOUTH_POLE_BO. Story uses MONS_MOUTON for IM-2 (NASA's IM-2 materials name Mons Mouton) and
  Shackleton Connecting Ridge for Blue Moon Mark 1 (NASA's CT-3 page). Worth agreeing on one.
- **Pets and sites in the engine:** the engine's pets are instruments (LISTER, LRA, EDS) and it
  has a SHADOWED_CRATER site; story's pets are landers (Ghost, Luna) and it has SHACKLETON_RIDGE.
  Both sides fall back to a default for an unknown id, so these need agreeing on.
- **Sunlight and Earth link:** the engine uses game sunlight factors and no Earth-visibility
  check; story's Sun & Earth view uses real positions. Worth making them agree.

## Testing it

```bash
./run-story.sh                                  # built-in content only
git archive origin/Data data | tar -x -C /tmp   # get the data branch's JSON without merging
./run-story.sh --data /tmp/data                 # story with real data
```

## What plugs in later

- **engine (Aku):** after each `/api/engine/tick` or `/act`, call `story.due(state.dayProgress)`
  and pass every event to `story.handleEngineEvent(event)`; for the Passport call
  `story.passport(state.dayProgress, name, { earthDays: state.earthDays })`. In Java,
  `new StoryEngine(siteId).advance(game.dayProgress())` also works.
- **data (Wonil):** sourced mission and site data to replace the entries in `Missions.java`,
  `MissionMoments.java` and `SkyModel.java`.
- **map (Akshay):** the site picker, using the same site ids.
- **pets (Ariha):** real art in place of the emoji faces in `Pets.java`.
- **ui:** styling in `web/story/story.css` and `web/story/index.html`; game loop calls `story-client.js`.
- **More pets:** add a `Pet` in `Pets.java` and its pop-ups in `MissionMoments.java` with the same id.
