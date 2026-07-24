/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(sheet)/me/profile.tsx"), "utf8");

void test("Edit Profile controls expose stable native accessibility semantics", () => {
  const avatar = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*className="h-28 w-28(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );
  const nameInput = source.match(
    /<TextInput\b(?:(?!\/>).)*placeholder="Your name"(?:(?!\/>).)*\/>/s,
  );
  const save = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*onPress=\{handleSave\}(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(avatar, "expected the profile photo picker");
  assert.match(avatar[0], /accessibilityRole="button"/);
  assert.match(avatar[0], /accessibilityLabel="Change profile photo"/);
  assert.match(
    avatar[0],
    /accessibilityState=\{\{ disabled: isUploadingPhoto, busy: isUploadingPhoto \}\}/,
  );

  assert.ok(nameInput, "expected the profile name input");
  assert.match(nameInput[0], /accessibilityLabel="Profile name"/);

  assert.ok(save, "expected the Save profile action");
  assert.match(save[0], /accessibilityRole="button"/);
  assert.match(save[0], /accessibilityLabel="Save profile"/);
  assert.match(
    save[0],
    /accessibilityState=\{\{ disabled: !fullName\.trim\(\) \|\| isSaving, busy: isSaving \}\}/,
  );
});
