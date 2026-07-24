/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/app/(sheet)/moments/edit/[id].tsx"),
  "utf8",
);

void test("Edit Moment tone choices are named buttons with selected state", () => {
  const toneChoice = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*setTone\(item\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(toneChoice, "expected the mapped Edit Moment tone choice Pressable");
  assert.match(toneChoice[0], /accessibilityRole="button"/);
  assert.match(
    toneChoice[0],
    /accessibilityLabel=\{`Set moment tone to \$\{item === "bad" \? "Hard" : item === "good" \? "Good" : "Mixed"\}`\}/,
  );
  assert.match(toneChoice[0], /accessibilityState=\{\{ selected: tone === item \}\}/);
});
