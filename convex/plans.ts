import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
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
const kindValidator = v.union(v.literal("activity"), v.literal("place"));
const dateSortValidator = v.union(
  v.literal("suggested"),
  v.literal("popular"),
  v.literal("rating"),
  v.literal("trending"),
);

type PlanCategory = "food" | "drinks" | "entertainment" | "activity" | "intimacy";
type PlanKind = "activity" | "place";
type DateSort = "suggested" | "popular" | "rating" | "trending";

type PublicIdea = ReturnType<typeof publicIdea>;

type DatePlanWithState = Doc<"datePlans"> & {
  items: PublicIdea[];
  matchedItemCount: number;
  likedByViewer: boolean;
  likeCount: number;
  isSaved: boolean;
  savedStatus: "saved" | "scheduled" | "completed" | "archived" | null;
  scheduledFor: number | null;
  completedAt: number | null;
};

const starterIdeas: Array<{
  title: string;
  description: string;
  kind: PlanKind;
  category: PlanCategory;
  costLevel: number;
  durationMinutes: number;
  subcategories: string[];
}> = [
  {
    title: "Cozy dinner + bookstore walk",
    description:
      "Dinner somewhere low-pressure, then browse books and pick one thing for each other.",
    kind: "activity",
    category: "food",
    costLevel: 2,
    durationMinutes: 120,
    subcategories: ["cozy", "talking"],
  },
  {
    title: "Phone-free cocktails or mocktails",
    description: "Go somewhere easy, keep phones away, and ask each other one real question.",
    kind: "activity",
    category: "drinks",
    costLevel: 2,
    durationMinutes: 75,
    subcategories: ["connection", "low-key"],
  },
  {
    title: "Pick a movie neither of you would normally choose",
    description: "Make snacks, commit to the bit, and rate it together after.",
    kind: "activity",
    category: "entertainment",
    costLevel: 1,
    durationMinutes: 140,
    subcategories: ["home", "playful"],
  },
  {
    title: "Cook one new recipe together",
    description: "Pick something neither of you has made. One person leads, one person assists.",
    kind: "activity",
    category: "activity",
    costLevel: 2,
    durationMinutes: 90,
    subcategories: ["teamwork", "home"],
  },
  {
    title: "Protected intimacy night",
    description: "No phones, no chores, no rushing. Just protected attention and affection.",
    kind: "activity",
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

export const seedDemoPartnerData = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, membership } = await requireSession(ctx);
    const now = Date.now();
    const coupleId = membership.coupleId;

    const testAuthUserId = `test-partner:${user._id}`;
    let testUser = await ctx.db
      .query("users")
      .withIndex("by_auth_user_id", (q) => q.eq("authUserId", testAuthUserId))
      .first();
    if (!testUser) {
      const testUserId = await ctx.db.insert("users", {
        authUserId: testAuthUserId,
        email: "test-partner@ourcutelife.local",
        fullName: "Test Partner",
        createdAt: now,
        updatedAt: now,
      });
      testUser = await ctx.db.get(testUserId);
    }
    if (!testUser) throw new Error("Could not create test partner.");

    const existingTestMembership = await ctx.db
      .query("coupleMembers")
      .withIndex("by_couple_and_user", (q) => q.eq("coupleId", coupleId).eq("userId", testUser._id))
      .first();
    if (!existingTestMembership) {
      await ctx.db.insert("coupleMembers", {
        coupleId,
        userId: testUser._id,
        role: "partner",
        joinedAt: now,
      });
    }

    const demoIdeas: Array<{
      title: string;
      description: string;
      kind: PlanKind;
      category: PlanCategory;
      subcategories: string[];
      costLevel: number;
      durationMinutes: number;
    }> = [
      {
        title: "Gunther's Ice Cream",
        description: "Classic Sacramento ice cream stop.",
        kind: "place",
        category: "food",
        subcategories: ["ice cream", "classic"],
        costLevel: 1,
        durationMinutes: 45,
      },
      {
        title: "Dimple Records browsing",
        description: "Browse records and pick one album for each other.",
        kind: "place",
        category: "entertainment",
        subcategories: ["music", "browsing"],
        costLevel: 1,
        durationMinutes: 45,
      },
      {
        title: "Puzzle night at home",
        description: "Phones away, snacks out, puzzle on the table.",
        kind: "activity",
        category: "activity",
        subcategories: ["home", "cozy"],
        costLevel: 0,
        durationMinutes: 90,
      },
    ];

    const existingIdeas = await ctx.db
      .query("planIdeas")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", coupleId))
      .collect();
    const ideaIds = [];
    for (const idea of demoIdeas) {
      const existingIdea = existingIdeas.find((item) => item.title === idea.title);
      const ideaId =
        existingIdea?._id ??
        (await ctx.db.insert("planIdeas", {
          coupleId,
          ...idea,
          vibeTags: idea.subcategories,
          source: "seed",
          createdAt: now,
        }));
      ideaIds.push(ideaId);

      for (const memberUserId of [user._id, testUser._id]) {
        const existingSwipe = await ctx.db
          .query("planSwipes")
          .withIndex("by_user_and_idea", (q) => q.eq("userId", memberUserId).eq("ideaId", ideaId))
          .first();
        if (!existingSwipe) {
          await ctx.db.insert("planSwipes", {
            coupleId,
            ideaId,
            userId: memberUserId,
            vote: "like",
            createdAt: now,
          });
        }
      }

      const existingMatch = await ctx.db
        .query("planMatches")
        .withIndex("by_idea", (q) => q.eq("ideaId", ideaId))
        .first();
      if (!existingMatch) {
        await ctx.db.insert("planMatches", {
          coupleId,
          ideaId,
          createdAt: now,
          status: "matched",
        });
      }
    }

    const existingDates = await ctx.db
      .query("datePlans")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", coupleId))
      .collect();
    if (!existingDates.some((date) => date.title === "Gunther's → Dimple Records")) {
      await ctx.db.insert("datePlans", {
        coupleId,
        title: "Gunther's → Dimple Records",
        summary: "Ice cream first, then browse records and pick something weird for each other.",
        itemIds: ideaIds.slice(0, 2),
        freeformSteps: ["Get cones", "Browse one aisle each", "Trade one pick"],
        durationMinutes: 90,
        costLevel: 1,
        vibeTags: ["classic", "music", "low-key"],
        source: "seed",
        popularityScore: 8,
        trendingScore: 6,
        ratingAverage: 4,
        ratingCount: 2,
        createdAt: now,
      });
    }
    if (!existingDates.some((date) => date.title === "Gunther's to-go → puzzle night")) {
      await ctx.db.insert("datePlans", {
        coupleId,
        title: "Gunther's to-go → puzzle night",
        summary: "Grab ice cream, head home, and make the night intentionally cozy.",
        itemIds: [ideaIds[0], ideaIds[2]],
        freeformSteps: ["Pick up ice cream", "Put phones away", "Finish one puzzle section"],
        durationMinutes: 120,
        costLevel: 1,
        vibeTags: ["cozy", "home", "dessert"],
        source: "seed",
        popularityScore: 7,
        trendingScore: 7,
        ratingAverage: 4,
        ratingCount: 1,
        createdAt: now,
      });
    }

    return { ideaCount: ideaIds.length };
  },
});

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))).slice(
    0,
    8,
  );
}

function inferKind(idea: Doc<"planIdeas">): PlanKind {
  if (idea.kind) return idea.kind;
  return idea.latitude || idea.longitude || idea.address || idea.source === "osm"
    ? "place"
    : "activity";
}

function publicIdea(idea: Doc<"planIdeas">, revealCreator: boolean) {
  const subcategories = idea.subcategories ?? idea.vibeTags ?? [];
  return {
    _id: idea._id,
    _creationTime: idea._creationTime,
    coupleId: idea.coupleId,
    title: idea.title,
    description: idea.description,
    kind: inferKind(idea),
    category: idea.category,
    costLevel: idea.costLevel,
    durationMinutes: idea.durationMinutes,
    subcategories,
    vibeTags: subcategories,
    createdAt: idea.createdAt,
    source: idea.source ?? null,
    sourceUrl: idea.sourceUrl ?? null,
    photoUrl: idea.photoUrl ?? null,
    latitude: idea.latitude ?? null,
    longitude: idea.longitude ?? null,
    address: idea.address ?? null,
    createdByUserId: revealCreator ? (idea.createdByUserId ?? null) : null,
  };
}

async function matchedIdeaIds(ctx: QueryCtx, coupleId: Id<"couples">) {
  const matches = await ctx.db
    .query("planMatches")
    .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", coupleId))
    .order("desc")
    .take(100);
  return new Set(
    matches.filter((match) => match.status !== "archived").map((match) => match.ideaId),
  );
}

async function decorateDatePlan(
  ctx: QueryCtx,
  plan: Doc<"datePlans">,
  viewerUserId: Id<"users">,
  matchedIds: Set<Id<"planIdeas">>,
): Promise<DatePlanWithState> {
  const items = [];
  for (const itemId of plan.itemIds.slice(0, 8)) {
    const idea = await ctx.db.get(itemId);
    if (idea) items.push(publicIdea(idea, true));
  }
  const likes = await ctx.db
    .query("datePlanLikes")
    .withIndex("by_date_plan", (q) => q.eq("datePlanId", plan._id))
    .take(10);
  const saved = await ctx.db
    .query("savedDatePlans")
    .withIndex("by_date_plan", (q) => q.eq("datePlanId", plan._id))
    .first();
  return {
    ...plan,
    items,
    matchedItemCount: plan.itemIds.filter((id) => matchedIds.has(id)).length,
    likedByViewer: likes.some((like) => like.userId === viewerUserId),
    likeCount: likes.length,
    isSaved: Boolean(saved && saved.status !== "archived"),
    savedStatus: saved?.status ?? null,
    scheduledFor: saved?.scheduledFor ?? null,
    completedAt: saved?.completedAt ?? null,
  };
}

async function ensureDateForIdea(ctx: MutationCtx, idea: Doc<"planIdeas">) {
  const existing = await ctx.db
    .query("datePlans")
    .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", idea.coupleId))
    .take(100);
  if (existing.some((plan) => plan.itemIds.length === 1 && plan.itemIds[0] === idea._id)) return;
  const isPlace = inferKind(idea) === "place";
  await ctx.db.insert("datePlans", {
    coupleId: idea.coupleId,
    title: isPlace ? `${idea.title} date` : idea.title,
    summary: isPlace
      ? `Start with ${idea.title}, then add one easy nearby or at-home follow-up.`
      : idea.description,
    itemIds: [idea._id],
    freeformSteps: isPlace ? ["Add an easy second stop", "Leave room to bail or extend"] : [],
    durationMinutes: Math.max(idea.durationMinutes, 60),
    costLevel: idea.costLevel,
    vibeTags: normalizeTags([...(idea.subcategories ?? []), ...(idea.vibeTags ?? [])]),
    source: "suggested",
    popularityScore: 1,
    trendingScore: 1,
    ratingCount: 0,
    createdAt: Date.now(),
  });
}

async function ensureDateForPair(
  ctx: MutationCtx,
  first: Doc<"planIdeas">,
  second: Doc<"planIdeas">,
) {
  if (first._id === second._id || first.coupleId !== second.coupleId) return;
  const itemIds = [first._id, second._id].sort() as Array<Id<"planIdeas">>;
  const existing = await ctx.db
    .query("datePlans")
    .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", first.coupleId))
    .take(100);
  if (
    existing.some(
      (plan) =>
        plan.itemIds.length === 2 &&
        [...plan.itemIds].sort().every((itemId, index) => itemId === itemIds[index]),
    )
  )
    return;
  const firstIsPlace = inferKind(first) === "place";
  const secondIsPlace = inferKind(second) === "place";
  const title =
    firstIsPlace && !secondIsPlace
      ? `${first.title} → ${second.title}`
      : `${second.title} → ${first.title}`;
  await ctx.db.insert("datePlans", {
    coupleId: first.coupleId,
    title,
    summary: `A lightweight date built from two mutual yeses: ${first.title} and ${second.title}.`,
    itemIds,
    freeformSteps: ["Keep it flexible", "Save the best part for last"],
    durationMinutes: Math.max(60, Math.min(first.durationMinutes + second.durationMinutes, 240)),
    costLevel: Math.max(first.costLevel, second.costLevel),
    vibeTags: normalizeTags([
      ...(first.subcategories ?? []),
      ...(first.vibeTags ?? []),
      ...(second.subcategories ?? []),
      ...(second.vibeTags ?? []),
    ]),
    source: "suggested",
    popularityScore: 2,
    trendingScore: 2,
    ratingCount: 0,
    createdAt: Date.now(),
  });
}

export const list = query({
  args: { category: v.optional(categoryValidator) },
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
      .take(100);
    const archivedIdeaIds = new Set(
      archivedMatches.filter((match) => match.status === "archived").map((match) => match.ideaId),
    );
    return ideas
      .filter((idea) => !voted.has(idea._id) && !archivedIdeaIds.has(idea._id))
      .map((idea) => publicIdea(idea, false));
  },
});

export const matches = query({
  args: { category: v.optional(categoryValidator) },
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
          .take(5);
        rows.push({ ...match, archiveVoteCount: votes.length, idea: publicIdea(idea, true) });
      }
    }
    return rows;
  },
});

export const dateRecommendationsForIdea = query({
  args: { ideaId: v.id("planIdeas") },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const matchedIds = await matchedIdeaIds(ctx, membership.coupleId);
    const plans = await ctx.db
      .query("datePlans")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .order("desc")
      .take(60);
    const relevant = plans.filter((plan) => plan.itemIds.includes(args.ideaId)).slice(0, 10);
    return Promise.all(relevant.map((plan) => decorateDatePlan(ctx, plan, user._id, matchedIds)));
  },
});

export const dateLeaderboard = query({
  args: { sort: dateSortValidator },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const matchedIds = await matchedIdeaIds(ctx, membership.coupleId);
    const plans = await ctx.db
      .query("datePlans")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .order("desc")
      .take(100);
    const decorated = await Promise.all(
      plans.map((plan) => decorateDatePlan(ctx, plan, user._id, matchedIds)),
    );
    return decorated.sort((a, b) => scoreDate(b, args.sort) - scoreDate(a, args.sort)).slice(0, 30);
  },
});

function scoreDate(plan: DatePlanWithState, sort: DateSort) {
  if (sort === "popular") return plan.popularityScore + plan.likeCount + (plan.isSaved ? 3 : 0);
  if (sort === "rating") return (plan.ratingAverage ?? 0) * 10 + plan.ratingCount;
  if (sort === "trending") return plan.trendingScore + plan.likeCount * 2;
  return (
    plan.matchedItemCount * 100 +
    plan.likeCount * 10 +
    plan.popularityScore +
    (plan.ratingAverage ?? 0)
  );
}

export const ourDates = query({
  args: {},
  handler: async (ctx) => {
    const { user, membership } = await requireSession(ctx);
    const matchedIds = await matchedIdeaIds(ctx, membership.coupleId);
    const saved = await ctx.db
      .query("savedDatePlans")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .order("desc")
      .take(50);
    const rows = [];
    for (const savedDate of saved.filter((item) => item.status !== "archived")) {
      const plan = await ctx.db.get(savedDate.datePlanId);
      if (plan) rows.push(await decorateDatePlan(ctx, plan, user._id, matchedIds));
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
      .take(100);
    const existingTitles = new Set(existing.map((idea) => idea.title));
    const now = Date.now();
    let inserted = 0;
    for (const idea of starterIdeas) {
      if (existingTitles.has(idea.title)) continue;
      await ctx.db.insert("planIdeas", {
        ...idea,
        vibeTags: idea.subcategories,
        source: "seed",
        coupleId: membership.coupleId,
        createdAt: now,
      });
      inserted += 1;
    }

    const matches = await ctx.db
      .query("planMatches")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .order("desc")
      .take(20);
    const matchedIdeas = [];
    for (const match of matches.filter((item) => item.status !== "archived")) {
      const idea = await ctx.db.get(match.ideaId);
      if (idea) {
        matchedIdeas.push(idea);
        await ensureDateForIdea(ctx, idea);
      }
    }
    for (let index = 0; index < matchedIdeas.length - 1 && index < 8; index += 1) {
      await ensureDateForPair(ctx, matchedIdeas[index], matchedIdeas[index + 1]);
    }
    return inserted > 0 || matchedIdeas.length > 0;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    kind: v.optional(kindValidator),
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
      kind: args.kind ?? "activity",
      category: args.category,
      costLevel: 1,
      durationMinutes: 60,
      subcategories,
      vibeTags: subcategories,
      source: "manual",
      createdAt: Date.now(),
    });
  },
});

export const vote = mutation({
  args: { ideaId: v.id("planIdeas"), vote: v.union(v.literal("like"), v.literal("pass")) },
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
      const likes = (
        await ctx.db
          .query("planSwipes")
          .withIndex("by_idea", (q) => q.eq("ideaId", args.ideaId))
          .take(10)
      ).filter((item) => item.vote === "like");
      const existingMatch = await ctx.db
        .query("planMatches")
        .withIndex("by_idea", (q) => q.eq("ideaId", args.ideaId))
        .first();
      if (likes.length >= 2 && !existingMatch) {
        const matchId = await ctx.db.insert("planMatches", {
          coupleId: membership.coupleId,
          ideaId: args.ideaId,
          createdAt: Date.now(),
          status: "matched",
        });
        await ensureDateForIdea(ctx, idea);
        const priorMatches = await ctx.db
          .query("planMatches")
          .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
          .order("desc")
          .take(6);
        for (const priorMatch of priorMatches) {
          if (priorMatch.ideaId === args.ideaId || priorMatch.status === "archived") continue;
          const priorIdea = await ctx.db.get(priorMatch.ideaId);
          if (priorIdea) {
            await ensureDateForPair(ctx, idea, priorIdea);
            break;
          }
        }
        return matchId;
      }
    }
    return null;
  },
});

export const randomByCategories = query({
  args: { categories: v.array(categoryValidator) },
  handler: async (ctx, args) => {
    const { membership } = await requireSession(ctx);
    const rows = [];
    for (const category of Array.from(new Set(args.categories))) {
      const ideas = await ctx.db
        .query("planIdeas")
        .withIndex("by_couple_and_category", (q) =>
          q.eq("coupleId", membership.coupleId).eq("category", category),
        )
        .take(50);
      if (ideas.length)
        rows.push(publicIdea(ideas[Math.floor(Math.random() * ideas.length)], false));
    }
    return rows;
  },
});

export const randomMatchesByCategories = query({
  args: { categories: v.array(categoryValidator) },
  handler: async (ctx, args) => {
    const { membership } = await requireSession(ctx);
    const categories = Array.from(new Set(args.categories));
    const matches = await ctx.db
      .query("planMatches")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .take(100);
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

export const likeDate = mutation({
  args: { datePlanId: v.id("datePlans") },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const plan = await ctx.db.get(args.datePlanId);
    if (!plan || plan.coupleId !== membership.coupleId) throw new Error("Date unavailable.");
    const existing = await ctx.db
      .query("datePlanLikes")
      .withIndex("by_user_and_date_plan", (q) =>
        q.eq("userId", user._id).eq("datePlanId", args.datePlanId),
      )
      .first();
    if (!existing)
      await ctx.db.insert("datePlanLikes", {
        coupleId: membership.coupleId,
        datePlanId: args.datePlanId,
        userId: user._id,
        createdAt: Date.now(),
      });
    const likes = await ctx.db
      .query("datePlanLikes")
      .withIndex("by_date_plan", (q) => q.eq("datePlanId", args.datePlanId))
      .take(10);
    const memberCount = (
      await ctx.db
        .query("coupleMembers")
        .withIndex("by_couple", (q) => q.eq("coupleId", membership.coupleId))
        .take(4)
    ).length;
    if (likes.length >= memberCount)
      await saveDatePlan(ctx, membership.coupleId, args.datePlanId, user._id);
    await ctx.db.patch(args.datePlanId, { trendingScore: plan.trendingScore + 1 });
    return likes.length;
  },
});

async function saveDatePlan(
  ctx: MutationCtx,
  coupleId: Id<"couples">,
  datePlanId: Id<"datePlans">,
  userId: Id<"users">,
) {
  const existing = await ctx.db
    .query("savedDatePlans")
    .withIndex("by_date_plan", (q) => q.eq("datePlanId", datePlanId))
    .first();
  const now = Date.now();
  if (existing) {
    if (existing.status === "archived")
      await ctx.db.patch(existing._id, { status: "saved", updatedAt: now });
    return existing._id;
  }
  return await ctx.db.insert("savedDatePlans", {
    coupleId,
    datePlanId,
    savedByUserId: userId,
    status: "saved",
    createdAt: now,
    updatedAt: now,
  });
}

export const saveDate = mutation({
  args: { datePlanId: v.id("datePlans") },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const plan = await ctx.db.get(args.datePlanId);
    if (!plan || plan.coupleId !== membership.coupleId) throw new Error("Date unavailable.");
    await saveDatePlan(ctx, membership.coupleId, args.datePlanId, user._id);
    await ctx.db.patch(args.datePlanId, {
      popularityScore: plan.popularityScore + 1,
      trendingScore: plan.trendingScore + 2,
    });
    return true;
  },
});

export const scheduleDate = mutation({
  args: { datePlanId: v.id("datePlans"), scheduledFor: v.number() },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const plan = await ctx.db.get(args.datePlanId);
    if (!plan || plan.coupleId !== membership.coupleId) throw new Error("Date unavailable.");
    const savedId = await saveDatePlan(ctx, membership.coupleId, args.datePlanId, user._id);
    await ctx.db.patch(savedId, {
      status: "scheduled",
      scheduledFor: args.scheduledFor,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const completeDate = mutation({
  args: { datePlanId: v.id("datePlans") },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const plan = await ctx.db.get(args.datePlanId);
    if (!plan || plan.coupleId !== membership.coupleId) throw new Error("Date unavailable.");
    const savedId = await saveDatePlan(ctx, membership.coupleId, args.datePlanId, user._id);
    await ctx.db.patch(savedId, {
      status: "completed",
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(args.datePlanId, {
      popularityScore: plan.popularityScore + 3,
      trendingScore: plan.trendingScore + 3,
    });
    return true;
  },
});

export const rateDate = mutation({
  args: { datePlanId: v.id("datePlans"), rating: v.number(), tags: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    if (args.rating < 1 || args.rating > 4) throw new Error("Rating must be 1-4.");
    const plan = await ctx.db.get(args.datePlanId);
    if (!plan || plan.coupleId !== membership.coupleId) throw new Error("Date unavailable.");
    const existing = await ctx.db
      .query("datePlanRatings")
      .withIndex("by_user_and_date_plan", (q) =>
        q.eq("userId", user._id).eq("datePlanId", args.datePlanId),
      )
      .first();
    if (existing)
      await ctx.db.patch(existing._id, {
        rating: args.rating,
        tags: normalizeTags(args.tags),
        createdAt: Date.now(),
      });
    else
      await ctx.db.insert("datePlanRatings", {
        coupleId: membership.coupleId,
        datePlanId: args.datePlanId,
        userId: user._id,
        rating: args.rating,
        tags: normalizeTags(args.tags),
        createdAt: Date.now(),
      });
    const ratings = await ctx.db
      .query("datePlanRatings")
      .withIndex("by_date_plan", (q) => q.eq("datePlanId", args.datePlanId))
      .take(20);
    const average =
      ratings.reduce((sum, rating) => sum + rating.rating, 0) / Math.max(ratings.length, 1);
    await ctx.db.patch(args.datePlanId, { ratingAverage: average, ratingCount: ratings.length });
    return true;
  },
});

export const voteArchive = mutation({
  args: { matchId: v.id("planMatches") },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const match = await ctx.db.get(args.matchId);
    if (!match || match.coupleId !== membership.coupleId || match.status === "archived")
      throw new Error("Match unavailable.");
    const existing = await ctx.db
      .query("planArchiveVotes")
      .withIndex("by_user_and_match", (q) => q.eq("userId", user._id).eq("matchId", args.matchId))
      .first();
    if (!existing)
      await ctx.db.insert("planArchiveVotes", {
        coupleId: membership.coupleId,
        matchId: args.matchId,
        userId: user._id,
        vote: "archive",
        createdAt: Date.now(),
      });
    const votes = await ctx.db
      .query("planArchiveVotes")
      .withIndex("by_match", (q) => q.eq("matchId", args.matchId))
      .take(5);
    const memberCount = (
      await ctx.db
        .query("coupleMembers")
        .withIndex("by_couple", (q) => q.eq("coupleId", membership.coupleId))
        .take(4)
    ).length;
    if (votes.length >= memberCount)
      await ctx.db.patch(args.matchId, { status: "archived", archivedAt: Date.now() });
    return votes.length;
  },
});
