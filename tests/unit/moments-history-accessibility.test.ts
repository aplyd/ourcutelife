/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(tabs)/moments.tsx"), "utf8");

void test("Moments history creation and detail navigation expose named button semantics", () => {
  const logMoment = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*router\.push\("\/moments\/new"\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );
  const momentRow = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*router\.push\(`\/moments\/\$\{moment\._id\}`\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(logMoment, "expected the Log a moment navigation action");
  assert.match(logMoment[0], /accessibilityRole="button"/);
  assert.match(logMoment[0], /accessibilityLabel="Log a moment"/);

  assert.ok(momentRow, "expected each moment detail navigation row");
  assert.match(momentRow[0], /accessibilityRole="button"/);
  assert.match(momentRow[0], /accessibilityLabel=\{`Open moment: \$\{moment\.summary\}`\}/);
});

void test("Moments history can be filtered by warm tone labels", () => {
  assert.match(source, /const momentFilters = \[/);
  assert.match(source, /\["all", "All"\]/);
  assert.match(source, /\["good", "Good"\]/);
  assert.match(source, /\["mixed", "Mixed"\]/);
  assert.match(source, /\["bad", "Hard"\]/);
  assert.match(source, /momentFilter === "all" \|\| moment\.tone === momentFilter/);
  assert.match(source, /accessibilityLabel=\{`Show \$\{label\.toLowerCase\(\)\} moments`\}/);
  assert.match(source, /accessibilityState=\{\{ selected: momentFilter === value \}\}/);
});
