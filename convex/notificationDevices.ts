import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getCurrentAppUser } from "./auth";

const platformValidator = v.union(
  v.literal("ios"),
  v.literal("android"),
  v.literal("web"),
  v.literal("unknown"),
);

const observedPermissionStatusValidator = v.union(
  v.literal("undetermined"),
  v.literal("denied"),
  v.literal("granted"),
);

function isValidIanaTimezone(timezone: string): boolean {
  if (!timezone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function isExpoPushToken(token: string): boolean {
  return /^ExponentPushToken\[[^\]]+\]$/.test(token) || /^ExpoPushToken\[[^\]]+\]$/.test(token);
}

async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  let appUser: Doc<"users"> | null = null;
  try {
    appUser = await getCurrentAppUser(ctx);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Component "betterAuth"')) {
      throw error;
    }
  }
  if (appUser) return appUser;

  const identity = await ctx.auth.getUserIdentity();
  const authUserId = identity?.tokenIdentifier;
  if (!authUserId) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId))
    .first();
}

async function getCurrentMembership(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const memberships = await ctx.db
    .query("coupleMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(2);
  if (memberships.length > 1) throw new Error("Ambiguous couple membership.");
  return memberships[0] ?? null;
}

async function getCoupleReadiness(ctx: QueryCtx | MutationCtx, coupleId: Id<"couples">) {
  const couple = await ctx.db.get(coupleId);
  if (!couple) throw new Error("Couple not found.");
  const members = await ctx.db
    .query("coupleMembers")
    .withIndex("by_couple", (q) => q.eq("coupleId", coupleId))
    .take(3);
  const readyUserIds = new Set<Id<"users">>();

  for (const member of members) {
    const devices = await ctx.db
      .query("notificationDevices")
      .withIndex("by_couple_id_and_user_id", (q) =>
        q.eq("coupleId", coupleId).eq("userId", member.userId),
      )
      .collect();
    if (
      devices.some(
        (device) =>
          device.enabled && device.permissionStatus === "granted" && Boolean(device.pushToken),
      )
    ) {
      readyUserIds.add(member.userId);
    }
  }

  return {
    couple,
    members,
    readyMemberCount: readyUserIds.size,
    isReady: members.length === 2 && readyUserIds.size === 2,
  };
}

async function maybeInitializePromptTimezone(
  ctx: MutationCtx,
  coupleId: Id<"couples">,
  now: number,
) {
  const readiness = await getCoupleReadiness(ctx, coupleId);
  if (!readiness.isReady || readiness.couple.promptTimezone) return;

  const creatorDevices = await ctx.db
    .query("notificationDevices")
    .withIndex("by_couple_id_and_user_id", (q) =>
      q.eq("coupleId", coupleId).eq("userId", readiness.couple.createdByUserId),
    )
    .collect();
  const creatorLatestGranted = creatorDevices
    .filter(
      (device) =>
        device.enabled &&
        device.permissionStatus === "granted" &&
        Boolean(device.pushToken) &&
        Boolean(device.timezone && isValidIanaTimezone(device.timezone)),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];

  if (!creatorLatestGranted?.timezone) return;

  await ctx.db.patch(coupleId, {
    promptTimezone: creatorLatestGranted.timezone,
    promptTimezoneUpdatedAt: now,
    updatedAt: now,
  });
}

export const reportPermissionObservation = mutation({
  args: {
    deviceId: v.string(),
    platform: platformValidator,
    permissionStatus: observedPermissionStatusValidator,
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) throw new Error("Not signed in.");
    const membership = await getCurrentMembership(ctx, user._id);
    if (!membership) throw new Error("Pair with your partner first.");
    if (!args.deviceId.trim()) throw new Error("Device ID is required.");
    if (!isValidIanaTimezone(args.timezone)) throw new Error("Timezone is invalid.");

    const now = Date.now();
    const existing = await ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", user._id).eq("deviceId", args.deviceId),
      )
      .unique();

    const permissionStatus =
      existing?.permissionStatus === "granted" &&
      existing.pushToken &&
      args.permissionStatus !== "granted"
        ? "revoked"
        : args.permissionStatus;

    if (existing) {
      await ctx.db.patch(existing._id, {
        coupleId: membership.coupleId,
        platform: args.platform,
        permissionStatus,
        pushToken: permissionStatus === "granted" ? existing.pushToken : undefined,
        timezone: args.timezone,
        enabled: existing.enabled && permissionStatus === "granted" && Boolean(existing.pushToken),
        lastObservedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("notificationDevices", {
        coupleId: membership.coupleId,
        userId: user._id,
        deviceId: args.deviceId,
        platform: args.platform,
        permissionStatus,
        timezone: args.timezone,
        enabled: false,
        lastObservedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { permissionStatus };
  },
});

export const registerGrantedDevice = mutation({
  args: {
    deviceId: v.string(),
    platform: platformValidator,
    pushToken: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) throw new Error("Not signed in.");
    const membership = await getCurrentMembership(ctx, user._id);
    if (!membership) throw new Error("Pair with your partner first.");
    if (!args.deviceId.trim()) throw new Error("Device ID is required.");
    if (!isExpoPushToken(args.pushToken)) throw new Error("Invalid Expo push token.");
    if (!isValidIanaTimezone(args.timezone)) throw new Error("Timezone is invalid.");

    const now = Date.now();
    const tokenOwner = await ctx.db
      .query("notificationDevices")
      .withIndex("by_push_token", (q) => q.eq("pushToken", args.pushToken))
      .first();
    if (tokenOwner && tokenOwner.userId !== user._id) {
      throw new Error("Push token already belongs to another user.");
    }

    const existing = await ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", user._id).eq("deviceId", args.deviceId),
      )
      .unique();

    if (tokenOwner && (!existing || tokenOwner._id !== existing._id)) {
      await ctx.db.patch(tokenOwner._id, {
        pushToken: undefined,
        enabled: false,
        updatedAt: now,
      });
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        coupleId: membership.coupleId,
        platform: args.platform,
        pushToken: args.pushToken,
        permissionStatus: "granted",
        timezone: args.timezone,
        enabled: true,
        lastObservedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("notificationDevices", {
        coupleId: membership.coupleId,
        userId: user._id,
        deviceId: args.deviceId,
        pushToken: args.pushToken,
        platform: args.platform,
        permissionStatus: "granted",
        timezone: args.timezone,
        enabled: true,
        lastObservedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    await maybeInitializePromptTimezone(ctx, membership.coupleId, now);
    return { permissionStatus: "granted" as const, enabled: true };
  },
});

export const getNotificationReadiness = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) throw new Error("Not signed in.");
    const membership = await getCurrentMembership(ctx, user._id);
    if (!membership) throw new Error("Pair with your partner first.");

    const readiness = await getCoupleReadiness(ctx, membership.coupleId);
    const blockedReason =
      readiness.members.length !== 2
        ? "invalid_member_count"
        : readiness.readyMemberCount !== 2
          ? "not_all_members_ready"
          : readiness.couple.promptTimezone
            ? null
            : "creator_timezone_unavailable";

    return {
      memberCount: readiness.members.length,
      readyMemberCount: readiness.readyMemberCount,
      isReady: readiness.isReady && Boolean(readiness.couple.promptTimezone),
      promptTimezone: readiness.couple.promptTimezone ?? null,
      blockedReason,
    };
  },
});

export const updatePromptTimezone = mutation({
  args: {
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) throw new Error("Not signed in.");
    const membership = await getCurrentMembership(ctx, user._id);
    if (!membership) throw new Error("Pair with your partner first.");
    if (!isValidIanaTimezone(args.timezone)) throw new Error("Timezone is invalid.");

    const now = Date.now();
    await ctx.db.patch(membership.coupleId, {
      promptTimezone: args.timezone,
      promptTimezoneUpdatedAt: now,
      updatedAt: now,
    });

    return { promptTimezone: args.timezone };
  },
});
