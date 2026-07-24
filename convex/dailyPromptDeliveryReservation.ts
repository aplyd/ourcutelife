import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { createDailyPromptDeliveryKey } from "./dailyPromptLifecycle";
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

export const reserveDailyPromptDelivery = internalMutation({
  args: {
    lifecycleId: v.id("dailyPromptLifecycles"),
    step: deliveryStepValidator,
    nowMs: v.number(),
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
    if (existingAttempts.length > 0) {
      return { disposition: "no_send" as const, reason: "attempt_exists" };
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
      .withIndex("by_couple_id_and_user_id_and_enabled_and_permission_status_and_updated_at", (q) =>
        q
          .eq("coupleId", lifecycle.coupleId)
          .eq("userId", recipientUserId)
          .eq("enabled", true)
          .eq("permissionStatus", "granted"),
      )
      .order("desc")
      .first();
    if (!device?.pushToken?.trim()) {
      return { disposition: "no_send" as const, reason: "no_eligible_device" };
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
