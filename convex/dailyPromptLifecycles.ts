import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getCurrentAppUser } from "./auth";
import {
  choosePromptRecipientOrder,
  chooseRandomFirstLocalMinute,
  createDailyPromptDeliveryKey,
  getPromptDateInTimezone,
  isValidIanaTimezone,
  localDateMinuteToTimestamp,
} from "./dailyPromptLifecycle";
import { existingLifecycleForDate, getAuthoritativePromptDate } from "./dailyPromptDateResolver";
import {
  DAILY_PROMPT_SEEDS,
  getAssignedDailyPrompt,
  normalizeDailyPromptText,
  validateDailyPromptDocument,
} from "./dailyPromptLibrary";
import { getDailyPromptQuestions } from "./prompts";

type CurrentMembership = {
  user: Doc<"users">;
  membership: Doc<"coupleMembers">;
};

type PromptQuestions = {
  question: string;
  quizQuestion: string;
  principle?: string;
};

const dispatchDailyPrompt = makeFunctionReference<
  "action",
  {
    lifecycleId: Id<"dailyPromptLifecycles">;
    step: "first" | "second";
    recoveryAttemptId?: Id<"dailyPromptDeliveryAttempts">;
  }
>("dailyPromptDispatch:dispatchDailyPrompt");
const continueDailyPromptPlanning = makeFunctionReference<"mutation", { cursor: string | null }>(
  "dailyPromptLifecycles:planDailyPrompts",
);
const secondAnswerBoundary = makeFunctionReference<
  "mutation",
  { lifecycleId: Id<"dailyPromptLifecycles"> }
>("prompts:secondAnswerBoundary");

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

const maxApprovedPromptCandidates = 64;
const recentPromptAssignmentLimit = 12;

function stablePromptIndex(seed: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}

async function ensureDailyPromptSeeds(ctx: MutationCtx, nowMs: number) {
  for (const seed of DAILY_PROMPT_SEEDS) {
    const matching = await ctx.db
      .query("dailyPrompts")
      .withIndex("by_normalized_fingerprint", (q) =>
        q.eq("normalizedFingerprint", seed.normalizedFingerprint),
      )
      .take(2);
    if (matching.length > 1) throw new Error("Duplicate daily prompt fingerprint.");
    const existing = matching[0];
    if (!existing) {
      await ctx.db.insert("dailyPrompts", {
        ...seed,
        completionCount: 0,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      continue;
    }
    if (
      existing.text !== seed.text ||
      existing.principle !== seed.principle ||
      existing.category !== seed.category ||
      existing.source !== "seed" ||
      existing.safetyStatus !== "approved" ||
      !Number.isSafeInteger(existing.completionCount) ||
      existing.completionCount < 0
    ) {
      throw new Error("Incompatible daily prompt seed state.");
    }
  }
}

async function selectPromptForLifecycle({
  ctx,
  coupleId,
  promptDate,
  selectionSeed,
}: {
  ctx: MutationCtx;
  coupleId: Id<"couples">;
  promptDate: string;
  selectionSeed?: string;
}) {
  const candidates = await ctx.db
    .query("dailyPrompts")
    .withIndex("by_safety_status_and_completion_count_and_created_at", (q) =>
      q.eq("safetyStatus", "approved"),
    )
    .take(maxApprovedPromptCandidates);
  if (candidates.length === 0) throw new Error("No approved daily prompts are available.");
  for (const candidate of candidates) validateDailyPromptDocument(candidate);
  if (
    new Set(candidates.map((candidate) => candidate.normalizedFingerprint)).size !==
    candidates.length
  ) {
    throw new Error("Duplicate daily prompt fingerprint.");
  }

  const recentLifecycles = await ctx.db
    .query("dailyPromptLifecycles")
    .withIndex("by_couple_id_and_prompt_date", (q) =>
      q.eq("coupleId", coupleId).lt("promptDate", promptDate),
    )
    .order("desc")
    .take(recentPromptAssignmentLimit);
  if (
    new Set(recentLifecycles.map((lifecycle) => lifecycle.promptDate)).size !==
    recentLifecycles.length
  ) {
    throw new Error("Duplicate daily prompt lifecycle.");
  }
  const recentPromptIds = new Set(
    recentLifecycles.flatMap((lifecycle) => (lifecycle.promptId ? [lifecycle.promptId] : [])),
  );
  const freshCandidates = candidates.filter((candidate) => !recentPromptIds.has(candidate._id));
  const eligible = (freshCandidates.length > 0 ? freshCandidates : candidates).toSorted(
    (left, right) => left.normalizedFingerprint.localeCompare(right.normalizedFingerprint),
  );
  const selected =
    eligible[stablePromptIndex(selectionSeed ?? `${coupleId}:${promptDate}`, eligible.length)];
  const exactFingerprintRows = await ctx.db
    .query("dailyPrompts")
    .withIndex("by_normalized_fingerprint", (q) =>
      q.eq("normalizedFingerprint", selected.normalizedFingerprint),
    )
    .take(2);
  if (exactFingerprintRows.length !== 1 || exactFingerprintRows[0]._id !== selected._id) {
    throw new Error("Duplicate daily prompt fingerprint.");
  }
  return selected;
}

async function assignLegacyLifecyclePrompt(
  ctx: MutationCtx,
  lifecycle: Doc<"dailyPromptLifecycles">,
  nowMs: number,
  selectionSeed?: string,
) {
  await ensureDailyPromptSeeds(ctx, nowMs);
  if (lifecycle.promptId) {
    await getAssignedDailyPrompt(ctx, lifecycle);
    return lifecycle;
  }
  const responses = await ctx.db
    .query("promptResponses")
    .withIndex("by_couple_and_date", (q) =>
      q.eq("coupleId", lifecycle.coupleId).eq("promptDate", lifecycle.promptDate),
    )
    .take(3);
  if (responses.length > 2) throw new Error("Duplicate daily prompt response.");
  const expectedUserIds = new Set([lifecycle.firstUserId, lifecycle.secondUserId]);
  if (
    new Set(responses.map((response) => response.userId)).size !== responses.length ||
    responses.some(
      (response) =>
        !expectedUserIds.has(response.userId) ||
        response.coupleId !== lifecycle.coupleId ||
        response.promptDate !== lifecycle.promptDate ||
        !response.prompt.trim() ||
        !response.response.trim(),
    )
  ) {
    throw new Error("Daily prompt response mismatch.");
  }
  const responsePrompts = await Promise.all(
    responses.map(async (response) => {
      const fingerprint = normalizeDailyPromptText(response.prompt);
      const matches = await ctx.db
        .query("dailyPrompts")
        .withIndex("by_normalized_fingerprint", (q) => q.eq("normalizedFingerprint", fingerprint))
        .take(2);
      if (matches.length > 1) throw new Error("Duplicate daily prompt fingerprint.");
      const match = matches[0];
      if (!match || match.text !== response.prompt || match.safetyStatus !== "approved") {
        throw new Error("Legacy daily prompt response is not canonical.");
      }
      validateDailyPromptDocument(match);
      return match;
    }),
  );
  if (new Set(responsePrompts.map((prompt) => prompt._id)).size > 1) {
    throw new Error("Daily prompt response mismatch.");
  }
  const prompt =
    responsePrompts[0] ??
    (await selectPromptForLifecycle({
      ctx,
      coupleId: lifecycle.coupleId,
      promptDate: lifecycle.promptDate,
      selectionSeed,
    }));
  await ctx.db.patch(lifecycle._id, { promptId: prompt._id, updatedAt: nowMs });
  const assigned = await ctx.db.get(lifecycle._id);
  if (!assigned?.promptId) throw new Error("Daily prompt assignment was not saved.");
  return assigned;
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

async function scheduleDispatchJob(
  ctx: MutationCtx,
  lifecycle: Doc<"dailyPromptLifecycles">,
  step: "first" | "second",
  nowMs: number,
) {
  const status = step === "first" ? lifecycle.firstStatus : lifecycle.secondStatus;
  if (status !== "scheduled" && status !== "sending") return;
  const scheduledAt = step === "first" ? lifecycle.firstScheduledAt : lifecycle.secondScheduledAt;
  const deliveryKey = createDailyPromptDeliveryKey(lifecycle._id, step);
  const persistedDeliveryKey =
    step === "first" ? lifecycle.firstDeliveryKey : lifecycle.secondDeliveryKey;
  const schedulerJobId =
    step === "first" ? lifecycle.firstSchedulerJobId : lifecycle.secondDispatchSchedulerJobId;

  if (scheduledAt === undefined || (persistedDeliveryKey && persistedDeliveryKey !== deliveryKey)) {
    throw new Error(`Malformed ${step} daily prompt dispatch state.`);
  }
  if (!schedulerJobId) {
    if (status !== "scheduled") return;
    if (step === "second") {
      if (
        lifecycle.firstStartedAt === undefined ||
        lifecycle.secondScheduledAt !== lifecycle.firstStartedAt + 300_000 ||
        lifecycle.secondDeliveryKey !== deliveryKey ||
        !lifecycle.secondSchedulerJobId
      ) {
        throw new Error("Malformed second daily prompt boundary state.");
      }
      let boundaryJob;
      try {
        boundaryJob = await ctx.db.system.get(
          "_scheduled_functions",
          lifecycle.secondSchedulerJobId as GenericId<"_scheduled_functions">,
        );
      } catch {
        throw new Error("Malformed second daily prompt boundary scheduler.");
      }
      const boundaryArgs = boundaryJob?.args[0] as { lifecycleId?: unknown } | undefined;
      if (
        !boundaryJob ||
        boundaryJob.name !== "prompts:secondAnswerBoundary" ||
        boundaryJob.scheduledTime !== lifecycle.secondScheduledAt ||
        boundaryJob.args.length !== 1 ||
        boundaryArgs?.lifecycleId !== lifecycle._id ||
        Object.keys(boundaryArgs ?? {}).length !== 1
      ) {
        throw new Error("Malformed second daily prompt boundary scheduler.");
      }
      const attempts = await ctx.db
        .query("dailyPromptDeliveryAttempts")
        .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", deliveryKey))
        .take(2);
      if (attempts.length !== 0) {
        throw new Error("Ambiguous second daily prompt delivery attempt.");
      }
      if (boundaryJob.state.kind === "pending" || boundaryJob.state.kind === "inProgress") return;
      if (boundaryJob.state.kind === "success") {
        const jobId = await ctx.scheduler.runAt(scheduledAt, dispatchDailyPrompt, {
          lifecycleId: lifecycle._id,
          step,
        });
        await ctx.db.patch(lifecycle._id, {
          secondDispatchSchedulerJobId: String(jobId),
          updatedAt: nowMs,
        });
        return;
      }
      if (boundaryJob.state.kind === "failed" || boundaryJob.state.kind === "canceled") {
        const replacementBoundaryJobId = await ctx.scheduler.runAt(
          scheduledAt,
          secondAnswerBoundary,
          { lifecycleId: lifecycle._id },
        );
        await ctx.db.patch(lifecycle._id, {
          secondSchedulerJobId: String(replacementBoundaryJobId),
          updatedAt: nowMs,
        });
      }
      return;
    }
    const jobId = await ctx.scheduler.runAt(scheduledAt, dispatchDailyPrompt, {
      lifecycleId: lifecycle._id,
      step,
    });
    await ctx.db.patch(lifecycle._id, {
      firstDeliveryKey: deliveryKey,
      firstSchedulerJobId: String(jobId),
      updatedAt: nowMs,
    });
    return;
  }

  let job;
  try {
    job = await ctx.db.system.get(
      "_scheduled_functions",
      schedulerJobId as GenericId<"_scheduled_functions">,
    );
  } catch {
    throw new Error(`Malformed ${step} daily prompt dispatch scheduler.`);
  }
  const jobArgs = job?.args[0] as
    | {
        lifecycleId?: unknown;
        step?: unknown;
        recoveryAttemptId?: unknown;
      }
    | undefined;
  const jobArgKeys = Object.keys(jobArgs ?? {});
  if (
    !job ||
    job.name !== "dailyPromptDispatch:dispatchDailyPrompt" ||
    job.scheduledTime < scheduledAt ||
    job.args.length !== 1 ||
    jobArgs?.lifecycleId !== lifecycle._id ||
    jobArgs.step !== step ||
    jobArgKeys.some((key) => key !== "lifecycleId" && key !== "step" && key !== "recoveryAttemptId")
  ) {
    throw new Error(`Malformed ${step} daily prompt dispatch scheduler.`);
  }

  const attempts = await ctx.db
    .query("dailyPromptDeliveryAttempts")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", deliveryKey))
    .take(2);
  if (attempts.length > 1) throw new Error(`Ambiguous ${step} daily prompt delivery attempt.`);
  const attempt = attempts[0];
  if (
    jobArgs.recoveryAttemptId !== undefined &&
    (!attempt ||
      jobArgs.recoveryAttemptId !== attempt._id ||
      attempt.status !== "reserved" ||
      attempt.dispatchStartedAt !== undefined ||
      attempt.outcomePersistedAt !== undefined ||
      status !== "sending")
  ) {
    throw new Error(`Malformed ${step} daily prompt dispatch scheduler.`);
  }
  if (job.state.kind !== "failed" && job.state.kind !== "canceled") return;

  const retryIsProvenPreProvider =
    (!attempt && status === "scheduled") ||
    (attempt?.status === "reserved" &&
      attempt.dispatchStartedAt === undefined &&
      attempt.outcomePersistedAt === undefined &&
      status === "sending");
  if (!retryIsProvenPreProvider) return;

  const replacementJobId = await ctx.scheduler.runAt(scheduledAt, dispatchDailyPrompt, {
    lifecycleId: lifecycle._id,
    step,
    ...(attempt ? { recoveryAttemptId: attempt._id } : {}),
  });
  await ctx.db.patch(lifecycle._id, {
    ...(step === "first"
      ? { firstSchedulerJobId: String(replacementJobId) }
      : { secondDispatchSchedulerJobId: String(replacementJobId) }),
    updatedAt: nowMs,
  });
}

async function reconcileDispatchJobs(
  ctx: MutationCtx,
  lifecycle: Doc<"dailyPromptLifecycles">,
  nowMs: number,
) {
  await scheduleDispatchJob(ctx, lifecycle, "first", nowMs);
  const refreshed = await ctx.db.get(lifecycle._id);
  if (!refreshed) throw new Error("Daily prompt lifecycle was not found.");
  await scheduleDispatchJob(ctx, refreshed, "second", nowMs);
}

async function reconcileForMembership({
  ctx,
  membership,
  nowMs,
  randomMinute,
  getPromptQuestions,
  promptSelectionSeedForTesting,
}: {
  ctx: MutationCtx;
  membership: Doc<"coupleMembers">;
  nowMs: number;
  randomMinute: (minInclusive: number, maxInclusive: number) => number;
  getPromptQuestions?: (promptDate: string) => PromptQuestions;
  promptSelectionSeedForTesting?: string;
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
    const assigned = await assignLegacyLifecyclePrompt(
      ctx,
      existing,
      nowMs,
      promptSelectionSeedForTesting,
    );
    await reconcileDispatchJobs(ctx, assigned, nowMs);
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
  await ensureDailyPromptSeeds(ctx, nowMs);
  const prompt = await selectPromptForLifecycle({
    ctx,
    coupleId: membership.coupleId,
    promptDate,
    selectionSeed: promptSelectionSeedForTesting,
  });

  const lifecycleId = await ctx.db.insert("dailyPromptLifecycles", {
    coupleId: membership.coupleId,
    promptDate,
    promptId: prompt._id,
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
  const lifecycle = await ctx.db.get(lifecycleId);
  if (!lifecycle) throw new Error("Daily prompt lifecycle was not saved.");
  await reconcileDispatchJobs(ctx, lifecycle, nowMs);

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

export const planDailyPrompts = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("couples").paginate({ cursor: args.cursor, numItems: 50 });
    const nowMs = Date.now();
    for (const couple of page.page) {
      const membership = await ctx.db
        .query("coupleMembers")
        .withIndex("by_couple", (q) => q.eq("coupleId", couple._id))
        .first();
      if (!membership) continue;
      try {
        await reconcileForMembership({
          ctx,
          membership,
          nowMs,
          randomMinute: randomMinuteFromMathRandom,
        });
      } catch (error) {
        // oxlint-disable-next-line no-console -- isolate one malformed couple while retaining operator evidence.
        console.error("Daily prompt planning failed for a couple", couple._id, error);
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, continueDailyPromptPlanning, {
        cursor: page.continueCursor,
      });
    }
    return {
      processed: page.page.length,
      continueCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

export const reconcileTodayForTesting = internalMutation({
  args: {
    nowMs: v.number(),
    randomMinute: v.number(),
    promptContentForTesting: v.optional(v.string()),
    promptSelectionSeedForTesting: v.optional(v.string()),
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
      promptSelectionSeedForTesting: args.promptSelectionSeedForTesting,
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
  const generatedPrompt = getPromptQuestions(promptDate);
  const setup = lifecycle
    ? { blockedReason: null }
    : await getSetupBlocker(ctx, membership.coupleId, promptDate, getPromptQuestions);
  if (setup.blockedReason) {
    return {
      status: "blocked" as const,
      blockedReason: setup.blockedReason,
      promptDate,
      prompt: generatedPrompt,
    };
  }

  const assignedPrompt = lifecycle?.promptId ? await getAssignedDailyPrompt(ctx, lifecycle) : null;
  return {
    status: lifecycle ? ("scheduled" as const) : ("not_scheduled" as const),
    blockedReason: null,
    promptDate,
    prompt: assignedPrompt
      ? {
          question: assignedPrompt.text,
          quizQuestion: generatedPrompt.quizQuestion,
          principle: assignedPrompt.principle,
        }
      : generatedPrompt,
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
