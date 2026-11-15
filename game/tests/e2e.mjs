// End-to-end check of Rover Run in headless Chrome (Chrome DevTools Protocol, no extra packages).
//
//   node tests/e2e.mjs [gameUrl] [screenshotDir]
//     gameUrl        default http://localhost:5500/web/game/index.html (VS Code Live Server)
//     screenshotDir  default ./e2e-shots
//   CHROME=/path/to/chrome to override the browser.
//
// Plays a full run (land → pet → destination → drive → arrive → drive → end) and checks that the
// numbers on screen are the engine's: the HUD is compared with GET /api/engine/state for the same game.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const GAME = process.argv[2] || "http://localhost:5500/web/game/index.html";
const OUT = resolve(process.argv[3] || "e2e-shots");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9400 + Math.floor(Math.random() * 400);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "rover-e2e-"));
const chrome = spawn(CHROME, [`--headless=new`, `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1440,900", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "about:blank"], { stdio: "ignore" });

let ws;
let seq = 0;
const pending = new Map();
const consoleErrors = [];
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        break;
      }
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === "Runtime.exceptionThrown") consoleErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  });
}
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
async function ev(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(`${expr}\n -> ${r.result.exceptionDetails.exception?.description}`);
  return r.result?.result?.value;
}
async function until(expr, ms = 10000, label = expr) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await ev(expr)) return true;
    await sleep(150);
  }
  throw new Error(`timeout waiting for: ${label}`);
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, "base64"));
}
const clickText = (sel, text) =>
  ev(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.includes(${JSON.stringify(text)}) && !e.disabled); if (!el) return false; el.click(); return true; })()`);
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
const rr = (path) => ev(`JSON.stringify(window.__roverRun?.${path} ?? null)`).then((s) => JSON.parse(s));

try {
  await connect();
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: GAME });

  // Home
  await until(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Start'))`, 20000, "Start button");
  await sleep(2500);
  const kind = await rr("engineKind");
  check("home: engine connected", kind === "java" || kind === "local", `${kind} · ${await rr("engineLabel")}`);
  await shot("1-home");
  await clickText("button", "Start");

  // Landing site
  await until(`!!document.querySelector('#site-title')`);
  await clickText("button", "Malapert A");
  await sleep(1800);
  check("land: Malapert A selected", (await ev(`document.querySelector('#site-title').textContent`)) === "Malapert A");
  await shot("2-land");
  await clickText("button", "Land here");

  // Pet
  await until(`!!document.querySelector('#pet-title')`);
  await sleep(1800);
  await ev(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent.includes('Nodey'))?.click()`);
  await sleep(400);
  await shot("3-pet");
  await clickText("button", "Load onto the rover");

  // Destination
  await until(`window.__roverRun?.phase === 'destination'`);
  await sleep(1800);
  const dest = await ev(`document.querySelector('#site-title').textContent`);
  const routeText = await ev(`document.querySelector('section[aria-labelledby=site-title]').innerText`);
  check("destination: nearest polar hop suggested", dest === "Mons Mouton", dest);
  check("destination: engine route shown (175.5 km, 21.7 h)", /176 km|175\.5|175 km/.test(routeText) && /21\.7 h/.test(routeText), routeText.match(/Distance[\s\S]{0,60}/)?.[0]?.replace(/\s+/g, " "));
  check("destination: forecast from engine rules", /If you just drive/.test(routeText));
  await shot("4-destination");
  await clickText("button", "Drive here");

  // Drive
  await until(`window.__roverRun?.phase === 'drive'`);
  await ev(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent.trim() === '2 h/s')?.click()`);
  await sleep(2600);
  const s1 = await rr("state");
  check("drive: trip under way", s1?.trip?.to === "MONS_MOUTON" && s1.trip.progress > 0, `progress ${s1?.trip?.progress}`);
  const hud = await ev(`document.querySelector('section[aria-label="Engine data"]').innerText`);
  check("drive: HUD shows the engine's lunar clock", hud.includes(`h ${Math.floor(s1.hour)}/708`) || hud.includes(`h ${Math.floor(s1.hour) + 1}/708`) || hud.includes(`h ${Math.floor(s1.hour) - 1}/708`), hud.match(/h \d+\/708/)?.[0]);
  check("drive: HUD shows the engine's temperature", hud.includes(`${Math.round(s1.petTempK)}`) || hud.includes(`${Math.round(s1.petTempK) - 1}`) || hud.includes(`${Math.round(s1.petTempK) + 1}`), `${Math.round(s1.petTempK)} K`);
  const gameId = await rr("gameId");
  if ((await rr("engineKind")) === "java") {
    const label = await rr("engineLabel");
    const host = label.split("· ")[1];
    const java = await (await fetch(`http://${host}/api/engine/state?id=${gameId}`)).json();
    const snap = await rr("state");
    check("drive: UI state equals the Java engine's own state", Math.abs(java.hour - snap.hour) < 2.5 && java.trip?.to === snap.trip?.to && java.pet.id === snap.pet.id, `java h${java.hour} ui h${snap.hour}`);
  }
  await shot("5-drive");

  // night/headlights check not needed; speed up to arrival
  await ev(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent.trim() === '24 h/s')?.click()`);
  await until(`window.__roverRun?.phase === 'arrived'`, 20000, "arrival");
  await sleep(1500);
  const s2 = await rr("state");
  check("arrive: engine switched site to Mons Mouton", s2.site.id === "MONS_MOUTON" && s2.trip === null && s2.legs === 1, `${s2.site.id} legs ${s2.legs}`);
  check("arrive: odometer equals the route", Math.abs(s2.kmDriven - 175.5) < 0.6, `${s2.kmDriven} km`);
  check("arrive: card shown", await ev(`!!document.querySelector('#arrive-title')`), await ev(`document.querySelector('#arrive-title')?.textContent`));
  await shot("6-arrived");

  // Science at the stop, then next leg
  await clickText("#arrive-title ~ * button, section[role=dialog] button", "Broadcast a ranging ping");
  await sleep(500);
  await clickText("button", "Choose the next destination");
  await until(`window.__roverRun?.phase === 'destination'`);
  await clickText("button", "Shackleton Crater floor");
  await sleep(1200);
  await clickText("button", "Drive here");
  await until(`window.__roverRun?.phase === 'drive'`);
  await until(`window.__roverRun?.phase === 'arrived' || window.__roverRun?.phase === 'over'`, 30000, "second arrival");
  await sleep(1200);
  const s3 = await rr("state");
  check("second leg: reached Shackleton (or the pet faced the dark)", s3.site.id === "SHADOWED_CRATER" || !s3.alive, `${s3.site.id} alive=${s3.alive}`);
  await shot("7-shackleton");
  if ((await rr("phase")) === "arrived") await clickText("button", "End run here");
  await until(`window.__roverRun?.phase === 'over'`);
  await sleep(1200);
  check("end: summary shown", await ev(`!!document.querySelector('#end-title')`), await ev(`document.querySelector('#end-title')?.textContent`));
  await shot("8-end");
} catch (e) {
  results.push(`FAIL  harness error — ${e.message}`);
  try {
    await shot("error");
  } catch {
    /* ignore */
  }
} finally {
  console.log(results.join("\n"));
  const errs = consoleErrors.filter((e) => !/favicon|ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
  console.log(`\nconsole errors (${errs.length}):\n${errs.slice(0, 10).join("\n")}`);
  console.log(`screenshots: ${OUT}`);
  chrome.kill();
  process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
}
