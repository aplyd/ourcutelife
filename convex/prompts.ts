import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

async function requireSession(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users"> | undefined,
  sessionToken: string | undefined,
) {
  if (!userId || !sessionToken) throw new Error("Not signed in.");
  const user = await ctx.db.get(userId);
  if (!user || user.sessionToken !== sessionToken) throw new Error("Not signed in.");
  const membership = await ctx.db
    .query("coupleMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!membership) throw new Error("Pair with your partner first.");
  return { membership };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function choosePrompt(tags: string[]): string {
  if (tags.includes("communication"))
    return "What is one thing you want to say more clearly and kindly this week?";
  if (tags.includes("quality time"))
    return "What would make time together feel more intentional this week?";
  if (tags.includes("stress")) return "Where could you make life 10% easier for each other today?";
  return "What is one small thing your partner did recently that made life easier?";
}

export const today = query({
  args: { userId: v.optional(v.id("users")), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { membership } = await requireSession(ctx, args.userId, args.sessionToken);
    const recent = await ctx.db
      .query("moments")
      .withIndex("by_couple_and_author_and_happened_at", (q) =>
        q.eq("coupleId", membership.coupleId).eq("authorUserId", args.userId!),
      )
      .order("desc")
      .take(10);
    const tags = Array.from(new Set(recent.flatMap((moment) => moment.tags)));
    const promptDate = todayKey();
    const existing = await ctx.db
      .query("promptResponses")
      .withIndex("by_user_and_date", (q) =>
        q.eq("userId", args.userId!).eq("promptDate", promptDate),
      )
      .first();
    return {
      promptDate,
      prompt: choosePrompt(tags),
      weeklyTopic: tags[0]
        ? `This week, make ${tags[0]} easier to talk about. Each of you names one need and one appreciation.`
        : "This week, each of you shares one appreciation and one tiny repair request.",
      response: existing?.response ?? null,
    };
  },
});

export const answer = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    promptDate: v.string(),
    prompt: v.string(),
    response: v.string(),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireSession(ctx, args.userId, args.sessionToken);
    const response = args.response.trim();
    if (!response) throw new Error("Write an answer before saving.");
    const existing = await ctx.db
      .query("promptResponses")
      .withIndex("by_user_and_date", (q) =>
        q.eq("userId", args.userId).eq("promptDate", args.promptDate),
      )
      .first();
    const payload = {
      coupleId: membership.coupleId,
      userId: args.userId,
      promptDate: args.promptDate,
      prompt: args.prompt,
      response,
      createdAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("promptResponses", payload);
  },
});
