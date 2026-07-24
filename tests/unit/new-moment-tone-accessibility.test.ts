/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(sheet)/moments/new.tsx"), "utf8");

void test("New Moment tone choices are named buttons with selected state", () => {
  const toneChoice = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*setTone\(option\.value\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(toneChoice, "expected the mapped New Moment tone choice Pressable");
  assert.match(toneChoice[0], /accessibilityRole="button"/);
  assert.match(toneChoice[0], /accessibilityLabel=\{`Set moment tone to \$\{option\.label\}`\}/);
  assert.match(toneChoice[0], /accessibilityState=\{\{ selected \}\}/);
});
