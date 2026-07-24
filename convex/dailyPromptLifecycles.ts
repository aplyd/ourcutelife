import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getCurrentAppUser } from "./auth";
import {
  choosePromptRecipientOrder,
  chooseRandomFirstLocalMinute,
  getPromptDateInTimezone,
  isValidIanaTimezone,
  localDateMinuteToTimestamp,
} from "./dailyPromptLifecycle";
import { existingLifecycleForDate, getAuthoritativePromptDate } from "./dailyPromptDateResolver";
import { getDailyPromptQuestions } from "./prompts";

type CurrentMembership = {
  user: Doc<"users">;
  membership: Doc<"coupleMembers">;
};

type PromptQuestions = {
  question: string;
  quizQuestion: string;
};

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

async function requireCurrentMembership(ctx: QueryCtx | MutationCtx): Promise<CurrentMembership> {
  const user = await getAuthenticatedUser(ctx);
  if (!user) throw new Error("Not signed in.");

  const memberships = await ctx.db
    .query("coupleMembers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .take(2);
  if (memberships.length === 0) throw new Error("Pair with your partner first.");
  if (memberships.length > 1) throw new Error("Ambiguous couple membership.");

  return { user, membership: memberships[0] };
}

async function getExactCoupleMembers(ctx: QueryCtx | MutationCtx, coupleId: Id<"couples">) {
  const members = await ctx.db
    .query("coupleMembers")
    .withIndex("by_couple", (q) => q.eq("coupleId", coupleId))
    .take(3);
  const distinctUserIds = new Set(members.map((member) => member.userId));
  if (members.length !== 2 || distinctUserIds.size !== 2) return null;
  return members;
}

async function hasReadyDevice(
  ctx: QueryCtx | MutationCtx,
  coupleId: Id<"couples">,
  userId: Id<"users">,
) {
  const device = await ctx.db
    .query("notificationDevices")
    .withIndex("by_ready_lookup", (q) =>
      q
        .eq("coupleId", coupleId)
        .eq("userId", userId)
        .eq("enabled", true)
        .eq("permissionStatus", "granted")
        .gt("pushToken", ""),
    )
    .first();

  return device !== null;
}

async function getLatestPriorLifecycle(
  ctx: MutationCtx,
  coupleId: Id<"couples">,
  promptDate: string,
) {
  const rows = await ctx.db
    .query("dailyPromptLifecycles")
    .withIndex("by_couple_id_and_prompt_date", (q) =>
      q.eq("coupleId", coupleId).lt("promptDate", promptDate),
    )
    .order("desc")
    .take(2);
  if (rows.length > 1 && rows[0].promptDate === rows[1].promptDate) {
    throw new Error("Duplicate daily prompt lifecycle.");
  }
  return rows[0] ?? null;
}

function randomMinuteFromMathRandom(minInclusive: number, maxInclusive: number) {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

function getLocalMinuteOfDay(timestampMs: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestampMs));
  const value = (type: string) => {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) throw new Error(`Unable to derive ${type} for timezone: ${timezone}`);
    return Number(part.value);
  };
  return value("hour") * 60 + value("minute");
}

function chooseAuthoritativeFirstLocalMinute({
  nowMs,
  timezone,
  promptDate,
  randomMinute,
}: {
  nowMs: number;
  timezone: string;
  promptDate: string;
  randomMinute: (minInclusive: number, maxInclusive: number) => number;
}) {
  const today = getPromptDateInTimezone(nowMs, timezone);
  const nowLocalMinute = getLocalMinuteOfDay(nowMs, timezone);
  let minInclusive = 1140;
  if (promptDate === today && nowLocalMinute >= 1140 && nowLocalMinute <= 1259) {
    const currentLocalMinuteStartedAt = localDateMinuteToTimestamp(today, nowLocalMinute, timezone);
    minInclusive = nowLocalMinute + (nowMs > currentLocalMinuteStartedAt ? 1 : 0);
  }

  const minute = chooseRandomFirstLocalMinute((_, maxInclusive) =>
    randomMinute(minInclusive, maxInclusive),
  );
  return Math.max(minInclusive, minute);
}

function promptContentForTesting(kind: string | undefined, promptDate: string): PromptQuestions {
  if (kind === "missing_quiz_question") {
    return { question: "What is one small thing you appreciated today?", quizQuestion: "" };
  }
  return getDailyPromptQuestions(promptDate);
}

async function getSetupBlocker(
  ctx: QueryCtx | MutationCtx,
  coupleId: Id<"couples">,
  promptDate: string,
  getPromptQuestions: (promptDate: string) => PromptQuestions,
) {
  const members = await getExactCoupleMembers(ctx, coupleId);
  if (!members) return { blockedReason: "invalid_member_count" as const, members: null };

  const ready = await Promise.all(
    members.map((member) => hasReadyDevice(ctx, coupleId, member.userId)),
  );
  if (!ready.every(Boolean)) {
    return { blockedReason: "not_all_members_ready" as const, members: null };
  }

  const prompt = getPromptQuestions(promptDate);
  if (!prompt.question.trim() || !prompt.quizQuestion.trim()) {
    return { blockedReason: "prompt_content_incomplete" as const, members: null };
  }

  return { blockedReason: null, members, prompt };
}

async function reconcileForMembership({
  ctx,
  membership,
  nowMs,
  randomMinute,
  getPromptQuestions,
}: {
  ctx: MutationCtx;
  membership: Doc<"coupleMembers">;
  nowMs: number;
  randomMinute: (minInclusive: number, maxInclusive: number) => number;
  getPromptQuestions?: (promptDate: string) => PromptQuestions;
}) {
  const couple = await ctx.db.get(membership.coupleId);
  if (!couple) throw new Error("Couple not found.");
  if (!couple.promptTimezone) {
    return {
      status: "blocked" as const,
      lifecycleId: null,
      promptDate: null,
      blockedReason: "missing_prompt_timezone",
    };
  }
  if (!isValidIanaTimezone(couple.promptTimezone)) {
    return {
      status: "blocked" as const,
      lifecycleId: null,
      promptDate: null,
      blockedReason: "invalid_prompt_timezone",
    };
  }

  const { promptDate, existing } = await getAuthoritativePromptDate(
    ctx,
    membership.coupleId,
    nowMs,
    couple.promptTimezone,
  );
  if (existing) {
    return {
      status: "scheduled" as const,
      lifecycleId: existing._id,
      promptDate: existing.promptDate,
      blockedReason: null,
    };
  }

  const setup = await getSetupBlocker(
    ctx,
    membership.coupleId,
    promptDate,
    getPromptQuestions ?? getDailyPromptQuestions,
  );
  if (setup.blockedReason) {
    return {
      status: "blocked" as const,
      lifecycleId: null,
      promptDate,
      blockedReason: setup.blockedReason,
    };
  }

  const members = setup.members;

  const prior = await getLatestPriorLifecycle(ctx, membership.coupleId, promptDate);
  const recipients = choosePromptRecipientOrder({
    members: members.map((member) => ({
      userId: member.userId,
      joinedAt: member.joinedAt,
    })),
    createdByUserId: couple.createdByUserId,
    previousFirstUserId: prior?.firstUserId ?? null,
  });
  const randomizedFirstLocalMinute = chooseAuthoritativeFirstLocalMinute({
    nowMs,
    timezone: couple.promptTimezone,
    promptDate,
    randomMinute,
  });
  const firstScheduledAt = localDateMinuteToTimestamp(
    promptDate,
    randomizedFirstLocalMinute,
    couple.promptTimezone,
  );

  const lifecycleId = await ctx.db.insert("dailyPromptLifecycles", {
    coupleId: membership.coupleId,
    promptDate,
    timezone: couple.promptTimezone,
    firstUserId: recipients.firstUserId as Id<"users">,
    secondUserId: recipients.secondUserId as Id<"users">,
    randomizedFirstLocalMinute,
    firstScheduledAt,
    firstStatus: "scheduled",
    secondStatus: "pending",
    createdAt: nowMs,
    updatedAt: nowMs,
  });

  return { status: "scheduled" as const, lifecycleId, promptDate, blockedReason: null };
}

export const reconcileToday = mutation({
  args: {},
  handler: async (ctx) => {
    const { membership } = await requireCurrentMembership(ctx);
    return await reconcileForMembership({
      ctx,
      membership,
      nowMs: Date.now(),
      randomMinute: randomMinuteFromMathRandom,
    });
  },
});

export const reconcileTodayForTesting = internalMutation({
  args: {
    nowMs: v.number(),
    randomMinute: v.number(),
    promptContentForTesting: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireCurrentMembership(ctx);
    return await reconcileForMembership({
      ctx,
      membership,
      nowMs: args.nowMs,
      randomMinute: () => args.randomMinute,
      getPromptQuestions: (promptDate) =>
        promptContentForTesting(args.promptContentForTesting, promptDate),
    });
  },
});

export const getTodayState = query({
  args: {},
  handler: async (ctx) => {
    const { membership } = await requireCurrentMembership(ctx);
    return await getTodayStateForMembership(ctx, membership, Date.now());
  },
});

async function getTodayStateForMembership(
  ctx: QueryCtx,
  membership: Doc<"coupleMembers">,
  nowMs: number,
  getPromptQuestions: (promptDate: string) => PromptQuestions = getDailyPromptQuestions,
) {
  const couple = await ctx.db.get(membership.coupleId);
  if (!couple?.promptTimezone) {
    return { status: "blocked" as const, blockedReason: "missing_prompt_timezone" };
  }
  if (!isValidIanaTimezone(couple.promptTimezone)) {
    return { status: "blocked" as const, blockedReason: "invalid_prompt_timezone" };
  }

  const { promptDate, existing } = await getAuthoritativePromptDate(
    ctx,
    membership.coupleId,
    nowMs,
    couple.promptTimezone,
  );
  const lifecycle =
    existing ?? (await existingLifecycleForDate(ctx, membership.coupleId, promptDate));
  const prompt = getPromptQuestions(promptDate);
  const setup = lifecycle
    ? { blockedReason: null }
    : await getSetupBlocker(ctx, membership.coupleId, promptDate, getPromptQuestions);
  if (setup.blockedReason) {
    return {
      status: "blocked" as const,
      blockedReason: setup.blockedReason,
      promptDate,
    };
  }

  return {
    status: lifecycle ? ("scheduled" as const) : ("not_scheduled" as const),
    blockedReason: null,
    promptDate,
    prompt,
    lifecycle: lifecycle
      ? {
          promptDate: lifecycle.promptDate,
          firstScheduledAt: lifecycle.firstScheduledAt,
          viewerRole: lifecycle.firstUserId === membership.userId ? "first" : "second",
          firstStatus: lifecycle.firstStatus,
          secondStatus: lifecycle.secondStatus,
        }
      : null,
  };
}

export const getTodayStateForTesting = internalQuery({
  args: {
    nowMs: v.number(),
    promptContentForTesting: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireCurrentMembership(ctx);
    return await getTodayStateForMembership(ctx, membership, args.nowMs, (promptDate) =>
      promptContentForTesting(args.promptContentForTesting, promptDate),
    );
  },
});
