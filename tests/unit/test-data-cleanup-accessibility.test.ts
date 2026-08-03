import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pairingSource = readFileSync("src/app/pairing.tsx", "utf8");
const meSource = readFileSync("src/app/(tabs)/me.tsx", "utf8");

void test("synthetic test cleanup requires a preview before confirmation", () => {
  for (const source of [pairingSource, meSource]) {
    assert.match(source, /confirm: cleanupPreview !== null/);
    assert.match(source, /Preview test data cleanup/);
    assert.match(source, /Confirm test data cleanup/);
    assert.match(source, /real-partner couple/);
  }
});

void test("paired-account cleanup control is accessible", () => {
  assert.match(meSource, /accessibilityRole="button"/);
  assert.match(
    meSource,
    /accessibilityState=\{\{ disabled: isCleaningTestData, busy: isCleaningTestData \}\}/,
  );
});
