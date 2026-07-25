import { ConvexError, v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { hashDailyPromptPushToken } from "./dailyPromptDeliveryToken";

const outcomeValidator = v.union(
  v.object({
    status: v.literal("provider_accepted"),
    expoTicketId: v.string(),
  }),
  v.object({
    status: v.literal("provider_rejected"),
    expoErrorCode: v.string(),
    disableDevice: v.boolean(),
  }),
  v.object({ status: v.literal("sending_unknown") }),
);

const persistedStatusValidator = v.union(
  v.literal("provider_accepted"),
  v.literal("provider_rejected"),
  v.literal("sending_unknown"),
);

const persistenceResultValidator = v.object({
  disposition: v.union(v.literal("persisted"), v.literal("already_persisted")),
  status: persistedStatusValidator,
});

export const persistDailyPromptDeliveryOutcome = internalMutation({
  args: {
    attemptId: v.id("dailyPromptDeliveryAttempts"),
    outcome: outcomeValidator,
    nowMs: v.number(),
  },
  returns: persistenceResultValidator,
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new ConvexError("Delivery attempt not found");
    if (attempt.status === "abandoned") {
      throw new ConvexError("Delivery attempt was abandoned before provider dispatch");
    }

    if (attempt.outcomePersistedAt !== undefined) {
      if (attempt.status === "reserved") {
        throw new ConvexError("Finalized delivery attempt has invalid status");
      }
      return {
        disposition: "already_persisted" as const,
        status: attempt.status,
      };
    }
    if (attempt.status === "provider_accepted" || attempt.status === "provider_rejected") {
      return { disposition: "already_persisted" as const, status: attempt.status };
    }
    if (attempt.status === "sending_unknown" && attempt.dispatchStartedAt === undefined) {
      return { disposition: "already_persisted" as const, status: "sending_unknown" as const };
    }
    if (attempt.status !== "sending_unknown" || attempt.dispatchStartedAt === undefined) {
      throw new ConvexError("Delivery dispatch has not started");
    }
    if (!Number.isFinite(args.nowMs) || args.nowMs < attempt.updatedAt) {
      throw new ConvexError("Invalid delivery outcome timestamp");
    }

    const attemptsForKey = await ctx.db
      .query("dailyPromptDeliveryAttempts")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", attempt.idempotencyKey))
      .take(2);
    if (attemptsForKey.length !== 1 || attemptsForKey[0]._id !== attempt._id) {
      throw new ConvexError("Ambiguous delivery attempt identity");
    }

    const lifecycle = await ctx.db.get(attempt.lifecycleId);
    if (
      !lifecycle ||
      lifecycle.coupleId !== attempt.coupleId ||
      lifecycle.promptDate !== attempt.promptDate ||
      (attempt.step === "first" ? lifecycle.firstUserId : lifecycle.secondUserId) !==
        attempt.recipientUserId ||
      (attempt.step === "first" ? lifecycle.firstStatus : lifecycle.secondStatus) !== "sending"
    ) {
      throw new ConvexError("Delivery attempt does not match a sending lifecycle step");
    }

    if (args.outcome.status === "provider_accepted") {
      if (!args.outcome.expoTicketId.trim()) throw new ConvexError("Missing Expo ticket ID");
      await ctx.db.patch(attempt._id, {
        status: "provider_accepted",
        expoTicketId: args.outcome.expoTicketId,
        outcomePersistedAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      await ctx.db.patch(lifecycle._id, {
        ...(attempt.step === "first"
          ? { firstStatus: "sent" as const, firstSentAt: args.nowMs }
          : { secondStatus: "sent" as const, secondSentAt: args.nowMs }),
        updatedAt: args.nowMs,
      });
      return { disposition: "persisted" as const, status: "provider_accepted" as const };
    }

    if (args.outcome.status === "provider_rejected") {
      if (!args.outcome.expoErrorCode.trim()) throw new ConvexError("Missing Expo error code");
      const shouldDisableDevice = args.outcome.expoErrorCode === "DeviceNotRegistered";
      if (args.outcome.disableDevice !== shouldDisableDevice) {
        throw new ConvexError("Invalid device-disable classification");
      }

      if (shouldDisableDevice) {
        const devices = await ctx.db
          .query("notificationDevices")
          .withIndex("by_user_id_and_device_id", (q) =>
            q.eq("userId", attempt.recipientUserId).eq("deviceId", attempt.deviceId),
          )
          .take(2);
        if (devices.length !== 1 || devices[0].coupleId !== attempt.coupleId) {
          throw new ConvexError("Reserved delivery device is ambiguous");
        }
        const currentTokenHash = devices[0].pushToken
          ? await hashDailyPromptPushToken(devices[0].pushToken)
          : undefined;
        if (attempt.tokenHash !== undefined && currentTokenHash === attempt.tokenHash) {
          await ctx.db.patch(devices[0]._id, {
            enabled: false,
            updatedAt: args.nowMs,
          });
        }
      }

      await ctx.db.patch(attempt._id, {
        status: "provider_rejected",
        expoErrorCode: args.outcome.expoErrorCode,
        outcomePersistedAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      await ctx.db.patch(lifecycle._id, {
        ...(attempt.step === "first"
          ? { firstStatus: "skipped" as const }
          : { secondStatus: "skipped" as const }),
        skippedAt: args.nowMs,
        skippedReason: `provider_rejected:${args.outcome.expoErrorCode}`,
        updatedAt: args.nowMs,
      });
      return { disposition: "persisted" as const, status: "provider_rejected" as const };
    }

    await ctx.db.patch(attempt._id, {
      status: "sending_unknown",
      outcomePersistedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { disposition: "persisted" as const, status: "sending_unknown" as const };
  },
});
