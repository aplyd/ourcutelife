import { ConvexError, v } from "convex/values";

import { internalMutation } from "./_generated/server";

const dispatchStartResultValidator = v.object({
  disposition: v.union(
    v.literal("started"),
    v.literal("already_started"),
    v.literal("already_finalized"),
  ),
  status: v.literal("sending_unknown"),
});

export const startDailyPromptDeliveryDispatch = internalMutation({
  args: {
    attemptId: v.id("dailyPromptDeliveryAttempts"),
    nowMs: v.number(),
  },
  returns: dispatchStartResultValidator,
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new ConvexError("Delivery attempt not found");
    if (!Number.isFinite(args.nowMs) || args.nowMs < attempt.updatedAt) {
      throw new ConvexError("Invalid delivery dispatch timestamp");
    }
    if (attempt.status === "sending_unknown") {
      return {
        disposition:
          attempt.dispatchStartedAt !== undefined && attempt.outcomePersistedAt === undefined
            ? ("already_started" as const)
            : ("already_finalized" as const),
        status: "sending_unknown" as const,
      };
    }
    if (attempt.status !== "reserved") {
      throw new ConvexError("Delivery attempt is already finalized");
    }

    const attemptsForKey = await ctx.db
      .query("dailyPromptDeliveryAttempts")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", attempt.idempotencyKey))
      .take(2);
    const lifecycle = await ctx.db.get(attempt.lifecycleId);
    if (
      attemptsForKey.length !== 1 ||
      attemptsForKey[0]._id !== attempt._id ||
      !lifecycle ||
      lifecycle.coupleId !== attempt.coupleId ||
      lifecycle.promptDate !== attempt.promptDate ||
      (attempt.step === "first" ? lifecycle.firstUserId : lifecycle.secondUserId) !==
        attempt.recipientUserId ||
      (attempt.step === "first" ? lifecycle.firstStatus : lifecycle.secondStatus) !== "sending"
    ) {
      throw new ConvexError("Delivery attempt does not match a sending lifecycle step");
    }

    await ctx.db.patch(attempt._id, {
      status: "sending_unknown",
      dispatchStartedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { disposition: "started" as const, status: "sending_unknown" as const };
  },
});
