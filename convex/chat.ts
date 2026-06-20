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

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { membership } = await requireSession(ctx);
    const messages = await ctx.db
      .query("coupleChatMessages")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .order("desc")
      .take(80);
    return messages.reverse();
  },
});

export const send = mutation({
  args: {
    text: v.string(),
    asCoachPrompt: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const text = args.text.trim();
    if (!text) throw new Error("Write a message first.");
    const now = Date.now();
    const messageId = await ctx.db.insert("coupleChatMessages", {
      coupleId: membership.coupleId,
      senderKind: "user",
      senderUserId: user._id,
      text,
      createdAt: now,
    });

    if (args.asCoachPrompt) {
      await ctx.db.insert("coupleChatMessages", {
        coupleId: membership.coupleId,
        senderKind: "ai",
        text:
          "Coach note: I’m invoked-only right now. Soon I’ll help rephrase, unpack patterns, and suggest a safer next message before anything is shared.",
        createdAt: now + 1,
      });
    }

    return messageId;
  },
});
