# Intro screen and demo layout

Planning-page task, branch `ui`: **Layout, styling, intro screen, demo.**

## What this is

The front door for Payload Pets. You pick a landing site and a CLPS instrument, then watch one lunar day (about 14 Earth days) play across the screen in half a minute. The page is the intro, the layout, and a demo of that layout. It is the screen, not the rest of the game.

## How it works

`src/demo.js` holds the screen state. `src/screen.js` paints it. `styles.css` restyles the page for intro, dawn, day, dusk, and night.

A session is `intro`, `playing`, `paused`, or `ended`. Time does not move on the intro. After **Start the demo**, the clock runs from 0 to 1 over `durationMs` (28 seconds unless the URL says otherwise). Progress maps to a phase:

| Progress | Phase |
| --- | --- |
| 0 up to 0.15 | Dawn |
| 0.15 up to 0.62 | Day |
| 0.62 up to 0.78 | Dusk |
| 0.78 through 1 | Night |

The sun disk and the sunlight bar use `sunlightPreview`. That curve is 0 at the start of the day, 1 at local noon (progress 0.385), and 0 again by the end of the night. It only moves pixels on this screen. It is not a power, warmth, or signal model.

The four sites are Mare Crisium, Malapert A, Mons Mouton, and Reiner Gamma. The five instruments are a heat-flow drill, a laser retroreflector, a dust shield, Triddy (`trident`), and Nodey (`ln-1`). Their sentences are stage labels for the demo. They are not the sourced mission catalog. Triddy and Nodey lines carry the Pet Passport flavor from the data catalog.

When the clock reaches 1, the demo ends on the night styling and a banner names the site and instrument you watched. Replay starts the day again. Back to intro resets the clock and returns to the first screen. The site and instrument you picked stay selected.

## How to run

From this directory:

```bash
npm test
python3 -m http.server 8736
```

Open [http://127.0.0.1:8736/](http://127.0.0.1:8736/). `npm test` runs `node --test src/demo.test.js`. There is no install step.

Useful URLs:

- `/?skipIntro=1` starts the clock immediately
- `/?site=mons-mouton&instrument=dust-shield` preselects a home and an instrument
- `/?site=mons-mouton&instrument=trident` or `/?site=malapert-a&instrument=ln-1` pick Triddy or Nodey
- `/?site=nowhere` falls back to Mare Crisium and explains why
- `/?duration=8` plays the day in 8 seconds

Keys: Enter starts from the intro. Space pauses or resumes, and on the intro it does not start the demo. R replays, Esc returns to the intro, and 1–4 pick a site. A held key does not repeat. Those shortcuts do not fire while a button or link is focused for Enter or Space, including the legacy Spacebar key, so a focused button still clicks normally.

## Edge cases

- An unknown, blank, or invisible-character site or instrument falls back to Mare Crisium or the heat-flow drill. A non-empty unknown value leaves a notice. A blank click during the demo keeps the current choice and asks you to pick from the list.
- Names match ignoring case, extra spaces, hyphens, and underscores (`MALAPERT-A`, `reiner_gamma`, `dust shield`).
- Duration query values that are blank, whitespace-only, or not a number stay at 28 seconds. `0` and negatives become 1 second. Finite values above 180 seconds become 180 seconds, including values so large that turning them into milliseconds would overflow.
- `skipIntro` accepts `1`, `true`, `yes`, and `on`. `0` leaves the intro up.
- Ticks that are `NaN`, not a number, zero, or negative do nothing. A huge tick ends the day at progress 1 and does not run past it.
- Pause freezes progress. `start` while paused does not resume; Resume or Space does. Replay from pause or from the end returns to dawn and plays.
- The clock does not run on the intro, and it does not keep going after the day has ended. While the demo is playing, the screen keeps painting. On the intro, while paused, and after the end, it paints the current screen and does not keep a frame loop running.
- The end banner and notices are written with `textContent`, so a weird query string is shown as text. Text, the document title, and `aria-pressed` are written again only when the value changes, so a status notice is not repeated on every frame.
- When `prefers-reduced-motion: reduce` matches, the sun does not interpolate at 60fps. It jumps to the clock position when the phase changes or the demo takes a coarse step, because that position is the state of the demo. If `matchMedia` is missing, the normal frame loop stays on.

## What this screen does not do

It does not draw the lunar map, balance care meters, animate pet moods, or open mission pop-ups. Triddy and Nodey stage lines carry Passport flavor only. Those heavier views are other branches. The footer on the page says the same thing about the sunlight bar.
