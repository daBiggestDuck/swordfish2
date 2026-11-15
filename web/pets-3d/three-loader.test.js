import assert from "node:assert/strict";
import test from "node:test";
import { THREE_CDN_URLS } from "./three-loader.js";

test("Three CDN list has jsdelivr, unpkg, and esm mirrors", () => {
  assert.ok(THREE_CDN_URLS.length >= 3);
  assert.match(THREE_CDN_URLS[0], /jsdelivr/);
  assert.match(THREE_CDN_URLS[1], /unpkg/);
  assert.match(THREE_CDN_URLS[2], /esm\.sh/);
  for (const url of THREE_CDN_URLS) {
    assert.match(url, /three@0\.170\.0/);
  }
});
