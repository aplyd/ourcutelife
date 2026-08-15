/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(sheet)/me/profile.tsx"), "utf8");

void test("Edit Profile controls expose stable native accessibility semantics", () => {
  const avatarPreview = source.match(
    /<View\b(?:(?!<View\b|<\/View>).)*className="h-28 w-28(?:(?!<View\b|<\/View>).)*<\/View>/s,
  );
  const photoActions = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*onPress=\{handlePickPhoto\}(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/gs,
  );
  const nameInput = source.match(
    /<TextInput\b(?:(?!\/>).)*placeholder="Your name"(?:(?!\/>).)*\/>/s,
  );
  const save = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*onPress=\{handleSave\}(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(avatarPreview, "expected the visual profile photo preview");
  assert.match(avatarPreview[0], /accessible=\{false\}/);
  assert.match(avatarPreview[0], /accessibilityElementsHidden/);
  assert.match(avatarPreview[0], /importantForAccessibility="no-hide-descendants"/);

  assert.equal(photoActions?.length, 1, "expected exactly one profile photo picker action");
  assert.match(photoActions[0], /accessibilityRole="button"/);
  assert.match(
    photoActions[0],
    /accessibilityLabel=\{avatarUrl \? "Change profile photo" : "Upload profile photo"\}/,
  );
  assert.match(
    photoActions[0],
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
