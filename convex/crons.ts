import { cronJobs, makeFunctionReference } from "convex/server";

const crons = cronJobs();
const planDailyPrompts = makeFunctionReference<"mutation", { cursor: string | null }>(
  "dailyPromptLifecycles:planDailyPrompts",
);

crons.interval("plan lifecycle-backed daily prompts", { minutes: 1 }, planDailyPrompts, {
  cursor: null,
});

export default crons;
