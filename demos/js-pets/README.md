# Pet art, moods, and animations

This is the `pets` branch of Payload Pets. It draws five real CLPS instruments and changes their face, pose, and motion with the sunlight.

The planning page asked for pet art, moods, and animations. The mood rules on that page are the ones implemented here: the pet looks happy in full sun and shivers as sunset gets close. Lunar-night sleep follows `pet.passive` (needs no power). Only the retroreflector is passive today.

## How it works

`src/pets.js` is the only place that decides a mood. `src/ui.js` draws whatever that module returns. The page does not keep a second copy of the poses.

Five instruments:

- **LISTER**, a heat-flow probe from the Blue Ghost Mission 1 payload set. The drawing is a body with a drill stem and a bit.
- **Retro**, a laser retroreflector. The drawing is a corner cube. NASA's laser retroreflector arrays are passive: no power, no commands, and no thermal control.
- **EDS**, an electrodynamic dust shield from the same payload set. The drawing is a gridded panel. Dust dots move.
- **Triddy** (`trident`), TRIDENT ice-drill pup. Silver / ice-blue body, frost whiskers, drill bit under the chin. Powered night huddle (cold), not sleep.
- **Nodey** (`ln-1`), LN-1 radio-beacon moth. Gold / amber wings and body, teal antenna tips that blink when Signal is high. Powered night huddle (cold), not sleep.

Three sun phases, in this order:

1. **Full sun** (`day`). Every pet is **Happy** and bobs. Eyes are open, the mouth smiles, and the sun mark sits high. EDS dust is drawn above the panel and floats. Nodey's tips blink by default (preview treats happy as high Signal).
2. **Sunset** (`sunset`). Every pet, including Retro, is **Shivering**. Eyes squint, frost marks show, and the whole figure shakes. EDS dust sits on the panel. Nodey's tips idle unless you pass a high `signal`.
3. **Lunar night** (`night`). Sleep follows `pet.passive`: the pet sleeps only when it needs no power. Only the retroreflector is passive today. Retro is **Sleeping**: eyes shut, three `z` marks, a slow breath, and no frost. LISTER, EDS, Triddy, and Nodey are **Cold**: heavy eyes, a flat mouth, frost, and a small huddle. They do not sleep. EDS dust rests on the lower edge of the panel.

`present(petId, phaseId)` returns that pose. Ids must match the catalog exactly (`lister`, `retro`, `eds`, `trident`, `ln-1`). Any pet or phase string outside that catalog throws. Numbers and `null` throw too. `nextPhase` walks day → sunset → night → day.

Optional third argument: `present("ln-1", "sunset", { signal: 85 })`. When `signal >= SIGNAL_BLINK_AT` (70), Nodey's teal tips get `class="signal-blink"` and `data-shape="blink"`. If `signal` is omitted, tips blink only in the happy (full sun) preview.

The stage drawing uses the mood's animation class: `bob`, `shiver`, `sleep`, or `huddle`. If the browser asks for reduced motion, those animations stop (including antenna blink). The face, dust, and sun mark still show the mood, because those are part of the drawing rather than the motion.

Play waits one interval before the first phase change, then steps the same three phases on that interval (2.8 seconds). Choosing an instrument, choosing a phase, choosing a cell in the pose grid, or pressing Esc pauses playback.

## Run it

From this directory:

```bash
node --test src/pets.test.js
```

The page is an ES module, so open it over HTTP rather than as a file. From the repository root (the `05-pets` worktree):

```bash
python3 -m http.server 8775
```

Then open `http://127.0.0.1:8775/pets/`.

### Preview moods

1. Open the page and pick **Triddy** or **Nodey** in the instrument buttons.
2. Step **Full sun** → **Sunset** → **Lunar night** (or hit **Play the lunar day**).
3. Or click any cell in the pose gallery (5 pets × 3 phases).
4. From a console / engine caller, force Nodey's blink: `present("ln-1", "night", { signal: 90 })`.

## Inputs and outputs

**Inputs:** an instrument id (`lister`, `retro`, `eds`, `trident`, `ln-1`) and a sun phase (`day`, `sunset`, `night`). Optional `{ signal }` for Nodey. On the page those are buttons, the pose grid, or Play.

**Outputs:** a mood (`happy`, `shivering`, `sleeping`, `cold`), one sentence saying why, an animation name, `signalHigh` for Nodey's tips, and an SVG pose. The sentence is the `reason` field. The picture's title is the pet name plus the mood label.

## Assumptions

- LISTER, NGLR, and EDS are described on NASA's Blue Ghost Mission 1 instrument page. LISTER is the pneumatic heat-flow probe. EDS lifts dust with electric fields and has no moving parts. NGLR is the laser retroreflector Earth observatories range to.
- TRIDENT is the PRIME-1 ice drill (catalog id `trident`). LN-1 is the IM navigation beacon (catalog id `ln-1`).
- The sleep rule uses NASA's description of the Laser Retroreflector Array: it is completely passive, and it requires neither power nor maintenance. The pet stands for that kind of instrument. It is not a claim that one serial number flew on every lander.
- LISTER, EDS, Triddy, and Nodey are active payloads, so lunar night is a cold huddle rather than sleep. This page does not estimate watts, heater duty, or a link window.
- Sun phase is an input. A later meter or map branch can pass `day`, `sunset`, or `night`, and the engine can pass `signal` for Nodey's tips. This branch does not compute illumination from a landing site.

## What this branch does not do

Triddy and Nodey show a short Passport line under the blurb (the same catalog text the data branch stores). The lunar map, filters, site picker, care meters, mission pop-ups, and the shared intro screen are other branches. This page does not tilt solar panels, switch a heater, or score a landing site.
