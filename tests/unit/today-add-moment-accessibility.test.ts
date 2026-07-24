/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(tabs)/index.tsx"), "utf8");

void test("Today add-moment control is an explicitly named button", () => {
  const match = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*router\.push\("\/moments\/new"\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(match, "expected the Today add-moment Pressable");
  assert.match(match[0], /accessibilityRole="button"/);
  assert.match(match[0], /accessibilityLabel="Add a moment"/);
});
