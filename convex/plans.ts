import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getCurrentAppUser } from "./auth";

const categoryValidator = v.union(
  v.literal("food"),
  v.literal("drinks"),
  v.literal("entertainment"),
  v.literal("activity"),
  v.literal("intimacy"),
);

type PlanCategory = "food" | "drinks" | "entertainment" | "activity" | "intimacy";

const starterIdeas: Array<{
  title: string;
  description: string;
  category: PlanCategory;
  costLevel: number;
  durationMinutes: number;
  subcategories: string[];
}> = [
  {
    title: "Cozy dinner + bookstore walk",
    description:
      "Low-pressure dinner followed by browsing books and picking one thing for each other.",
    category: "food",
    costLevel: 2,
    durationMinutes: 120,
    subcategories: ["cozy", "talking"],
  },
  {
    title: "Phone-free cocktails or mocktails",
    description: "Go somewhere easy, keep phones away, and ask each other one real question.",
    category: "drinks",
    costLevel: 2,
    durationMinutes: 75,
    subcategories: ["connection", "low-key"],
  },
  {
    title: "Pick a movie neither of you would normally choose",
    description: "Make snacks, commit to the bit, and rate it together after.",
    category: "entertainment",
    costLevel: 1,
    durationMinutes: 140,
    subcategories: ["home", "playful"],
  },
  {
    title: "Cook one new recipe together",
    description: "Pick something neither of you has made. One person leads, one person assists.",
    category: "activity",
    costLevel: 2,
    durationMinutes: 90,
    subcategories: ["teamwork", "home"],
  },
  {
    title: "Protected intimacy night",
    description: "No phones, no chores, no rushing. Just protected attention and affection.",
    category: "intimacy",
    costLevel: 0,
    durationMinutes: 90,
    subcategories: ["affection", "private"],
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

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))).slice(
    0,
    8,
  );
}

function publicIdea(idea: any, revealCreator: boolean) {
  const subcategories = idea.subcategories ?? idea.vibeTags ?? [];
  return {
    _id: idea._id,
    _creationTime: idea._creationTime,
    coupleId: idea.coupleId,
    title: idea.title,
    description: idea.description,
    category: idea.category,
    costLevel: idea.costLevel,
    durationMinutes: idea.durationMinutes,
    subcategories,
    vibeTags: subcategories,
    createdAt: idea.createdAt,
    createdByUserId: revealCreator ? (idea.createdByUserId ?? null) : null,
  };
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
          .take(50)
      : await ctx.db
          .query("planIdeas")
          .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
          .order("desc")
          .take(50);
    const swipes = await ctx.db
      .query("planSwipes")
      .withIndex("by_user_and_idea", (q) => q.eq("userId", user._id))
      .collect();
    const voted = new Set(swipes.map((swipe) => swipe.ideaId));
    const archivedMatches = await ctx.db
      .query("planMatches")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .collect();
    const archivedIdeaIds = new Set(
      archivedMatches.filter((match) => match.status === "archived").map((match) => match.ideaId),
    );
    return ideas
      .filter((idea) => !voted.has(idea._id) && !archivedIdeaIds.has(idea._id))
      .map((idea) => publicIdea(idea, false));
  },
});

export const randomByCategories = query({
  args: {
    categories: v.array(categoryValidator),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireSession(ctx);
    const categories = Array.from(new Set(args.categories));
    const rows = [];
    for (const category of categories) {
      const ideas = await ctx.db
        .query("planIdeas")
        .withIndex("by_couple_and_category", (q) =>
          q.eq("coupleId", membership.coupleId).eq("category", category),
        )
        .collect();
      if (ideas.length)
        rows.push(publicIdea(ideas[Math.floor(Math.random() * ideas.length)], false));
    }
    return rows;
  },
});

export const matches = query({
  args: {
    category: v.optional(categoryValidator),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireSession(ctx);
    const matches = await ctx.db
      .query("planMatches")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .order("desc")
      .take(50);
    const rows = [];
    for (const match of matches) {
      const idea = await ctx.db.get(match.ideaId);
      if (
        idea &&
        match.status !== "archived" &&
        (!args.category || idea.category === args.category)
      ) {
        const votes = await ctx.db
          .query("planArchiveVotes")
          .withIndex("by_match", (q) => q.eq("matchId", match._id))
          .collect();
        rows.push({ ...match, archiveVoteCount: votes.length, idea: publicIdea(idea, true) });
      }
    }
    return rows;
  },
});

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const { membership } = await requireSession(ctx);
    const existing = await ctx.db
      .query("planIdeas")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .collect();
    const existingTitles = new Set(existing.map((idea) => idea.title));
    const now = Date.now();
    let inserted = 0;
    for (const idea of starterIdeas) {
      if (existingTitles.has(idea.title)) continue;
      await ctx.db.insert("planIdeas", {
        ...idea,
        vibeTags: idea.subcategories,
        coupleId: membership.coupleId,
        createdAt: now,
      });
      inserted += 1;
    }
    return inserted > 0;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    category: categoryValidator,
    subcategories: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const title = args.title.trim();
    const description = args.description.trim();
    if (!title) throw new Error("Add a title before saving.");
    if (!description) throw new Error("Add a description before saving.");
    const subcategories = normalizeTags(args.subcategories);
    return await ctx.db.insert("planIdeas", {
      coupleId: membership.coupleId,
      createdByUserId: user._id,
      title,
      description,
      category: args.category,
      costLevel: 1,
      durationMinutes: 60,
      subcategories,
      vibeTags: subcategories,
      createdAt: Date.now(),
    });
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

export const randomMatchesByCategories = query({
  args: {
    categories: v.array(categoryValidator),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireSession(ctx);
    const categories = Array.from(new Set(args.categories));
    const matches = await ctx.db
      .query("planMatches")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .collect();
    const rows = [];
    for (const category of categories) {
      const categoryMatches = [];
      for (const match of matches.filter((item) => item.status !== "archived")) {
        const idea = await ctx.db.get(match.ideaId);
        if (idea?.category === category)
          categoryMatches.push({ ...match, idea: publicIdea(idea, true) });
      }
      if (categoryMatches.length)
        rows.push(categoryMatches[Math.floor(Math.random() * categoryMatches.length)]);
    }
    return rows;
  },
});

export const voteArchive = mutation({
  args: {
    matchId: v.id("planMatches"),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const match = await ctx.db.get(args.matchId);
    if (!match || match.coupleId !== membership.coupleId || match.status === "archived")
      throw new Error("Match unavailable.");
    const existing = await ctx.db
      .query("planArchiveVotes")
      .withIndex("by_user_and_match", (q) => q.eq("userId", user._id).eq("matchId", args.matchId))
      .first();
    if (!existing) {
      await ctx.db.insert("planArchiveVotes", {
        coupleId: membership.coupleId,
        matchId: args.matchId,
        userId: user._id,
        vote: "archive",
        createdAt: Date.now(),
      });
    }
    const votes = await ctx.db
      .query("planArchiveVotes")
      .withIndex("by_match", (q) => q.eq("matchId", args.matchId))
      .collect();
    const memberCount = await ctx.db
      .query("coupleMembers")
      .withIndex("by_couple", (q) => q.eq("coupleId", membership.coupleId))
      .collect()
      .then((members) => members.length);
    if (votes.length >= memberCount) {
      await ctx.db.patch(args.matchId, { status: "archived", archivedAt: Date.now() });
    }
    return votes.length;
  },
});
