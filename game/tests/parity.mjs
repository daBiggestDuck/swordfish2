// Parity check: the in-browser engine port (src/engine/game.ts) must match the Java engine
// (src/engine/Game.java) step for step. Generates seeded scenarios, runs them through both,
// and compares every state field and every event.
//
//   node tests/parity.mjs            (needs a JDK; exits 0 with SKIP if javac is missing)
//
// Also checks failover: a run rebuilt from a mid-game Java state keeps tracking Java closely.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Game } from "../src/engine/game.ts";
import { PETS, SITES, petById, siteById } from "../src/engine/data.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");

function hasJdk() {
  try {
    execFileSync("javac", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ scenarios (seeded)

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildScenarios() {
  const out = [];
  const rand = rng(20261115);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const actions = ["work", "send", "clean", "heater", "shade"];
  let n = 0;
  for (const pet of PETS) {
    for (const site of SITES) {
      for (const tipped of [false, true]) {
        if (tipped && rand() < 0.5) continue;
        const name = `s${n++}-${pet.id}-${site.id}-${tipped ? "tipped" : "upright"}`;
        out.push(`scenario ${name} ${pet.id} ${site.id} ${tipped}`);
        for (let i = 0; i < 70; i++) {
          const r = rand();
          if (r < 0.45) out.push(`tick ${(rand() * 14 + 0.1).toFixed(3)}`);
          else if (r < 0.8) out.push(`act ${pick(actions)}`);
          else if (r < 0.9) out.push(`drive ${pick(SITES).id}`);
          else out.push(`tick ${(rand() * 60).toFixed(2)}`);
        }
        out.push(`tick 800`);
      }
    }
  }
  // Hand-written rover runs across the south-pole cluster.
  out.push("scenario rover-polar LN-1 MALAPERT_A false");
  out.push("act work", "drive MONS_MOUTON", "tick 3.7", "act work", "act send", "tick 30", "act work", "act send",
    "drive SHADOWED_CRATER", "tick 7", "act heater", "tick 50", "drive MALAPERT_A", "tick 100");
  out.push("scenario rover-longhaul LISTER MARE_CRISIUM false");
  out.push("drive MALAPERT_A", "act shade", "tick 40", "act shade", "act heater", "tick 400");
  return out;
}

// ------------------------------------------------------------------ comparison

const TOL = 0.0101; // both sides round to 2 decimals; a value on a rounding edge may differ by one cent

function diff(a, b, path, out, tol) {
  if (out.length > 12) return;
  if (typeof a === "number" && typeof b === "number") {
    if (Math.abs(a - b) > tol) out.push(`${path}: java=${a} port=${b}`);
    return;
  }
  if (typeof a === "string" && typeof b === "string") {
    const na = Number(a.replace(/ (K|m)$/, ""));
    const nb = Number(b.replace(/ (K|m)$/, ""));
    if (a !== b && !(Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) <= tol)) {
      out.push(`${path}: java=${JSON.stringify(a)} port=${JSON.stringify(b)}`);
    }
    return;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    if (a !== b) out.push(`${path}: java=${JSON.stringify(a)} port=${JSON.stringify(b)}`);
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push(`${path}: array mismatch`);
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) diff(a[k], b[k], `${path}.${k}`, out, tol);
}

function runPort(lines) {
  const rows = [];
  let game = null;
  let name = "";
  let step = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const p = line.split(/\s+/);
    let result;
    if (p[0] === "scenario") {
      name = p[1];
      game = new Game(petById(p[2]), siteById(p[3]), "Parity", p[4] === "true");
      step = 0;
      result = null;
    } else if (p[0] === "tick") result = game.tick(Number(p[1]));
    else if (p[0] === "act") result = game.act(p[1]);
    else if (p[0] === "drive") result = game.drive(p[1]);
    else throw new Error(`bad line ${line}`);
    rows.push({ scenario: name, step: step++, op: line, result, state: game.toJson() });
  }
  return rows;
}

// ------------------------------------------------------------------ main

if (!hasJdk()) {
  console.log("SKIP parity: no JDK (javac) on PATH");
  process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), "rover-parity-"));
try {
  const classes = join(work, "classes");
  const javaFiles = [
    ...["Event", "Game", "Json", "Pet", "Rules", "Site", "Sites", "Sources"].map((f) => join(repo, "src/engine", `${f}.java`)),
    join(repo, "test/engine/ParityDump.java"),
  ];
  execFileSync("javac", ["-d", classes, ...javaFiles], { stdio: "inherit" });

  const lines = buildScenarios();
  const file = join(work, "scenarios.txt");
  writeFileSync(file, lines.join("\n"));
  const javaOut = execFileSync("java", ["-cp", classes, "engine.ParityDump", file], { maxBuffer: 512 * 1024 * 1024 })
    .toString()
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const port = runPort(lines);

  let failures = 0;
  if (javaOut.length !== port.length) {
    console.log(`FAIL step count: java=${javaOut.length} port=${port.length}`);
    failures++;
  }
  const scenarios = new Set();
  for (let i = 0; i < Math.min(javaOut.length, port.length); i++) {
    const j = javaOut[i];
    const t = port[i];
    scenarios.add(j.scenario);
    const problems = [];
    diff(j.state, t.state, "state", problems, TOL);
    diff(j.result, t.result, "result", problems, TOL);
    if (problems.length) {
      failures++;
      if (failures <= 5) console.log(`FAIL ${j.scenario} step ${j.step} (${j.op})\n  ${problems.join("\n  ")}`);
    }
  }

  // Failover: rebuild from Java's mid-run state, keep playing, stay close to Java.
  let failoverChecks = 0;
  const byScenario = new Map();
  for (const row of javaOut) {
    if (!byScenario.has(row.scenario)) byScenario.set(row.scenario, []);
    byScenario.get(row.scenario).push(row);
  }
  for (const rows of byScenario.values()) {
    const mid = rows[Math.floor(rows.length / 2)];
    if (!mid.state.alive || mid.state.won) continue;
    const g = Game.fromState(mid.state, petById(mid.state.pet.id), siteById(mid.state.site.id));
    for (const row of rows.slice(rows.indexOf(mid) + 1)) {
      const p = row.op.split(/\s+/);
      if (p[0] === "tick") g.tick(Number(p[1]));
      else if (p[0] === "act") g.act(p[1]);
      else if (p[0] === "drive") g.drive(p[1]);
      const problems = [];
      const ours = g.toJson();
      // Alive/won can legitimately flip only on a knife edge; compare the meters with a looser bound.
      // Rebuilt from 2-decimal JSON, so allow "no visible jump": 0.1 h / 0.1 km, 1 % / 1 K on the meters.
      for (const k of ["hour", "kmDriven", "legs", "dataSent", "drillDepthM", "pings"]) {
        diff(row.state[k], ours[k], k, problems, 0.1);
      }
      if (row.state.alive && ours.alive) {
        for (const k of ["health", "power", "dust", "petTempK"]) diff(row.state[k], ours[k], k, problems, 1.0);
      }
      diff(row.state.trip?.to ?? null, ours.trip?.to ?? null, "trip.to", problems, 0);
      failoverChecks++;
      if (problems.length) {
        failures++;
        if (failures <= 8) console.log(`FAIL failover ${row.scenario} step ${row.step} (${row.op})\n  ${problems.join("\n  ")}`);
        break;
      }
    }
  }

  console.log(`parity: ${scenarios.size} scenarios, ${javaOut.length} steps compared, ${failoverChecks} failover steps checked`);
  if (failures) {
    console.log(`FAILED: ${failures} mismatching step(s)`);
    process.exit(1);
  }
  console.log("OK: the in-browser engine matches the Java engine");
} finally {
  rmSync(work, { recursive: true, force: true });
}
