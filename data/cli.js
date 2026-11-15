#!/usr/bin/env node
"use strict";

const {
  loadCatalog,
  filterMissions,
  compareSites,
  describeMission,
  describeSite,
  describePet,
  listSources,
} = require("./catalog");

function run(argv, catalog = loadCatalog()) {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help") {
    return {
      exitCode: command ? 0 : 1,
      body: { commands: commandHelp() },
    };
  }

  if (command === "validate") {
    const { positional } = flags(rest, []);
    rejectPositionals(positional);
    return {
      exitCode: 0,
      body: {
        ok: true,
        asOf: catalog.asOf,
        missions: catalog.missions.length,
        sites: catalog.sites.length,
        payloads: catalog.payloads.length,
        pets: catalog.pets.length,
        sources: catalog.sources.length,
      },
    };
  }

  if (command === "missions") {
    const { named, positional } = flags(rest, ["window", "year", "region", "site", "status", "payload", "as-of"]);
    rejectPositionals(positional);
    const missions = filterMissions(catalog, namedToQuery(named), { asOf: named["as-of"] });
    return { exitCode: 0, body: { asOf: named["as-of"] || catalog.asOf, count: missions.length, missions: missions.map(briefMission) } };
  }

  if (command === "mission" || command === "site" || command === "pet") {
    const { positional } = flags(rest, []);
    if (positional.length !== 1) {
      throw Object.assign(new Error(`${command} needs one id`), { code: "INVALID_FILTER" });
    }
    const found =
      command === "mission"
        ? describeMission(catalog, positional[0])
        : command === "site"
          ? describeSite(catalog, positional[0])
          : describePet(catalog, positional[0]);
    if (!found) {
      throw Object.assign(new Error(`Unknown ${command} id: ${positional[0]}`), { code: "NOT_FOUND" });
    }
    return { exitCode: 0, body: found };
  }

  if (command === "compare") {
    const { positional } = flags(rest, []);
    const compared = compareSites(catalog, positional);
    if (compared.sites.length === 0) {
      throw Object.assign(new Error(`Unknown site id: ${compared.missing.join(", ")}`), { code: "NOT_FOUND" });
    }
    return { exitCode: 0, body: compared };
  }

  if (command === "sources") {
    const { positional } = flags(rest, []);
    rejectPositionals(positional);
    return { exitCode: 0, body: { sources: listSources(catalog) } };
  }

  throw Object.assign(new Error(`Unknown command: ${command}`), { code: "UNKNOWN_COMMAND" });
}

function rejectPositionals(positional) {
  if (positional.length > 0) {
    throw Object.assign(new Error(`Unexpected argument: ${positional.join(" ")}`), { code: "INVALID_FILTER" });
  }
}

function namedToQuery(named) {
  return {
    window: named.window,
    year: named.year,
    region: named.region,
    siteId: named.site,
    status: named.status,
    payloadType: named.payload,
  };
}

function briefMission(mission) {
  return {
    id: mission.id,
    name: mission.name,
    status: mission.status,
    outcome: mission.outcome || null,
    launchDate: mission.launchDate || null,
    landingDate: mission.landingDate || null,
    nasaTimelineYear: Number.isInteger(mission.nasaTimelineYear) ? mission.nasaTimelineYear : null,
    region: mission.region,
    siteId: mission.siteId,
    provider: mission.provider,
  };
}

function flags(args, allowed) {
  const positional = [];
  const named = {};
  const allowedSet = allowed ? new Set(allowed) : null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (allowedSet && !allowedSet.has(key)) {
      throw Object.assign(new Error(`Unknown option --${key}`), { code: "INVALID_FILTER" });
    }
    const value = args[index + 1];
    if (!key || value == null || value.startsWith("--")) {
      throw Object.assign(new Error(`Missing value for --${key}`), { code: "INVALID_FILTER" });
    }
    named[key] = value;
    index += 1;
  }
  return { positional, named };
}

function commandHelp() {
  return [
    "validate",
    "missions [--window past|upcoming|all] [--year YYYY] [--region polar|near-side|far-side] [--site id] [--status planned|completed|failed|cancelled] [--payload type-or-kind] [--as-of YYYY-MM-DD]",
    "mission <id>",
    "site <id>",
    "pet <id>",
    "compare <site-id> [more site ids]",
    "sources",
  ];
}

function main(argv = process.argv.slice(2)) {
  try {
    const result = run(argv);
    process.stdout.write(`${JSON.stringify(result.body, null, 2)}\n`);
    return result.exitCode;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message, code: error.code || "ERROR" }, null, 2)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { run, main };
