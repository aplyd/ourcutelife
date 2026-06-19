import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    appleSubject: v.string(),
    email: v.optional(v.string()),
    fullName: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_apple_subject", ["appleSubject"]),
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
  journalEntries: defineTable({
    coupleId: v.id("couples"),
    authorId: v.id("users"),
    body: v.string(),
    mood: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_couple", ["coupleId"]),
});
