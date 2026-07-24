/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/plans/match/[category].tsx"), "utf8");

function pressableForLabel(label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(
      `<Pressable\\b(?:(?!<Pressable\\b|</Pressable>).)*accessibilityLabel="${escapedLabel}"(?:(?!<Pressable\\b|</Pressable>).)*</Pressable>`,
      "s",
    ),
  );

  assert.ok(match, `expected a Pressable with accessibilityLabel="${label}"`);
  return match[0];
}

void test("plan-item match actions expose explicit native button semantics and labels", () => {
  for (const label of ["Back", "History", "Pass", "Like", "Add a private plan item"]) {
    assert.match(pressableForLabel(label), /accessibilityRole="button"/);
  }
});

void test("plan-item match vote actions retain their disabled state contract", () => {
  for (const label of ["Pass", "Like"]) {
    assert.match(pressableForLabel(label), /disabled=\{isWorking\}/);
  }
});
