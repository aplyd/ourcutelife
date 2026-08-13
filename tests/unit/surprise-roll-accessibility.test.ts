/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(sheet)/plans/random.tsx"), "utf8");

void test("Surprise picks are submitted explicitly and same-category rerolls refresh the query", () => {
  assert.match(
    source,
    /const \[rollRequest, setRollRequest\] = useState<Category\[\] \| null>\(null\)/,
  );
  assert.match(
    source,
    /useAppQuery\(\s*api\.plans\.randomByCategories,\s*rollRequest \? \{ categories: rollRequest \} : "skip",?\s*\)/s,
  );
  assert.match(source, /function handleRoll\(\)/);
  assert.match(source, /rollSequenceRef\.current \+= 1/);
  assert.match(source, /setRollRequest\(nextRequest\)/);
  assert.match(source, /setRollRequest\(null\)/);
});

void test("Surprise roll is a named native button with matching disabled and busy state", () => {
  const match = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*onPress=\{handleRoll\}(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(match, "expected the explicit Surprise roll Pressable");
  assert.match(match[0], /accessibilityRole="button"/);
  assert.match(
    match[0],
    /accessibilityLabel=\{hasRolled \? "Reroll surprise picks" : "Roll surprise picks"\}/,
  );
  assert.match(match[0], /disabled=\{selected\.length === 0 \|\| isRolling\}/);
  assert.match(
    match[0],
    /accessibilityState=\{\{\s*disabled: selected\.length === 0 \|\| isRolling,\s*busy: isRolling,?\s*\}\}/s,
  );
});

void test("Surprise keeps the existing honest no-picks state after a completed roll", () => {
  assert.match(
    source,
    /hasRolled && !isRolling && picks && !picks\.length[\s\S]*No picks in those categories yet\./,
  );
});
