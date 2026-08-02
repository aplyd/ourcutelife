import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import {
  adaptLegacyPlanCategory,
  evaluateQualityTimeMutualReveal,
  evaluateQualityTimeShortlist,
  QUALITY_TIME_CATEGORIES,
} from "./qualityTimePolicy";

const qualityTimeCategoryValidator = v.union(
  v.literal("eat"),
  v.literal("drink"),
  v.literal("explore_adventure"),
  v.literal("entertainment"),
  v.literal("romance"),
);

const timingValidator = v.union(
  v.object({ kind: v.literal("now") }),
  v.object({ kind: v.literal("future"), scheduledFor: v.number() }),
);

const DRAFT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_CATEGORIES = 5;
const MAX_DECISIONS_PER_CATEGORY = 64;
const MAX_INVENTORY_PAGE_SIZE = 12;

type QualityTimeCategory = "eat" | "drink" | "explore_adventure" | "entertainment" | "romance";

type LegacyPlanCategory = "food" | "drinks" | "activity" | "entertainment" | "intimacy";

const LEGACY_CATEGORY_BY_QUALITY_TIME_CATEGORY: ReadonlyMap<
  QualityTimeCategory,
  LegacyPlanCategory
> = new Map([
  ["eat", "food"],
  ["drink", "drinks"],
  ["explore_adventure", "activity"],
  ["entertainment", "entertainment"],
  ["romance", "intimacy"],
]);

type FunctionCtx = QueryCtx | MutationCtx;

type ExactPair = {
  coupleId: Id<"couples">;
  viewerUserId: Id<"users">;
  partnerUserId: Id<"users">;
};

async function getAuthenticatedUser(ctx: FunctionCtx): Promise<Doc<"users"> | null> {
  let canonicalAuthUserId: string | null = null;
  try {
    const authUser = await authComponent.safeGetAuthUser(ctx as never);
    canonicalAuthUserId = authUser?._id ?? null;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Component "betterAuth"')) {
      throw error;
    }
  }

  const identity = canonicalAuthUserId ? null : await ctx.auth.getUserIdentity();
  const authUserId = canonicalAuthUserId ?? identity?.tokenIdentifier;
  if (!authUserId) return null;

  const users = await ctx.db
    .query("users")
    .withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId))
    .take(2);
  if (users.length > 1) throw new Error("Ambiguous authenticated user.");
  return users[0] ?? null;
}

async function requireExactPair(ctx: FunctionCtx): Promise<ExactPair> {
  const user = await getAuthenticatedUser(ctx);
  if (!user) throw new Error("Not signed in.");

  const memberships = await ctx.db
    .query("coupleMembers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .take(2);
  if (memberships.length !== 1) throw new Error("Exact couple membership required.");

  const membership = memberships[0];
  const couple = await ctx.db.get(membership.coupleId);
  if (!couple) throw new Error("Exact couple membership required.");

  const members = await ctx.db
    .query("coupleMembers")
    .withIndex("by_couple", (q) => q.eq("coupleId", membership.coupleId))
    .take(3);
  if (members.length !== 2) throw new Error("Exactly two couple members required.");

  const memberUserIds = new Set(members.map((member) => member.userId));
  if (memberUserIds.size !== 2 || !memberUserIds.has(user._id)) {
    throw new Error("Exactly two distinct couple members required.");
  }

  const partner = members.find((member) => member.userId !== user._id);
  if (!partner) throw new Error("Exactly two distinct couple members required.");

  return {
    coupleId: membership.coupleId,
    viewerUserId: user._id,
    partnerUserId: partner.userId,
  };
}

function validateCategories(categories: readonly string[]): void {
  if (categories.length < 1 || categories.length > MAX_CATEGORIES) {
    throw new Error("Choose between one and five categories.");
  }
  if (new Set(categories).size !== categories.length) {
    throw new Error("Categories must be unique.");
  }
}

function validateTiming(
  timing: { kind: "now" } | { kind: "future"; scheduledFor: number },
  now: number,
): void {
  if (timing.kind === "future") {
    if (!Number.isFinite(timing.scheduledFor) || timing.scheduledFor <= now) {
      throw new Error("Future timing must be a finite future timestamp.");
    }
  }
}

function requestMatchesExactPair(request: Doc<"qualityTimeRequests">, pair: ExactPair): boolean {
  return (
    request.coupleId === pair.coupleId &&
    request.initiatorUserId === pair.viewerUserId &&
    request.responderUserId === pair.partnerUserId
  );
}

function requestRoleForExactPair(
  request: Doc<"qualityTimeRequests">,
  pair: ExactPair,
): "initiator" | "responder" | null {
  if (request.coupleId !== pair.coupleId) return null;
  if (
    request.initiatorUserId === pair.viewerUserId &&
    request.responderUserId === pair.partnerUserId
  ) {
    return "initiator";
  }
  if (
    request.responderUserId === pair.viewerUserId &&
    request.initiatorUserId === pair.partnerUserId
  ) {
    return "responder";
  }
  return null;
}

function projectTiming(request: Doc<"qualityTimeRequests">) {
  if (request.timingKind === "future") {
    if (!Number.isFinite(request.scheduledFor)) throw new Error("Invalid request timing evidence.");
    return { kind: "future" as const, scheduledFor: request.scheduledFor };
  }
  if (request.scheduledFor !== undefined) throw new Error("Invalid request timing evidence.");
  return { kind: "now" as const };
}

async function getOwnDraftCounts(
  ctx: QueryCtx,
  request: Doc<"qualityTimeRequests">,
): Promise<Array<{ category: string; acceptedCount: number; decidedCount: number }>> {
  const counts: Array<{ category: string; acceptedCount: number; decidedCount: number }> = [];
  for (const category of request.selectedCategories) {
    await validateInitiatorCategoryEvidence(ctx, request, category);
    const decisions = await ctx.db
      .query("qualityTimeDecisions")
      .withIndex("by_request_id_and_user_id_and_category_and_created_at", (q) =>
        q
          .eq("requestId", request._id)
          .eq("userId", request.initiatorUserId)
          .eq("category", category),
      )
      .take(MAX_DECISIONS_PER_CATEGORY + 1);
    if (decisions.length > MAX_DECISIONS_PER_CATEGORY) {
      throw new Error("Invalid draft decision evidence.");
    }

    const optionIds = new Set<Id<"qualityTimeOptions">>();
    let acceptedCount = 0;
    for (const decision of decisions) {
      if (
        decision.requestId !== request._id ||
        decision.coupleId !== request.coupleId ||
        decision.userId !== request.initiatorUserId ||
        decision.category !== category ||
        optionIds.has(decision.optionId)
      ) {
        throw new Error("Invalid draft decision evidence.");
      }
      optionIds.add(decision.optionId);
      if (decision.decision === "accept") acceptedCount += 1;
    }

    counts.push({ category, acceptedCount, decidedCount: decisions.length });
  }
  return counts;
}

async function getDecidedPlanIdeaIds(
  ctx: QueryCtx,
  request: Doc<"qualityTimeRequests">,
  category: QualityTimeCategory,
): Promise<Set<Id<"planIdeas">>> {
  const decisions = await ctx.db
    .query("qualityTimeDecisions")
    .withIndex("by_request_id_and_user_id_and_category_and_created_at", (q) =>
      q.eq("requestId", request._id).eq("userId", request.initiatorUserId).eq("category", category),
    )
    .take(MAX_DECISIONS_PER_CATEGORY + 1);
  if (decisions.length > MAX_DECISIONS_PER_CATEGORY) {
    throw new Error("Invalid draft decision evidence.");
  }

  const optionIds = new Set<Id<"qualityTimeOptions">>();
  const planIdeaIds = new Set<Id<"planIdeas">>();
  for (const decision of decisions) {
    if (
      decision.requestId !== request._id ||
      decision.coupleId !== request.coupleId ||
      decision.userId !== request.initiatorUserId ||
      decision.category !== category ||
      optionIds.has(decision.optionId)
    ) {
      throw new Error("Invalid draft decision evidence.");
    }
    optionIds.add(decision.optionId);

    const option = await ctx.db.get(decision.optionId);
    if (
      !option ||
      option.requestId !== request._id ||
      option.coupleId !== request.coupleId ||
      option.category !== category ||
      planIdeaIds.has(option.planIdeaId)
    ) {
      throw new Error("Invalid draft decision evidence.");
    }
    planIdeaIds.add(option.planIdeaId);
  }
  return planIdeaIds;
}

function inferInventoryKind(idea: Doc<"planIdeas">): "activity" | "place" {
  if (idea.kind) return idea.kind;
  return idea.latitude !== undefined ||
    idea.longitude !== undefined ||
    idea.address !== undefined ||
    idea.source === "osm"
    ? "place"
    : "activity";
}

async function validateInitiatorCategoryEvidence(
  ctx: FunctionCtx,
  request: Doc<"qualityTimeRequests">,
  category: QualityTimeCategory,
): Promise<Set<Id<"planIdeas">>> {
  const decisions = await ctx.db
    .query("qualityTimeDecisions")
    .withIndex("by_request_id_and_user_id_and_category_and_created_at", (q) =>
      q.eq("requestId", request._id).eq("userId", request.initiatorUserId).eq("category", category),
    )
    .take(MAX_DECISIONS_PER_CATEGORY + 1);
  if (decisions.length > MAX_DECISIONS_PER_CATEGORY) {
    throw new Error("Initiator category decision limit reached.");
  }

  const options = await ctx.db
    .query("qualityTimeOptions")
    .withIndex("by_request_id_and_category_and_created_at", (q) =>
      q.eq("requestId", request._id).eq("category", category),
    )
    .take(MAX_DECISIONS_PER_CATEGORY + 1);
  if (options.length > MAX_DECISIONS_PER_CATEGORY || options.length !== decisions.length) {
    throw new Error("Invalid draft decision evidence.");
  }

  const optionsById = new Map<Id<"qualityTimeOptions">, Doc<"qualityTimeOptions">>();
  const planIdeaIds = new Set<Id<"planIdeas">>();
  for (const option of options) {
    if (
      option.requestId !== request._id ||
      option.coupleId !== request.coupleId ||
      option.category !== category ||
      optionsById.has(option._id) ||
      planIdeaIds.has(option.planIdeaId)
    ) {
      throw new Error("Invalid draft decision evidence.");
    }
    optionsById.set(option._id, option);
    planIdeaIds.add(option.planIdeaId);
  }

  const decisionsByOptionId = new Map<Id<"qualityTimeOptions">, Doc<"qualityTimeDecisions">>();
  for (const decision of decisions) {
    if (
      decision.requestId !== request._id ||
      decision.coupleId !== request.coupleId ||
      decision.userId !== request.initiatorUserId ||
      decision.category !== category ||
      !optionsById.has(decision.optionId) ||
      decisionsByOptionId.has(decision.optionId)
    ) {
      throw new Error("Invalid draft decision evidence.");
    }
    decisionsByOptionId.set(decision.optionId, decision);
  }

  for (const option of options) {
    const attachedDecisions = await ctx.db
      .query("qualityTimeDecisions")
      .withIndex("by_option_id", (q) => q.eq("optionId", option._id))
      .take(2);
    if (
      attachedDecisions.length !== 1 ||
      attachedDecisions[0]._id !== decisionsByOptionId.get(option._id)?._id
    ) {
      throw new Error("Invalid draft decision evidence.");
    }
  }

  return planIdeaIds;
}

async function collectSendAcceptedOptions(
  ctx: FunctionCtx,
  request: Doc<"qualityTimeRequests">,
): Promise<Array<{ optionId: string; category: QualityTimeCategory }>> {
  validateCategories(request.selectedCategories);
  const selectedCategorySet = new Set(request.selectedCategories);
  const acceptedOptions: Array<{ optionId: string; category: QualityTimeCategory }> = [];

  for (const category of QUALITY_TIME_CATEGORIES) {
    const options = await ctx.db
      .query("qualityTimeOptions")
      .withIndex("by_request_id_and_category_and_created_at", (q) =>
        q.eq("requestId", request._id).eq("category", category),
      )
      .take(MAX_DECISIONS_PER_CATEGORY + 1);
    const decisions = await ctx.db
      .query("qualityTimeDecisions")
      .withIndex("by_request_id_and_user_id_and_category_and_created_at", (q) =>
        q
          .eq("requestId", request._id)
          .eq("userId", request.initiatorUserId)
          .eq("category", category),
      )
      .take(MAX_DECISIONS_PER_CATEGORY + 1);
    if (
      options.length > MAX_DECISIONS_PER_CATEGORY ||
      decisions.length > MAX_DECISIONS_PER_CATEGORY
    ) {
      throw new Error("Invalid send shortlist evidence.");
    }
    if (!selectedCategorySet.has(category)) {
      if (options.length !== 0 || decisions.length !== 0) {
        throw new Error("Invalid send shortlist evidence.");
      }
      continue;
    }
    if (decisions.length !== options.length) {
      throw new Error("Invalid send shortlist evidence.");
    }

    const optionsById = new Map<Id<"qualityTimeOptions">, Doc<"qualityTimeOptions">>();
    const planIdeaIds = new Set<Id<"planIdeas">>();
    for (const option of options) {
      if (
        option.requestId !== request._id ||
        option.coupleId !== request.coupleId ||
        option.category !== category ||
        optionsById.has(option._id) ||
        planIdeaIds.has(option.planIdeaId)
      ) {
        throw new Error("Invalid send shortlist evidence.");
      }
      optionsById.set(option._id, option);
      planIdeaIds.add(option.planIdeaId);
    }

    const decisionsByOptionId = new Map<Id<"qualityTimeOptions">, Doc<"qualityTimeDecisions">>();
    for (const decision of decisions) {
      if (
        decision.requestId !== request._id ||
        decision.coupleId !== request.coupleId ||
        decision.userId !== request.initiatorUserId ||
        decision.category !== category ||
        !optionsById.has(decision.optionId) ||
        decisionsByOptionId.has(decision.optionId)
      ) {
        throw new Error("Invalid send shortlist evidence.");
      }
      decisionsByOptionId.set(decision.optionId, decision);
      if (decision.decision === "accept") {
        acceptedOptions.push({ optionId: decision.optionId, category });
      }
    }

    for (const option of options) {
      const attachedDecisions = await ctx.db
        .query("qualityTimeDecisions")
        .withIndex("by_option_id", (q) => q.eq("optionId", option._id))
        .take(2);
      if (
        attachedDecisions.length !== 1 ||
        attachedDecisions[0]._id !== decisionsByOptionId.get(option._id)?._id
      ) {
        throw new Error("Invalid send shortlist evidence.");
      }
    }
  }

  const readiness = evaluateQualityTimeShortlist({
    selectedCategories: request.selectedCategories,
    acceptedOptions,
  });
  if (readiness.disposition === "incomplete") throw new Error("Shortlist is not ready to send.");
  if (readiness.disposition !== "ready") throw new Error("Invalid send shortlist evidence.");
  return acceptedOptions;
}

function validateDraftRequestEvidence(request: Doc<"qualityTimeRequests">): void {
  validateCategories(request.selectedCategories);
  projectTiming(request);
  if (
    !Number.isFinite(request.createdAt) ||
    !Number.isFinite(request.updatedAt) ||
    (request.expiresAt !== undefined && !Number.isFinite(request.expiresAt)) ||
    request.responderCategories !== undefined ||
    request.sentAt !== undefined ||
    request.completedAt !== undefined ||
    request.canceledAt !== undefined
  ) {
    throw new Error("Invalid draft request evidence.");
  }
}

function validateRequestVersion(
  request: Doc<"qualityTimeRequests">,
  expectedVersion: number,
): void {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new Error("Expected version must be a finite nonnegative integer.");
  }
  validatePersistedRequestVersion(request);
  if (request.version !== expectedVersion) throw new Error("Stale request version.");
}

function validatePersistedRequestVersion(request: Doc<"qualityTimeRequests">): void {
  if (
    !Number.isSafeInteger(request.version) ||
    request.version < 1 ||
    request.version >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("Invalid request version evidence.");
  }
}

function validateActiveRequestEvidence(request: Doc<"qualityTimeRequests">): void {
  validateCategories(request.selectedCategories);
  projectTiming(request);
  if (
    !Number.isFinite(request.createdAt) ||
    !Number.isFinite(request.updatedAt) ||
    (request.expiresAt !== undefined && !Number.isFinite(request.expiresAt))
  ) {
    throw new Error("Invalid request evidence.");
  }
  if (request.status === "sent") {
    if (
      !Number.isFinite(request.sentAt) ||
      request.updatedAt !== request.sentAt ||
      request.responderCategories !== undefined ||
      request.completedAt !== undefined ||
      request.canceledAt !== undefined
    ) {
      throw new Error("Invalid sent request evidence.");
    }
    return;
  }
  if (request.status === "responding") {
    if (
      request.sentAt === undefined ||
      !Number.isFinite(request.sentAt) ||
      request.updatedAt < (request.sentAt ?? request.updatedAt) ||
      !request.responderCategories ||
      request.completedAt !== undefined ||
      request.canceledAt !== undefined
    ) {
      throw new Error("Invalid responding request evidence.");
    }
    validateCategories(request.responderCategories);
    if (
      request.responderCategories.some((category) => !request.selectedCategories.includes(category))
    ) {
      throw new Error("Invalid responding request evidence.");
    }
    return;
  }
  if (request.status === "completed") {
    if (
      !Number.isFinite(request.sentAt) ||
      !Number.isFinite(request.completedAt) ||
      request.updatedAt !== request.completedAt ||
      !request.responderCategories ||
      request.canceledAt !== undefined
    ) {
      throw new Error("Invalid completed request evidence.");
    }
    validateCategories(request.responderCategories);
    if (
      request.responderCategories.some((category) => !request.selectedCategories.includes(category))
    ) {
      throw new Error("Invalid completed request evidence.");
    }
    return;
  }
  if (request.status === "canceled" && !Number.isFinite(request.canceledAt)) {
    throw new Error("Invalid canceled request evidence.");
  }
}

function projectOption(option: Doc<"qualityTimeOptions">) {
  return {
    optionId: option._id,
    title: option.title,
    description: option.description,
    kind: option.kind,
    costLevel: option.costLevel,
    durationMinutes: option.durationMinutes,
    vibeTags: option.vibeTags.slice(0, 8),
    ...(option.photoUrl === undefined ? {} : { photoUrl: option.photoUrl }),
    ...(option.address === undefined ? {} : { address: option.address }),
  };
}

type ResponseCategoryEvidence = {
  shortlist: Doc<"qualityTimeOptions">[];
  responderDecisions: Map<Id<"qualityTimeOptions">, Doc<"qualityTimeDecisions">>;
  outcome: Doc<"qualityTimeOutcomes"> | null;
};

async function loadResponseCategoryEvidence(
  ctx: FunctionCtx,
  request: Doc<"qualityTimeRequests">,
  category: QualityTimeCategory,
): Promise<ResponseCategoryEvidence> {
  const options = await ctx.db
    .query("qualityTimeOptions")
    .withIndex("by_request_id_and_category_and_created_at", (q) =>
      q.eq("requestId", request._id).eq("category", category),
    )
    .take(MAX_DECISIONS_PER_CATEGORY + 1);
  if (options.length > MAX_DECISIONS_PER_CATEGORY) {
    throw new Error("Invalid responder shortlist evidence.");
  }

  const planIdeaIds = new Set<Id<"planIdeas">>();
  const shortlist: Doc<"qualityTimeOptions">[] = [];
  const responderDecisions = new Map<Id<"qualityTimeOptions">, Doc<"qualityTimeDecisions">>();
  for (const option of options) {
    if (
      option.requestId !== request._id ||
      option.coupleId !== request.coupleId ||
      option.category !== category ||
      planIdeaIds.has(option.planIdeaId)
    ) {
      throw new Error("Invalid responder shortlist evidence.");
    }
    planIdeaIds.add(option.planIdeaId);
    const attached = await ctx.db
      .query("qualityTimeDecisions")
      .withIndex("by_option_id", (q) => q.eq("optionId", option._id))
      .take(3);
    if (attached.length < 1 || attached.length > 2) {
      throw new Error("Invalid responder shortlist evidence.");
    }
    const initiator = attached.filter(
      (decision) =>
        decision.requestId === request._id &&
        decision.coupleId === request.coupleId &&
        decision.category === category &&
        decision.userId === request.initiatorUserId,
    );
    const responder = attached.filter(
      (decision) =>
        decision.requestId === request._id &&
        decision.coupleId === request.coupleId &&
        decision.category === category &&
        decision.userId === request.responderUserId,
    );
    if (
      initiator.length !== 1 ||
      responder.length > 1 ||
      attached.length !== 1 + responder.length
    ) {
      throw new Error("Invalid responder shortlist evidence.");
    }
    if (responder[0]) responderDecisions.set(option._id, responder[0]);
    if (initiator[0].decision === "accept") shortlist.push(option);
    else if (responder.length !== 0) throw new Error("Invalid responder shortlist evidence.");
  }
  if (shortlist.length < 3 || shortlist.length > 5) {
    throw new Error("Invalid responder shortlist evidence.");
  }
  const indexedResponderDecisions = await ctx.db
    .query("qualityTimeDecisions")
    .withIndex("by_request_id_and_user_id_and_category_and_created_at", (q) =>
      q.eq("requestId", request._id).eq("userId", request.responderUserId).eq("category", category),
    )
    .take(6);
  if (
    indexedResponderDecisions.length > 5 ||
    indexedResponderDecisions.length !== responderDecisions.size ||
    indexedResponderDecisions.some(
      (decision) => responderDecisions.get(decision.optionId)?._id !== decision._id,
    )
  ) {
    throw new Error("Invalid responder shortlist evidence.");
  }

  const outcomes = await ctx.db
    .query("qualityTimeOutcomes")
    .withIndex("by_request_id_and_category", (q) =>
      q.eq("requestId", request._id).eq("category", category),
    )
    .take(2);
  if (outcomes.length > 1) throw new Error("Invalid outcome evidence.");
  const outcome = outcomes[0] ?? null;
  if (outcome) {
    const option = shortlist.find((candidate) => candidate._id === outcome.optionId);
    const responderDecision = responderDecisions.get(outcome.optionId);
    if (
      !option ||
      outcome.requestId !== request._id ||
      outcome.coupleId !== request.coupleId ||
      outcome.category !== category ||
      !Number.isFinite(outcome.matchedAt) ||
      !Number.isFinite(outcome.createdAt) ||
      !responderDecision ||
      evaluateQualityTimeMutualReveal({
        requestStatus: request.status,
        viewerRole: "responder",
        requestCategory: category,
        responderSelectedCategory: true,
        optionCategory: option.category,
        initiatorDecision: { optionId: option._id, decision: "accept" },
        responderDecision: { optionId: option._id, decision: responderDecision.decision },
        outcomeOptionIds: [outcome.optionId],
      }).disposition !== "revealable"
    ) {
      throw new Error("Invalid outcome evidence.");
    }
  }
  return { shortlist, responderDecisions, outcome };
}

async function loadAllOutcomeEvidence(
  ctx: FunctionCtx,
  request: Doc<"qualityTimeRequests">,
): Promise<Map<QualityTimeCategory, ResponseCategoryEvidence>> {
  if (!request.responderCategories) throw new Error("Invalid responder category evidence.");
  validateCategories(request.responderCategories);
  if (
    request.responderCategories.some((category) => !request.selectedCategories.includes(category))
  ) {
    throw new Error("Invalid responder category evidence.");
  }
  const allOutcomes = await ctx.db
    .query("qualityTimeOutcomes")
    .withIndex("by_request_id_and_created_at", (q) => q.eq("requestId", request._id))
    .take(MAX_CATEGORIES + 1);
  if (allOutcomes.length > MAX_CATEGORIES) throw new Error("Invalid outcome evidence.");

  const evidence = new Map<QualityTimeCategory, ResponseCategoryEvidence>();
  for (const category of request.responderCategories) {
    evidence.set(category, await loadResponseCategoryEvidence(ctx, request, category));
  }
  const knownOutcomeIds = new Set(
    [...evidence.values()].flatMap((value) => (value.outcome ? [value.outcome._id] : [])),
  );
  if (knownOutcomeIds.size !== allOutcomes.length) throw new Error("Invalid outcome evidence.");
  return evidence;
}

async function expireIfOverdue(
  ctx: MutationCtx,
  request: Doc<"qualityTimeRequests">,
  now: number,
): Promise<{ requestId: Id<"qualityTimeRequests">; status: "expired"; version: number } | null> {
  if (request.expiresAt !== undefined && !Number.isFinite(request.expiresAt)) {
    throw new Error("Invalid request expiry evidence.");
  }
  if (request.expiresAt === undefined || now < request.expiresAt) return null;
  const version = request.version + 1;
  await ctx.db.patch(request._id, { status: "expired", version, updatedAt: now });
  return { requestId: request._id, status: "expired", version };
}

export const createDraft = mutation({
  args: {
    timing: timingValidator,
    selectedCategories: v.array(qualityTimeCategoryValidator),
  },
  handler: async (ctx, args) => {
    const pair = await requireExactPair(ctx);
    const now = Date.now();
    validateCategories(args.selectedCategories);
    validateTiming(args.timing, now);

    const requestId = await ctx.db.insert("qualityTimeRequests", {
      coupleId: pair.coupleId,
      initiatorUserId: pair.viewerUserId,
      responderUserId: pair.partnerUserId,
      timingKind: args.timing.kind,
      scheduledFor: args.timing.kind === "future" ? args.timing.scheduledFor : undefined,
      selectedCategories: args.selectedCategories,
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + DRAFT_LIFETIME_MS,
    });

    return { requestId, status: "draft" as const, version: 1 };
  },
});

export const listDraftInventory = query({
  args: {
    requestId: v.id("qualityTimeRequests"),
    category: qualityTimeCategoryValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const pair = await requireExactPair(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "draft" || !requestMatchesExactPair(request, pair)) {
      throw new Error("Request not found.");
    }
    validatePersistedRequestVersion(request);
    validateDraftRequestEvidence(request);
    if (request.expiresAt !== undefined && Date.now() >= request.expiresAt) {
      throw new Error("Request not found.");
    }
    if (!request.selectedCategories.includes(args.category)) {
      throw new Error("Category is not selected.");
    }
    if (
      !Number.isSafeInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > MAX_INVENTORY_PAGE_SIZE
    ) {
      throw new Error("Inventory page size must be an integer from 1 to 12.");
    }

    const legacyCategory = LEGACY_CATEGORY_BY_QUALITY_TIME_CATEGORY.get(args.category);
    if (!legacyCategory) throw new Error("Unsupported inventory category.");
    const decidedPlanIdeaIds = await getDecidedPlanIdeaIds(ctx, request, args.category);
    const inventory = await ctx.db
      .query("planIdeas")
      .withIndex("by_couple_and_category", (q) =>
        q.eq("coupleId", request.coupleId).eq("category", legacyCategory),
      )
      .paginate(args.paginationOpts);

    const page = [];
    for (const idea of inventory.page) {
      if (decidedPlanIdeaIds.has(idea._id)) continue;
      page.push({
        planIdeaId: idea._id,
        title: idea.title,
        description: idea.description,
        kind: inferInventoryKind(idea),
        costLevel: idea.costLevel,
        durationMinutes: idea.durationMinutes,
        vibeTags: idea.vibeTags.slice(0, 8),
        ...(idea.photoUrl === undefined ? {} : { photoUrl: idea.photoUrl }),
        ...(idea.address === undefined ? {} : { address: idea.address }),
      });
    }

    return { ...inventory, page };
  },
});

export const recordDecision = mutation({
  args: {
    requestId: v.id("qualityTimeRequests"),
    expectedVersion: v.number(),
    planIdeaId: v.optional(v.id("planIdeas")),
    optionId: v.optional(v.id("qualityTimeOptions")),
    decision: v.union(v.literal("accept"), v.literal("pass")),
  },
  handler: async (ctx, args) => {
    const pair = await requireExactPair(ctx);
    const request = await ctx.db.get(args.requestId);
    const role = request ? requestRoleForExactPair(request, pair) : null;
    if (!request || !role) throw new Error("Request not found.");

    if (role === "responder") {
      const optionId = args.optionId;
      if (optionId === undefined || args.planIdeaId !== undefined) {
        throw new Error("Request not found.");
      }
      if (request.status !== "responding" || !request.responderCategories) {
        throw new Error("Request not found.");
      }
      validateRequestVersion(request, args.expectedVersion);
      validateActiveRequestEvidence(request);
      const now = Date.now();
      const expired = await expireIfOverdue(ctx, request, now);
      if (expired) return expired;

      const option = await ctx.db.get(optionId);
      if (
        !option ||
        option.requestId !== request._id ||
        option.coupleId !== request.coupleId ||
        !request.responderCategories.includes(option.category)
      ) {
        throw new Error("Invalid responder shortlist choice.");
      }
      const categoryEvidence = await loadResponseCategoryEvidence(ctx, request, option.category);
      if (
        categoryEvidence.outcome ||
        !categoryEvidence.shortlist.some((candidate) => candidate._id === option._id) ||
        categoryEvidence.responderDecisions.has(option._id)
      ) {
        throw new Error("Invalid responder shortlist choice.");
      }
      await ctx.db.insert("qualityTimeDecisions", {
        requestId: request._id,
        coupleId: request.coupleId,
        optionId: option._id,
        category: option.category,
        userId: request.responderUserId,
        decision: args.decision,
        createdAt: now,
      });

      if (args.decision === "accept") {
        const reveal = evaluateQualityTimeMutualReveal({
          requestStatus: request.status,
          viewerRole: "responder",
          requestCategory: option.category,
          responderSelectedCategory: true,
          optionCategory: option.category,
          initiatorDecision: { optionId: option._id, decision: "accept" },
          responderDecision: { optionId: option._id, decision: "accept" },
          outcomeOptionIds: [],
        });
        if (reveal.disposition !== "revealable")
          throw new Error("Invalid mutual outcome evidence.");
        await ctx.db.insert("qualityTimeOutcomes", {
          requestId: request._id,
          coupleId: request.coupleId,
          category: option.category,
          optionId: option._id,
          matchedAt: now,
          createdAt: now,
        });
      }

      let completed = true;
      for (const category of request.responderCategories) {
        if (category === option.category) {
          const decidedCount = categoryEvidence.responderDecisions.size + 1;
          if (args.decision !== "accept" && decidedCount < categoryEvidence.shortlist.length) {
            completed = false;
          }
          continue;
        }
        const evidence = await loadResponseCategoryEvidence(ctx, request, category);
        if (!evidence.outcome && evidence.responderDecisions.size < evidence.shortlist.length) {
          completed = false;
        }
      }
      const version = request.version + 1;
      await ctx.db.patch(request._id, {
        status: completed ? "completed" : "responding",
        version,
        updatedAt: now,
        completedAt: completed ? now : undefined,
      });
      return {
        requestId: request._id,
        status: completed ? ("completed" as const) : ("responding" as const),
        version,
      };
    }

    if (request.status !== "draft" || !requestMatchesExactPair(request, pair)) {
      throw new Error("Request not found.");
    }
    const planIdeaId = args.planIdeaId;
    if (planIdeaId === undefined || args.optionId !== undefined) {
      throw new Error("Request not found.");
    }
    validateRequestVersion(request, args.expectedVersion);
    validateDraftRequestEvidence(request);

    const now = Date.now();
    if (request.expiresAt !== undefined && now >= request.expiresAt) {
      const version = request.version + 1;
      await ctx.db.patch(request._id, { status: "expired", version, updatedAt: now });
      return { requestId: request._id, status: "expired" as const, version };
    }

    const idea = await ctx.db.get(planIdeaId);
    if (!idea || idea.coupleId !== request.coupleId) {
      throw new Error("Invalid Quality Time inventory choice.");
    }
    const category = adaptLegacyPlanCategory(idea.category);
    if (!category || !request.selectedCategories.includes(category)) {
      throw new Error("Invalid Quality Time inventory category.");
    }

    const decidedPlanIdeaIds = await validateInitiatorCategoryEvidence(ctx, request, category);
    if (decidedPlanIdeaIds.size >= MAX_DECISIONS_PER_CATEGORY) {
      throw new Error("Initiator category decision limit reached.");
    }
    if (decidedPlanIdeaIds.has(idea._id)) {
      throw new Error("Invalid draft decision evidence.");
    }
    const existingOptions = await ctx.db
      .query("qualityTimeOptions")
      .withIndex("by_request_id_and_plan_idea_id", (q) =>
        q.eq("requestId", request._id).eq("planIdeaId", idea._id),
      )
      .take(2);
    if (existingOptions.length !== 0) {
      throw new Error("Invalid draft decision evidence.");
    }

    const optionId = await ctx.db.insert("qualityTimeOptions", {
      requestId: request._id,
      coupleId: request.coupleId,
      category,
      planIdeaId: idea._id,
      title: idea.title,
      description: idea.description,
      kind: inferInventoryKind(idea),
      costLevel: idea.costLevel,
      durationMinutes: idea.durationMinutes,
      vibeTags: idea.vibeTags.slice(0, 8),
      photoUrl: idea.photoUrl,
      address: idea.address,
      sourceCreatedByUserId: idea.createdByUserId,
      createdAt: now,
    });
    await ctx.db.insert("qualityTimeDecisions", {
      requestId: request._id,
      coupleId: request.coupleId,
      optionId,
      category,
      userId: request.initiatorUserId,
      decision: args.decision,
      createdAt: now,
    });

    const version = request.version + 1;
    await ctx.db.patch(request._id, { version, updatedAt: now });
    return { requestId: request._id, status: "draft" as const, version };
  },
});

export const sendRequest = mutation({
  args: {
    requestId: v.id("qualityTimeRequests"),
    expectedVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const pair = await requireExactPair(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "draft" || !requestMatchesExactPair(request, pair)) {
      throw new Error("Request not found.");
    }
    validateRequestVersion(request, args.expectedVersion);
    validateDraftRequestEvidence(request);

    const now = Date.now();
    if (request.expiresAt !== undefined && now >= request.expiresAt) {
      const version = request.version + 1;
      await ctx.db.patch(request._id, { status: "expired", version, updatedAt: now });
      return { requestId: request._id, status: "expired" as const, version };
    }

    await collectSendAcceptedOptions(ctx, request);
    const version = request.version + 1;
    await ctx.db.patch(request._id, {
      status: "sent",
      sentAt: now,
      updatedAt: now,
      version,
    });
    return { requestId: request._id, status: "sent" as const, version };
  },
});

export const beginResponse = mutation({
  args: {
    requestId: v.id("qualityTimeRequests"),
    expectedVersion: v.number(),
    categories: v.array(qualityTimeCategoryValidator),
  },
  handler: async (ctx, args) => {
    const pair = await requireExactPair(ctx);
    const request = await ctx.db.get(args.requestId);
    if (
      !request ||
      request.status !== "sent" ||
      requestRoleForExactPair(request, pair) !== "responder"
    ) {
      throw new Error("Request not found.");
    }
    validateRequestVersion(request, args.expectedVersion);
    validateActiveRequestEvidence(request);
    validateCategories(args.categories);
    if (args.categories.some((category) => !request.selectedCategories.includes(category))) {
      throw new Error("Responder categories must be a subset of request categories.");
    }
    if (request.responderCategories !== undefined) {
      throw new Error("Invalid sent request evidence.");
    }
    await collectSendAcceptedOptions(ctx, request);
    const now = Date.now();
    const expired = await expireIfOverdue(ctx, request, now);
    if (expired) return expired;
    const version = request.version + 1;
    await ctx.db.patch(request._id, {
      responderCategories: args.categories,
      status: "responding",
      version,
      updatedAt: now,
    });
    return { requestId: request._id, status: "responding" as const, version };
  },
});

export const cancelRequest = mutation({
  args: {
    requestId: v.id("qualityTimeRequests"),
    expectedVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const pair = await requireExactPair(ctx);
    const request = await ctx.db.get(args.requestId);
    const role = request ? requestRoleForExactPair(request, pair) : null;
    if (!request || !role || !["draft", "sent", "responding"].includes(request.status)) {
      throw new Error("Request not found.");
    }
    if (request.status === "draft" && role !== "initiator") {
      throw new Error("Request not found.");
    }
    validateRequestVersion(request, args.expectedVersion);
    if (request.status === "draft") validateDraftRequestEvidence(request);
    else validateActiveRequestEvidence(request);
    const now = Date.now();
    const expired = await expireIfOverdue(ctx, request, now);
    if (expired) return expired;
    const version = request.version + 1;
    await ctx.db.patch(request._id, {
      status: "canceled",
      canceledAt: now,
      updatedAt: now,
      version,
    });
    return { requestId: request._id, status: "canceled" as const, version };
  },
});

export const getRequest = query({
  args: { requestId: v.id("qualityTimeRequests") },
  handler: async (ctx, args) => {
    const pair = await requireExactPair(ctx);
    const request = await ctx.db.get(args.requestId);
    const role = request ? requestRoleForExactPair(request, pair) : null;

    if (!request || !role || (request.status === "draft" && role !== "initiator")) {
      throw new Error("Request not found.");
    }
    validatePersistedRequestVersion(request);
    if (request.status === "draft") validateDraftRequestEvidence(request);
    else validateActiveRequestEvidence(request);
    const timing = projectTiming(request);
    const effectiveStatus =
      ["draft", "sent", "responding"].includes(request.status) &&
      request.expiresAt !== undefined &&
      Number.isFinite(request.expiresAt) &&
      Date.now() >= request.expiresAt
        ? "expired"
        : request.status;
    if (request.expiresAt !== undefined && !Number.isFinite(request.expiresAt)) {
      throw new Error("Invalid request expiry evidence.");
    }
    const base = {
      requestId: request._id,
      status: effectiveStatus,
      version: request.version,
      timing,
      selectedCategories: request.selectedCategories,
    };

    if (effectiveStatus === "expired" || effectiveStatus === "canceled") {
      return base;
    }
    if (effectiveStatus === "sent") {
      if (!Number.isFinite(request.sentAt) || request.responderCategories !== undefined) {
        throw new Error("Invalid sent request evidence.");
      }
      await collectSendAcceptedOptions(ctx, request);
      return base;
    }
    if (effectiveStatus === "responding") {
      const evidence = await loadAllOutcomeEvidence(ctx, request);
      if (role === "initiator") return base;
      return {
        ...base,
        responderCategories: request.responderCategories!,
        categoryResults: request.responderCategories!.map((category) => {
          const categoryEvidence = evidence.get(category)!;
          if (categoryEvidence.outcome) {
            const option = categoryEvidence.shortlist.find(
              (candidate) => candidate._id === categoryEvidence.outcome!.optionId,
            )!;
            return { category, status: "matched" as const, option: projectOption(option) };
          }
          return {
            category,
            status: "pending" as const,
            options: categoryEvidence.shortlist
              .filter((option) => !categoryEvidence.responderDecisions.has(option._id))
              .map(projectOption),
          };
        }),
      };
    }
    if (effectiveStatus === "completed") {
      if (!Number.isFinite(request.completedAt) || request.updatedAt !== request.completedAt) {
        throw new Error("Invalid completed request evidence.");
      }
      const evidence = await loadAllOutcomeEvidence(ctx, request);
      return {
        ...base,
        categoryResults: request.responderCategories!.map((category) => {
          const categoryEvidence = evidence.get(category)!;
          if (!categoryEvidence.outcome) {
            if (categoryEvidence.responderDecisions.size !== categoryEvidence.shortlist.length) {
              throw new Error("Invalid completed request evidence.");
            }
            return { category, status: "no_match" as const };
          }
          const option = categoryEvidence.shortlist.find(
            (candidate) => candidate._id === categoryEvidence.outcome!.optionId,
          )!;
          return { category, status: "matched" as const, option: projectOption(option) };
        }),
      };
    }
    if (effectiveStatus !== "draft") throw new Error("Request not found.");

    const shortlistCounts = await getOwnDraftCounts(ctx, request);
    return { ...base, shortlistCounts };
  },
});
