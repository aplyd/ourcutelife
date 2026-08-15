/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test, vi } from "vitest";

import type { Id } from "./_generated/dataModel";
import {
  listPendingResponses as listPendingResponsesDefinition,
  recordDecision as recordDecisionDefinition,
} from "./qualityTime";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("recordDecision exports the top-level object validator required by Convex mutations", () => {
  const registered = recordDecisionDefinition as unknown as { exportArgs: () => string };
  expect(JSON.parse(registered.exportArgs())).toMatchObject({ type: "object" });
});

test("listPendingResponses exports an exact empty object validator", () => {
  const registered = listPendingResponsesDefinition as unknown as { exportArgs: () => string };
  expect(JSON.parse(registered.exportArgs())).toEqual({ type: "object", value: {} });
});

type Category = "eat" | "drink" | "explore_adventure" | "entertainment" | "romance";
type Timing = { kind: "now" } | { kind: "future"; scheduledFor: number };

const createDraft = makeFunctionReference<
  "mutation",
  { timing: Timing; selectedCategories: Category[] },
  { requestId: Id<"qualityTimeRequests">; status: "draft"; version: number }
>("qualityTime:createDraft");

const getRequest = makeFunctionReference<
  "query",
  { requestId: Id<"qualityTimeRequests"> },
  {
    requestId: Id<"qualityTimeRequests">;
    status: "draft" | "sent";
    version: number;
    timing: Timing;
    selectedCategories: Category[];
    shortlistCounts?: Array<{ category: string; acceptedCount: number; decidedCount: number }>;
  }
>("qualityTime:getRequest");

const sendRequest = makeFunctionReference<
  "mutation",
  { requestId: Id<"qualityTimeRequests">; expectedVersion: number },
  { requestId: Id<"qualityTimeRequests">; status: "sent" | "expired"; version: number }
>("qualityTime:sendRequest");

const beginResponse = makeFunctionReference<
  "mutation",
  { requestId: Id<"qualityTimeRequests">; expectedVersion: number; categories: Category[] },
  { requestId: Id<"qualityTimeRequests">; status: "responding" | "expired"; version: number }
>("qualityTime:beginResponse");

const cancelRequest = makeFunctionReference<
  "mutation",
  { requestId: Id<"qualityTimeRequests">; expectedVersion: number },
  { requestId: Id<"qualityTimeRequests">; status: "canceled" | "expired"; version: number }
>("qualityTime:cancelRequest");

const listDraftInventory = makeFunctionReference<
  "query",
  {
    requestId: Id<"qualityTimeRequests">;
    category: Category;
    paginationOpts: { cursor: string | null; numItems: number };
  },
  {
    page: Array<{
      planIdeaId: Id<"planIdeas">;
      title: string;
      description: string;
      kind: "activity" | "place";
      costLevel: number;
      durationMinutes: number;
      vibeTags: string[];
      photoUrl?: string;
      address?: string;
    }>;
    isDone: boolean;
    continueCursor: string;
  }
>("qualityTime:listDraftInventory");

const recordDecision = makeFunctionReference<
  "mutation",
  {
    requestId: Id<"qualityTimeRequests">;
    expectedVersion: number;
    decision: "accept" | "pass";
  } & (
    | { planIdeaId: Id<"planIdeas">; optionId?: never }
    | { planIdeaId?: never; optionId: Id<"qualityTimeOptions"> }
  ),
  {
    requestId: Id<"qualityTimeRequests">;
    status: "draft" | "responding" | "completed" | "expired";
    version: number;
  }
>("qualityTime:recordDecision");

const listPendingResponses = makeFunctionReference<
  "query",
  Record<string, never>,
  Array<{
    requestId: Id<"qualityTimeRequests">;
    status: "sent" | "responding";
    version: number;
    timing: Timing;
    selectedCategories: Category[];
  }>
>("qualityTime:listPendingResponses");

type TestClient = ReturnType<typeof convexTest>;

type SeededCouple = {
  coupleId: Id<"couples">;
  initiatorUserId: Id<"users">;
  responderUserId: Id<"users">;
};

async function insertUser(t: TestClient, authUserId: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId,
      email: `${authUserId}@example.com`,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

async function seedCouple(t: TestClient, prefix = "primary"): Promise<SeededCouple> {
  const initiatorUserId = await insertUser(t, `${prefix}-initiator-auth`);
  const responderUserId = await insertUser(t, `${prefix}-responder-auth`);
  const coupleId = await t.run(async (ctx) =>
    ctx.db.insert("couples", {
      name: `${prefix} couple`,
      createdByUserId: initiatorUserId,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: initiatorUserId,
      role: "partner",
      joinedAt: 1,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: responderUserId,
      role: "partner",
      joinedAt: 2,
    });
  });
  return { coupleId, initiatorUserId, responderUserId };
}

async function insertPlanIdea(
  t: TestClient,
  coupleId: Id<"couples">,
  title: string,
  category: "food" | "drinks" | "entertainment" | "activity" | "intimacy" | "dinner" = "food",
  overrides: Record<string, unknown> = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("planIdeas", {
      coupleId,
      title,
      description: `${title} description`,
      category,
      costLevel: 1,
      durationMinutes: 30,
      vibeTags: [],
      createdAt: 1,
      ...overrides,
    } as never),
  );
}

function asInitiator(t: TestClient, prefix = "primary") {
  return t.withIdentity({ tokenIdentifier: `${prefix}-initiator-auth` });
}

function asResponder(t: TestClient, prefix = "primary") {
  return t.withIdentity({ tokenIdentifier: `${prefix}-responder-auth` });
}

test("the four additive tables accept their exact shape and expose every named index", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, initiatorUserId, responderUserId } = await seedCouple(t);

  await t.run(async (ctx) => {
    const planIdeaId = await ctx.db.insert("planIdeas", {
      coupleId,
      createdByUserId: responderUserId,
      title: "Tacos",
      description: "A neutral inventory row",
      kind: "place",
      category: "food",
      costLevel: 2,
      durationMinutes: 60,
      vibeTags: ["casual"],
      createdAt: 2,
    });
    const requestId = await ctx.db.insert("qualityTimeRequests", {
      coupleId,
      initiatorUserId,
      responderUserId,
      timingKind: "future",
      scheduledFor: 10_000,
      selectedCategories: ["eat"],
      responderCategories: ["eat"],
      status: "responding",
      version: 3,
      createdAt: 3,
      updatedAt: 4,
      sentAt: 4,
      expiresAt: 20_000,
    });
    const optionId = await ctx.db.insert("qualityTimeOptions", {
      requestId,
      coupleId,
      category: "eat",
      planIdeaId,
      title: "Tacos",
      description: "A neutral snapshot",
      kind: "place",
      costLevel: 2,
      durationMinutes: 60,
      vibeTags: ["casual"],
      sourceCreatedByUserId: responderUserId,
      createdAt: 5,
    });
    await ctx.db.insert("qualityTimeDecisions", {
      requestId,
      coupleId,
      optionId,
      category: "eat",
      userId: initiatorUserId,
      decision: "accept",
      createdAt: 6,
    });
    await ctx.db.insert("qualityTimeOutcomes", {
      requestId,
      coupleId,
      category: "eat",
      optionId,
      matchedAt: 7,
      createdAt: 7,
    });

    expect(
      await ctx.db
        .query("qualityTimeRequests")
        .withIndex("by_couple_id_and_updated_at", (q) => q.eq("coupleId", coupleId))
        .take(2),
    ).toHaveLength(1);
    expect(
      await ctx.db
        .query("qualityTimeRequests")
        .withIndex("by_couple_id_and_status_and_updated_at", (q) =>
          q.eq("coupleId", coupleId).eq("status", "responding"),
        )
        .take(2),
    ).toHaveLength(1);
    expect(
      await ctx.db
        .query("qualityTimeOptions")
        .withIndex("by_request_id_and_category_and_created_at", (q) =>
          q.eq("requestId", requestId).eq("category", "eat"),
        )
        .take(2),
    ).toHaveLength(1);
    expect(
      await ctx.db
        .query("qualityTimeOptions")
        .withIndex("by_request_id_and_plan_idea_id", (q) =>
          q.eq("requestId", requestId).eq("planIdeaId", planIdeaId),
        )
        .take(2),
    ).toHaveLength(1);
    expect(
      await ctx.db
        .query("qualityTimeDecisions")
        .withIndex("by_request_id_and_user_id_and_category_and_created_at", (q) =>
          q.eq("requestId", requestId).eq("userId", initiatorUserId).eq("category", "eat"),
        )
        .take(2),
    ).toHaveLength(1);
    expect(
      await ctx.db
        .query("qualityTimeDecisions")
        .withIndex("by_request_id_and_option_id_and_user_id", (q) =>
          q.eq("requestId", requestId).eq("optionId", optionId).eq("userId", initiatorUserId),
        )
        .take(2),
    ).toHaveLength(1);
    expect(
      await ctx.db
        .query("qualityTimeOutcomes")
        .withIndex("by_request_id_and_category", (q) =>
          q.eq("requestId", requestId).eq("category", "eat"),
        )
        .take(2),
    ).toHaveLength(1);
    expect(
      await ctx.db
        .query("qualityTimeOutcomes")
        .withIndex("by_request_id_and_created_at", (q) => q.eq("requestId", requestId))
        .take(2),
    ).toHaveLength(1);
  });
});

test("each additive table rejects values outside its closed validators", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, initiatorUserId, responderUserId } = await seedCouple(t);
  const seeded = await t.run(async (ctx) => {
    const planIdeaId = await ctx.db.insert("planIdeas", {
      coupleId,
      title: "Tacos",
      description: "Inventory",
      kind: "place",
      category: "food",
      costLevel: 2,
      durationMinutes: 60,
      vibeTags: [],
      createdAt: 1,
    });
    const requestId = await ctx.db.insert("qualityTimeRequests", {
      coupleId,
      initiatorUserId,
      responderUserId,
      timingKind: "now",
      selectedCategories: ["eat"],
      status: "draft",
      version: 1,
      createdAt: 1,
      updatedAt: 1,
      expiresAt: 2,
    });
    const optionId = await ctx.db.insert("qualityTimeOptions", {
      requestId,
      coupleId,
      category: "eat",
      planIdeaId,
      title: "Tacos",
      description: "Snapshot",
      kind: "place",
      costLevel: 2,
      durationMinutes: 60,
      vibeTags: [],
      createdAt: 1,
    });
    return { planIdeaId, requestId, optionId };
  });

  await expect(
    t.run(async (ctx) =>
      ctx.db.insert("qualityTimeRequests", {
        coupleId,
        initiatorUserId,
        responderUserId,
        timingKind: "later",
        selectedCategories: ["eat"],
        status: "draft",
        version: 1,
        createdAt: 1,
        updatedAt: 1,
      } as never),
    ),
  ).rejects.toThrow();
  await expect(
    t.run(async (ctx) =>
      ctx.db.insert("qualityTimeOptions", {
        requestId: seeded.requestId,
        coupleId,
        category: "eat",
        planIdeaId: seeded.planIdeaId,
        title: "Invalid",
        description: "Invalid kind",
        kind: "restaurant",
        costLevel: 1,
        durationMinutes: 1,
        vibeTags: [],
        createdAt: 1,
      } as never),
    ),
  ).rejects.toThrow();
  await expect(
    t.run(async (ctx) =>
      ctx.db.insert("qualityTimeDecisions", {
        requestId: seeded.requestId,
        coupleId,
        optionId: seeded.optionId,
        category: "eat",
        userId: initiatorUserId,
        decision: "maybe",
        createdAt: 1,
      } as never),
    ),
  ).rejects.toThrow();
  await expect(
    t.run(async (ctx) =>
      ctx.db.insert("qualityTimeOutcomes", {
        requestId: seeded.requestId,
        coupleId,
        category: "unknown",
        optionId: seeded.optionId,
        matchedAt: 1,
        createdAt: 1,
      } as never),
    ),
  ).rejects.toThrow();
});

test("authenticated exact-pair creation derives roles, version, timestamps, and expiry server-side", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, initiatorUserId, responderUserId } = await seedCouple(t);
  const before = Date.now();

  const result = await asInitiator(t).mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: ["eat", "romance"],
  });
  const after = Date.now();
  const request = await t.run(async (ctx) => ctx.db.get(result.requestId));

  expect(result).toEqual({ requestId: result.requestId, status: "draft", version: 1 });
  expect(Object.keys(result).sort()).toEqual(["requestId", "status", "version"]);
  expect(request).toMatchObject({
    coupleId,
    initiatorUserId,
    responderUserId,
    timingKind: "now",
    selectedCategories: ["eat", "romance"],
    status: "draft",
    version: 1,
  });
  expect(request?.scheduledFor).toBeUndefined();
  expect(request?.createdAt).toBeGreaterThanOrEqual(before);
  expect(request?.createdAt).toBeLessThanOrEqual(after);
  expect(request?.updatedAt).toBe(request?.createdAt);
  expect(request?.expiresAt).toBe((request?.createdAt ?? 0) + 7 * 24 * 60 * 60 * 1_000);
});

test("future drafts persist only a finite timestamp strictly after server time", async () => {
  const t = convexTest(schema, modules);
  await seedCouple(t);
  const scheduledFor = Date.now() + 60_000;

  const result = await asInitiator(t).mutation(createDraft, {
    timing: { kind: "future", scheduledFor },
    selectedCategories: ["drink"],
  });
  const request = await t.run(async (ctx) => ctx.db.get(result.requestId));
  expect(request).toMatchObject({ timingKind: "future", scheduledFor });

  for (const invalidScheduledFor of [Date.now() - 1, Number.POSITIVE_INFINITY, Number.NaN]) {
    await expect(
      asInitiator(t).mutation(createDraft, {
        timing: { kind: "future", scheduledFor: invalidScheduledFor },
        selectedCategories: ["drink"],
      }),
    ).rejects.toThrow();
  }
});

test("draft creation rejects unauthenticated and unpaired users", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(createDraft, { timing: { kind: "now" }, selectedCategories: ["eat"] }),
  ).rejects.toThrow("Not signed in");

  await insertUser(t, "unpaired-auth");
  await expect(
    t.withIdentity({ tokenIdentifier: "unpaired-auth" }).mutation(createDraft, {
      timing: { kind: "now" },
      selectedCategories: ["eat"],
    }),
  ).rejects.toThrow("Exact couple membership required");
});

test("duplicate memberships, duplicate member users, and three-member couples fail closed", async () => {
  const duplicateMembership = convexTest(schema, modules);
  const duplicateSeed = await seedCouple(duplicateMembership);
  const secondCoupleId = await duplicateMembership.run(async (ctx) =>
    ctx.db.insert("couples", {
      name: "Other",
      createdByUserId: duplicateSeed.initiatorUserId,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await duplicateMembership.run(async (ctx) => {
    await ctx.db.insert("coupleMembers", {
      coupleId: secondCoupleId,
      userId: duplicateSeed.initiatorUserId,
      role: "partner",
      joinedAt: 3,
    });
  });
  await expect(
    asInitiator(duplicateMembership).mutation(createDraft, {
      timing: { kind: "now" },
      selectedCategories: ["eat"],
    }),
  ).rejects.toThrow("Exact couple membership required");

  const duplicateUser = convexTest(schema, modules);
  const duplicateUserSeed = await seedCouple(duplicateUser);
  await duplicateUser.run(async (ctx) => {
    await ctx.db.delete(duplicateUserSeed.responderUserId);
    const memberships = await ctx.db
      .query("coupleMembers")
      .withIndex("by_couple", (q) => q.eq("coupleId", duplicateUserSeed.coupleId))
      .take(3);
    await ctx.db.delete(memberships[1]._id);
    await ctx.db.insert("coupleMembers", {
      coupleId: duplicateUserSeed.coupleId,
      userId: duplicateUserSeed.initiatorUserId,
      role: "partner",
      joinedAt: 3,
    });
  });
  await expect(
    asInitiator(duplicateUser).mutation(createDraft, {
      timing: { kind: "now" },
      selectedCategories: ["eat"],
    }),
  ).rejects.toThrow("Exact couple membership required");

  const threeMember = convexTest(schema, modules);
  const threeSeed = await seedCouple(threeMember);
  const thirdUserId = await insertUser(threeMember, "third-auth");
  await threeMember.run(async (ctx) => {
    await ctx.db.insert("coupleMembers", {
      coupleId: threeSeed.coupleId,
      userId: thirdUserId,
      role: "partner",
      joinedAt: 3,
    });
  });
  await expect(
    asInitiator(threeMember).mutation(createDraft, {
      timing: { kind: "now" },
      selectedCategories: ["eat"],
    }),
  ).rejects.toThrow("Exactly two couple members required");
});

test("category rules and exact argument validators reject malformed or caller-forged input", async () => {
  const t = convexTest(schema, modules);
  await seedCouple(t);

  for (const selectedCategories of [[], ["eat", "eat"]]) {
    await expect(
      asInitiator(t).mutation(createDraft, {
        timing: { kind: "now" },
        selectedCategories: selectedCategories as Category[],
      }),
    ).rejects.toThrow();
  }

  const invalidCalls: unknown[] = [
    { timing: { kind: "now", scheduledFor: Date.now() + 1_000 }, selectedCategories: ["eat"] },
    { timing: { kind: "future" }, selectedCategories: ["eat"] },
    { timing: { kind: "someday" }, selectedCategories: ["eat"] },
    { timing: { kind: "now" }, selectedCategories: ["unknown"] },
    {
      timing: { kind: "now" },
      selectedCategories: ["eat"],
      userId: "forged",
      coupleId: "forged",
      role: "initiator",
      version: 99,
      status: "sent",
    },
  ];
  for (const args of invalidCalls) {
    await expect(asInitiator(t).mutation(createDraft, args as never)).rejects.toThrow();
  }
});

test("only the initiator can read a draft and receives an allowlisted projection", async () => {
  const t = convexTest(schema, modules);
  await seedCouple(t);
  await seedCouple(t, "foreign");
  const created = await asInitiator(t).mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: ["eat", "entertainment"],
  });

  const projection = await asInitiator(t).query(getRequest, { requestId: created.requestId });
  expect(projection).toEqual({
    requestId: created.requestId,
    status: "draft",
    version: 1,
    timing: { kind: "now" },
    selectedCategories: ["eat", "entertainment"],
    shortlistCounts: [
      { category: "eat", acceptedCount: 0, decidedCount: 0 },
      { category: "entertainment", acceptedCount: 0, decidedCount: 0 },
    ],
  });
  expect(Object.keys(projection).sort()).toEqual([
    "requestId",
    "selectedCategories",
    "shortlistCounts",
    "status",
    "timing",
    "version",
  ]);
  const serialized = JSON.stringify(projection);
  for (const privateField of [
    "coupleId",
    "initiatorUserId",
    "responderUserId",
    "createdByUserId",
    "sourceCreatedByUserId",
    "expiresAt",
    "createdAt",
    "updatedAt",
  ]) {
    expect(serialized).not.toContain(privateField);
  }

  await expect(asResponder(t).query(getRequest, { requestId: created.requestId })).rejects.toThrow(
    "Request not found",
  );
  await expect(
    asInitiator(t, "foreign").query(getRequest, { requestId: created.requestId }),
  ).rejects.toThrow("Request not found");
});

test("draft operations leave all legacy planning rows byte-for-byte unchanged", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, initiatorUserId } = await seedCouple(t);
  await t.run(async (ctx) => {
    const ideaId = await ctx.db.insert("planIdeas", {
      coupleId,
      createdByUserId: initiatorUserId,
      title: "Legacy idea",
      description: "Must remain unchanged",
      category: "food",
      costLevel: 1,
      durationMinutes: 30,
      vibeTags: ["legacy"],
      createdAt: 5,
    });
    await ctx.db.insert("planSwipes", {
      coupleId,
      ideaId,
      userId: initiatorUserId,
      vote: "like",
      createdAt: 6,
    });
    await ctx.db.insert("planMatches", {
      coupleId,
      ideaId,
      status: "matched",
      createdAt: 7,
    });
    await ctx.db.insert("datePlans", {
      coupleId,
      title: "Legacy date",
      summary: "Must remain unchanged",
      itemIds: [ideaId],
      freeformSteps: [],
      durationMinutes: 30,
      costLevel: 1,
      vibeTags: ["legacy"],
      source: "manual",
      popularityScore: 0,
      trendingScore: 0,
      ratingCount: 0,
      createdAt: 8,
    });
  });

  const snapshot = async () =>
    await t.run(async (ctx) => ({
      planIdeas: await ctx.db.query("planIdeas").take(20),
      planSwipes: await ctx.db.query("planSwipes").take(20),
      planMatches: await ctx.db.query("planMatches").take(20),
      planArchiveVotes: await ctx.db.query("planArchiveVotes").take(20),
      datePlans: await ctx.db.query("datePlans").take(20),
      datePlanLikes: await ctx.db.query("datePlanLikes").take(20),
      savedDatePlans: await ctx.db.query("savedDatePlans").take(20),
      datePlanRatings: await ctx.db.query("datePlanRatings").take(20),
    }));

  const before = await snapshot();
  const created = await asInitiator(t).mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });
  await asInitiator(t).query(getRequest, { requestId: created.requestId });
  expect(await snapshot()).toEqual(before);
});

test("draft inventory adapts the exact category and paginates at the twelve-card cap", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, initiatorUserId } = await seedCouple(t);
  await t.run(async (ctx) => {
    for (let index = 0; index < 14; index += 1) {
      await ctx.db.insert("planIdeas", {
        coupleId,
        createdByUserId: initiatorUserId,
        title: `Food ${index}`,
        description: `Private provenance ${index}`,
        category: "food",
        kind: index % 2 === 0 ? "place" : undefined,
        costLevel: index % 4,
        durationMinutes: 30 + index,
        vibeTags: ["cozy", "shared", "extra", "four", "five", "six", "seven", "eight", "hidden"],
        photoUrl: index === 0 ? "https://example.com/food.jpg" : undefined,
        address: index === 0 ? "123 Test St" : undefined,
        createdAt: index + 1,
      });
    }
    await ctx.db.insert("planIdeas", {
      coupleId,
      title: "Wrong category",
      description: "Must not leak into Eat",
      category: "drinks",
      costLevel: 1,
      durationMinutes: 30,
      vibeTags: [],
      createdAt: 20,
    });
  });
  const draft = await asInitiator(t).mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });

  const first = await asInitiator(t).query(listDraftInventory, {
    requestId: draft.requestId,
    category: "eat",
    paginationOpts: { cursor: null, numItems: 12 },
  });
  expect(first.page).toHaveLength(12);
  expect(first.isDone).toBe(false);
  expect(first.page[0]).toEqual({
    planIdeaId: first.page[0].planIdeaId,
    title: "Food 0",
    description: "Private provenance 0",
    kind: "place",
    costLevel: 0,
    durationMinutes: 30,
    vibeTags: ["cozy", "shared", "extra", "four", "five", "six", "seven", "eight"],
    photoUrl: "https://example.com/food.jpg",
    address: "123 Test St",
  });
  expect(Object.keys(first.page[0]).sort()).toEqual([
    "address",
    "costLevel",
    "description",
    "durationMinutes",
    "kind",
    "photoUrl",
    "planIdeaId",
    "title",
    "vibeTags",
  ]);
  expect(JSON.stringify(first)).not.toContain("createdByUserId");
  expect(JSON.stringify(first)).not.toContain("coupleId");

  const second = await asInitiator(t).query(listDraftInventory, {
    requestId: draft.requestId,
    category: "eat",
    paginationOpts: { cursor: first.continueCursor, numItems: 12 },
  });
  expect(second.page).toHaveLength(2);
  expect(second.isDone).toBe(true);
});

test("draft inventory is initiator-only, selected-category-only, and rejects invalid limits", async () => {
  const t = convexTest(schema, modules);
  await seedCouple(t);
  const draft = await asInitiator(t).mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });

  await expect(
    asResponder(t).query(listDraftInventory, {
      requestId: draft.requestId,
      category: "eat",
      paginationOpts: { cursor: null, numItems: 12 },
    }),
  ).rejects.toThrow("Request not found");
  await expect(
    asInitiator(t).query(listDraftInventory, {
      requestId: draft.requestId,
      category: "drink",
      paginationOpts: { cursor: null, numItems: 12 },
    }),
  ).rejects.toThrow("Category is not selected");
  for (const numItems of [0, 13, 1.5, Number.NaN]) {
    await expect(
      asInitiator(t).query(listDraftInventory, {
        requestId: draft.requestId,
        category: "eat",
        paginationOpts: { cursor: null, numItems },
      }),
    ).rejects.toThrow("Inventory page size");
  }
});

test("draft inventory hides already-decided ideas and fails closed on ambiguous decision evidence", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, initiatorUserId } = await seedCouple(t);
  const ideaIds = await t.run(async (ctx) => {
    const first = await ctx.db.insert("planIdeas", {
      coupleId,
      title: "Already decided",
      description: "Must be hidden",
      category: "food",
      costLevel: 1,
      durationMinutes: 30,
      vibeTags: [],
      createdAt: 1,
    });
    const second = await ctx.db.insert("planIdeas", {
      coupleId,
      title: "Still available",
      description: "May be shown",
      category: "food",
      costLevel: 1,
      durationMinutes: 30,
      vibeTags: [],
      createdAt: 2,
    });
    return { first, second };
  });
  const draft = await asInitiator(t).mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });
  const optionId = await t.run(async (ctx) =>
    ctx.db.insert("qualityTimeOptions", {
      requestId: draft.requestId,
      coupleId,
      category: "eat",
      planIdeaId: ideaIds.first,
      title: "Already decided",
      description: "Snapshot",
      kind: "place",
      costLevel: 1,
      durationMinutes: 30,
      vibeTags: [],
      createdAt: 3,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("qualityTimeDecisions", {
      requestId: draft.requestId,
      coupleId,
      optionId,
      category: "eat",
      userId: initiatorUserId,
      decision: "pass",
      createdAt: 4,
    });
  });

  const page = await asInitiator(t).query(listDraftInventory, {
    requestId: draft.requestId,
    category: "eat",
    paginationOpts: { cursor: null, numItems: 12 },
  });
  expect(page.page.map((idea) => idea.planIdeaId)).toEqual([ideaIds.second]);

  await t.run(async (ctx) => {
    const duplicateOptionId = await ctx.db.insert("qualityTimeOptions", {
      requestId: draft.requestId,
      coupleId,
      category: "eat",
      planIdeaId: ideaIds.first,
      title: "Duplicate",
      description: "Corrupt duplicate",
      kind: "place",
      costLevel: 1,
      durationMinutes: 30,
      vibeTags: [],
      createdAt: 5,
    });
    await ctx.db.insert("qualityTimeDecisions", {
      requestId: draft.requestId,
      coupleId,
      optionId: duplicateOptionId,
      category: "eat",
      userId: initiatorUserId,
      decision: "accept",
      createdAt: 6,
    });
  });
  await expect(
    asInitiator(t).query(listDraftInventory, {
      requestId: draft.requestId,
      category: "eat",
      paginationOpts: { cursor: null, numItems: 12 },
    }),
  ).rejects.toThrow("Invalid draft decision evidence");
});

test("recordDecision snapshots authoritative inventory and persists one private initiator choice", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, initiatorUserId, responderUserId } = await seedCouple(t);
  const planIdeaId = await insertPlanIdea(t, coupleId, "Snapshot", "food", {
    createdByUserId: responderUserId,
    kind: "place",
    costLevel: 2,
    durationMinutes: 75,
    vibeTags: ["1", "2", "3", "4", "5", "6", "7", "8", "hidden"],
    photoUrl: "https://example.com/photo.jpg",
    address: "123 Test St",
  });
  const draft = await asInitiator(t).mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });

  expect(
    await asInitiator(t).mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 1,
      planIdeaId,
      decision: "accept",
    }),
  ).toEqual({ requestId: draft.requestId, status: "draft", version: 2 });

  const persisted = await t.run(async (ctx) => {
    const options = await ctx.db
      .query("qualityTimeOptions")
      .withIndex("by_request_id_and_plan_idea_id", (q) =>
        q.eq("requestId", draft.requestId).eq("planIdeaId", planIdeaId),
      )
      .take(2);
    const decisions = await ctx.db
      .query("qualityTimeDecisions")
      .withIndex("by_request_id_and_user_id_and_category_and_created_at", (q) =>
        q.eq("requestId", draft.requestId).eq("userId", initiatorUserId).eq("category", "eat"),
      )
      .take(2);
    return { request: await ctx.db.get(draft.requestId), options, decisions };
  });
  expect(persisted.options).toHaveLength(1);
  expect(persisted.options[0]).toMatchObject({
    requestId: draft.requestId,
    coupleId,
    category: "eat",
    planIdeaId,
    title: "Snapshot",
    description: "Snapshot description",
    kind: "place",
    costLevel: 2,
    durationMinutes: 75,
    vibeTags: ["1", "2", "3", "4", "5", "6", "7", "8"],
    photoUrl: "https://example.com/photo.jpg",
    address: "123 Test St",
    sourceCreatedByUserId: responderUserId,
  });
  expect(persisted.decisions).toHaveLength(1);
  expect(persisted.decisions[0]).toMatchObject({
    optionId: persisted.options[0]._id,
    requestId: draft.requestId,
    coupleId,
    category: "eat",
    decision: "accept",
  });
  expect(persisted.request?.version).toBe(2);
  expect(persisted.request?.updatedAt).toBe(persisted.options[0].createdAt);

  await t.run(async (ctx) => {
    await ctx.db.patch(planIdeaId, {
      title: "Changed after decision",
      vibeTags: ["changed"],
    });
  });
  expect(await t.run(async (ctx) => ctx.db.get(persisted.options[0]._id))).toMatchObject({
    title: "Snapshot",
    vibeTags: ["1", "2", "3", "4", "5", "6", "7", "8"],
  });
  const projection = await asInitiator(t).query(getRequest, { requestId: draft.requestId });
  expect(projection.shortlistCounts).toEqual([
    { category: "eat", acceptedCount: 1, decidedCount: 1 },
  ]);
  expect(JSON.stringify(projection)).not.toContain("sourceCreatedByUserId");
  await expect(asResponder(t).query(getRequest, { requestId: draft.requestId })).rejects.toThrow(
    "Request not found",
  );
});

test("recordDecision rejects unauthorized, foreign, unknown-category, and non-draft choices", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedCouple(t);
  const foreign = await seedCouple(t, "foreign");
  const valid = await insertPlanIdea(t, coupleId, "Valid");
  const unselected = await insertPlanIdea(t, coupleId, "Drink", "drinks");
  const unknown = await insertPlanIdea(t, coupleId, "Historical", "dinner");
  const foreignIdea = await insertPlanIdea(t, foreign.coupleId, "Foreign");
  const draft = await asInitiator(t).mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });

  await expect(
    asResponder(t).mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 1,
      planIdeaId: valid,
      decision: "accept",
    }),
  ).rejects.toThrow("Request not found");
  await expect(
    asInitiator(t, "foreign").mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 1,
      planIdeaId: valid,
      decision: "accept",
    }),
  ).rejects.toThrow("Request not found");
  for (const planIdeaId of [unselected, unknown, foreignIdea]) {
    await expect(
      asInitiator(t).mutation(recordDecision, {
        requestId: draft.requestId,
        expectedVersion: 1,
        planIdeaId,
        decision: "accept",
      }),
    ).rejects.toThrow();
  }
  await t.run(async (ctx) => ctx.db.patch(draft.requestId, { status: "sent" }));
  await expect(
    asInitiator(t).mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 1,
      planIdeaId: valid,
      decision: "accept",
    }),
  ).rejects.toThrow("Request not found");
  expect(await t.run(async (ctx) => ctx.db.query("qualityTimeOptions").take(2))).toEqual([]);
});

test("recordDecision rejects malformed or stale versions and commits at most one concurrent choice", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedCouple(t);
  const first = await insertPlanIdea(t, coupleId, "First");
  const second = await insertPlanIdea(t, coupleId, "Second");
  const draft = await asInitiator(t).mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });

  for (const expectedVersion of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2]) {
    await expect(
      asInitiator(t).mutation(recordDecision, {
        requestId: draft.requestId,
        expectedVersion,
        planIdeaId: first,
        decision: "pass",
      }),
    ).rejects.toThrow();
  }
  expect(await t.run(async (ctx) => ctx.db.query("qualityTimeOptions").take(2))).toEqual([]);

  const attempts = await Promise.allSettled([
    asInitiator(t).mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 1,
      planIdeaId: first,
      decision: "pass",
    }),
    asInitiator(t).mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 1,
      planIdeaId: second,
      decision: "accept",
    }),
  ]);
  expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
  expect(await t.run(async (ctx) => ctx.db.query("qualityTimeOptions").take(3))).toHaveLength(1);
  expect(await t.run(async (ctx) => ctx.db.query("qualityTimeDecisions").take(3))).toHaveLength(1);
  expect((await t.run(async (ctx) => ctx.db.get(draft.requestId)))?.version).toBe(2);
});

test("recordDecision rejects stale expiry attempts before atomically expiring a valid draft", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedCouple(t);
  const planIdeaId = await insertPlanIdea(t, coupleId, "Expired choice");
  const draft = await asInitiator(t).mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });
  await t.run(async (ctx) => ctx.db.patch(draft.requestId, { expiresAt: Date.now() - 1 }));

  await expect(
    asInitiator(t).mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 0,
      planIdeaId,
      decision: "accept",
    }),
  ).rejects.toThrow("Stale request version");
  expect(await t.run(async (ctx) => ctx.db.get(draft.requestId))).toMatchObject({
    status: "draft",
    version: 1,
  });

  expect(
    await asInitiator(t).mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 1,
      planIdeaId,
      decision: "accept",
    }),
  ).toEqual({ requestId: draft.requestId, status: "expired", version: 2 });
  expect(await t.run(async (ctx) => ctx.db.query("qualityTimeOptions").take(1))).toEqual([]);
  expect(await t.run(async (ctx) => ctx.db.query("qualityTimeDecisions").take(1))).toEqual([]);
});

test("recordDecision rejects repeated ideas and duplicate option or decision evidence", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, initiatorUserId } = await seedCouple(t);
  const planIdeaId = await insertPlanIdea(t, coupleId, "Repeated");
  const draft = await asInitiator(t).mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });
  await asInitiator(t).mutation(recordDecision, {
    requestId: draft.requestId,
    expectedVersion: 1,
    planIdeaId,
    decision: "pass",
  });
  await expect(
    asInitiator(t).mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 2,
      planIdeaId,
      decision: "accept",
    }),
  ).rejects.toThrow();

  await t.run(async (ctx) => {
    const options = await ctx.db
      .query("qualityTimeOptions")
      .withIndex("by_request_id_and_plan_idea_id", (q) =>
        q.eq("requestId", draft.requestId).eq("planIdeaId", planIdeaId),
      )
      .take(1);
    await ctx.db.insert("qualityTimeDecisions", {
      requestId: draft.requestId,
      coupleId,
      optionId: options[0]._id,
      category: "eat",
      userId: initiatorUserId,
      decision: "accept",
      createdAt: 3,
    });
    await ctx.db.insert("qualityTimeOptions", {
      requestId: draft.requestId,
      coupleId,
      category: "eat",
      planIdeaId,
      title: "Duplicate repeated option",
      description: "Corrupt duplicate option evidence",
      kind: "place",
      costLevel: 1,
      durationMinutes: 30,
      vibeTags: [],
      createdAt: 4,
    });
  });
  await expect(
    asInitiator(t).mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 2,
      planIdeaId,
      decision: "accept",
    }),
  ).rejects.toThrow("Invalid draft decision evidence");
});

test("recordDecision rejects compensated extra decisions attached to a current-category option", async () => {
  for (const corruption of ["actor", "request", "category"] as const) {
    const t = convexTest(schema, modules);
    const seeded = await seedCouple(t, corruption);
    const firstIdea = await insertPlanIdea(t, seeded.coupleId, `${corruption} first`);
    const nextIdea = await insertPlanIdea(t, seeded.coupleId, `${corruption} next`);
    const draft = await asInitiator(t, corruption).mutation(createDraft, {
      timing: { kind: "now" },
      selectedCategories: ["eat"],
    });
    await asInitiator(t, corruption).mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 1,
      planIdeaId: firstIdea,
      decision: "accept",
    });

    await t.run(async (ctx) => {
      const [option] = await ctx.db
        .query("qualityTimeOptions")
        .withIndex("by_request_id_and_plan_idea_id", (q) =>
          q.eq("requestId", draft.requestId).eq("planIdeaId", firstIdea),
        )
        .take(1);
      const otherRequestId = await ctx.db.insert("qualityTimeRequests", {
        coupleId: seeded.coupleId,
        initiatorUserId: seeded.initiatorUserId,
        responderUserId: seeded.responderUserId,
        timingKind: "now",
        selectedCategories: ["eat"],
        status: "draft",
        version: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("qualityTimeDecisions", {
        requestId: corruption === "request" ? otherRequestId : draft.requestId,
        coupleId: seeded.coupleId,
        optionId: option._id,
        category: corruption === "category" ? "drink" : "eat",
        userId: corruption === "actor" ? seeded.responderUserId : seeded.initiatorUserId,
        decision: "pass",
        createdAt: 2,
      });
    });

    await expect(
      asInitiator(t, corruption).mutation(recordDecision, {
        requestId: draft.requestId,
        expectedVersion: 2,
        planIdeaId: nextIdea,
        decision: "pass",
      }),
    ).rejects.toThrow("Invalid draft decision evidence");
    expect((await t.run(async (ctx) => ctx.db.get(draft.requestId)))?.version).toBe(2);
  }
});

test("recordDecision fails closed on malformed evidence and the sixty-fifth category decision", async () => {
  for (const corruption of ["request", "couple", "category"] as const) {
    const t = convexTest(schema, modules);
    const seeded = await seedCouple(t);
    const idea = await insertPlanIdea(t, seeded.coupleId, corruption);
    const draft = await asInitiator(t).mutation(createDraft, {
      timing: { kind: "now" },
      selectedCategories: ["eat", "drink"],
    });
    await t.run(async (ctx) => {
      const optionId = await ctx.db.insert("qualityTimeOptions", {
        requestId: draft.requestId,
        coupleId: seeded.coupleId,
        category: "eat",
        planIdeaId: idea,
        title: corruption,
        description: corruption,
        kind: "place",
        costLevel: 1,
        durationMinutes: 30,
        vibeTags: [],
        createdAt: 1,
      });
      const otherRequestId = await ctx.db.insert("qualityTimeRequests", {
        coupleId: seeded.coupleId,
        initiatorUserId: seeded.initiatorUserId,
        responderUserId: seeded.responderUserId,
        timingKind: "now",
        selectedCategories: ["eat"],
        status: "draft",
        version: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      const corruptCoupleId = await ctx.db.insert("couples", {
        name: "Corrupt evidence couple",
        createdByUserId: seeded.initiatorUserId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("qualityTimeDecisions", {
        requestId: corruption === "request" ? otherRequestId : draft.requestId,
        coupleId: corruption === "couple" ? corruptCoupleId : seeded.coupleId,
        optionId,
        category: corruption === "category" ? "drink" : "eat",
        userId: seeded.initiatorUserId,
        decision: "pass",
        createdAt: 1,
      });
    });
    await expect(
      asInitiator(t).mutation(recordDecision, {
        requestId: draft.requestId,
        expectedVersion: 1,
        planIdeaId: idea,
        decision: "accept",
      }),
    ).rejects.toThrow();
  }

  const capped = convexTest(schema, modules);
  const seeded = await seedCouple(capped, "capped");
  const nextIdea = await insertPlanIdea(capped, seeded.coupleId, "Sixty fifth");
  const draft = await asInitiator(capped, "capped").mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });
  await capped.run(async (ctx) => {
    for (let index = 0; index < 64; index += 1) {
      const idea = await ctx.db.insert("planIdeas", {
        coupleId: seeded.coupleId,
        title: `${index}`,
        description: `${index}`,
        category: "food",
        costLevel: 1,
        durationMinutes: 30,
        vibeTags: [],
        createdAt: index,
      });
      const optionId = await ctx.db.insert("qualityTimeOptions", {
        requestId: draft.requestId,
        coupleId: seeded.coupleId,
        category: "eat",
        planIdeaId: idea,
        title: `${index}`,
        description: `${index}`,
        kind: "place",
        costLevel: 1,
        durationMinutes: 30,
        vibeTags: [],
        createdAt: index,
      });
      await ctx.db.insert("qualityTimeDecisions", {
        requestId: draft.requestId,
        coupleId: seeded.coupleId,
        optionId,
        category: "eat",
        userId: seeded.initiatorUserId,
        decision: index % 2 === 0 ? "pass" : "accept",
        createdAt: index,
      });
    }
  });
  const legacyBefore = await capped.run(async (ctx) => ({
    swipes: await ctx.db.query("planSwipes").take(2),
    matches: await ctx.db.query("planMatches").take(2),
    dates: await ctx.db.query("datePlans").take(2),
  }));
  await expect(
    asInitiator(capped, "capped").mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 1,
      planIdeaId: nextIdea,
      decision: "accept",
    }),
  ).rejects.toThrow("decision limit");
  expect(
    await capped.run(async (ctx) => ({
      swipes: await ctx.db.query("planSwipes").take(2),
      matches: await ctx.db.query("planMatches").take(2),
      dates: await ctx.db.query("datePlans").take(2),
    })),
  ).toEqual(legacyBefore);
});

async function seedShortlist(
  t: TestClient,
  seeded: SeededCouple,
  requestId: Id<"qualityTimeRequests">,
  entries: Array<{ category: "eat" | "drink"; decision: "accept" | "pass" }>,
) {
  return await t.run(async (ctx) => {
    const optionIds: Id<"qualityTimeOptions">[] = [];
    for (const [index, entry] of entries.entries()) {
      const planIdeaId = await ctx.db.insert("planIdeas", {
        coupleId: seeded.coupleId,
        title: `${entry.category} ${index}`,
        description: `${entry.category} ${index}`,
        category: entry.category === "eat" ? "food" : "drinks",
        costLevel: 1,
        durationMinutes: 30,
        vibeTags: [],
        createdAt: index + 1,
      });
      const optionId = await ctx.db.insert("qualityTimeOptions", {
        requestId,
        coupleId: seeded.coupleId,
        category: entry.category,
        planIdeaId,
        title: `${entry.category} ${index}`,
        description: `${entry.category} ${index}`,
        kind: "place",
        costLevel: 1,
        durationMinutes: 30,
        vibeTags: [],
        createdAt: index + 1,
      });
      await ctx.db.insert("qualityTimeDecisions", {
        requestId,
        coupleId: seeded.coupleId,
        optionId,
        category: entry.category,
        userId: seeded.initiatorUserId,
        decision: entry.decision,
        createdAt: index + 1,
      });
      optionIds.push(optionId);
    }
    return optionIds;
  });
}

async function makeSendDraft(
  acceptedCount: number,
  prefix: string,
  categories: Category[] = ["eat"],
) {
  const t = convexTest(schema, modules);
  const seeded = await seedCouple(t, prefix);
  const draft = await asInitiator(t, prefix).mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: categories,
  });
  await seedShortlist(t, seeded, draft.requestId, [
    ...Array.from({ length: acceptedCount }, () => ({
      category: "eat" as const,
      decision: "accept" as const,
    })),
    { category: "eat", decision: "pass" },
  ]);
  return { t, seeded, draft };
}

test("send requires three to five accepts, excludes passes, and requires every category", async () => {
  for (const acceptedCount of [2, 3, 5, 6]) {
    const { t, draft } = await makeSendDraft(acceptedCount, `send-${acceptedCount}`);
    const attempt = asInitiator(t, `send-${acceptedCount}`).mutation(sendRequest, {
      requestId: draft.requestId,
      expectedVersion: 1,
    });
    if (acceptedCount === 3 || acceptedCount === 5) {
      await expect(attempt).resolves.toEqual({
        requestId: draft.requestId,
        status: "sent",
        version: 2,
      });
    } else {
      await expect(attempt).rejects.toThrow();
      expect(await t.run(async (ctx) => ctx.db.get(draft.requestId))).toMatchObject({
        status: "draft",
        version: 1,
      });
    }
  }

  const { t, seeded, draft } = await makeSendDraft(3, "send-multiple", ["eat", "drink"]);
  await seedShortlist(t, seeded, draft.requestId, [
    { category: "drink", decision: "accept" },
    { category: "drink", decision: "accept" },
  ]);
  await expect(
    asInitiator(t, "send-multiple").mutation(sendRequest, {
      requestId: draft.requestId,
      expectedVersion: 1,
    }),
  ).rejects.toThrow();
  await seedShortlist(t, seeded, draft.requestId, [{ category: "drink", decision: "accept" }]);
  await expect(
    asInitiator(t, "send-multiple").mutation(sendRequest, {
      requestId: draft.requestId,
      expectedVersion: 1,
    }),
  ).resolves.toMatchObject({ status: "sent", version: 2 });
});

test("send fails closed on missing, duplicate, wrong-category, cross-request, and ambiguous evidence", async () => {
  for (const corruption of ["missing", "duplicate", "category", "request", "actor"] as const) {
    const prefix = `corrupt-send-${corruption}`;
    const { t, seeded, draft } = await makeSendDraft(3, prefix, ["eat", "drink"]);
    await seedShortlist(
      t,
      seeded,
      draft.requestId,
      Array.from({ length: 3 }, () => ({
        category: "drink" as const,
        decision: "accept" as const,
      })),
    );
    const option = await t.run(async (ctx) =>
      ctx.db
        .query("qualityTimeOptions")
        .withIndex("by_request_id_and_category_and_created_at", (q) =>
          q.eq("requestId", draft.requestId).eq("category", "eat"),
        )
        .take(1),
    );
    await t.run(async (ctx) => {
      const decision = (
        await ctx.db
          .query("qualityTimeDecisions")
          .withIndex("by_option_id", (q) => q.eq("optionId", option[0]._id))
          .take(1)
      )[0];
      if (corruption === "missing") {
        await ctx.db.delete(decision._id);
        return;
      }
      if (corruption === "category") {
        await ctx.db.patch(decision._id, { category: "drink" });
        return;
      }
      const otherRequestId = await ctx.db.insert("qualityTimeRequests", {
        coupleId: seeded.coupleId,
        initiatorUserId: seeded.initiatorUserId,
        responderUserId: seeded.responderUserId,
        timingKind: "now",
        selectedCategories: ["eat"],
        status: "draft",
        version: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("qualityTimeDecisions", {
        requestId: corruption === "request" ? otherRequestId : draft.requestId,
        coupleId: seeded.coupleId,
        optionId: option[0]._id,
        category: "eat",
        userId: corruption === "actor" ? seeded.responderUserId : seeded.initiatorUserId,
        decision: "accept",
        createdAt: 10,
      });
    });
    await expect(
      asInitiator(t, prefix).mutation(sendRequest, {
        requestId: draft.requestId,
        expectedVersion: 1,
      }),
    ).rejects.toThrow();
    expect(await t.run(async (ctx) => ctx.db.get(draft.requestId))).toMatchObject({
      status: "draft",
      version: 1,
    });
  }
});

test("send rejects the overflow sentinel even when three accepts appear ready", async () => {
  const { t, seeded, draft } = await makeSendDraft(0, "send-overflow");
  await seedShortlist(
    t,
    seeded,
    draft.requestId,
    Array.from({ length: 64 }, (_, index) => ({
      category: "eat",
      decision: index < 3 ? "accept" : "pass",
    })),
  );
  await expect(
    asInitiator(t, "send-overflow").mutation(sendRequest, {
      requestId: draft.requestId,
      expectedVersion: 1,
    }),
  ).rejects.toThrow();
});

test("send rejects malformed draft state before any transition", async () => {
  for (const corruption of ["timing", "sentAt"] as const) {
    const prefix = `malformed-send-${corruption}`;
    const { t, draft } = await makeSendDraft(3, prefix);
    await t.run(async (ctx) =>
      ctx.db.patch(
        draft.requestId,
        corruption === "timing" ? { scheduledFor: Date.now() + 60_000 } : { sentAt: Date.now() },
      ),
    );
    await expect(
      asInitiator(t, prefix).mutation(sendRequest, {
        requestId: draft.requestId,
        expectedVersion: 1,
      }),
    ).rejects.toThrow("Invalid");
    expect(await t.run(async (ctx) => ctx.db.get(draft.requestId))).toMatchObject({
      status: "draft",
      version: 1,
    });
  }
});

test("send commits status, timestamp, and version atomically, freezes decisions, then projects neutrally", async () => {
  const { t, seeded, draft } = await makeSendDraft(3, "atomic-send");
  await expect(
    asResponder(t, "atomic-send").query(getRequest, { requestId: draft.requestId }),
  ).rejects.toThrow("Request not found");
  const before = Date.now();
  await expect(
    asInitiator(t, "atomic-send").mutation(sendRequest, {
      requestId: draft.requestId,
      expectedVersion: 1,
    }),
  ).resolves.toEqual({ requestId: draft.requestId, status: "sent", version: 2 });
  const persisted = await t.run(async (ctx) => ctx.db.get(draft.requestId));
  expect(persisted).toMatchObject({ status: "sent", version: 2 });
  expect(persisted?.sentAt).toBeGreaterThanOrEqual(before);
  expect(persisted?.updatedAt).toBe(persisted?.sentAt);

  const responderProjection = await asResponder(t, "atomic-send").query(getRequest, {
    requestId: draft.requestId,
  });
  expect(responderProjection).toEqual({
    requestId: draft.requestId,
    status: "sent",
    version: 2,
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });
  expect(JSON.stringify(responderProjection)).not.toMatch(
    /decision|option|accept|pass|userId|coupleId/,
  );
  const nextIdea = await insertPlanIdea(t, seeded.coupleId, "Frozen");
  await expect(
    asInitiator(t, "atomic-send").mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 2,
      planIdeaId: nextIdea,
      decision: "accept",
    }),
  ).rejects.toThrow("Request not found");
});

test("send requires authentication and expires elapsed drafts without a partial send", async () => {
  const { t, draft } = await makeSendDraft(3, "expired-send");
  await expect(
    t.mutation(sendRequest, { requestId: draft.requestId, expectedVersion: 1 }),
  ).rejects.toThrow("Not signed in");
  await t.run(async (ctx) => ctx.db.patch(draft.requestId, { expiresAt: Date.now() - 1 }));

  await expect(
    asInitiator(t, "expired-send").mutation(sendRequest, {
      requestId: draft.requestId,
      expectedVersion: 1,
    }),
  ).resolves.toEqual({ requestId: draft.requestId, status: "expired", version: 2 });
  const persisted = await t.run(async (ctx) => ctx.db.get(draft.requestId));
  expect(persisted).toMatchObject({ status: "expired", version: 2 });
  expect(persisted?.sentAt).toBeUndefined();
});

test("simultaneous and stale sends commit once and create no legacy or outcome writes", async () => {
  const { t, draft } = await makeSendDraft(3, "racing-send");
  const snapshot = async () =>
    await t.run(async (ctx) => ({
      swipes: await ctx.db.query("planSwipes").take(2),
      matches: await ctx.db.query("planMatches").take(2),
      dates: await ctx.db.query("datePlans").take(2),
      outcomes: await ctx.db.query("qualityTimeOutcomes").take(2),
    }));
  const before = await snapshot();
  for (const expectedVersion of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    await expect(
      asInitiator(t, "racing-send").mutation(sendRequest, {
        requestId: draft.requestId,
        expectedVersion,
      }),
    ).rejects.toThrow();
  }
  await expect(
    asResponder(t, "racing-send").mutation(sendRequest, {
      requestId: draft.requestId,
      expectedVersion: 1,
    }),
  ).rejects.toThrow("Request not found");
  await expect(
    asInitiator(t, "racing-send").mutation(sendRequest, {
      requestId: draft.requestId,
      expectedVersion: 0,
    }),
  ).rejects.toThrow("Stale request version");
  const attempts = await Promise.allSettled([
    asInitiator(t, "racing-send").mutation(sendRequest, {
      requestId: draft.requestId,
      expectedVersion: 1,
    }),
    asInitiator(t, "racing-send").mutation(sendRequest, {
      requestId: draft.requestId,
      expectedVersion: 1,
    }),
  ]);
  expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
  expect(await snapshot()).toEqual(before);
  expect(await t.run(async (ctx) => ctx.db.get(draft.requestId))).toMatchObject({
    status: "sent",
    version: 2,
  });
});

async function makeRespondingRequest(prefix: string, categories: Category[] = ["eat"]) {
  const { t, seeded, draft } = await makeSendDraft(3, prefix, categories);
  if (categories.includes("drink")) {
    await seedShortlist(
      t,
      seeded,
      draft.requestId,
      Array.from({ length: 3 }, () => ({
        category: "drink" as const,
        decision: "accept" as const,
      })),
    );
  }
  await asInitiator(t, prefix).mutation(sendRequest, {
    requestId: draft.requestId,
    expectedVersion: 1,
  });
  await asResponder(t, prefix).mutation(beginResponse, {
    requestId: draft.requestId,
    expectedVersion: 2,
    categories,
  });
  return { t, seeded, requestId: draft.requestId };
}

test("beginResponse is responder-only, validates a unique subset, and projects only neutral shortlist cards", async () => {
  const { t, seeded, draft } = await makeSendDraft(3, "begin", ["eat", "drink"]);
  await seedShortlist(
    t,
    seeded,
    draft.requestId,
    Array.from({ length: 3 }, () => ({ category: "drink" as const, decision: "accept" as const })),
  );
  await asInitiator(t, "begin").mutation(sendRequest, {
    requestId: draft.requestId,
    expectedVersion: 1,
  });
  for (const categories of [[], ["eat", "eat"], ["romance"]] as Category[][]) {
    await expect(
      asResponder(t, "begin").mutation(beginResponse, {
        requestId: draft.requestId,
        expectedVersion: 2,
        categories,
      }),
    ).rejects.toThrow();
  }
  await expect(
    asInitiator(t, "begin").mutation(beginResponse, {
      requestId: draft.requestId,
      expectedVersion: 2,
      categories: ["eat"],
    }),
  ).rejects.toThrow("Request not found");
  await expect(
    asResponder(t, "begin").mutation(beginResponse, {
      requestId: draft.requestId,
      expectedVersion: 2,
      categories: ["eat"],
    }),
  ).resolves.toEqual({ requestId: draft.requestId, status: "responding", version: 3 });

  const responder = (await asResponder(t, "begin").query(getRequest, {
    requestId: draft.requestId,
  })) as never as Record<string, any>;
  expect(Object.keys(responder).sort()).toEqual([
    "categoryResults",
    "requestId",
    "responderCategories",
    "selectedCategories",
    "status",
    "timing",
    "version",
  ]);
  expect(responder.responderCategories).toEqual(["eat"]);
  expect(responder.categoryResults[0].options).toHaveLength(3);
  expect(Object.keys(responder.categoryResults[0].options[0]).sort()).toEqual([
    "costLevel",
    "description",
    "durationMinutes",
    "kind",
    "optionId",
    "title",
    "vibeTags",
  ]);
  expect(JSON.stringify(responder)).not.toMatch(
    /userId|coupleId|createdBy|sourceCreated|decision|pass/,
  );
  const initiator = (await asInitiator(t, "begin").query(getRequest, {
    requestId: draft.requestId,
  })) as never as Record<string, unknown>;
  expect(Object.keys(initiator).sort()).toEqual([
    "requestId",
    "selectedCategories",
    "status",
    "timing",
    "version",
  ]);
  expect(JSON.stringify(initiator)).not.toContain("responderCategories");
});

test("responder can decide only on the shortlist and same-option mutual accept creates one stopping outcome", async () => {
  const { t, requestId } = await makeRespondingRequest("mutual");
  const options = await t.run(async (ctx) =>
    ctx.db
      .query("qualityTimeOptions")
      .withIndex("by_request_id_and_category_and_created_at", (q) =>
        q.eq("requestId", requestId).eq("category", "eat"),
      )
      .take(10),
  );
  await expect(
    asResponder(t, "mutual").mutation(recordDecision, {
      requestId,
      expectedVersion: 3,
      optionId: options[3]._id,
      decision: "accept",
    }),
  ).rejects.toThrow();
  await expect(
    asResponder(t, "mutual").mutation(recordDecision, {
      requestId,
      expectedVersion: 3,
      optionId: options[0]._id,
      decision: "accept",
    }),
  ).resolves.toEqual({ requestId, status: "completed", version: 4 });
  expect(await t.run(async (ctx) => ctx.db.query("qualityTimeOutcomes").take(2))).toHaveLength(1);
  await expect(
    asResponder(t, "mutual").mutation(recordDecision, {
      requestId,
      expectedVersion: 4,
      optionId: options[1]._id,
      decision: "pass",
    }),
  ).rejects.toThrow();
  for (const actor of [asInitiator(t, "mutual"), asResponder(t, "mutual")]) {
    const terminal = (await actor.query(getRequest, { requestId })) as never as Record<string, any>;
    expect(terminal.categoryResults).toEqual([
      {
        category: "eat",
        status: "matched",
        option: {
          optionId: options[0]._id,
          title: options[0].title,
          description: options[0].description,
          kind: options[0].kind,
          costLevel: options[0].costLevel,
          durationMinutes: options[0].durationMinutes,
          vibeTags: options[0].vibeTags,
        },
      },
    ]);
    expect(JSON.stringify(terminal)).not.toMatch(
      /userId|coupleId|createdBy|sourceCreated|decision|pass/,
    );
  }
});

test("responder exhaustion completes with neutral no_match and no outcome", async () => {
  const { t, requestId } = await makeRespondingRequest("exhaust");
  const options = await t.run(async (ctx) =>
    ctx.db
      .query("qualityTimeOptions")
      .withIndex("by_request_id_and_category_and_created_at", (q) =>
        q.eq("requestId", requestId).eq("category", "eat"),
      )
      .take(10),
  );
  const shortlist = options.slice(0, 3);
  for (const [index, option] of shortlist.entries()) {
    const result = await asResponder(t, "exhaust").mutation(recordDecision, {
      requestId,
      expectedVersion: 3 + index,
      optionId: option._id,
      decision: "pass",
    });
    expect(result.status).toBe(index === shortlist.length - 1 ? "completed" : "responding");
  }
  expect(await t.run(async (ctx) => ctx.db.query("qualityTimeOutcomes").take(1))).toEqual([]);
  const terminal = (await asResponder(t, "exhaust").query(getRequest, {
    requestId,
  })) as never as Record<string, any>;
  expect(terminal.categoryResults).toEqual([{ category: "eat", status: "no_match" }]);
  expect(JSON.stringify(terminal)).not.toMatch(/decision|pass|reject|optionId/);
});

test("duplicate and malformed outcome links fail closed", async () => {
  for (const corruption of ["duplicate", "link"] as const) {
    const { t, seeded, requestId } = await makeRespondingRequest(`outcome-${corruption}`);
    const options = await t.run(async (ctx) =>
      ctx.db
        .query("qualityTimeOptions")
        .withIndex("by_request_id_and_category_and_created_at", (q) =>
          q.eq("requestId", requestId).eq("category", "eat"),
        )
        .take(2),
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(requestId, { status: "completed", completedAt: 10, updatedAt: 10 });
      await ctx.db.insert("qualityTimeOutcomes", {
        requestId,
        coupleId: seeded.coupleId,
        category: "eat",
        optionId: options[0]._id,
        matchedAt: 10,
        createdAt: 10,
      });
      if (corruption === "duplicate") {
        await ctx.db.insert("qualityTimeOutcomes", {
          requestId,
          coupleId: seeded.coupleId,
          category: "eat",
          optionId: options[1]._id,
          matchedAt: 11,
          createdAt: 11,
        });
      } else {
        await ctx.db.patch(options[0]._id, { category: "drink" });
      }
    });
    await expect(
      asInitiator(t, `outcome-${corruption}`).query(getRequest, { requestId }),
    ).rejects.toThrow();
  }
});

test("cancel is participant-only, stale-safe, terminal, neutral, and preserves private and legacy rows", async () => {
  const { t, draft } = await makeSendDraft(3, "cancel");
  await asInitiator(t, "cancel").mutation(sendRequest, {
    requestId: draft.requestId,
    expectedVersion: 1,
  });
  const before = await t.run(async (ctx) => ({
    options: await ctx.db.query("qualityTimeOptions").take(10),
    decisions: await ctx.db.query("qualityTimeDecisions").take(10),
    swipes: await ctx.db.query("planSwipes").take(10),
    matches: await ctx.db.query("planMatches").take(10),
    dates: await ctx.db.query("datePlans").take(10),
  }));
  await expect(
    asResponder(t, "cancel").mutation(cancelRequest, {
      requestId: draft.requestId,
      expectedVersion: 1,
    }),
  ).rejects.toThrow("Stale request version");
  await expect(
    asResponder(t, "cancel").mutation(cancelRequest, {
      requestId: draft.requestId,
      expectedVersion: 2,
    }),
  ).resolves.toEqual({ requestId: draft.requestId, status: "canceled", version: 3 });
  expect(await asInitiator(t, "cancel").query(getRequest, { requestId: draft.requestId })).toEqual({
    requestId: draft.requestId,
    status: "canceled",
    version: 3,
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });
  await expect(
    asInitiator(t, "cancel").mutation(cancelRequest, {
      requestId: draft.requestId,
      expectedVersion: 3,
    }),
  ).rejects.toThrow();
  expect(
    await t.run(async (ctx) => ({
      options: await ctx.db.query("qualityTimeOptions").take(10),
      decisions: await ctx.db.query("qualityTimeDecisions").take(10),
      swipes: await ctx.db.query("planSwipes").take(10),
      matches: await ctx.db.query("planMatches").take(10),
      dates: await ctx.db.query("datePlans").take(10),
    })),
  ).toEqual(before);
});

test("the responder cannot cancel a private draft and the rejected attempt writes nothing", async () => {
  const t = convexTest(schema, modules);
  await seedCouple(t, "draft-cancel");
  const draft = await asInitiator(t, "draft-cancel").mutation(createDraft, {
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });
  const before = await t.run(async (ctx) => ({
    request: await ctx.db.get(draft.requestId),
    options: await ctx.db.query("qualityTimeOptions").take(2),
    decisions: await ctx.db.query("qualityTimeDecisions").take(2),
    outcomes: await ctx.db.query("qualityTimeOutcomes").take(2),
  }));

  await expect(
    asResponder(t, "draft-cancel").mutation(cancelRequest, {
      requestId: draft.requestId,
      expectedVersion: 1,
    }),
  ).rejects.toThrow("Request not found");
  expect(
    await t.run(async (ctx) => ({
      request: await ctx.db.get(draft.requestId),
      options: await ctx.db.query("qualityTimeOptions").take(2),
      decisions: await ctx.db.query("qualityTimeDecisions").take(2),
      outcomes: await ctx.db.query("qualityTimeOutcomes").take(2),
    })),
  ).toEqual(before);
});

test("the responder decides using only an optionId from the public request projection", async () => {
  const { t, requestId } = await makeRespondingRequest("projection-option");
  const projection = (await asResponder(t, "projection-option").query(getRequest, {
    requestId,
  })) as never as Record<string, any>;
  const optionId = projection.categoryResults[0].options[0].optionId as Id<"qualityTimeOptions">;
  const responder = asResponder(t, "projection-option");

  await expect(
    responder.mutation(recordDecision, {
      requestId,
      expectedVersion: projection.version,
      optionId,
      planIdeaId: optionId,
      decision: "accept",
    } as never),
  ).rejects.toThrow("Validator error");
  await expect(
    responder.mutation(recordDecision, {
      requestId,
      expectedVersion: projection.version,
      decision: "accept",
    } as never),
  ).rejects.toThrow("Request not found");
  await expect(
    responder.mutation(recordDecision, {
      requestId,
      expectedVersion: projection.version,
      optionId,
      decision: "accept",
    }),
  ).resolves.toEqual({ requestId, status: "completed", version: 4 });
});

test("expiresAt equality projects expired, blocks inventory, and atomically expires without a choice write", async () => {
  const fixedNow = 2_000_000_000_000;
  vi.spyOn(Date, "now").mockReturnValue(fixedNow);
  try {
    const t = convexTest(schema, modules);
    const seeded = await seedCouple(t, "expiry-equality");
    const idea = await insertPlanIdea(t, seeded.coupleId, "Equality choice");
    const draft = await asInitiator(t, "expiry-equality").mutation(createDraft, {
      timing: { kind: "now" },
      selectedCategories: ["eat"],
    });
    await t.run(async (ctx) => ctx.db.patch(draft.requestId, { expiresAt: fixedNow }));

    await expect(
      asInitiator(t, "expiry-equality").query(getRequest, { requestId: draft.requestId }),
    ).resolves.toMatchObject({ status: "expired" });
    await expect(
      asInitiator(t, "expiry-equality").query(listDraftInventory, {
        requestId: draft.requestId,
        category: "eat",
        paginationOpts: { cursor: null, numItems: 12 },
      }),
    ).rejects.toThrow("Request not found");
    await expect(
      asInitiator(t, "expiry-equality").mutation(recordDecision, {
        requestId: draft.requestId,
        expectedVersion: 1,
        planIdeaId: idea,
        decision: "accept",
      }),
    ).resolves.toEqual({ requestId: draft.requestId, status: "expired", version: 2 });
    expect(await t.run(async (ctx) => ctx.db.query("qualityTimeOptions").take(1))).toEqual([]);
    expect(await t.run(async (ctx) => ctx.db.query("qualityTimeDecisions").take(1))).toEqual([]);
  } finally {
    vi.restoreAllMocks();
  }
});

test("getRequest and listDraftInventory reject malformed draft fields and versions", async () => {
  for (const corruption of ["field", "version"] as const) {
    const prefix = `malformed-draft-${corruption}`;
    const t = convexTest(schema, modules);
    await seedCouple(t, prefix);
    const draft = await asInitiator(t, prefix).mutation(createDraft, {
      timing: { kind: "now" },
      selectedCategories: ["eat"],
    });
    await t.run(async (ctx) =>
      ctx.db.patch(
        draft.requestId,
        corruption === "field" ? { sentAt: Date.now() } : { version: 0 },
      ),
    );

    await expect(
      asInitiator(t, prefix).query(getRequest, { requestId: draft.requestId }),
    ).rejects.toThrow("Invalid");
    await expect(
      asInitiator(t, prefix).query(listDraftInventory, {
        requestId: draft.requestId,
        category: "eat",
        paginationOpts: { cursor: null, numItems: 12 },
      }),
    ).rejects.toThrow("Invalid");
  }
});

test("draft counts reject orphan options and extra option-attached decision evidence", async () => {
  for (const corruption of ["orphan", "extra"] as const) {
    const prefix = `draft-count-${corruption}`;
    const t = convexTest(schema, modules);
    const seeded = await seedCouple(t, prefix);
    const idea = await insertPlanIdea(t, seeded.coupleId, `${corruption} option`);
    const draft = await asInitiator(t, prefix).mutation(createDraft, {
      timing: { kind: "now" },
      selectedCategories: ["eat"],
    });
    await asInitiator(t, prefix).mutation(recordDecision, {
      requestId: draft.requestId,
      expectedVersion: 1,
      planIdeaId: idea,
      decision: "accept",
    });
    await t.run(async (ctx) => {
      const [option] = await ctx.db
        .query("qualityTimeOptions")
        .withIndex("by_request_id_and_plan_idea_id", (q) =>
          q.eq("requestId", draft.requestId).eq("planIdeaId", idea),
        )
        .take(1);
      if (corruption === "orphan") {
        await ctx.db.delete(option._id);
      } else {
        await ctx.db.insert("qualityTimeDecisions", {
          requestId: draft.requestId,
          coupleId: seeded.coupleId,
          optionId: option._id,
          category: "eat",
          userId: seeded.responderUserId,
          decision: "pass",
          createdAt: Date.now(),
        });
      }
    });

    await expect(
      asInitiator(t, prefix).query(getRequest, { requestId: draft.requestId }),
    ).rejects.toThrow("Invalid draft decision evidence");
  }
});

async function insertDiscoverableRequest(
  t: TestClient,
  pair: SeededCouple,
  updatedAt: number,
  overrides: Record<string, unknown> = {},
  optionCount = 3,
) {
  return await t.run(async (ctx) => {
    const status = overrides.status === "responding" ? "responding" : "sent";
    const requestId = await ctx.db.insert("qualityTimeRequests", {
      coupleId: pair.coupleId,
      initiatorUserId: pair.initiatorUserId,
      responderUserId: pair.responderUserId,
      timingKind: "now",
      selectedCategories: ["eat"],
      status,
      version: status === "responding" ? 3 : 2,
      createdAt: updatedAt - 2,
      updatedAt,
      sentAt: status === "responding" ? updatedAt - 1 : updatedAt,
      responderCategories: status === "responding" ? ["eat"] : undefined,
      expiresAt: Date.now() + 60_000,
      ...overrides,
    } as never);
    for (let index = 0; index < optionCount; index += 1) {
      const planIdeaId = await ctx.db.insert("planIdeas", {
        coupleId: pair.coupleId,
        title: `Discovery ${updatedAt} ${index}`,
        description: "Neutral inventory",
        category: "food",
        costLevel: 1,
        durationMinutes: 30,
        vibeTags: [],
        createdAt: updatedAt + index,
      });
      const optionId = await ctx.db.insert("qualityTimeOptions", {
        requestId,
        coupleId: pair.coupleId,
        category: "eat",
        planIdeaId,
        title: `Discovery ${updatedAt} ${index}`,
        description: "Neutral snapshot",
        kind: "place",
        costLevel: 1,
        durationMinutes: 30,
        vibeTags: [],
        createdAt: updatedAt + index,
      });
      await ctx.db.insert("qualityTimeDecisions", {
        requestId,
        coupleId: pair.coupleId,
        optionId,
        category: "eat",
        userId: pair.initiatorUserId,
        decision: "accept",
        createdAt: updatedAt + index,
      });
    }
    return requestId;
  });
}

async function snapshotDiscoveryWriteTables(t: TestClient) {
  return await t.run(async (ctx) => ({
    qualityTimeRequests: await ctx.db.query("qualityTimeRequests").take(100),
    qualityTimeOptions: await ctx.db.query("qualityTimeOptions").take(100),
    qualityTimeDecisions: await ctx.db.query("qualityTimeDecisions").take(100),
    qualityTimeOutcomes: await ctx.db.query("qualityTimeOutcomes").take(100),
    notificationDevices: await ctx.db.query("notificationDevices").take(100),
    pairingAcceptedNotifications: await ctx.db.query("pairingAcceptedNotifications").take(100),
    pushTokens: await ctx.db.query("pushTokens").take(100),
    promptResponses: await ctx.db.query("promptResponses").take(100),
    dailyPrompts: await ctx.db.query("dailyPrompts").take(100),
    dailyPromptLifecycles: await ctx.db.query("dailyPromptLifecycles").take(100),
    dailyPromptCompletions: await ctx.db.query("dailyPromptCompletions").take(100),
    dailyPromptDeliveryAttempts: await ctx.db.query("dailyPromptDeliveryAttempts").take(100),
    dailyPromptAnswerStarts: await ctx.db.query("dailyPromptAnswerStarts").take(100),
    planIdeas: await ctx.db.query("planIdeas").take(100),
    planSwipes: await ctx.db.query("planSwipes").take(100),
    planMatches: await ctx.db.query("planMatches").take(100),
    planArchiveVotes: await ctx.db.query("planArchiveVotes").take(100),
    datePlans: await ctx.db.query("datePlans").take(100),
    datePlanLikes: await ctx.db.query("datePlanLikes").take(100),
    savedDatePlans: await ctx.db.query("savedDatePlans").take(100),
    datePlanRatings: await ctx.db.query("datePlanRatings").take(100),
  }));
}

test("pending discovery accepts no arguments and projects sent/responding only to the exact responder", async () => {
  const t = convexTest(schema, modules);
  const pair = await seedCouple(t);
  const sent = await insertDiscoverableRequest(t, pair, 10);
  const responding = await insertDiscoverableRequest(t, pair, 20, { status: "responding" });

  expect(await asInitiator(t).query(listPendingResponses, {})).toEqual([]);
  expect(await asResponder(t).query(listPendingResponses, {})).toEqual([
    {
      requestId: responding,
      status: "responding",
      version: 3,
      timing: { kind: "now" },
      selectedCategories: ["eat"],
    },
    {
      requestId: sent,
      status: "sent",
      version: 2,
      timing: { kind: "now" },
      selectedCategories: ["eat"],
    },
  ]);
  await expect(
    asResponder(t).query(listPendingResponses, { status: "sent" } as never),
  ).rejects.toThrow();
});

test("pending discovery excludes draft, completed, canceled, persisted-expired, overdue, and initiator-owned rows", async () => {
  const t = convexTest(schema, modules);
  const pair = await seedCouple(t);
  const statuses = ["draft", "completed", "canceled", "expired"] as const;
  for (let index = 0; index < statuses.length; index += 1) {
    const requestId = await insertDiscoverableRequest(t, pair, 10 + index);
    await t.run(async (ctx) => ctx.db.patch(requestId, { status: statuses[index] }));
  }
  await insertDiscoverableRequest(t, pair, 30, { expiresAt: Date.now() - 1 });

  expect(await asResponder(t).query(listPendingResponses, {})).toEqual([]);
  expect(await asInitiator(t).query(listPendingResponses, {})).toEqual([]);
});

test("pending discovery is newest-first with request ID as the equal-updatedAt tie-break", async () => {
  const t = convexTest(schema, modules);
  const pair = await seedCouple(t);
  const tiedA = await insertDiscoverableRequest(t, pair, 10);
  const tiedB = await insertDiscoverableRequest(t, pair, 10);
  const newest = await insertDiscoverableRequest(t, pair, 20);
  const tied = [tiedA, tiedB].sort();

  expect(
    (await asResponder(t).query(listPendingResponses, {})).map((entry) => entry.requestId),
  ).toEqual([newest, ...tied]);
});

test("pending discovery returns exactly ten valid mixed rows and fails closed on per-status or combined overflow", async () => {
  const exact = convexTest(schema, modules);
  const exactPair = await seedCouple(exact);
  for (let index = 0; index < 5; index += 1) {
    await insertDiscoverableRequest(exact, exactPair, 100 + index);
    await insertDiscoverableRequest(exact, exactPair, 200 + index, { status: "responding" });
  }
  expect(await asResponder(exact).query(listPendingResponses, {})).toHaveLength(10);

  await insertDiscoverableRequest(exact, exactPair, 300, { status: "responding" });
  await expect(asResponder(exact).query(listPendingResponses, {})).rejects.toThrow(
    "Quality Time requests unavailable",
  );

  const perStatus = convexTest(schema, modules);
  const perStatusPair = await seedCouple(perStatus);
  for (let index = 0; index < 11; index += 1) {
    await insertDiscoverableRequest(perStatus, perStatusPair, 400 + index);
  }
  await expect(asResponder(perStatus).query(listPendingResponses, {})).rejects.toThrow(
    "Quality Time requests unavailable",
  );
});

test("pending discovery fails closed on a raw active-status overflow before omitting effectively expired rows", async () => {
  const t = convexTest(schema, modules);
  const pair = await seedCouple(t);
  for (let index = 0; index < 11; index += 1) {
    await insertDiscoverableRequest(t, pair, 100 + index, {
      expiresAt: Date.now() - 1,
    });
  }
  await insertDiscoverableRequest(t, pair, 200);

  await expect(asResponder(t).query(listPendingResponses, {})).rejects.toThrow(
    "Quality Time requests unavailable",
  );
});

test.each([
  ["version", { version: 0 }, 3],
  ["timing", { timingKind: "now", scheduledFor: Date.now() + 60_000 }, 3],
  ["category", { selectedCategories: ["eat", "eat"] }, 3],
  ["sent active state", { responderCategories: ["eat"] }, 3],
  ["shortlist", {}, 2],
])(
  "pending discovery fails closed on malformed %s evidence",
  async (_label, overrides, optionCount) => {
    const t = convexTest(schema, modules);
    const pair = await seedCouple(t);
    await insertDiscoverableRequest(t, pair, 10, overrides, optionCount);
    await expect(asResponder(t).query(listPendingResponses, {})).rejects.toThrow();
  },
);

test("pending discovery fails closed on malformed outcome evidence", async () => {
  const t = convexTest(schema, modules);
  const pair = await seedCouple(t);
  const requestId = await insertDiscoverableRequest(t, pair, 10);
  await t.run(async (ctx) => {
    const option = (
      await ctx.db
        .query("qualityTimeOptions")
        .withIndex("by_request_id_and_category_and_created_at", (q) =>
          q.eq("requestId", requestId).eq("category", "eat"),
        )
        .take(1)
    )[0];
    await ctx.db.insert("qualityTimeOutcomes", {
      requestId,
      coupleId: pair.coupleId,
      category: "eat",
      optionId: option._id,
      matchedAt: 10,
      createdAt: 10,
    });
  });
  await expect(asResponder(t).query(listPendingResponses, {})).rejects.toThrow(
    "Quality Time requests unavailable",
  );
});

test("pending discovery fails closed on foreign and changed exact-pair membership", async () => {
  const foreign = convexTest(schema, modules);
  const pair = await seedCouple(foreign);
  const foreignPair = await seedCouple(foreign, "foreign");
  await insertDiscoverableRequest(
    foreign,
    {
      coupleId: foreignPair.coupleId,
      initiatorUserId: foreignPair.initiatorUserId,
      responderUserId: pair.responderUserId,
    },
    10,
  );
  await expect(asResponder(foreign).query(listPendingResponses, {})).rejects.toThrow(
    "Quality Time requests unavailable",
  );

  const changed = convexTest(schema, modules);
  const changedPair = await seedCouple(changed);
  await insertDiscoverableRequest(changed, changedPair, 10);
  const replacementUserId = await insertUser(changed, "replacement-auth");
  await changed.run(async (ctx) => {
    const memberships = await ctx.db
      .query("coupleMembers")
      .withIndex("by_couple", (q) => q.eq("coupleId", changedPair.coupleId))
      .take(3);
    const oldInitiatorMembership = memberships.find(
      (membership) => membership.userId === changedPair.initiatorUserId,
    )!;
    await ctx.db.delete(oldInitiatorMembership._id);
    await ctx.db.insert("coupleMembers", {
      coupleId: changedPair.coupleId,
      userId: replacementUserId,
      role: "partner",
      joinedAt: 3,
    });
  });
  await expect(asResponder(changed).query(listPendingResponses, {})).rejects.toThrow(
    "Quality Time requests unavailable",
  );
});

test("pending discovery returns only allowlisted fields and writes no Quality Time, prompt, notification, or legacy row", async () => {
  const t = convexTest(schema, modules);
  const pair = await seedCouple(t);
  await insertDiscoverableRequest(t, pair, 10, {
    timingKind: "future",
    scheduledFor: Date.now() + 30_000,
  });
  await insertDiscoverableRequest(t, pair, 20, { expiresAt: Date.now() - 1 });
  const before = await snapshotDiscoveryWriteTables(t);

  const result = await asResponder(t).query(listPendingResponses, {});
  expect(result).toHaveLength(1);
  expect(Object.keys(result[0]).sort()).toEqual([
    "requestId",
    "selectedCategories",
    "status",
    "timing",
    "version",
  ]);
  expect(result[0].timing).toEqual({
    kind: "future",
    scheduledFor: expect.any(Number),
  });
  expect(JSON.stringify(result)).not.toMatch(
    /initiator|responder|userId|coupleId|decision|outcome|option|card|author|provenance|reject|createdAt|updatedAt|expiresAt|sentAt|completedAt|canceledAt|notif|deliver|seen|opened|acknowledged/i,
  );
  expect(await snapshotDiscoveryWriteTables(t)).toEqual(before);
});
