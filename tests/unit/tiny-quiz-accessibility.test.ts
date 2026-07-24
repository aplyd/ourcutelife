/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/quizzes/today.tsx"), "utf8");

void test("Tiny Quiz controls expose explicit roles, names, and state", () => {
  const back = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*router\.back\(\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );
  const choice = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*setGuess\(choice\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );
  const reveal = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*setRevealed\(true\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(back, "expected the Tiny Quiz back action");
  assert.match(back[0], /accessibilityRole="button"/);
  assert.match(back[0], /accessibilityLabel="Back to Today"/);

  assert.ok(choice, "expected the mapped Tiny Quiz guess choice");
  assert.match(choice[0], /accessibilityRole="button"/);
  assert.match(choice[0], /accessibilityLabel=\{`Guess \$\{choice\}`\}/);
  assert.match(choice[0], /accessibilityState=\{\{ selected: active \}\}/);

  assert.ok(reveal, "expected the Tiny Quiz reveal action");
  assert.match(reveal[0], /accessibilityRole="button"/);
  assert.match(reveal[0], /accessibilityLabel="Compare quiz answer"/);
  assert.match(reveal[0], /accessibilityState=\{\{ disabled: !guess \}\}/);
});
