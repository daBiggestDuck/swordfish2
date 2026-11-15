# Game rules and meter balance

This is the `engine` branch of Payload Pets. The planning page asked for the game rules and the meter balance: Power, Warmth, and Signal, kept up by tilting the solar panels, switching the heater on, and waiting for the Earth link.

You adopt one instrument and one landing site, then step through 14 Earth days of daylight and a 3-step night. A retroreflector does not use power, so those two meters stay still and it sleeps through the night. A powered instrument (LISTER, EDS, Triddy, or Nodey) can run out of power or warmth. The run ends when that happens, or when night 3 is over. Signal reaching 0 does not end the run. Signal is informational.

## How it works

`src/engine.js` is the rules. `src/ui.js` only renders them. The page does not keep a second copy of the numbers.

Each `advance` is one Earth day. Meters are integers from 0 to 100. `Math.round` is applied first (halves go toward +∞, which is what JavaScript does), then the value is clamped.

Power, for an instrument that needs power:

`sun × (panelFloor + (1 − panelFloor) × panel) × dust × solar − draw`

`draw` is the instrument draw while the sun is above 0, and `nightBus` when it is not. If the heater is on, add `heaterPower`. Panel is a number from 0 (flat) to 1 (tracking). Omitted controls default to panel 1, heater off, wait off.

Warmth, for an instrument that needs power:

`sun × sunWarm + heaterWarm − (warmthLeak + (1 − sun) × darkLeak + nightLeak)`

`nightLeak` is added only on the night coda. The heater term is 0 when the heater is off.

Signal:

`earth × waitGain − waitOverhead` while waiting, or `−idleDrop` while idle.

Signal is informational. Reaching 0 does not end the run. Loss is power or warmth at 0 for a pet that spends those meters.

A retroreflector skips the power and warmth math. The page disables the heater for a retroreflector. Callers of `advance` can still pass `heater: true` and get `ignored: ["heater"]`. That does not spend anything. Signal still moves, because waiting is the lander's radio, not the mirror.

`advance` throws after a loss or after night 3. `play` on an already ended run returns an empty list and does not throw.

Status is the first match:

1. `lost` — power or warmth rounded to 0, for a pet that spends those meters. Signal is not a loss. The note names every meter that hit zero.
2. `asleep` — retroreflector at night.
3. `shiver` — daylight on day `sunsetDay` or later, and sun below `sunsetSun`. This wins even when the meters are healthy, because sunset is the shiver, not a low battery.
4. `dark` — power below `darkPower`.
5. `holding` — night, and warmth still at least `holdingWarmth`.
6. `chilly` — warmth below `chillyWarmth`.
7. `happy` — sun at least `happySun`, and, if the pet needs power, both power and warmth at their happy marks.
8. `steady` — anything else that is still alive.

`suggestAction` is a tutor, not a search. It tracks the sun (panel 1). It turns the heater on only when the next step is night or warmth is below `suggestWarmth`, and only if power is above `suggestPowerReserve`. It never heats a retroreflector. A retroreflector waits when signal is below `suggestSignal` and the next Earth view is above 0, because waiting is free. Nodey (`preferWait`) uses that same Earth floor, because LN-1's job is to stay findable. Other powered pets wait only when signal is below `suggestSignal` and the next Earth view is at least `suggestEarth`.

## What the sites do

These curves are the balance model. They are not a LOLA run, and they are not the mission catalog.

- Mare Crisium dust 1. Sun is a 14-day sine, dim at the ends and nearly full at noon. Mare Crisium earth day 0.92. Mare Crisium earth night 0.84.
- Malapert A dust 1. Same sine, multiplied by `malapertPeak`, so a drill's daylight draw is never covered. Malapert A earth day 0.38. Malapert A earth night 0.2.
- Mons Mouton dust 1. Sun stays high: `monsBase + monsSwing × sine`. That stands in for the planning page's note of about 70–80% annual south-pole sunlight. Mons Mouton earth day 0.62. Mons Mouton earth night 0.5.
- Reiner Gamma dust `reinerDust`. Same sun as Mare Crisium. Dust scales solar power only, as a game penalty, not a measured optical depth. Reiner Gamma earth day 0.9. Reiner Gamma earth night 0.8.

With the suggestion, a tracking drill survives Mare Crisium, Mons Mouton, and Reiner Gamma, and it dies of power in the first days at Malapert A. The dust shield survives the three brighter sites and dies at Malapert A with both meters at zero. Triddy (hungrier than LISTER) still finishes Mons Mouton on the suggestion. Nodey (lighter than EDS) still dies at Malapert A when power runs out, but the tutor waits through the low Earth night there. Flat panels, or the heater left on every day, empty a drill at Mare Crisium. Leaving the heater off through the night empties warmth. A retroreflector survives every site with Power and Warmth unchanged.

## Constants

```
daylightDays = 14
nightDays = 3
startPower = 86
startWarmth = 78
startSignal = 42
solar = 54
panelFloor = 0.22
nightBus = 6
heaterPower = 14
sunWarm = 22
heaterWarm = 30
warmthLeak = 8
darkLeak = 16
nightLeak = 11
waitGain = 40
waitOverhead = 6
idleDrop = 14
sunsetDay = 12
sunsetSun = 0.4
happySun = 0.5
happyPower = 50
happyWarmth = 50
darkPower = 15
chillyWarmth = 28
holdingWarmth = 35
lowSignal = 30
listerDraw = 30
edsDraw = 20
tridentDraw = 34
ln1Draw = 18
reinerDust = 0.86
malapertPeak = 0.46
monsBase = 0.58
monsSwing = 0.2
suggestWarmth = 40
suggestPowerReserve = 18
suggestSignal = 85
suggestEarth = 0.3
```

Mare Crisium dust 1. Malapert A dust 1. Mons Mouton dust 1. Reiner Gamma dust 0.86.

## Run it

From this directory:

```bash
node --test src/engine.test.js
```

The page is an ES module, so open it over HTTP:

```bash
cd ..
python3 -m http.server 8754
```

Then open `http://127.0.0.1:8754/engine/`.

Pick LISTER and Mare Crisium, choose "Finish with the suggestion", and the log runs to night 3 still alive. The same button at Malapert A stops when power hits zero. Pick Retro at Mare Crisium. The heater control is disabled, so a step from the page leaves Power and Warmth still. Callers of `advance` can pass `heater: true` and the books list the ignored heater. Day 13 there is `shiver`, and a night step is `asleep`. At Mons Mouton the sun stays above the sunset line, so day 13 stays `happy`.

## What this branch does not do

Triddy and Nodey show a Passport line on the adopt sheet (catalog text). The lunar map, the pet drawings, the mission pop-ups, and the shared intro screen are other branches. This page does not place sites on a map or animate an instrument. It only balances the meters and reports the status those views can use.
