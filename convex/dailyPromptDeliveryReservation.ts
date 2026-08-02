import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import {
  createDailyPromptDeliveryKey,
  validateDailyPromptDeliveryStepTransition,
} from "./dailyPromptLifecycle";
import { hashDailyPromptPushToken } from "./dailyPromptDeliveryToken";

const deliveryStepValidator = v.union(v.literal("first"), v.literal("second"));
const reservationResultValidator = v.union(
  v.object({
    disposition: v.literal("reserved"),
    attemptId: v.id("dailyPromptDeliveryAttempts"),
    deviceId: v.string(),
    pushToken: v.string(),
    promptDate: v.string(),
    step: deliveryStepValidator,
  }),
  v.object({
    disposition: v.literal("no_send"),
    reason: v.string(),
  }),
);

const PRE_PROVIDER_UNAVAILABLE_REASON = "skipped_pre_provider_unavailable";

async function skipUnavailableStep(
  ctx: MutationCtx,
  lifecycleId: Id<"dailyPromptLifecycles">,
  step: "first" | "second",
  nowMs: number,
) {
  const lifecycle = await ctx.db.get(lifecycleId);
  if (!lifecycle) throw new Error("Daily prompt lifecycle was not found.");
  const status = step === "first" ? lifecycle.firstStatus : lifecycle.secondStatus;
  validateDailyPromptDeliveryStepTransition(status, "skipped");
  await ctx.db.patch(lifecycleId, {
    ...(step === "first"
      ? { firstStatus: "skipped" as const }
      : { secondStatus: "skipped" as const }),
    skippedAt: nowMs,
    skippedReason: PRE_PROVIDER_UNAVAILABLE_REASON,
    updatedAt: nowMs,
  });
}

export const reserveDailyPromptDelivery = internalMutation({
  args: {
    lifecycleId: v.id("dailyPromptLifecycles"),
    step: deliveryStepValidator,
    nowMs: v.number(),
    recoveryAttemptId: v.optional(v.id("dailyPromptDeliveryAttempts")),
  },
  returns: reservationResultValidator,
  handler: async (ctx, args) => {
    const lifecycle = await ctx.db.get(args.lifecycleId);
    if (!lifecycle) {
      return { disposition: "no_send" as const, reason: "lifecycle_not_found" };
    }

    const idempotencyKey = createDailyPromptDeliveryKey(lifecycle._id, args.step);
    const existingAttempts = await ctx.db
      .query("dailyPromptDeliveryAttempts")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
      .take(2);
    if (existingAttempts.length > 1) {
      return { disposition: "no_send" as const, reason: "ambiguous_attempt" };
    }
    if (existingAttempts.length === 1) {
      const attempt = existingAttempts[0];
      const expectedRecipient =
        args.step === "first" ? lifecycle.firstUserId : lifecycle.secondUserId;
      const stepStatus = args.step === "first" ? lifecycle.firstStatus : lifecycle.secondStatus;
      if (
        args.recoveryAttemptId !== attempt._id ||
        attempt.status !== "reserved" ||
        attempt.dispatchStartedAt !== undefined ||
        attempt.outcomePersistedAt !== undefined ||
        attempt.abandonedAt !== undefined ||
        attempt.expoTicketId !== undefined ||
        attempt.expoErrorCode !== undefined ||
        attempt.lifecycleId !== lifecycle._id ||
        attempt.coupleId !== lifecycle.coupleId ||
        attempt.promptDate !== lifecycle.promptDate ||
        attempt.step !== args.step ||
        attempt.recipientUserId !== expectedRecipient ||
        stepStatus !== "sending" ||
        !attempt.deviceId.trim() ||
        !attempt.tokenHash ||
        !/^[0-9a-f]{64}$/.test(attempt.tokenHash) ||
        !Number.isFinite(args.nowMs) ||
        args.nowMs < attempt.updatedAt
      ) {
        return { disposition: "no_send" as const, reason: "attempt_exists" };
      }
      const devices = await ctx.db
        .query("notificationDevices")
        .withIndex("by_user_id_and_device_id", (q) =>
          q.eq("userId", attempt.recipientUserId).eq("deviceId", attempt.deviceId),
        )
        .take(2);
      if (devices.length > 1) {
        return { disposition: "no_send" as const, reason: "ambiguous_reserved_device" };
      }
      const device = devices[0];
      const pushToken = device?.pushToken?.trim() ? device.pushToken : undefined;
      const tokenMatches =
        pushToken !== undefined &&
        (await hashDailyPromptPushToken(pushToken)) === attempt.tokenHash;
      if (
        !device ||
        device.coupleId !== lifecycle.coupleId ||
        !device.enabled ||
        device.permissionStatus !== "granted" ||
        !pushToken ||
        !tokenMatches
      ) {
        await ctx.db.patch(attempt._id, {
          status: "abandoned",
          abandonedAt: args.nowMs,
          updatedAt: args.nowMs,
        });
        await skipUnavailableStep(ctx, lifecycle._id, args.step, args.nowMs);
        return { disposition: "no_send" as const, reason: "delivery_abandoned" };
      }
      return {
        disposition: "reserved" as const,
        attemptId: attempt._id,
        deviceId: attempt.deviceId,
        pushToken,
        promptDate: lifecycle.promptDate,
        step: args.step,
      };
    }

    const stepStatus = args.step === "first" ? lifecycle.firstStatus : lifecycle.secondStatus;
    if (stepStatus !== "scheduled") {
      return { disposition: "no_send" as const, reason: "step_not_scheduled" };
    }
    const scheduledAt =
      args.step === "first" ? lifecycle.firstScheduledAt : lifecycle.secondScheduledAt;
    if (!Number.isFinite(args.nowMs) || scheduledAt === undefined || args.nowMs < scheduledAt) {
      return { disposition: "no_send" as const, reason: "step_not_due" };
    }

    const members = await ctx.db
      .query("coupleMembers")
      .withIndex("by_couple", (q) => q.eq("coupleId", lifecycle.coupleId))
      .take(3);
    const memberUserIds = new Set(members.map((member) => member.userId));
    if (
      members.length !== 2 ||
      memberUserIds.size !== 2 ||
      lifecycle.firstUserId === lifecycle.secondUserId ||
      !memberUserIds.has(lifecycle.firstUserId) ||
      !memberUserIds.has(lifecycle.secondUserId)
    ) {
      return { disposition: "no_send" as const, reason: "invalid_membership" };
    }

    const recipientUserId: Id<"users"> =
      args.step === "first" ? lifecycle.firstUserId : lifecycle.secondUserId;
    const device = await ctx.db
      .query("notificationDevices")
      .withIndex("by_couple_user_delivery_readiness", (q) =>
        q
          .eq("coupleId", lifecycle.coupleId)
          .eq("userId", recipientUserId)
          .eq("enabled", true)
          .eq("permissionStatus", "granted"),
      )
      .order("desc")
      .first();
    if (!device?.pushToken?.trim()) {
      await skipUnavailableStep(ctx, lifecycle._id, args.step, args.nowMs);
      return { disposition: "no_send" as const, reason: "delivery_abandoned" };
    }

    const attemptId = await ctx.db.insert("dailyPromptDeliveryAttempts", {
      lifecycleId: lifecycle._id,
      coupleId: lifecycle.coupleId,
      promptDate: lifecycle.promptDate,
      step: args.step,
      recipientUserId,
      idempotencyKey,
      deviceId: device.deviceId,
      tokenHash: await hashDailyPromptPushToken(device.pushToken),
      status: "reserved",
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    await ctx.db.patch(lifecycle._id, {
      ...(args.step === "first"
        ? { firstStatus: "sending" as const }
        : { secondStatus: "sending" as const }),
      updatedAt: args.nowMs,
    });

    return {
      disposition: "reserved" as const,
      attemptId,
      deviceId: device.deviceId,
      pushToken: device.pushToken,
      promptDate: lifecycle.promptDate,
      step: args.step,
    };
  },
});
