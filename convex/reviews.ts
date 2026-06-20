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

function monthRange(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(year, monthIndex - 1, 1).getTime();
  const end = new Date(year, monthIndex, 1).getTime();
  return { start, end };
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function topTags(moments: Array<{ tags: string[] }>): string[] {
  const counts = new Map<string, number>();
  for (const moment of moments)
    for (const tag of moment.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag]) => tag);
}

function safeSnippet(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
}

export const latestMine = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireSession(ctx);
    return await ctx.db
      .query("monthlyReviews")
      .withIndex("by_owner_and_month", (q) => q.eq("ownerUserId", user._id))
      .order("desc")
      .take(6);
  },
});

export const chatMessages = query({
  args: {},
  handler: async (ctx) => {
    const { membership } = await requireSession(ctx);
    return await ctx.db
      .query("coupleChatMessages")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .order("desc")
      .take(50);
  },
});

export const generateMine = mutation({
  args: {
    month: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const month = args.month ?? currentMonth();
    const { start, end } = monthRange(month);
    const moments = await ctx.db
      .query("moments")
      .withIndex("by_couple_and_author_and_happened_at", (q) =>
        q.eq("coupleId", membership.coupleId).eq("authorUserId", user._id),
      )
      .collect()
      .then((items) => items.filter((item) => item.happenedAt >= start && item.happenedAt < end));

    const good = moments.filter((m) => m.tone === "good");
    const hard = moments.filter((m) => m.tone === "bad");
    const mixed = moments.filter((m) => m.tone === "mixed");
    const tags = topTags(moments);
    const summary = moments.length
      ? `You logged ${moments.length} private moments in ${month}: ${good.length} good, ${mixed.length} mixed, and ${hard.length} hard. The strongest themes were ${tags.length ? tags.join(", ") : "connection and repair"}.`
      : `No private moments were logged for ${month} yet. Start with one honest note before generating a deeper review.`;

    const highlights = good.slice(0, 3).map((m) => safeSnippet(m.summary));
    const patterns = tags.length
      ? tags.map((tag) => `A recurring theme worth discussing gently: ${tag}.`)
      : ["Notice what helped you feel close, supported, or disconnected this month."];
    const questions = [
      "What helped us feel most connected this month?",
      "Where did I need support but not ask clearly enough?",
      "What is one small repair we can make next month?",
    ];
    const ownerWorkOns = moments
      .map((m) => m.authorCouldDo)
      .filter((text): text is string => Boolean(text))
      .slice(0, 3)
      .map((text) => safeSnippet(text));
    const partnerRequests = moments
      .map((m) => m.partnerCouldDo)
      .filter((text): text is string => Boolean(text))
      .slice(0, 3)
      .map((text) => safeSnippet(text));
    const agreements = ["Choose one concrete behavior each of you will practice next month."];

    const existing = await ctx.db
      .query("monthlyReviews")
      .withIndex("by_owner_and_month", (q) => q.eq("ownerUserId", user._id).eq("month", month))
      .first();

    const payload = {
      coupleId: membership.coupleId,
      ownerUserId: user._id,
      month,
      status: "draft" as const,
      generatedAt: Date.now(),
      summary,
      highlights,
      patterns,
      questions,
      ownerWorkOns: ownerWorkOns.length
        ? ownerWorkOns
        : ["Practice naming needs earlier and more calmly."],
      partnerRequests: partnerRequests.length
        ? partnerRequests
        : ["Ask for one specific support behavior instead of a broad personality change."],
      agreements,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("monthlyReviews", payload);
  },
});

export const share = mutation({
  args: {
    reviewId: v.id("monthlyReviews"),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.ownerUserId !== user._id || review.coupleId !== membership.coupleId) {
      throw new Error("Review unavailable.");
    }
    const now = Date.now();
    const text = `${review.month} reflection shared:\n\n${review.summary}\n\nQuestions to talk through:\n${review.questions.map((q) => `• ${q}`).join("\n")}`;
    await ctx.db.insert("coupleChatMessages", {
      coupleId: membership.coupleId,
      senderKind: "ai",
      text,
      createdAt: now,
      relatedReviewId: review._id,
    });
    await ctx.db.patch(review._id, { status: "shared", sharedAt: now });
    return review._id;
  },
});
