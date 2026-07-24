/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(tabs)/index.tsx"), "utf8");

function routePressable(route: string): string {
  const escapedRoute = route.replaceAll("/", "\\/");
  const match = source.match(
    new RegExp(
      `<Pressable\\b(?:(?!<Pressable\\b|<\\/Pressable>).)*router\\.push\\("${escapedRoute}"\\)(?:(?!<Pressable\\b|<\\/Pressable>).)*<\\/Pressable>`,
      "s",
    ),
  );

  assert.ok(match, `expected the ${route} entry Pressable`);
  return match[0];
}

void test("Today weekly game and quiz cards are explicitly named buttons", () => {
  const weeklyGame = routePressable("/games/weekly");
  const quiz = routePressable("/quizzes/today");

  assert.match(weeklyGame, /accessibilityRole="button"/);
  assert.match(weeklyGame, /accessibilityLabel="Open weekly game"/);

  assert.match(quiz, /accessibilityRole="button"/);
  assert.match(quiz, /accessibilityLabel="Open today's tiny quiz"/);
});
