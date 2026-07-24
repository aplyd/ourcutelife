/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(tabs)/me.tsx"), "utf8");

void test("Me profile and relationship edit actions are explicitly named buttons", () => {
  const profilePhoto = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*router\.push\("\/me\/profile"\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );
  const editName = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*accessibilityLabel="Edit name"(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );
  const anniversary = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*router\.push\("\/me\/anniversary"\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(profilePhoto, "expected the profile photo edit action");
  assert.match(profilePhoto[0], /accessibilityRole="button"/);
  assert.match(profilePhoto[0], /accessibilityLabel="Edit profile photo"/);

  assert.ok(editName, "expected the name edit action");
  assert.match(editName[0], /accessibilityRole="button"/);

  assert.ok(anniversary, "expected the anniversary edit action");
  assert.match(anniversary[0], /accessibilityRole="button"/);
  assert.match(anniversary[0], /accessibilityLabel="Edit anniversary"/);
});
