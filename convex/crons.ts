import { cronJobs, makeFunctionReference } from "convex/server";

const crons = cronJobs();
const planDailyPrompts = makeFunctionReference<"mutation", { cursor: string | null }>(
  "dailyPromptLifecycles:planDailyPrompts",
);
const generateReusableDailyPrompts = makeFunctionReference<"action", { mode: "scheduled_daily" }>(
  "dailyPromptGenerationActions:generateReusableDailyPrompts",
);

crons.interval("plan lifecycle-backed daily prompts", { minutes: 1 }, planDailyPrompts, {
  cursor: null,
});
crons.cron("generate reusable daily prompts", "0 12 * * *", generateReusableDailyPrompts, {
  mode: "scheduled_daily",
});

export default crons;
