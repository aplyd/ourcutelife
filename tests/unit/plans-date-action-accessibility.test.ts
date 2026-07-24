/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(tabs)/plans.tsx"), "utf8");

void test("shared Plans date actions expose explicit native button semantics and stable names", () => {
  const start = source.indexOf("function Action(");
  const end = source.indexOf("function formatCostLevel", start);

  assert.notEqual(start, -1, "expected the shared Plans Action control");
  assert.notEqual(end, -1, "expected the end of the shared Plans Action control");

  const action = source.slice(start, end);
  assert.match(action, /accessibilityRole="button"/);
  assert.match(action, /accessibilityLabel=\{label\}/);
  assert.match(action, /onPress=\{onPress\}/);
  assert.match(action, />\{label\}<\/Text>/);
});
