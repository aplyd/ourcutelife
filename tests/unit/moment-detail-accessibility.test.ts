/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/moments/[id].tsx"), "utf8");

void test("Moment detail exposes one named button that returns to Moments history", () => {
  const backControls = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*accessibilityLabel="Back to moments"(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/gs,
  );

  assert.equal(backControls?.length, 1, "expected exactly one Moment detail back Pressable");
  assert.match(backControls[0], /accessibilityRole="button"/);
  assert.match(backControls[0], /router\.replace\("\/moments"\)/);
  assert.match(backControls[0], />\s*<Text\b[^>]*>Back to moments<\/Text>\s*<\/Pressable>/s);
});

void test("Moment detail edit and delete actions are explicitly named buttons", () => {
  const edit = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*router\.push\(`\/moments\/edit\/\$\{moment\._id\}`\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );
  const remove = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*Alert\.alert\("Delete moment\?"(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(edit, "expected the Moment detail edit Pressable");
  assert.match(edit[0], /accessibilityRole="button"/);
  assert.match(edit[0], /accessibilityLabel="Edit moment"/);

  assert.ok(remove, "expected the Moment detail delete Pressable");
  assert.match(remove[0], /accessibilityRole="button"/);
  assert.match(remove[0], /accessibilityLabel="Delete moment"/);
});
