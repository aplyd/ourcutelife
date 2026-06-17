import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    appleSubject: v.string(),
    email: v.optional(v.string()),
    fullName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_apple_subject", ["appleSubject"]),
  couples: defineTable({
    name: v.string(),
    memberIds: v.array(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  journalEntries: defineTable({
    coupleId: v.id("couples"),
    authorId: v.id("users"),
    body: v.string(),
    mood: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_couple", ["coupleId"]),
});
