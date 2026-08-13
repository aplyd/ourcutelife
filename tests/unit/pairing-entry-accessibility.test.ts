/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/pairing.tsx"), "utf8");

void test("pairing create and join paths expose stable native accessibility semantics", () => {
  const anniversaryInput = source.match(
    /<TextInput\b(?:(?!\/>).)*placeholder="YYYY-MM-DD"(?:(?!\/>).)*\/>/s,
  );
  const createCode = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*onPress=\{handleCreateCode\}(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );
  const pairingCodeInput = source.match(
    /<TextInput\b(?:(?!\/>).)*placeholder="482-913"(?:(?!\/>).)*\/>/s,
  );
  const join = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*onPress=\{handleJoin\}(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(anniversaryInput, "expected the anniversary date input");
  assert.match(anniversaryInput[0], /accessibilityLabel="Anniversary date"/);

  assert.ok(createCode, "expected the generate pairing code action");
  assert.match(createCode[0], /accessibilityRole="button"/);
  assert.match(createCode[0], /accessibilityLabel=\{[^}]*displayedCode[^}]*\}/s);
  assert.match(createCode[0], /accessibilityState=\{\{ disabled: isWorking, busy: isWorking \}\}/);
  assert.match(createCode[0], /disabled=\{isWorking\}/);

  assert.ok(pairingCodeInput, "expected the pairing code input");
  assert.match(pairingCodeInput[0], /accessibilityLabel="Partner pairing code"/);

  assert.ok(join, "expected the join partner action");
  assert.match(join[0], /accessibilityRole="button"/);
  assert.match(join[0], /accessibilityLabel="Join partner"/);
  assert.match(join[0], /accessibilityState=\{\{ disabled: !canJoin, busy: isWorking \}\}/);
  assert.match(join[0], /disabled=\{!canJoin\}/);
});

void test("pairing recovery exposes a stable native sign-out action", () => {
  const signOut = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*authClient\.signOut\(\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(signOut, "expected the pairing recovery sign-out action");
  assert.match(signOut[0], /accessibilityLabel="Sign out"/);
  assert.match(signOut[0], /accessibilityRole="button"/);
});
