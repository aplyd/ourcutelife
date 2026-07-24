/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(tabs)/me.tsx"), "utf8");

function pressableForText(text: string): string {
  const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(
      `<Pressable\\b(?:(?!<Pressable\\b|</Pressable>).)*<Text\\b[^>]*>${escapedText}</Text>(?:(?!<Pressable\\b|</Pressable>).)*</Pressable>`,
      "s",
    ),
  );

  assert.ok(match, `expected a Pressable containing ${text}`);
  return match[0];
}

void test("account actions expose explicit native button semantics", () => {
  for (const text of ["Sign out", "Leave couple"]) {
    assert.match(pressableForText(text), /accessibilityRole="button"/);
  }
});

void test("leave couple remains a non-destructive confirmation placeholder", () => {
  assert.match(pressableForText("Leave couple"), /onPress=\{confirmLeaveCouple\}/);
  assert.match(source, /This is intentionally not wired yet\./);
});
