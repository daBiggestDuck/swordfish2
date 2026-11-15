"use strict";

const assert = require("assert");
const { execFileSync, spawnSync } = require("child_process");
const test = require("node:test");
const {
  loadCatalog,
  validateCatalog,
  filterMissions,
  compareSites,
  describeMission,
  describePet,
  windowOf,
} = require("./catalog");
const { run, main } = require("./cli");

const catalog = loadCatalog();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("the shipped catalog matches the source rules", () => {
  const result = validateCatalog(catalog);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(catalog.asOf, "2026-11-14");
  assert.equal(catalog.program.contractCeilingUsd, 2600000000);
  assert.ok(catalog.sources.every((source) => source.url.startsWith("https://")));
  assert.ok(catalog.sites.every((site) => site.illumination.annualSunlightPercent === null));
});

test("flown missions are past on the catalog date, and planned missions are upcoming", () => {
  const past = filterMissions(catalog, { window: "past" }).map((mission) => mission.id);
  const upcoming = filterMissions(catalog, { window: "upcoming" }).map((mission) => mission.id);
  assert.deepEqual(past, ["peregrine", "im-1", "blue-ghost-1", "im-2"]);
  assert.ok(upcoming.includes("griffin-1"));
  assert.ok(upcoming.includes("draper-1"));
  assert.ok(!upcoming.includes("im-1"));
  assert.equal(past.length + upcoming.length, catalog.missions.length);
});

test("a clock before the first launch makes every flown mission upcoming", () => {
  const past = filterMissions(catalog, { window: "past" }, { asOf: "2024-01-01" });
  const upcoming = filterMissions(catalog, { window: " UPCOMING " }, { asOf: "2024-01-01" });
  assert.equal(past.length, 0);
  assert.ok(upcoming.some((mission) => mission.id === "peregrine"));
  const afterPeregrine = filterMissions(catalog, { window: "past" }, { asOf: "2024-02-01" }).map(
    (mission) => mission.id
  );
  assert.deepEqual(afterPeregrine, ["peregrine"]);
  const ghost = catalog.missions.find((mission) => mission.id === "blue-ghost-1");
  assert.equal(windowOf(ghost, "2025-01-14"), "upcoming");
  assert.equal(windowOf(ghost, "2025-01-15"), "past");
});

test("year uses the launch date when one exists, otherwise NASA's timeline bucket", () => {
  const year2024 = filterMissions(catalog, { year: " 2024 " }).map((mission) => mission.id);
  const year2025 = filterMissions(catalog, { year: 2025 }).map((mission) => mission.id);
  const year2028 = filterMissions(catalog, { window: "upcoming", year: "2028" }).map((mission) => mission.id);
  assert.deepEqual(year2024, ["peregrine", "im-1"]);
  assert.ok(year2025.includes("blue-ghost-1"));
  assert.ok(year2025.includes("im-2"));
  assert.ok(year2025.includes("griffin-1"));
  assert.ok(!year2025.includes("im-1"));
  assert.deepEqual(year2028, ["blue-ghost-3"]);
  const undated = ["blue-ghost-4", "nova-d", "cs-11", "cs-8", "cx-2"];
  for (const year of [2024, 2025, 2026, 2027, 2028]) {
    const ids = filterMissions(catalog, { year }).map((mission) => mission.id);
    for (const id of undated) {
      assert.ok(!ids.includes(id), `${id} has no stored year and must be skipped for ${year}`);
    }
  }
});

test("region, site, status, and payload type combine, and blank filters are ignored", () => {
  const polar = filterMissions(catalog, {
    region: "Polar",
    status: " completed ",
    payloadType: "retroreflector",
    window: "",
    year: "",
    siteId: "   ",
  }).map((mission) => mission.id);
  assert.deepEqual(polar, ["im-1", "im-2"]);

  const crisium = filterMissions(catalog, { siteId: " mare-crisium " }).map((mission) => mission.id);
  assert.deepEqual(crisium, ["blue-ghost-1"]);

  const farSide = filterMissions(catalog, { region: "far-side" }).map((mission) => mission.id);
  assert.deepEqual(farSide.sort(), ["blue-ghost-2", "cs-11"]);
  assert.ok(!farSide.includes("draper-1"));
  assert.ok(!filterMissions(catalog, { region: "polar" }).some((mission) => mission.id === "draper-1"));

  const failed = filterMissions(catalog, { status: "failed" }).map((mission) => mission.id);
  assert.deepEqual(failed, ["peregrine"]);
});

test("a launch date decides past versus upcoming when status is still planned", () => {
  const copy = clone(catalog);
  const griffin = copy.missions.find((mission) => mission.id === "griffin-1");
  griffin.launchDate = "2024-01-01";
  assert.equal(griffin.status, "planned");
  assert.equal(windowOf(griffin, catalog.asOf), "past");
  assert.ok(filterMissions(copy, { window: "past" }).some((mission) => mission.id === "griffin-1"));
  assert.ok(!filterMissions(copy, { window: "upcoming" }).some((mission) => mission.id === "griffin-1"));
});

test("payload kind tokens filter missions, and a nonsense token throws", () => {
  assert.deepEqual(
    filterMissions(catalog, { payloadType: "volatiles" }).map((mission) => mission.id),
    ["im-2"]
  );
  assert.deepEqual(
    filterMissions(catalog, { payloadType: "Geophysics" }).map((mission) => mission.id),
    ["blue-ghost-1"]
  );
  assert.throws(() => filterMissions(catalog, { payloadType: "not-a-kind" }), { code: "INVALID_FILTER" });
  const fromCli = run(["missions", "--payload", "volatiles"]);
  assert.equal(fromCli.exitCode, 0);
  assert.deepEqual(
    fromCli.body.missions.map((mission) => mission.id),
    ["im-2"]
  );
});

test("payload type is case-insensitive and does not invent Griffin's retroreflector", () => {
  const retro = filterMissions(catalog, { payloadType: "Retroreflector" }).map((mission) => mission.id);
  assert.deepEqual(retro, ["peregrine", "im-1", "blue-ghost-1", "im-2"]);
  assert.deepEqual(
    filterMissions(catalog, { payloadType: "heat-flow" }).map((mission) => mission.id),
    ["blue-ghost-1"]
  );
  assert.deepEqual(
    filterMissions(catalog, { payloadType: "dust-shield" }).map((mission) => mission.id),
    ["blue-ghost-1"]
  );
});

test("an unknown site id filters to nothing, and a bad filter value throws", () => {
  assert.deepEqual(filterMissions(catalog, { siteId: "Malapert-A" }), []);
  assert.throws(() => filterMissions(catalog, { window: "soon" }), { code: "INVALID_FILTER" });
  assert.throws(() => filterMissions(catalog, { region: "near side" }), { code: "INVALID_FILTER" });
  assert.throws(() => filterMissions(catalog, { year: "2025abc" }), { code: "INVALID_FILTER" });
  assert.throws(() => filterMissions(catalog, { year: 2025.5 }), { code: "INVALID_FILTER" });
  assert.throws(() => filterMissions(catalog, {}, { asOf: "2026-02-31" }), { code: "INVALID_FILTER" });
  assert.throws(() => filterMissions(null, {}), { code: "INVALID_CATALOG" });
});

test("cancelled missions are in neither past nor upcoming", () => {
  const copy = clone(catalog);
  copy.missions.push({
    id: "dropped",
    status: "cancelled",
    outcome: "scheduled",
    region: "near-side",
    siteId: "mare-crisium",
    payloadIds: [],
    payloadNote: "Removed from the manifest.",
    sourceIds: ["nasa-clps-encyclopedia"],
  });
  assert.equal(windowOf(copy.missions.at(-1), catalog.asOf), "cancelled");
  assert.ok(!filterMissions(copy, { window: "past" }).some((mission) => mission.id === "dropped"));
  assert.ok(!filterMissions(copy, { window: "upcoming" }).some((mission) => mission.id === "dropped"));
  assert.ok(filterMissions(copy, { status: "cancelled" }).some((mission) => mission.id === "dropped"));
});

test("site comparison states region, ice, and Earth-link differences without a sunlight score", () => {
  const result = compareSites(catalog, ["malapert-a", "mare-crisium", "malapert-a", "mons-mouton"]);
  assert.deepEqual(
    result.sites.map((site) => site.id),
    ["malapert-a", "mare-crisium", "mons-mouton"]
  );
  assert.deepEqual(result.missing, []);
  assert.equal(result.sites[0].missions[0].id, "im-1");
  assert.ok(result.notes.some((note) => note.startsWith("Regions differ:")));
  assert.ok(result.notes.some((note) => note.startsWith("Water-ice relation differs:")));
  assert.ok(result.notes.some((note) => note.startsWith("Earth link differs:")));
  assert.ok(result.notes.some((note) => note.includes("annual sunlight percent")));
  assert.equal(compareSites(catalog, ["mare-crisium"]).notes.length, 0);
});

test("site comparison notes name a different illumination regime and terrain", () => {
  const result = compareSites(catalog, ["malapert-a", "mare-crisium"]);
  assert.ok(
    result.notes.some(
      (note) =>
        note.startsWith("Illumination regime differs:") &&
        note.includes("Malapert A is polar") &&
        note.includes("Mare Crisium is mid-latitude")
    )
  );
  assert.ok(result.notes.some((note) => note.startsWith("Terrain differs:")));
  assert.ok(result.notes.some((note) => note.includes("annual sunlight percent")));

  const sameRegime = compareSites(catalog, ["malapert-a", "mons-mouton"]);
  assert.ok(sameRegime.notes.some((note) => note.startsWith("Terrain differs:")));
  assert.ok(!sameRegime.notes.some((note) => note.startsWith("Illumination regime differs:")));
  assert.ok(sameRegime.notes.some((note) => note.includes("annual sunlight percent")));
});

test("comparison reports unknown ids and rejects an empty request", () => {
  const result = compareSites(catalog, ["mare-crisium", "not-a-site"]);
  assert.deepEqual(result.missing, ["not-a-site"]);
  assert.equal(result.sites.length, 1);
  assert.throws(() => compareSites(catalog, []), { code: "INVALID_FILTER" });
  assert.throws(() => compareSites(catalog, ["  "]), { code: "INVALID_FILTER" });
});

test("mission and pet lookups join the records they name", () => {
  const im2 = describeMission(catalog, "im-2");
  assert.equal(im2.site.id, "mons-mouton");
  assert.deepEqual(
    im2.payloads.map((payload) => payload.id),
    ["trident", "msolo", "lra"]
  );
  assert.deepEqual(
    im2.pets.map((pet) => pet.id).sort(),
    ["retroreflector"]
  );
  assert.equal(im2.mission.outcome, "partial");
  const im1 = describeMission(catalog, "im-1");
  assert.equal(im1.mission.outcome, "success");
  assert.deepEqual(im1.pets.map((pet) => pet.id).sort(), ["ln-1", "retroreflector"]);
  assert.equal(describeMission(catalog, "peregrine").mission.outcome, "no-landing");
  assert.equal(describeMission(catalog, "missing"), null);
  assert.equal(describeMission(catalog, "draper-1").site, null);

  const ghost = describeMission(catalog, "blue-ghost-1");
  assert.deepEqual(ghost.pets.map((pet) => pet.id).sort(), ["dust-shield", "heat-flow-drill", "retroreflector"]);
  const drill = describePet(catalog, "heat-flow-drill");
  assert.equal(drill.pet.power, "required");
  assert.equal(drill.pet.nightBehavior, "needs-power");
  assert.equal(drill.missions[0].id, "blue-ghost-1");
  const retro = describePet(catalog, "retroreflector");
  assert.equal(retro.pet.power, "none");
  assert.equal(retro.pet.nightBehavior, "passive");

  assert.equal(describePet(catalog, "trident"), null);

  const nodey = describePet(catalog, "ln-1");
  assert.equal(nodey.pet.name, "Nodey");
  assert.equal(nodey.pet.instrument, "LN-1");
  assert.equal(nodey.pet.power, "required");
  assert.equal(nodey.pet.passive, false);
  assert.equal(nodey.pet.nightBehavior, "needs-power");
  assert.equal(nodey.pet.homeMissionId, "im-1");
  assert.equal(nodey.pet.homeSiteId, "malapert-a");
  assert.equal(im1.site.latitude, -80.13);
  assert.equal(im1.site.longitude, 1.44);
  assert.deepEqual(nodey.pet.care, ["Power", "Warmth", "Signal"]);
  assert.equal(nodey.pet.engineDraw.value, 18);
  assert.equal(nodey.pet.engineDraw.key, "ln1Draw");
  assert.deepEqual(nodey.pet.moods, { day: "happy", sunset: "shivering", night: "cold" });
  assert.equal(nodey.pet.preferWait, true);
  assert.equal(nodey.pet.signalBias, true);
  assert.equal(nodey.pet.rarity, "Uncommon");
  assert.equal(nodey.missions[0].id, "im-1");
  assert.ok(nodey.pet.passport.includes("Malapert A"));

  const reversed = clone(catalog);
  reversed.missions.reverse();
  assert.deepEqual(
    describePet(reversed, "retroreflector").missions.map((mission) => mission.id),
    ["peregrine", "im-1", "blue-ghost-1", "im-2"]
  );
});

test("validation catches broken cross-references, dates, and invented sunlight percents", () => {
  const duplicate = clone(catalog);
  duplicate.missions.push(clone(duplicate.missions[0]));
  assert.equal(validateCatalog(duplicate).ok, false);

  const badUrl = clone(catalog);
  badUrl.sources[0].url = "http://example.com";
  assert.ok(validateCatalog(badUrl).errors.some((error) => error.includes("https")));

  const scored = clone(catalog);
  scored.sites[0].illumination.annualSunlightPercent = 75;
  assert.equal(validateCatalog(scored).ok, false);

  const plannedLanding = clone(catalog);
  plannedLanding.missions.find((mission) => mission.id === "griffin-1").landingDate = "2026-11-01";
  assert.ok(validateCatalog(plannedLanding).errors.some((error) => error.includes("landingDate")));

  const failedLanding = clone(catalog);
  failedLanding.missions.find((mission) => mission.id === "peregrine").landingDate = "2024-01-09";
  assert.equal(validateCatalog(failedLanding).ok, false);

  const noLaunch = clone(catalog);
  delete noLaunch.missions.find((mission) => mission.id === "im-1").launchDate;
  assert.equal(validateCatalog(noLaunch).ok, false);

  const mismatch = clone(catalog);
  mismatch.missions.find((mission) => mission.id === "im-1").region = "near-side";
  assert.ok(validateCatalog(mismatch).errors.some((error) => error.includes("region")));

  const poweredPassive = clone(catalog);
  poweredPassive.pets[0].nightBehavior = "passive";
  assert.equal(validateCatalog(poweredPassive).ok, false);

  const sleepingDrill = clone(catalog);
  sleepingDrill.pets.find((pet) => pet.id === "heat-flow-drill").moods.night = "sleeping";
  assert.ok(validateCatalog(sleepingDrill).errors.some((error) => error.includes("cannot be sleeping")));

  const badHome = clone(catalog);
  badHome.pets.find((pet) => pet.id === "ln-1").homeMissionId = "missing-mission";
  assert.ok(validateCatalog(badHome).errors.some((error) => error.includes("homeMissionId")));

  const shortCount = clone(catalog);
  shortCount.missions.find((mission) => mission.id === "im-1").nasaPayloadCount = 2;
  assert.equal(validateCatalog(shortCount).ok, false);

  const unnamed = clone(catalog);
  const griffin = unnamed.missions.find((mission) => mission.id === "griffin-1");
  griffin.payloadNote = "   ";
  assert.ok(validateCatalog(unnamed).errors.some((error) => error.includes("griffin-1")));
});

test("validation reports dangling ids, a bad outcome, and non-finite coordinates without throwing", () => {
  const danglingSource = clone(catalog);
  danglingSource.missions[0].sourceIds = ["missing-source"];
  assert.ok(validateCatalog(danglingSource).errors.some((error) => error.includes("missing-source")));

  const danglingSite = clone(catalog);
  danglingSite.missions.find((mission) => mission.id === "im-1").siteId = "missing-site";
  assert.ok(validateCatalog(danglingSite).errors.some((error) => error.includes("missing-site")));

  const danglingPayload = clone(catalog);
  danglingPayload.missions.find((mission) => mission.id === "im-1").payloadIds = ["missing-payload"];
  assert.ok(validateCatalog(danglingPayload).errors.some((error) => error.includes("missing-payload")));

  const badOutcome = clone(catalog);
  badOutcome.missions.find((mission) => mission.id === "peregrine").outcome = "success";
  const outcomeErrors = validateCatalog(badOutcome).errors;
  assert.ok(outcomeErrors.some((error) => error.includes("requires outcome no-landing")));

  const nan = clone(catalog);
  nan.sites.find((site) => site.id === "malapert-a").latitude = NaN;
  const nanResult = validateCatalog(nan);
  assert.equal(nanResult.ok, false);
  assert.ok(nanResult.errors.some((error) => error.includes("latitude")));

  const notArray = clone(catalog);
  notArray.sites = { id: "malapert-a" };
  const notArrayResult = validateCatalog(notArray);
  assert.equal(notArrayResult.ok, false);
  assert.ok(notArrayResult.errors.some((error) => error.includes("sites must be an array")));

  const notObject = clone(catalog);
  notObject.missions = [null];
  const notObjectResult = validateCatalog(notObject);
  assert.equal(notObjectResult.ok, false);
  assert.ok(notObjectResult.errors.length > 0);

  const cancelledLanding = clone(catalog);
  const dropped = clone(cancelledLanding.missions[0]);
  dropped.id = "dropped-landed";
  dropped.status = "cancelled";
  dropped.outcome = "scheduled";
  dropped.landingDate = "2024-01-09";
  dropped.payloadIds = [];
  dropped.payloadNote = "Cancelled before landing.";
  cancelledLanding.missions.push(dropped);
  assert.ok(validateCatalog(cancelledLanding).errors.some((error) => error.includes("cannot have a landingDate")));

  const danglingVendor = clone(catalog);
  danglingVendor.program.eligibleVendorCounts[0].sourceId = "missing-source";
  assert.ok(validateCatalog(danglingVendor).errors.some((error) => error.includes("missing-source")));

  const bareHttps = clone(catalog);
  bareHttps.sources[0].url = "https://";
  assert.ok(validateCatalog(bareHttps).errors.some((error) => error.includes("https")));

  const badProgram = clone(catalog);
  badProgram.program.eligibleVendorCounts = null;
  assert.equal(validateCatalog(badProgram).ok, false);
});

test("the command line prints the same past missions the library returns", () => {
  const result = run(["missions", "--window", "past", "--year", "2025"]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(
    result.body.missions.map((mission) => mission.id),
    ["blue-ghost-1", "im-2"]
  );

  const stdout = execFileSync(process.execPath, ["data/cli.js", "pet", "dust-shield"], {
    cwd: require("path").join(__dirname, ".."),
    encoding: "utf8",
  });
  const body = JSON.parse(stdout);
  assert.equal(body.pet.nightBehavior, "needs-power");
  assert.equal(body.missions[0].id, "blue-ghost-1");
});

test("the command line returns a non-zero status for a bad filter and an unknown id", () => {
  const logs = [];
  const original = process.stderr.write;
  process.stderr.write = (chunk) => {
    logs.push(String(chunk));
    return true;
  };
  try {
    assert.equal(main(["missions", "--region", "near side"]), 1);
    assert.equal(main(["mission", "nope"]), 1);
  } finally {
    process.stderr.write = original;
  }
  const errors = logs.map((line) => JSON.parse(line));
  assert.equal(errors[0].code, "INVALID_FILTER");
  assert.equal(errors[1].code, "NOT_FOUND");
  assert.throws(() => run(["missions", "--colour", "blue"]), { code: "INVALID_FILTER" });
});

test("the command line rejects stray arguments, unknown commands, and a compare with no sites", () => {
  assert.equal(run(["validate"]).exitCode, 0);
  assert.throws(() => run(["missions", "polar"]), { code: "INVALID_FILTER" });
  assert.throws(() => run(["validate", "extra"]), { code: "INVALID_FILTER" });
  assert.throws(() => run(["validate", "--strict"]), { code: "INVALID_FILTER" });
  assert.throws(() => run(["sources", "extra"]), { code: "INVALID_FILTER" });
  assert.throws(() => run(["sources", "--all"]), { code: "INVALID_FILTER" });
  assert.throws(() => run(["fly"]), { code: "UNKNOWN_COMMAND" });
  assert.throws(() => run(["compare", "ghost-site"]), { code: "NOT_FOUND" });

  const mixed = run(["compare", "mare-crisium", "ghost-site"]);
  assert.equal(mixed.exitCode, 0);
  assert.equal(mixed.body.sites.length, 1);
  assert.deepEqual(mixed.body.missing, ["ghost-site"]);

  const logs = [];
  const original = process.stderr.write;
  process.stderr.write = (chunk) => {
    logs.push(String(chunk));
    return true;
  };
  try {
    assert.equal(main(["missions", "polar"]), 1);
    assert.equal(main(["compare", "ghost-site"]), 1);
    assert.equal(main(["fly"]), 1);
  } finally {
    process.stderr.write = original;
  }
  const errors = logs.map((line) => JSON.parse(line));
  assert.equal(errors[0].code, "INVALID_FILTER");
  assert.equal(errors[1].code, "NOT_FOUND");
  assert.equal(errors[2].code, "UNKNOWN_COMMAND");

  const root = require("path").join(__dirname, "..");
  const missing = spawnSync(process.execPath, ["data/cli.js", "compare", "ghost-site"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stderr).code, "NOT_FOUND");

  const kind = spawnSync(process.execPath, ["data/cli.js", "missions", "--payload", "geophysics"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(kind.status, 0);
  assert.deepEqual(
    JSON.parse(kind.stdout).missions.map((mission) => mission.id),
    ["blue-ghost-1"]
  );
});
