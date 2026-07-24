/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/games/weekly.tsx"), "utf8");

void test("Weekly Game navigation controls are explicitly named buttons", () => {
  const back = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*router\.back\(\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );
  const previous = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*value \+ cards\.length - 1(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );
  const next = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*value \+ 1(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(back, "expected the Weekly Game back action");
  assert.match(back[0], /accessibilityRole="button"/);
  assert.match(back[0], /accessibilityLabel="Back to Today"/);

  assert.ok(previous, "expected the previous-prompt action");
  assert.match(previous[0], /accessibilityRole="button"/);
  assert.match(previous[0], /accessibilityLabel="Previous weekly game prompt"/);

  assert.ok(next, "expected the next-prompt action");
  assert.match(next[0], /accessibilityRole="button"/);
  assert.match(next[0], /accessibilityLabel="Next weekly game prompt"/);
});

void test("Weekly Game scoreboard rows expose checkbox state", () => {
  const score = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*toggle\(card\.index\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(score, "expected the mapped Weekly Game scoreboard Pressable");
  assert.match(score[0], /accessibilityRole="checkbox"/);
  assert.match(
    score[0],
    /accessibilityLabel=\{`Mark weekly game prompt complete: \$\{card\.text\}`\}/,
  );
  assert.match(score[0], /accessibilityState=\{\{ checked: done \}\}/);
});
