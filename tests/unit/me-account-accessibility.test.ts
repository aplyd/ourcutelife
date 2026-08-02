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

void test("leave couple is mutation-wired only behind destructive confirmation", () => {
  assert.match(source, /useAppMutation\(api\.pairing\.leaveCouple\)/);
  assert.match(pressableForText("Leave couple"), /onPress=\{confirmLeaveCouple\}/);
  assert.match(source, /text: "Cancel", style: "cancel"/);
  assert.match(source, /text: "Leave couple",[\s\S]{0,80}style: "destructive"/);
  assert.match(source, /onPress: \(\) => void leaveCurrentCouple\(\)/);
});

void test("leave couple exposes pending and error state and redirects only after success", () => {
  assert.match(
    source,
    /accessibilityState=\{\{ disabled: isLeavingCouple, busy: isLeavingCouple \}\}/,
  );
  assert.match(source, /disabled=\{isLeavingCouple\}/);
  assert.match(source, /Leaving couple…/);
  assert.match(source, /setLeaveCoupleError\(null\)/);
  assert.match(source, /await leaveCouple\(\{\}\);\s*router\.replace\("\/pairing"\)/s);
  assert.match(source, /catch \(error\)[\s\S]*setLeaveCoupleError\(/);
  assert.match(source, /accessibilityRole="alert"/);
});
