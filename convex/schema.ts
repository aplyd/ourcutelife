import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    authUserId: v.string(),
    email: v.optional(v.string()),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_auth_user_id", ["authUserId"]),
  couples: defineTable({
    name: v.string(),
    anniversaryDate: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  coupleMembers: defineTable({
    coupleId: v.id("couples"),
    userId: v.id("users"),
    role: v.literal("partner"),
    joinedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_couple", ["coupleId"])
    .index("by_couple_and_user", ["coupleId", "userId"]),
  pairingCodes: defineTable({
    coupleId: v.id("couples"),
    code: v.string(),
    createdByUserId: v.id("users"),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    usedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_couple", ["coupleId"]),
  moments: defineTable({
    coupleId: v.id("couples"),
    authorUserId: v.id("users"),
    happenedAt: v.number(),
    createdAt: v.number(),
    summary: v.string(),
    feeling: v.string(),
    tone: v.union(v.literal("good"), v.literal("bad"), v.literal("mixed")),
    partnerCouldDo: v.optional(v.string()),
    authorCouldDo: v.optional(v.string()),
    tags: v.array(v.string()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_couple_and_author_and_happened_at", ["coupleId", "authorUserId", "happenedAt"])
    .index("by_couple_and_happened_at", ["coupleId", "happenedAt"]),
  monthlyReviews: defineTable({
    coupleId: v.id("couples"),
    ownerUserId: v.id("users"),
    month: v.string(),
    status: v.union(v.literal("draft"), v.literal("shared"), v.literal("completed")),
    generatedAt: v.number(),
    summary: v.string(),
    highlights: v.array(v.string()),
    patterns: v.array(v.string()),
    questions: v.array(v.string()),
    ownerWorkOns: v.array(v.string()),
    partnerRequests: v.array(v.string()),
    agreements: v.array(v.string()),
    sharedAt: v.optional(v.number()),
  })
    .index("by_owner_and_month", ["ownerUserId", "month"])
    .index("by_couple_and_month", ["coupleId", "month"]),
  coupleChatMessages: defineTable({
    coupleId: v.id("couples"),
    senderKind: v.union(v.literal("ai"), v.literal("user")),
    senderUserId: v.optional(v.id("users")),
    text: v.string(),
    createdAt: v.number(),
    relatedReviewId: v.optional(v.id("monthlyReviews")),
  }).index("by_couple_and_created_at", ["coupleId", "createdAt"]),
  promptResponses: defineTable({
    coupleId: v.id("couples"),
    userId: v.id("users"),
    promptDate: v.string(),
    prompt: v.string(),
    response: v.string(),
    createdAt: v.number(),
  })
    .index("by_user_and_date", ["userId", "promptDate"])
    .index("by_couple_and_date", ["coupleId", "promptDate"]),
  planIdeas: defineTable({
    coupleId: v.id("couples"),
    createdByUserId: v.optional(v.id("users")),
    title: v.string(),
    description: v.string(),
    category: v.union(
      v.literal("food"),
      v.literal("drinks"),
      v.literal("entertainment"),
      v.literal("activity"),
      v.literal("intimacy"),
      v.literal("dinner"),
      v.literal("date"),
      v.literal("weekend"),
    ),
    costLevel: v.number(),
    durationMinutes: v.number(),
    subcategories: v.optional(v.array(v.string())),
    vibeTags: v.array(v.string()),
    source: v.optional(
      v.union(v.literal("manual"), v.literal("seed"), v.literal("osm"), v.literal("ai")),
    ),
    externalId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    address: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_couple_and_created_at", ["coupleId", "createdAt"])
    .index("by_couple_and_category", ["coupleId", "category"])
    .index("by_couple_and_external_id", ["coupleId", "externalId"]),
  planSwipes: defineTable({
    coupleId: v.id("couples"),
    ideaId: v.id("planIdeas"),
    userId: v.id("users"),
    vote: v.union(v.literal("like"), v.literal("pass")),
    createdAt: v.number(),
  })
    .index("by_user_and_idea", ["userId", "ideaId"])
    .index("by_idea", ["ideaId"]),
  planMatches: defineTable({
    coupleId: v.id("couples"),
    ideaId: v.id("planIdeas"),
    createdAt: v.number(),
    status: v.union(
      v.literal("matched"),
      v.literal("planned"),
      v.literal("done"),
      v.literal("archived"),
    ),
    archivedAt: v.optional(v.number()),
  })
    .index("by_couple_and_created_at", ["coupleId", "createdAt"])
    .index("by_idea", ["ideaId"]),
  planArchiveVotes: defineTable({
    coupleId: v.id("couples"),
    matchId: v.id("planMatches"),
    userId: v.id("users"),
    vote: v.literal("archive"),
    createdAt: v.number(),
  })
    .index("by_match", ["matchId"])
    .index("by_user_and_match", ["userId", "matchId"]),
});
