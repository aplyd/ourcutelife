import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pairingSource = readFileSync("src/app/pairing.tsx", "utf8");
const meSource = readFileSync("src/app/(tabs)/me.tsx", "utf8");

void test("test-data cleanup is not exposed in customer pairing or profile UI", () => {
  assert.doesNotMatch(pairingSource, /cleanupMySyntheticTestData/);
  assert.doesNotMatch(pairingSource, /Preview test data cleanup/);
  assert.doesNotMatch(meSource, /cleanupMySyntheticTestData/);
  assert.doesNotMatch(meSource, /Preview test data cleanup/);
  assert.doesNotMatch(meSource, /Confirm test data cleanup/);
  assert.doesNotMatch(meSource, /cleanupPreview/);
});
