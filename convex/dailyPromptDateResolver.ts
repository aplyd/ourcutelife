import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getPromptDateInTimezone, localDateMinuteToTimestamp } from "./dailyPromptLifecycle";

export async function getLatestLifecycle(ctx: QueryCtx | MutationCtx, coupleId: Id<"couples">) {
  const rows = await ctx.db
    .query("dailyPromptLifecycles")
    .withIndex("by_couple_id_and_prompt_date", (q) => q.eq("coupleId", coupleId))
    .order("desc")
    .take(2);
  if (rows.length > 1 && rows[0].promptDate === rows[1].promptDate) {
    throw new Error("Duplicate daily prompt lifecycle.");
  }
  return rows[0] ?? null;
}

export async function existingLifecycleForDate(
  ctx: QueryCtx | MutationCtx,
  coupleId: Id<"couples">,
  promptDate: string,
) {
  const rows = await ctx.db
    .query("dailyPromptLifecycles")
    .withIndex("by_couple_id_and_prompt_date", (q) =>
      q.eq("coupleId", coupleId).eq("promptDate", promptDate),
    )
    .take(2);
  if (rows.length > 1) throw new Error("Duplicate daily prompt lifecycle.");
  return rows[0] ?? null;
}

export function getNextLocalDate(localDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new Error(`Invalid local date: ${localDate}`);
  const [, yearText, monthText, dayText] = match;
  const next = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText) + 1));
  return next.toISOString().slice(0, 10);
}

export async function getAuthoritativePromptDate(
  ctx: QueryCtx | MutationCtx,
  coupleId: Id<"couples">,
  nowMs: number,
  timezone: string,
): Promise<{ promptDate: string; existing: Doc<"dailyPromptLifecycles"> | null }> {
  const today = getPromptDateInTimezone(nowMs, timezone);
  const existingToday = await existingLifecycleForDate(ctx, coupleId, today);
  const finalEligibleMinuteStartedAt = localDateMinuteToTimestamp(today, 1259, timezone);
  const candidatePromptDate = existingToday
    ? today
    : nowMs <= finalEligibleMinuteStartedAt
      ? today
      : getNextLocalDate(today);
  const latest = await getLatestLifecycle(ctx, coupleId);
  if (latest && latest.promptDate >= candidatePromptDate) {
    return { promptDate: latest.promptDate, existing: latest };
  }
  return { promptDate: candidatePromptDate, existing: null };
}
