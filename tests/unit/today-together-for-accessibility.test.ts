/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(tabs)/index.tsx"), "utf8");

void test("Together For exposes one coherent value per segment and hides rolling glyphs", () => {
  const segments = source.match(
    /\{Object\.entries\(duration\)\.map\(\(\[label, value\]\) => \([\s\S]*?\)\)\}/,
  );

  assert.ok(segments, "expected the Together For duration segment map");
  assert.match(segments[0], /accessible/);
  assert.match(segments[0], /accessibilityLabel=\{formatDurationSegmentLabel\(label, value\)\}/);
  assert.match(segments[0], /accessibilityElementsHidden/);
  assert.match(segments[0], /importantForAccessibility="no-hide-descendants"/);
  assert.doesNotMatch(segments[0], /accessibilityLiveRegion/);
});
