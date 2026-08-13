/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(sheet)/moments/new.tsx"), "utf8");

void test("New Moment tag choices are named buttons with selected state", () => {
  const tagChoice = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*toggleTag\(tag\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(tagChoice, "expected the mapped New Moment tag choice Pressable");
  assert.match(tagChoice[0], /accessibilityRole="button"/);
  assert.match(tagChoice[0], /accessibilityLabel=\{`Toggle \$\{tag\} moment tag`\}/);
  assert.match(tagChoice[0], /accessibilityState=\{\{ selected \}\}/);
});
