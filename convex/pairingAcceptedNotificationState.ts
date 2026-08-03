import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

export type PairingAcceptedReservation =
  | {
      disposition: "reserved";
      notificationId: Id<"pairingAcceptedNotifications">;
      pushToken: string;
    }
  | { disposition: "no_send"; reason: string };

const REGISTRATION_RETRY_DELAY_MS = 2_000;
const MAX_REGISTRATION_RETRIES = 60;
const dispatchPairingAcceptedNotification = makeFunctionReference<
  "action",
  { notificationId: Id<"pairingAcceptedNotifications"> },
  unknown
>("pairingAcceptedDispatch:dispatchPairingAcceptedNotification");

export const reservePairingAcceptedNotification = internalMutation({
  args: { notificationId: v.id("pairingAcceptedNotifications"), nowMs: v.number() },
  handler: async (ctx, args): Promise<PairingAcceptedReservation> => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return { disposition: "no_send", reason: "notification_missing" };
    if (notification.status !== "pending" && notification.status !== "awaiting_permission") {
      return { disposition: "no_send", reason: "notification_already_started" };
    }
    if (
      notification.status === "awaiting_permission" &&
      notification.nextRegistrationRetryAt &&
      args.nowMs < notification.nextRegistrationRetryAt
    ) {
      return { disposition: "no_send", reason: "registration_retry_already_scheduled" };
    }

    const pairingCode = await ctx.db.get(notification.pairingCodeId);
    const members = await ctx.db
      .query("coupleMembers")
      .withIndex("by_couple", (q) => q.eq("coupleId", notification.coupleId))
      .take(3);
    const memberUserIds = new Set(members.map((member) => member.userId));
    if (
      !pairingCode?.usedAt ||
      !pairingCode.usedByUserId ||
      pairingCode.coupleId !== notification.coupleId ||
      pairingCode.createdByUserId !== notification.recipientUserId ||
      members.length !== 2 ||
      memberUserIds.size !== 2 ||
      !memberUserIds.has(notification.recipientUserId) ||
      !memberUserIds.has(pairingCode.usedByUserId)
    ) {
      await ctx.db.patch(notification._id, {
        status: "skipped",
        skippedReason: "membership_changed",
        outcomePersistedAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      return { disposition: "no_send", reason: "membership_changed" };
    }

    const devices = await ctx.db
      .query("notificationDevices")
      .withIndex("by_couple_user_delivery_readiness", (q) =>
        q
          .eq("coupleId", notification.coupleId)
          .eq("userId", notification.recipientUserId)
          .eq("enabled", true)
          .eq("permissionStatus", "granted"),
      )
      .collect();
    const device = devices
      .filter((candidate) => Boolean(candidate.pushToken))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
    if (!device?.pushToken) {
      const registrationRetryCount = (notification.registrationRetryCount ?? 0) + 1;
      if (registrationRetryCount > MAX_REGISTRATION_RETRIES) {
        await ctx.db.patch(notification._id, {
          status: "skipped",
          skippedReason: "permission_unavailable",
          outcomePersistedAt: args.nowMs,
          updatedAt: args.nowMs,
        });
        return { disposition: "no_send", reason: "permission_unavailable" };
      }

      const nextRegistrationRetryAt = args.nowMs + REGISTRATION_RETRY_DELAY_MS;
      const schedulerJobId = await ctx.scheduler.runAfter(
        REGISTRATION_RETRY_DELAY_MS,
        dispatchPairingAcceptedNotification,
        { notificationId: notification._id },
      );
      await ctx.db.patch(notification._id, {
        status: "awaiting_permission",
        registrationRetryCount,
        nextRegistrationRetryAt,
        schedulerJobId: String(schedulerJobId),
        updatedAt: args.nowMs,
      });
      return { disposition: "no_send", reason: "registration_retry_scheduled" };
    }

    await ctx.db.patch(notification._id, {
      // Mark the dispatch uncertain before the external side effect. A crash after this
      // transaction must fail closed instead of leaving a retryable-looking send.
      status: "sending_unknown",
      deviceId: device.deviceId,
      nextRegistrationRetryAt: undefined,
      dispatchStartedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return {
      disposition: "reserved",
      notificationId: notification._id,
      pushToken: device.pushToken,
    };
  },
});

export const persistPairingAcceptedNotificationOutcome = internalMutation({
  args: {
    notificationId: v.id("pairingAcceptedNotifications"),
    outcome: v.union(
      v.object({ status: v.literal("provider_accepted"), expoTicketId: v.string() }),
      v.object({
        status: v.literal("provider_rejected"),
        expoErrorCode: v.string(),
        disableDevice: v.boolean(),
      }),
      v.object({ status: v.literal("sending_unknown") }),
    ),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return { disposition: "notification_missing" as const };
    if (notification.status !== "sending_unknown" && notification.status !== "sending") {
      return { disposition: "already_persisted" as const, status: notification.status };
    }

    await ctx.db.patch(notification._id, {
      status: args.outcome.status,
      expoTicketId:
        args.outcome.status === "provider_accepted" ? args.outcome.expoTicketId : undefined,
      expoErrorCode:
        args.outcome.status === "provider_rejected" ? args.outcome.expoErrorCode : undefined,
      outcomePersistedAt: args.nowMs,
      updatedAt: args.nowMs,
    });

    if (
      args.outcome.status === "provider_rejected" &&
      args.outcome.disableDevice &&
      notification.deviceId
    ) {
      const devices = await ctx.db
        .query("notificationDevices")
        .withIndex("by_user_id_and_device_id", (q) =>
          q.eq("userId", notification.recipientUserId).eq("deviceId", notification.deviceId!),
        )
        .take(2);
      if (devices.length === 1) {
        await ctx.db.patch(devices[0]._id, { enabled: false, updatedAt: args.nowMs });
      }
    }

    return { disposition: "persisted" as const, status: args.outcome.status };
  },
});
