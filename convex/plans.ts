import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getCurrentAppUser } from "./auth";

const categoryValidator = v.union(
  v.literal("dinner"),
  v.literal("date"),
  v.literal("activity"),
  v.literal("weekend"),
);
const starterIdeas: Array<{
  title: string;
  description: string;
  category: "dinner" | "date" | "activity" | "weekend";
  costLevel: number;
  durationMinutes: number;
  vibeTags: string[];
}> = [
  {
    title: "Cozy dinner + bookstore walk",
    description:
      "Low-pressure dinner followed by browsing books and picking one thing for each other.",
    category: "dinner",
    costLevel: 2,
    durationMinutes: 120,
    vibeTags: ["cozy", "talking"],
  },
  {
    title: "Phone-free dessert date",
    description: "Go somewhere easy, keep phones away, and ask each other one real question.",
    category: "date",
    costLevel: 1,
    durationMinutes: 75,
    vibeTags: ["connection", "simple"],
  },
  {
    title: "Cook one new recipe together",
    description: "Pick something neither of you has made. One person leads, one person assists.",
    category: "activity",
    costLevel: 2,
    durationMinutes: 90,
    vibeTags: ["teamwork", "home"],
  },
  {
    title: "Lazy weekend reset",
    description: "Coffee, a short walk, one errand together, then protected downtime.",
    category: "weekend",
    costLevel: 1,
    durationMinutes: 180,
    vibeTags: ["calm", "reset"],
  },
];

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

export const list = query({
  args: {
    category: v.optional(categoryValidator),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const ideas = args.category
      ? await ctx.db
          .query("planIdeas")
          .withIndex("by_couple_and_category", (q) =>
            q.eq("coupleId", membership.coupleId).eq("category", args.category!),
          )
          .take(20)
      : await ctx.db
          .query("planIdeas")
          .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
          .order("desc")
          .take(20);
    const swipes = await ctx.db
      .query("planSwipes")
      .withIndex("by_user_and_idea", (q) => q.eq("userId", user._id))
      .collect();
    const voted = new Set(swipes.map((swipe) => swipe.ideaId));
    return ideas.filter((idea) => !voted.has(idea._id));
  },
});

export const matches = query({
  args: {},
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const matches = await ctx.db
      .query("planMatches")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .order("desc")
      .take(20);
    const rows = [];
    for (const match of matches) {
      const idea = await ctx.db.get(match.ideaId);
      if (idea) rows.push({ ...match, idea });
    }
    return rows;
  },
});

export const seed = mutation({
  args: {},
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const existing = await ctx.db
      .query("planIdeas")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .take(1);
    if (existing.length) return null;
    const now = Date.now();
    for (const idea of starterIdeas)
      await ctx.db.insert("planIdeas", { ...idea, coupleId: membership.coupleId, createdAt: now });
    return true;
  },
});

export const vote = mutation({
  args: {
    ideaId: v.id("planIdeas"),
    vote: v.union(v.literal("like"), v.literal("pass")),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const idea = await ctx.db.get(args.ideaId);
    if (!idea || idea.coupleId !== membership.coupleId) throw new Error("Idea unavailable.");
    const existing = await ctx.db
      .query("planSwipes")
      .withIndex("by_user_and_idea", (q) => q.eq("userId", user._id).eq("ideaId", args.ideaId))
      .first();
    if (existing) await ctx.db.patch(existing._id, { vote: args.vote, createdAt: Date.now() });
    else
      await ctx.db.insert("planSwipes", {
        coupleId: membership.coupleId,
        ideaId: args.ideaId,
        userId: user._id,
        vote: args.vote,
        createdAt: Date.now(),
      });

    if (args.vote === "like") {
      const likes = await ctx.db
        .query("planSwipes")
        .withIndex("by_idea", (q) => q.eq("ideaId", args.ideaId))
        .collect()
        .then((items) => items.filter((item) => item.vote === "like"));
      const existingMatch = await ctx.db
        .query("planMatches")
        .withIndex("by_idea", (q) => q.eq("ideaId", args.ideaId))
        .first();
      if (likes.length >= 2 && !existingMatch)
        return await ctx.db.insert("planMatches", {
          coupleId: membership.coupleId,
          ideaId: args.ideaId,
          createdAt: Date.now(),
          status: "matched",
        });
    }
    return null;
  },
});
