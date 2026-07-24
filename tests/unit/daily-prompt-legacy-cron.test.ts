import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const cronsSource = readFileSync("convex/crons.ts", "utf8");

void test("the legacy fixed-hour daily prompt reminder is not scheduled", () => {
  assert.doesNotMatch(cronsSource, /sendDailyPromptReminders/);
  assert.doesNotMatch(cronsSource, /daily prompt push reminders/);
});
