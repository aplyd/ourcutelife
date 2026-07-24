import { v } from "convex/values";
import type { GenericId } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  createDailyPromptDeliveryKey,
  getPromptDateInTimezone,
  validateDailyPromptDeliveryStepTransition,
} from "./dailyPromptLifecycle";
import { getAuthoritativePromptDate, getLatestLifecycle } from "./dailyPromptDateResolver";

async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  const authUserId = identity?.tokenIdentifier;
  if (!authUserId) return null;

  const users = await ctx.db
    .query("users")
    .withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId))
    .take(2);
  if (users.length > 1) throw new Error("Ambiguous authenticated user.");
  return users[0] ?? null;
}

async function requireSession(ctx: QueryCtx | MutationCtx) {
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

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1)
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return hash % length;
}

async function getExactCoupleMembers(ctx: QueryCtx | MutationCtx, coupleId: Id<"couples">) {
  const members = await ctx.db
    .query("coupleMembers")
    .withIndex("by_couple", (q) => q.eq("coupleId", coupleId))
    .take(3);
  const distinctUserIds = new Set(members.map((member) => member.userId));
  if (members.length !== 2 || distinctUserIds.size !== 2) {
    throw new Error("Invalid daily prompt membership.");
  }
  return members;
}

async function getCurrentLifecycle(
  ctx: QueryCtx | MutationCtx,
  coupleId: Id<"couples">,
  promptDate: string,
) {
  const couple = await ctx.db.get(coupleId);
  if (!couple?.promptTimezone) throw new Error("Daily prompt timezone is not configured.");

  const authoritative = await getAuthoritativePromptDate(
    ctx,
    coupleId,
    Date.now(),
    couple.promptTimezone,
  );
  if (promptDate !== authoritative.promptDate) {
    const latest = await getLatestLifecycle(ctx, coupleId);
    if (!latest) throw new Error("Daily prompt is not scheduled.");
    throw new Error("Daily prompt date is not current.");
  }

  const rows = await ctx.db
    .query("dailyPromptLifecycles")
    .withIndex("by_couple_id_and_prompt_date", (q) =>
      q.eq("coupleId", coupleId).eq("promptDate", promptDate),
    )
    .take(2);
  if (rows.length === 0) throw new Error("Daily prompt is not scheduled.");
  if (rows.length > 1) throw new Error("Duplicate daily prompt lifecycle.");
  const lifecycle = rows[0];
  if (lifecycle.coupleId !== coupleId) throw new Error("Daily prompt lifecycle mismatch.");

  return lifecycle;
}

async function validateLifecycleRecipients(
  ctx: QueryCtx | MutationCtx,
  lifecycle: Doc<"dailyPromptLifecycles">,
  viewerUserId: Id<"users">,
) {
  if (lifecycle.firstUserId === lifecycle.secondUserId) {
    throw new Error("Malformed daily prompt lifecycle recipients.");
  }
  const members = await getExactCoupleMembers(ctx, lifecycle.coupleId);
  const memberUserIds = new Set(members.map((member) => member.userId));
  if (
    !memberUserIds.has(viewerUserId) ||
    !memberUserIds.has(lifecycle.firstUserId) ||
    !memberUserIds.has(lifecycle.secondUserId)
  ) {
    throw new Error("Malformed daily prompt lifecycle recipients.");
  }
}

async function getExistingStart(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  coupleId: Id<"couples">,
  promptDate: string,
) {
  const rows = await ctx.db
    .query("dailyPromptAnswerStarts")
    .withIndex("by_user_id_and_prompt_date", (q) =>
      q.eq("userId", userId).eq("promptDate", promptDate),
    )
    .take(2);
  if (rows.length > 1) throw new Error("Duplicate daily prompt answer start.");
  const start = rows[0] ?? null;
  if (start && start.coupleId !== coupleId) {
    throw new Error("Daily prompt answer start mismatch.");
  }
  return start;
}

function validateFirstAnswerCanStart(lifecycle: Doc<"dailyPromptLifecycles">) {
  if (!["scheduled", "sending", "sent"].includes(lifecycle.firstStatus)) {
    throw new Error("Illegal first daily prompt status for answer start.");
  }
}

function validatePendingSecondState(lifecycle: Doc<"dailyPromptLifecycles">) {
  if (
    lifecycle.secondScheduledAt !== undefined ||
    lifecycle.secondDeliveryKey !== undefined ||
    lifecycle.secondSchedulerJobId !== undefined
  ) {
    throw new Error("Malformed pending second daily prompt state.");
  }
}

async function validateScheduledSecondState(
  ctx: MutationCtx,
  lifecycle: Doc<"dailyPromptLifecycles">,
  startedAt: number,
  expectedJobStates: ReadonlyArray<"pending" | "inProgress" | "success"> = ["pending"],
) {
  const expectedScheduledAt = startedAt + 300_000;
  const expectedDeliveryKey = createDailyPromptDeliveryKey(lifecycle._id, "second");
  if (
    lifecycle.secondScheduledAt !== expectedScheduledAt ||
    lifecycle.secondDeliveryKey !== expectedDeliveryKey ||
    !lifecycle.secondSchedulerJobId
  ) {
    throw new Error("Malformed scheduled second daily prompt state.");
  }
  let scheduled;
  try {
    scheduled = await ctx.db.system.get(
      "_scheduled_functions",
      lifecycle.secondSchedulerJobId as GenericId<"_scheduled_functions">,
    );
  } catch {
    throw new Error("Malformed scheduled second daily prompt state.");
  }
  if (
    !scheduled ||
    scheduled.name !== "prompts:secondAnswerBoundary" ||
    scheduled.scheduledTime !== expectedScheduledAt ||
    !expectedJobStates.some((state) => state === scheduled.state.kind) ||
    JSON.stringify(scheduled.args) !== JSON.stringify([{ lifecycleId: lifecycle._id }])
  ) {
    throw new Error("Malformed scheduled second daily prompt state.");
  }
  return scheduled;
}

async function validateExistingSecondState(
  ctx: MutationCtx,
  lifecycle: Doc<"dailyPromptLifecycles">,
  startedAt: number,
) {
  if (lifecycle.firstStartedAt !== undefined && lifecycle.firstStartedAt !== startedAt) {
    throw new Error("Malformed first daily prompt start state.");
  }
  if (lifecycle.secondStatus === "pending") {
    validatePendingSecondState(lifecycle);
    return;
  }
  if (lifecycle.secondStatus === "scheduled") {
    await validateScheduledSecondState(ctx, lifecycle, startedAt, [
      "pending",
      "inProgress",
      "success",
    ]);
    return;
  }
  if (lifecycle.secondStatus === "sending" || lifecycle.secondStatus === "sent") {
    if (
      lifecycle.secondScheduledAt !== startedAt + 300_000 ||
      lifecycle.secondDeliveryKey !== createDailyPromptDeliveryKey(lifecycle._id, "second")
    ) {
      throw new Error("Malformed delivered second daily prompt state.");
    }
    return;
  }
  if (lifecycle.secondStatus === "skipped") {
    if (lifecycle.skippedAt === undefined || !lifecycle.skippedReason) {
      throw new Error("Malformed skipped second daily prompt state.");
    }
  }
}

async function recordAnswerStartFromSave({
  ctx,
  lifecycle,
  userId,
  now,
}: {
  ctx: MutationCtx;
  lifecycle: Doc<"dailyPromptLifecycles">;
  userId: Id<"users">;
  now: number;
}) {
  const existingStart = await getExistingStart(
    ctx,
    userId,
    lifecycle.coupleId,
    lifecycle.promptDate,
  );
  const start =
    existingStart ??
    (await ctx.db.get(
      await ctx.db.insert("dailyPromptAnswerStarts", {
        coupleId: lifecycle.coupleId,
        promptDate: lifecycle.promptDate,
        userId,
        startedAt: now,
        source: "first_non_empty_input",
        createdAt: now,
      }),
    ));
  if (!start) throw new Error("Daily prompt answer start was not saved.");
  const startedAt = start.startedAt;

  if (userId === lifecycle.firstUserId) {
    validateFirstAnswerCanStart(lifecycle);
    await validateExistingSecondState(ctx, lifecycle, startedAt);
    if (lifecycle.secondStatus === "pending") {
      const [partnerStart, partnerResponses] = await Promise.all([
        getExistingStart(ctx, lifecycle.secondUserId, lifecycle.coupleId, lifecycle.promptDate),
        ctx.db
          .query("promptResponses")
          .withIndex("by_user_and_date", (q) =>
            q.eq("userId", lifecycle.secondUserId).eq("promptDate", lifecycle.promptDate),
          )
          .take(2),
      ]);
      if (partnerResponses.length > 1) throw new Error("Duplicate daily prompt response.");
      const partnerResponse = partnerResponses[0] ?? null;
      if (partnerResponse && partnerResponse.coupleId !== lifecycle.coupleId) {
        throw new Error("Daily prompt response mismatch.");
      }
      if (partnerStart || partnerResponse?.response.trim()) {
        validateDailyPromptDeliveryStepTransition(lifecycle.secondStatus, "skipped");
        await ctx.db.patch(lifecycle._id, {
          firstStartedAt: lifecycle.firstStartedAt ?? startedAt,
          secondStatus: "skipped",
          skippedAt: now,
          skippedReason: "skipped_already_started",
          updatedAt: now,
        });
        return start;
      }
      validateDailyPromptDeliveryStepTransition(lifecycle.secondStatus, "scheduled");
      const secondScheduledAt = startedAt + 300_000;
      const secondDeliveryKey = createDailyPromptDeliveryKey(lifecycle._id, "second");
      const secondSchedulerJobId = await ctx.scheduler.runAt(
        secondScheduledAt,
        internal.prompts.secondAnswerBoundary,
        {
          lifecycleId: lifecycle._id,
        },
      );
      await ctx.db.patch(lifecycle._id, {
        firstStartedAt: lifecycle.firstStartedAt ?? startedAt,
        secondScheduledAt,
        secondDeliveryKey,
        secondSchedulerJobId: String(secondSchedulerJobId),
        secondStatus: "scheduled",
        updatedAt: now,
      });
    } else if (lifecycle.firstStartedAt === undefined) {
      await ctx.db.patch(lifecycle._id, { firstStartedAt: startedAt, updatedAt: now });
    }
  } else if (
    userId === lifecycle.secondUserId &&
    (lifecycle.secondStatus === "pending" || lifecycle.secondStatus === "scheduled")
  ) {
    validateFirstAnswerCanStart(lifecycle);
    if (lifecycle.secondStatus === "pending") {
      validatePendingSecondState(lifecycle);
    } else {
      if (lifecycle.firstStartedAt === undefined) {
        throw new Error("Malformed scheduled second daily prompt state.");
      }
      const scheduled = await validateScheduledSecondState(
        ctx,
        lifecycle,
        lifecycle.firstStartedAt,
        ["pending", "inProgress", "success"],
      );
      if (scheduled.state.kind === "pending") {
        await ctx.scheduler.cancel(
          lifecycle.secondSchedulerJobId as GenericId<"_scheduled_functions">,
        );
      }
    }
    validateDailyPromptDeliveryStepTransition(lifecycle.secondStatus, "skipped");
    await ctx.db.patch(lifecycle._id, {
      secondStatus: "skipped",
      skippedAt: startedAt,
      skippedReason: "skipped_already_started",
      updatedAt: now,
    });
  }

  return start;
}

const promptBank = [
  {
    principle: "appreciation",
    prompt:
      "What is one specific thing your partner did recently that you want them to know mattered?",
  },
  {
    principle: "love maps",
    prompt:
      "What is one small detail about your inner world this week that your partner might not know yet?",
  },
  {
    principle: "bids for connection",
    prompt:
      "What is one tiny way your partner could get your attention or affection today that would land well?",
  },
  {
    principle: "repair",
    prompt:
      "Is there a small moment from this week that would feel better with a quick repair or clarification?",
  },
  {
    principle: "stress reducing conversation",
    prompt:
      "What stress are you carrying that you do not need your partner to fix, only understand?",
  },
  {
    principle: "shared meaning",
    prompt: "What is one little ritual you want more of in our life together?",
  },
];

const weeklyGames = [
  {
    title: "Bid bingo",
    description:
      "Each of you makes three tiny bids for connection this week. Notice and accept as many as you can.",
    principle: "bids for connection",
  },
  {
    title: "Two appreciations, one ask",
    description:
      "Trade two specific appreciations before making one small request. Keep the ask behavioral and doable.",
    principle: "positive sentiment + gentle startup",
  },
  {
    title: "Love map lightning round",
    description:
      "Take turns asking five quick questions about current stress, hopes, preferences, and tiny joys.",
    principle: "love maps",
  },
  {
    title: "Repair phrase practice",
    description:
      "Each partner picks one repair phrase they are willing to use this week: 'Can I try that again?' counts.",
    principle: "repair attempts",
  },
];

const quizzes = [
  {
    title: "Do I know your current stress?",
    question:
      "What is one thing your partner is dealing with this week that deserves more tenderness?",
    principle: "stress reducing conversation",
  },
  {
    title: "Tiny joy check",
    question: "What small thing would make your partner's next 24 hours 5% better?",
    principle: "turning toward",
  },
  {
    title: "Ritual audit",
    question:
      "Which ritual should you protect this week: greeting, goodbye, meal, bedtime, or weekend reset?",
    principle: "shared meaning",
  },
  {
    title: "Repair readiness",
    question:
      "When conflict gets tense, what helps your partner soften: space, touch, humor, clarity, or reassurance?",
    principle: "repair attempts",
  },
];

export function chooseGeneratedContent(promptDate: string, tags: string[]) {
  const seed = `${promptDate}:${tags.join(",")}`;
  const tagText = tags[0] ? ` Recent theme: ${tags[0]}.` : "";
  const prompt = promptBank[stableIndex(seed, promptBank.length)];
  const weeklyGame = weeklyGames[stableIndex(`${seed}:game`, weeklyGames.length)];
  const quiz = quizzes[stableIndex(`${seed}:quiz`, quizzes.length)];
  return {
    prompt: `${prompt.prompt}${tagText}`,
    promptPrinciple: prompt.principle,
    weeklyGame,
    quiz,
  };
}

export function getDailyPromptQuestions(promptDate: string) {
  const content = chooseGeneratedContent(promptDate, []);
  return {
    question: content.prompt,
    quizQuestion: content.quiz.question,
  };
}

export const today = query({
  args: {},
  handler: async (ctx) => {
    const { user, membership } = await requireSession(ctx);
    const recent = await ctx.db
      .query("moments")
      .withIndex("by_couple_and_author_and_happened_at", (q) =>
        q.eq("coupleId", membership.coupleId).eq("authorUserId", user._id),
      )
      .order("desc")
      .take(10)
      .then((items) => items.filter((item) => !item.deletedAt));
    const tags = Array.from(new Set(recent.flatMap((moment) => moment.tags)));
    const couple = await ctx.db.get(membership.coupleId);
    const promptDate = couple?.promptTimezone
      ? (
          await getAuthoritativePromptDate(
            ctx,
            membership.coupleId,
            Date.now(),
            couple.promptTimezone,
          )
        ).promptDate
      : todayKey();
    const generated = chooseGeneratedContent(promptDate, tags);
    const responses = await ctx.db
      .query("promptResponses")
      .withIndex("by_couple_and_date", (q) =>
        q.eq("coupleId", membership.coupleId).eq("promptDate", promptDate),
      )
      .collect();
    const ownResponse = responses.find((response) => response.userId === user._id) ?? null;
    const partnerResponse = responses.find((response) => response.userId !== user._id) ?? null;
    const members = await ctx.db
      .query("coupleMembers")
      .withIndex("by_couple", (q) => q.eq("coupleId", membership.coupleId))
      .collect();
    const prompt = ownResponse?.prompt ?? partnerResponse?.prompt ?? generated.prompt;

    return {
      promptDate,
      prompt,
      promptPrinciple: generated.promptPrinciple,
      weeklyTopic: generated.weeklyGame.description,
      weeklyGame: generated.weeklyGame,
      quiz: generated.quiz,
      response: ownResponse?.response ?? null,
      answeredAt: ownResponse?.createdAt ?? null,
      partnerHasAnswered: Boolean(partnerResponse),
      partnerResponse:
        ownResponse && partnerResponse
          ? {
              response: partnerResponse.response,
              answeredAt: partnerResponse.createdAt,
            }
          : null,
      partnerCount: Math.max(0, members.length - 1),
      isRevealed: Boolean(ownResponse && partnerResponse),
    };
  },
});

export const startAnswering = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, membership } = await requireSession(ctx);
    const latest = await getLatestLifecycle(ctx, membership.coupleId);
    if (!latest) throw new Error("Daily prompt is not scheduled.");
    const lifecycle = await getCurrentLifecycle(ctx, membership.coupleId, latest.promptDate);
    await validateLifecycleRecipients(ctx, lifecycle, user._id);

    const responses = await ctx.db
      .query("promptResponses")
      .withIndex("by_user_and_date", (q) =>
        q.eq("userId", user._id).eq("promptDate", lifecycle.promptDate),
      )
      .take(2);
    if (responses.length > 1) throw new Error("Duplicate daily prompt response.");
    const response = responses[0] ?? null;
    if (response && response.coupleId !== membership.coupleId) {
      throw new Error("Daily prompt response mismatch.");
    }

    const existingStart = await getExistingStart(
      ctx,
      user._id,
      lifecycle.coupleId,
      lifecycle.promptDate,
    );
    if (response?.response.trim()) {
      if (!existingStart) throw new Error("Daily prompt answer start is missing.");
      return existingStart.startedAt;
    }

    const start = await recordAnswerStartFromSave({
      ctx,
      lifecycle,
      userId: user._id,
      now: Date.now(),
    });
    return start.startedAt;
  },
});

export const answer = mutation({
  args: {
    promptDate: v.string(),
    prompt: v.string(),
    response: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const response = args.response.trim();
    if (!response) throw new Error("Write an answer before saving.");
    if (response.length > 2000) throw new Error("Keep today's answer under 2,000 characters.");
    const lifecycle = await getCurrentLifecycle(ctx, membership.coupleId, args.promptDate);
    await validateLifecycleRecipients(ctx, lifecycle, user._id);
    const existing = await ctx.db
      .query("promptResponses")
      .withIndex("by_user_and_date", (q) =>
        q.eq("userId", user._id).eq("promptDate", args.promptDate),
      )
      .take(2);
    if (existing.length > 1) throw new Error("Duplicate daily prompt response.");
    const existingResponse = existing[0] ?? null;
    if (existingResponse && existingResponse.coupleId !== membership.coupleId) {
      throw new Error("Daily prompt response mismatch.");
    }
    const now = Date.now();
    const shouldRecordStart = !existingResponse?.response.trim();
    const payload = {
      coupleId: membership.coupleId,
      userId: user._id,
      promptDate: args.promptDate,
      prompt: args.prompt,
      response,
    };
    if (shouldRecordStart) {
      await recordAnswerStartFromSave({ ctx, lifecycle, userId: user._id, now });
    }
    if (existingResponse) {
      await ctx.db.patch(existingResponse._id, payload);
      return existingResponse._id;
    }
    return await ctx.db.insert("promptResponses", { ...payload, createdAt: now });
  },
});

export const secondAnswerBoundary = internalMutation({
  args: {
    lifecycleId: v.id("dailyPromptLifecycles"),
  },
  handler: async (ctx, args) => {
    const lifecycle = await ctx.db.get(args.lifecycleId);
    if (!lifecycle || lifecycle.secondStatus !== "scheduled") return null;
    if (
      lifecycle.firstStartedAt === undefined ||
      lifecycle.secondScheduledAt !== lifecycle.firstStartedAt + 300_000 ||
      lifecycle.secondDeliveryKey !== createDailyPromptDeliveryKey(lifecycle._id, "second") ||
      !lifecycle.secondSchedulerJobId
    ) {
      throw new Error("Malformed scheduled second daily prompt state.");
    }
    await validateScheduledSecondState(ctx, lifecycle, lifecycle.firstStartedAt, ["inProgress"]);

    const members = await ctx.db
      .query("coupleMembers")
      .withIndex("by_couple", (q) => q.eq("coupleId", lifecycle.coupleId))
      .take(3);
    const memberUserIds = new Set(members.map((member) => member.userId));
    const validMembership =
      members.length === 2 &&
      memberUserIds.size === 2 &&
      memberUserIds.has(lifecycle.firstUserId) &&
      memberUserIds.has(lifecycle.secondUserId);
    const [partnerStart, partnerResponses, readyDevice] = await Promise.all([
      getExistingStart(ctx, lifecycle.secondUserId, lifecycle.coupleId, lifecycle.promptDate),
      ctx.db
        .query("promptResponses")
        .withIndex("by_user_and_date", (q) =>
          q.eq("userId", lifecycle.secondUserId).eq("promptDate", lifecycle.promptDate),
        )
        .take(2),
      ctx.db
        .query("notificationDevices")
        .withIndex("by_ready_lookup", (q) =>
          q
            .eq("coupleId", lifecycle.coupleId)
            .eq("userId", lifecycle.secondUserId)
            .eq("enabled", true)
            .eq("permissionStatus", "granted")
            .gt("pushToken", ""),
        )
        .first(),
    ]);
    if (partnerResponses.length > 1) throw new Error("Duplicate daily prompt response.");
    const partnerResponse = partnerResponses[0] ?? null;
    if (partnerResponse && partnerResponse.coupleId !== lifecycle.coupleId) {
      throw new Error("Daily prompt response mismatch.");
    }
    const stale = getPromptDateInTimezone(Date.now(), lifecycle.timezone) !== lifecycle.promptDate;
    const hasReadyDevice = readyDevice !== null;
    const skippedReason = stale
      ? "skipped_stale"
      : !validMembership
        ? "skipped_membership_changed"
        : partnerStart || partnerResponse?.response.trim()
          ? "skipped_already_started"
          : !hasReadyDevice
            ? "skipped_permission_unavailable"
            : null;
    if (!skippedReason) {
      // Provider reservation/dispatch is intentionally outside Slice 05-05.
      return { status: "eligible" as const };
    }
    validateDailyPromptDeliveryStepTransition(lifecycle.secondStatus, "skipped");
    const now = Date.now();
    await ctx.db.patch(lifecycle._id, {
      secondStatus: "skipped",
      skippedAt: now,
      skippedReason,
      updatedAt: now,
    });
    return { status: "skipped" as const, reason: skippedReason };
  },
});
