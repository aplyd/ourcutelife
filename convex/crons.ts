import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron("daily prompt push reminders", "0 * * * *", internal.push.sendDailyPromptReminders, {});

export default crons;
