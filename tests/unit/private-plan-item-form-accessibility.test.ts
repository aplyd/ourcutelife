/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(sheet)/plans/new.tsx"), "utf8");

void test("Private plan-item form exposes stable native accessibility semantics", () => {
  const titleInput = source.match(
    /<TextInput\b(?:(?!\/>).)*placeholder="Try that new ramen place"(?:(?!\/>).)*\/>/s,
  );
  const descriptionInput = source.match(
    /<TextInput\b(?:(?!\/>).)*placeholder="Enough detail to make the swipe easy\."(?:(?!\/>).)*\/>/s,
  );
  const tagsInput = source.match(
    /<TextInput\b(?:(?!\/>).)*placeholder="cozy, spicy, outside"(?:(?!\/>).)*\/>/s,
  );
  const save = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*onPress=\{handleSave\}(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(titleInput, "expected the plan-item title input");
  assert.match(titleInput[0], /accessibilityLabel="Plan item title"/);

  assert.ok(descriptionInput, "expected the plan-item description input");
  assert.match(descriptionInput[0], /accessibilityLabel="Plan item description"/);

  assert.ok(tagsInput, "expected the plan-item tags input");
  assert.match(tagsInput[0], /accessibilityLabel="Plan item hashtags or subcategories"/);

  assert.ok(save, "expected the Save private suggestion action");
  assert.match(save[0], /accessibilityRole="button"/);
  assert.match(save[0], /accessibilityLabel="Save private suggestion"/);
  assert.match(save[0], /accessibilityState=\{\{ disabled: !canSave, busy: isSaving \}\}/);
});
