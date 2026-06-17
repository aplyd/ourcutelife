import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const signInWithApple = mutation({
  args: {
    appleSubject: v.string(),
    email: v.optional(v.string()),
    fullName: v.optional(v.string()),
    identityToken: v.string(),
  },
  handler: async (ctx, args) => {
    // TODO: Verify identityToken server-side against Apple's JWKS before production launch.
    // Expo gives the client token; Convex must own the trusted user record.
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_apple_subject", (q) => q.eq("appleSubject", args.appleSubject))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email ?? existing.email,
        fullName: args.fullName ?? existing.fullName,
        updatedAt: now,
      });
      return { userId: existing._id };
    }

    const userId = await ctx.db.insert("users", {
      appleSubject: args.appleSubject,
      email: args.email,
      fullName: args.fullName,
      createdAt: now,
      updatedAt: now,
    });

    return { userId };
  },
});
