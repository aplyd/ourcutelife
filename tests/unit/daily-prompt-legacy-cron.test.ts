import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const cronsSource = readFileSync("convex/crons.ts", "utf8");

void test("the legacy fixed-hour daily prompt reminder is not scheduled", () => {
  assert.doesNotMatch(cronsSource, /sendDailyPromptReminders/);
  assert.doesNotMatch(cronsSource, /daily prompt push reminders/);
});

void test("the production cron continuously plans lifecycle-backed daily prompt delivery", () => {
  assert.match(cronsSource, /crons\.interval\(/);
  assert.match(cronsSource, /dailyPromptLifecycles:planDailyPrompts/);
  assert.match(cronsSource, /minutes:\s*1/);
});
