import { expect, test } from "vitest";

import crons from "./crons";

type CronEntry = {
  name: string;
  args: unknown[];
  schedule: { type: string; cron?: string };
};

test("schedules daily reusable prompt generation once per day in scheduled-daily mode", () => {
  const entries = Object.values(
    (crons as unknown as { crons: Record<string, CronEntry> }).crons,
  ).filter((entry) => entry.name === "dailyPromptGenerationActions:generateReusableDailyPrompts");

  expect(entries).toEqual([
    {
      name: "dailyPromptGenerationActions:generateReusableDailyPrompts",
      args: [{ mode: "scheduled_daily" }],
      schedule: { type: "cron", cron: "0 12 * * *" },
    },
  ]);
});
