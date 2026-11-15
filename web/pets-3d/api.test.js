import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_PETS,
  CANONICAL_PETS,
  resolveMood,
  resolvePetId,
} from "./api.js";

test("canonical four are drill / reflector / shield / beacon", () => {
  assert.equal(CANONICAL_PETS.length, 4);
  assert.deepEqual(
    CANONICAL_PETS.map((p) => p.id),
    ["lister", "retro", "eds", "ln-1"],
  );
  assert.deepEqual(
    CANONICAL_PETS.map((p) => p.silhouette),
    ["drill", "reflector", "shield", "beacon"],
  );
});

test("resolvePetId accepts catalog and engine aliases", () => {
  assert.equal(resolvePetId("lister"), "lister");
  assert.equal(resolvePetId("LISTER"), "lister");
  assert.equal(resolvePetId("retro"), "retro");
  assert.equal(resolvePetId("lra"), "retro");
  assert.equal(resolvePetId("LRA"), "retro");
  assert.equal(resolvePetId("eds"), "eds");
  assert.equal(resolvePetId("trident"), "trident");
  assert.equal(resolvePetId("TRIDENT"), "trident");
  assert.equal(resolvePetId("ln-1"), "ln-1");
  assert.equal(resolvePetId("nodey"), "ln-1");
});

test("resolvePetId rejects unknown ids", () => {
  assert.throws(() => resolvePetId("ghost"), /Unknown instrument/);
  assert.throws(() => resolvePetId(null), /Pet id must be a string/);
});

test("resolveMood maps phases and keeps retro asleep at night", () => {
  assert.equal(resolveMood("day"), "happy");
  assert.equal(resolveMood("sunset"), "shivering");
  assert.equal(resolveMood("night", { petId: "lister" }), "cold");
  assert.equal(resolveMood("night", { petId: "retro" }), "sleeping");
  assert.equal(resolveMood("night", { petId: "LRA" }), "sleeping");
  assert.equal(resolveMood("cold"), "cold");
});

test("all pets have unique ids", () => {
  const ids = ALL_PETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});
