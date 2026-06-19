import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

function createSessionToken(): string {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

async function requireUserBySession(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users"> | undefined,
  sessionToken: string | undefined,
) {
  if (!userId || !sessionToken) return null;
  const user = await ctx.db.get(userId);
  if (!user || user.sessionToken !== sessionToken) return null;
  return user;
}

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
    const sessionToken = createSessionToken();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_apple_subject", (q) => q.eq("appleSubject", args.appleSubject))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email ?? existing.email,
        fullName: args.fullName ?? existing.fullName,
        sessionToken,
        updatedAt: now,
      });
      return { userId: existing._id, sessionToken };
    }

    const userId = await ctx.db.insert("users", {
      appleSubject: args.appleSubject,
      email: args.email,
      fullName: args.fullName,
      sessionToken,
      createdAt: now,
      updatedAt: now,
    });

    return { userId, sessionToken };
  },
});

export const viewer = query({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUserBySession(ctx, args.userId, args.sessionToken);
    if (!user || !args.userId) return null;

    const membership = await ctx.db
      .query("coupleMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId!))
      .first();

    const couple = membership ? await ctx.db.get(membership.coupleId) : null;
    const members = membership
      ? await ctx.db
          .query("coupleMembers")
          .withIndex("by_couple", (q) => q.eq("coupleId", membership.coupleId))
          .collect()
      : [];
    const activePairingCode = membership
      ? await ctx.db
          .query("pairingCodes")
          .withIndex("by_couple", (q) => q.eq("coupleId", membership.coupleId))
          .collect()
          .then(
            (codes) =>
              codes
                .filter((code) => !code.usedAt && code.expiresAt > Date.now())
                .sort((a, b) => b.createdAt - a.createdAt)[0],
          )
      : null;

    return {
      user,
      membership,
      couple,
      memberCount: members.length,
      activePairingCode: activePairingCode
        ? `${activePairingCode.code.slice(0, 3)}-${activePairingCode.code.slice(3)}`
        : null,
    };
  },
});
