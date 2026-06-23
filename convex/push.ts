import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { getCurrentAppUser } from "./auth";

const platformValidator = v.union(
  v.literal("ios"),
  v.literal("android"),
  v.literal("web"),
  v.literal("unknown"),
);

type DueReminder = {
  tokenId: Id<"pushTokens">;
  token: string;
};

function localDateParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
  };
}

function isExpoPushToken(token: string): boolean {
  return /^ExponentPushToken\[[^\]]+\]$/.test(token) || /^ExpoPushToken\[[^\]]+\]$/.test(token);
}

export const registerToken = mutation({
  args: {
    token: v.string(),
    platform: platformValidator,
    deviceId: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");
    if (!isExpoPushToken(args.token)) throw new Error("Invalid Expo push token.");

    const now = Date.now();
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: user._id,
        platform: args.platform,
        deviceId: args.deviceId,
        timezone: args.timezone,
        enabled: true,
        updatedAt: now,
      });
      return { tokenId: existing._id };
    }

    const tokenId = await ctx.db.insert("pushTokens", {
      userId: user._id,
      token: args.token,
      platform: args.platform,
      deviceId: args.deviceId,
      timezone: args.timezone,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    return { tokenId };
  },
});

export const dueDailyPromptReminders = internalQuery({
  args: { now: v.number(), hour: v.number(), limit: v.number() },
  handler: async (ctx, args): Promise<DueReminder[]> => {
    const now = new Date(args.now);
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .take(args.limit);
    const due: DueReminder[] = [];

    for (const token of tokens) {
      const timezone = token.timezone ?? "America/Los_Angeles";
      const local = localDateParts(now, timezone);
      if (local.hour !== args.hour) continue;
      if (token.lastPromptReminderDate === local.date) continue;

      const answeredToday = await ctx.db
        .query("promptResponses")
        .withIndex("by_user_and_date", (q) =>
          q.eq("userId", token.userId).eq("promptDate", local.date),
        )
        .first();
      if (answeredToday) continue;

      due.push({ tokenId: token._id, token: token.token });
    }

    return due;
  },
});

export const markPromptReminderSent = internalMutation({
  args: { tokenIds: v.array(v.id("pushTokens")), now: v.number() },
  handler: async (ctx, args) => {
    const now = new Date(args.now);
    for (const tokenId of args.tokenIds) {
      const token: Doc<"pushTokens"> | null = await ctx.db.get(tokenId);
      if (!token) continue;
      const timezone = token.timezone ?? "America/Los_Angeles";
      const local = localDateParts(now, timezone);
      await ctx.db.patch(tokenId, {
        lastPromptReminderDate: local.date,
        updatedAt: args.now,
      });
    }
  },
});

export const disableTokens = internalMutation({
  args: { tokenIds: v.array(v.id("pushTokens")), now: v.number() },
  handler: async (ctx, args) => {
    for (const tokenId of args.tokenIds) {
      await ctx.db.patch(tokenId, { enabled: false, updatedAt: args.now });
    }
  },
});

export const sendDailyPromptReminders = internalAction({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const due: DueReminder[] = await ctx.runQuery(internal.push.dueDailyPromptReminders, {
      now,
      hour: 19,
      limit: 100,
    });
    if (!due.length) return { sent: 0 };

    const messages = due.map((item) => ({
      to: item.token,
      sound: "default",
      title: "Daily prompt",
      body: "Take two minutes to answer today's relationship prompt.",
      data: { url: "/prompts/today" },
    }));

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) throw new Error(`Expo push failed: ${response.status}`);

    const payload = (await response.json()) as {
      data?: Array<{ status?: string; details?: { error?: string } }>;
    };
    const disabledTokenIds = due
      .filter((item, index) => payload.data?.[index]?.details?.error === "DeviceNotRegistered")
      .map((item) => item.tokenId);

    if (disabledTokenIds.length) {
      await ctx.runMutation(internal.push.disableTokens, { tokenIds: disabledTokenIds, now });
    }

    const sentTokenIds = due
      .filter((item, index) => payload.data?.[index]?.status === "ok")
      .map((item) => item.tokenId);
    if (sentTokenIds.length) {
      await ctx.runMutation(internal.push.markPromptReminderSent, { tokenIds: sentTokenIds, now });
    }

    return { sent: sentTokenIds.length, disabled: disabledTokenIds.length };
  },
});
