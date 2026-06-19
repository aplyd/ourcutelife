import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { getCurrentAppUser } from "./auth";

async function requireSession(ctx: QueryCtx) {
  const user = await getCurrentAppUser(ctx);
  if (!user) throw new Error("Not signed in.");
  const membership = await ctx.db
    .query("coupleMembers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();
  if (!membership) throw new Error("Pair with your partner first.");
  const couple = await ctx.db.get(membership.coupleId);
  if (!couple) throw new Error("Relationship space unavailable.");
  return { user, membership, couple };
}

export const mine = query({
  args: {},
  handler: async (ctx, args) => {
    const { user, membership, couple } = await requireSession(ctx);
    const moments = await ctx.db
      .query("moments")
      .withIndex("by_couple_and_author_and_happened_at", (q) =>
        q.eq("coupleId", membership.coupleId).eq("authorUserId", user._id),
      )
      .take(200);
    const counts = { good: 0, mixed: 0, bad: 0 };
    const tagCounts = new Map<string, number>();
    for (const moment of moments) {
      counts[moment.tone] += 1;
      for (const tag of moment.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const reviews = await ctx.db
      .query("monthlyReviews")
      .withIndex("by_owner_and_month", (q) => q.eq("ownerUserId", user._id))
      .take(50);
    return {
      daysTogether: couple.anniversaryDate
        ? Math.max(0, Math.floor((Date.now() - couple.anniversaryDate) / 86_400_000))
        : 0,
      momentCount: moments.length,
      toneCounts: counts,
      topTags: Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, count]) => ({ tag, count })),
      reviewCount: reviews.length,
      completedReviewCount: reviews.filter(
        (review) => review.status === "completed" || review.status === "shared",
      ).length,
    };
  },
});
