import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getCurrentAppUser } from "./auth";

async function requireSession(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentAppUser(ctx);
  if (!user) throw new Error("Not signed in.");
  const membership = await ctx.db
    .query("coupleMembers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();
  if (!membership) throw new Error("Pair with your partner first.");
  return { user, membership };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function choosePrompt(tags: string[]): string {
  if (tags.includes("communication")) {
    return "What is one thing you want to say more clearly and kindly this week?";
  }
  if (tags.includes("quality time")) {
    return "What would make time together feel more intentional this week?";
  }
  if (tags.includes("stress")) return "Where could you make life 10% easier for each other today?";
  return "What is one small thing your partner did recently that made life easier?";
}

export const today = query({
  args: {},
  handler: async (ctx) => {
    const { user, membership } = await requireSession(ctx);
    const recent = await ctx.db
      .query("moments")
      .withIndex("by_couple_and_author_and_happened_at", (q) =>
        q.eq("coupleId", membership.coupleId).eq("authorUserId", user._id),
      )
      .order("desc")
      .take(10);
    const tags = Array.from(new Set(recent.flatMap((moment) => moment.tags)));
    const promptDate = todayKey();
    const responses = await ctx.db
      .query("promptResponses")
      .withIndex("by_couple_and_date", (q) =>
        q.eq("coupleId", membership.coupleId).eq("promptDate", promptDate),
      )
      .collect();
    const ownResponse = responses.find((response) => response.userId === user._id) ?? null;
    const partnerResponse = responses.find((response) => response.userId !== user._id) ?? null;
    const members = await ctx.db
      .query("coupleMembers")
      .withIndex("by_couple", (q) => q.eq("coupleId", membership.coupleId))
      .collect();
    const prompt = ownResponse?.prompt ?? partnerResponse?.prompt ?? choosePrompt(tags);

    return {
      promptDate,
      prompt,
      weeklyTopic: tags[0]
        ? `This week, make ${tags[0]} easier to talk about. Each of you names one need and one appreciation.`
        : "This week, each of you shares one appreciation and one tiny repair request.",
      response: ownResponse?.response ?? null,
      answeredAt: ownResponse?.createdAt ?? null,
      partnerHasAnswered: Boolean(partnerResponse),
      partnerResponse:
        ownResponse && partnerResponse
          ? {
              response: partnerResponse.response,
              answeredAt: partnerResponse.createdAt,
            }
          : null,
      partnerCount: Math.max(0, members.length - 1),
      isRevealed: Boolean(ownResponse && partnerResponse),
    };
  },
});

export const answer = mutation({
  args: {
    promptDate: v.string(),
    prompt: v.string(),
    response: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const response = args.response.trim();
    if (!response) throw new Error("Write an answer before saving.");
    if (response.length > 2000) throw new Error("Keep today's answer under 2,000 characters.");
    const existing = await ctx.db
      .query("promptResponses")
      .withIndex("by_user_and_date", (q) =>
        q.eq("userId", user._id).eq("promptDate", args.promptDate),
      )
      .first();
    const now = Date.now();
    const payload = {
      coupleId: membership.coupleId,
      userId: user._id,
      promptDate: args.promptDate,
      prompt: args.prompt,
      response,
      createdAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("promptResponses", payload);
  },
});
