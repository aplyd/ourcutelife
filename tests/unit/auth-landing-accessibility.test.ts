/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/auth.tsx"), "utf8");

void test("Apple sign-in exposes native button and pending state", () => {
  const match = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*Continue with Apple(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(match, "expected a Pressable containing Continue with Apple");
  assert.match(match[0], /accessibilityLabel="Continue with Apple"/);
  assert.match(match[0], /accessibilityRole="button"/);
  assert.match(
    match[0],
    /accessibilityState=\{\{\s*disabled: isSigningIn \|\| betterAuthSession\.isPending,\s*busy: isSigningIn \|\| betterAuthSession\.isPending,?\s*\}\}/,
  );
  assert.match(match[0], /disabled=\{isSigningIn \|\| betterAuthSession\.isPending\}/);
});
