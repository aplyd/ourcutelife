/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(sheet)/me/anniversary.tsx"), "utf8");

void test("Edit Anniversary controls expose stable native accessibility semantics", () => {
  const dateInput = source.match(
    /<TextInput\b(?:(?!\/>).)*placeholder="YYYY-MM-DD"(?:(?!\/>).)*\/>/s,
  );
  const save = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*onPress=\{handleSave\}(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(dateInput, "expected the anniversary date input");
  assert.match(dateInput[0], /accessibilityLabel="Anniversary date"/);

  assert.ok(save, "expected the Save anniversary action");
  assert.match(save[0], /accessibilityRole="button"/);
  assert.match(save[0], /accessibilityLabel="Save anniversary"/);
  assert.match(save[0], /disabled=\{!dateText\.trim\(\) \|\| isSaving\}/);
  assert.match(
    save[0],
    /accessibilityState=\{\{ disabled: !dateText\.trim\(\) \|\| isSaving, busy: isSaving \}\}/,
  );
});
