import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootLayoutSource = readFileSync("src/app/_layout.tsx", "utf8");

void test("root stack registers protected leaf routes instead of nonexistent parent routes", () => {
  for (const invalidParent of ["plans", "games", "quizzes"]) {
    assert.doesNotMatch(rootLayoutSource, new RegExp(`<Stack\\.Screen name="${invalidParent}"`));
  }

  for (const route of [
    "plans/history",
    "plans/match/[category]",
    "plans/quality-time/new",
    "plans/quality-time/[requestId]",
    "plans/quality-time/[requestId]/respond",
    "plans/quality-time/[requestId]/outcome",
    "games/weekly",
    "quizzes/today",
  ]) {
    assert.match(
      rootLayoutSource,
      new RegExp(`<Stack\\.Screen name="${route.replaceAll("[", "\\[").replaceAll("]", "\\]")}"`),
    );
  }
});
