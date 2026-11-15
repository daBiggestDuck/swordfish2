# How the story works (Payload Pets, story branch)

The story turns real CLPS lander missions into a short, friendly journey. A player adopts a pet
that is a real lander, lives through one lunar day, meets real missions along the way, and ends
with a Pet Passport that cites NASA.

## The player's path through the site

1. **Adopt a pet.** The player picks a pet (a real lander) and optionally names it.
   - Ghost is based on Firefly's Blue Ghost Mission 1 (landed Mar. 2, 2025).
   - Luna is based on Blue Origin's Blue Moon Mark 1 (a planned delivery).
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
| engine (Aku) | JavaScript game rules: meters, actions, moods, events | `story-client.js` takes the engine's events (`missionComplete` adds Passport science, `petFainted` ends the story) |
| map (Akshay) | Java `MapServer` on port 8080, globe in `web/` | Story moved to `web/story/` and port 8081 so the two never collide |
| pets, ui | empty so far | ui drives the game loop and calls `story-client.js`; pets can replace the emoji faces |

Open questions for the team (not changed by story):

- **Pets:** the data branch defines 6 instrument pets (lister, lra, rac, msolo, scalpss,
  planetvac). Story has 2 lander pets (Ghost = Blue Ghost 1, Luna = Blue Moon Mark 1), as asked.
  Luna's two instruments are SCALPSS and LRA, which are also data-branch pets, so they can link.
- **Sites that disagree:** data puts IM-2 at SHACKLETON_RIDGE and Blue Moon Mark 1 at
  SOUTH_POLE_BO. Story uses MONS_MOUTON for IM-2 (NASA's IM-2 materials name Mons Mouton) and
  Shackleton Connecting Ridge for Blue Moon Mark 1 (NASA's CT-3 page). Worth agreeing on one.
- **Language:** engine is JavaScript, story/data/map are Java. The browser glue is
  `story-client.js`, so ui can stay in JavaScript.

## Testing it

```bash
./run-story.sh                                  # built-in content only
git archive origin/Data data | tar -x -C /tmp   # get the data branch's JSON without merging
./run-story.sh --data /tmp/data                 # story with real data
```

## What plugs in later

- **engine (Aku):** call `story.due(dayProgress)` each tick and pass every engine event to
  `story.handleEngineEvent(event)`. Sun height can feed the power meter and Earth height the
  happiness (link) meter, matching the data branch's `decayMultipliers`.
- **data (Wonil):** sourced mission and site data to replace the entries in `Missions.java`,
  `MissionMoments.java` and `SkyModel.java`.
- **map (Akshay):** the site picker, using the same site ids.
- **pets (Ariha):** real art in place of the emoji faces in `Pets.java`.
- **ui:** styling in `web/story/story.css` and `web/story/index.html`; game loop calls `story-client.js`.
- **Two more pets:** add a `Pet` in `Pets.java` and its pop-ups in `MissionMoments.java`.
