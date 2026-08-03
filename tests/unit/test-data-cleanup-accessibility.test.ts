import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pairingSource = readFileSync("src/app/pairing.tsx", "utf8");
const meSource = readFileSync("src/app/(tabs)/me.tsx", "utf8");

void test("paired-account synthetic cleanup requires a preview before confirmation", () => {
  assert.match(meSource, /confirm: cleanupPreview !== null/);
  assert.match(meSource, /Preview test data cleanup/);
  assert.match(meSource, /Confirm test data cleanup/);
  assert.match(meSource, /real-partner couple/);

  assert.doesNotMatch(pairingSource, /cleanupMySyntheticTestData/);
  assert.doesNotMatch(pairingSource, /Preview test data cleanup/);
});

void test("paired-account cleanup control is accessible", () => {
  assert.match(meSource, /accessibilityRole="button"/);
  assert.match(
    meSource,
    /accessibilityState=\{\{ disabled: isCleaningTestData, busy: isCleaningTestData \}\}/,
  );
});
