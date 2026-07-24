/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const reconcileTodayForTesting = makeFunctionReference<
  "mutation",
  { nowMs: number; randomMinute: number; promptContentForTesting?: string },
  {
    status: "scheduled" | "blocked";
    lifecycleId: string | null;
    promptDate: string | null;
    blockedReason: string | null;
  }
>("dailyPromptLifecycles:reconcileTodayForTesting");

const getTodayStateForTesting = makeFunctionReference<
  "query",
  { nowMs: number; promptContentForTesting?: string },
  {
    status: "scheduled" | "not_scheduled" | "blocked";
    promptDate?: string;
    prompt?: { question: string; quizQuestion: string };
    lifecycle?: {
      promptDate: string;
      firstScheduledAt: number;
      viewerRole: "first" | "second";
      firstStatus: string;
      secondStatus: string;
    } | null;
  }
>("dailyPromptLifecycles:getTodayStateForTesting");

const reconcileToday = makeFunctionReference<
  "mutation",
  {
    nowMs?: number;
    randomMinute?: number;
    userId?: string;
    coupleId?: string;
    promptDate?: string;
  },
  {
    status: "scheduled" | "blocked";
    lifecycleId: string | null;
    promptDate: string | null;
    blockedReason: string | null;
  }
>("dailyPromptLifecycles:reconcileToday");

const getTodayState = makeFunctionReference<
  "query",
  {
    nowMs?: number;
    userId?: string;
    coupleId?: string;
    promptDate?: string;
  },
  {
    status: "scheduled" | "not_scheduled" | "blocked";
  }
>("dailyPromptLifecycles:getTodayState");

async function seedCouple(t: ReturnType<typeof convexTest>) {
  const creatorUserId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "creator-auth",
      email: "creator@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const partnerUserId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "partner-auth",
      email: "partner@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const coupleId = await t.run(async (ctx) =>
    ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: creatorUserId,
      promptTimezone: "America/New_York",
      promptTimezoneUpdatedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: creatorUserId,
      role: "partner",
      joinedAt: 10,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: partnerUserId,
      role: "partner",
      joinedAt: 20,
    });
    await ctx.db.insert("notificationDevices", {
      coupleId,
      userId: creatorUserId,
      deviceId: "creator-ios",
      pushToken: "ExponentPushToken[creator]",
      platform: "ios",
      permissionStatus: "granted",
      timezone: "America/New_York",
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("notificationDevices", {
      coupleId,
      userId: partnerUserId,
      deviceId: "partner-ios",
      pushToken: "ExponentPushToken[partner]",
      platform: "ios",
      permissionStatus: "granted",
      timezone: "America/Chicago",
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    });
  });

  return { coupleId, creatorUserId, partnerUserId };
}

async function seedOtherCouple(t: ReturnType<typeof convexTest>) {
  const otherUserId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "other-auth",
      email: "other@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const otherPartnerId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "other-partner-auth",
      email: "other-partner@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const otherCoupleId = await t.run(async (ctx) =>
    ctx.db.insert("couples", {
      name: "Them",
      createdByUserId: otherUserId,
      promptTimezone: "America/Los_Angeles",
      promptTimezoneUpdatedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("coupleMembers", {
      coupleId: otherCoupleId,
      userId: otherUserId,
      role: "partner",
      joinedAt: 10,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId: otherCoupleId,
      userId: otherPartnerId,
      role: "partner",
      joinedAt: 20,
    });
  });

  return { otherCoupleId, otherUserId, otherPartnerId };
}

test("reconcile creates today's immutable lifecycle from server now, timezone, readiness, prompt content, and injected random minute", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId, partnerUserId } = await seedCouple(t);

  const result = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
    });

  const lifecycle = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .unique(),
  );

  expect(result).toMatchObject({
    status: "scheduled",
    lifecycleId: lifecycle?._id,
    promptDate: "2026-07-22",
    blockedReason: null,
  });
  expect(lifecycle).toMatchObject({
    coupleId,
    promptDate: "2026-07-22",
    timezone: "America/New_York",
    firstUserId: creatorUserId,
    secondUserId: partnerUserId,
    randomizedFirstLocalMinute: 1140,
    firstScheduledAt: Date.UTC(2026, 6, 22, 23, 0),
    firstStatus: "scheduled",
    secondStatus: "pending",
  });
});

test("in-window reconcile keeps today and constrains low random minute to the remaining local interval", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedCouple(t);

  const result = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 23, 0, 30),
      randomMinute: 1140,
    });

  const lifecycle = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .unique(),
  );

  expect(result).toMatchObject({
    status: "scheduled",
    promptDate: "2026-07-22",
  });
  expect(lifecycle).toMatchObject({
    promptDate: "2026-07-22",
    randomizedFirstLocalMinute: 1230,
    firstScheduledAt: Date.UTC(2026, 6, 23, 0, 30),
  });
  expect(lifecycle?.randomizedFirstLocalMinute).toBeGreaterThanOrEqual(1140);
  expect(lifecycle?.randomizedFirstLocalMinute).toBeLessThanOrEqual(1259);
});

test("20:59 local reconcile keeps today and persists the last inclusive delivery minute", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedCouple(t);

  const result = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 23, 0, 59),
      randomMinute: 1140,
    });

  const lifecycle = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .unique(),
  );

  expect(result).toMatchObject({
    status: "scheduled",
    promptDate: "2026-07-22",
  });
  expect(lifecycle).toMatchObject({
    promptDate: "2026-07-22",
    randomizedFirstLocalMinute: 1259,
    firstScheduledAt: Date.UTC(2026, 6, 23, 0, 59),
  });
});

test("sub-minute reconciliation never persists a first schedule before server now", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedCouple(t);

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
    nowMs: Date.UTC(2026, 6, 23, 0, 30, 30),
    randomMinute: 1140,
  });

  const lifecycle = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .unique(),
  );

  expect(lifecycle).toMatchObject({
    randomizedFirstLocalMinute: 1231,
    firstScheduledAt: Date.UTC(2026, 6, 23, 0, 31),
  });
});

test("after the final minute has started, reconciliation rolls to the next local date", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedCouple(t);

  const result = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 23, 0, 59, 30),
      randomMinute: 1140,
    });

  const lifecycle = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-23"),
      )
      .unique(),
  );

  expect(result).toMatchObject({ status: "scheduled", promptDate: "2026-07-23" });
  expect(lifecycle).toMatchObject({
    randomizedFirstLocalMinute: 1140,
    firstScheduledAt: Date.UTC(2026, 6, 23, 23, 0),
  });
});

test("after the local delivery window without an existing lifecycle, reconcile rolls forward to the next local prompt date", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedCouple(t);

  const result = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 23, 1, 1),
      randomMinute: 1259,
    });

  const lifecycle = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-23"),
      )
      .unique(),
  );

  expect(result).toMatchObject({
    status: "scheduled",
    lifecycleId: lifecycle?._id,
    promptDate: "2026-07-23",
  });
  expect(lifecycle).toMatchObject({
    promptDate: "2026-07-23",
    randomizedFirstLocalMinute: 1259,
    firstScheduledAt: Date.UTC(2026, 6, 24, 0, 59),
  });
});

test("today state is member-private and returns viewer-safe lifecycle and complete prompt state without recipient ids", async () => {
  const t = convexTest(schema, modules);
  await seedCouple(t);

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
    nowMs: Date.UTC(2026, 6, 22, 20, 30),
    randomMinute: 1140,
  });

  const state = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .query(getTodayStateForTesting, { nowMs: Date.UTC(2026, 6, 22, 20, 45) });

  expect(state).toMatchObject({
    status: "scheduled",
    promptDate: "2026-07-22",
    prompt: {
      question: expect.any(String),
      quizQuestion: expect.any(String),
    },
    lifecycle: {
      promptDate: "2026-07-22",
      firstScheduledAt: Date.UTC(2026, 6, 22, 23, 0),
      viewerRole: "first",
      firstStatus: "scheduled",
      secondStatus: "pending",
    },
  });
  expect(state.prompt?.question.length).toBeGreaterThan(0);
  expect(state.prompt?.quizQuestion.length).toBeGreaterThan(0);
  expect(JSON.stringify(state)).not.toContain("ExponentPushToken");
  expect(JSON.stringify(state)).not.toContain("firstUserId");
  expect(JSON.stringify(state)).not.toContain("secondUserId");
});

test("after-window replay preserves an existing same-day lifecycle instead of rolling forward", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedCouple(t);

  const first = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
    });
  const replay = await t
    .withIdentity({ tokenIdentifier: "partner-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 23, 1, 30),
      randomMinute: 1259,
    });

  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .take(2),
  );

  expect(replay).toMatchObject({
    status: "scheduled",
    lifecycleId: first.lifecycleId,
    promptDate: "2026-07-22",
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    randomizedFirstLocalMinute: 1140,
    timezone: "America/New_York",
    firstScheduledAt: Date.UTC(2026, 6, 22, 23, 0),
  });
});

test("recipient alternation uses the latest prior persisted lifecycle even with more than one hundred historical rows", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId, partnerUserId } = await seedCouple(t);

  await t.run(async (ctx) => {
    for (let offset = 0; offset < 101; offset += 1) {
      const date = new Date(Date.UTC(2026, 2, 1 + offset));
      const promptDate = date.toISOString().slice(0, 10);
      const isLatest = offset === 100;
      await ctx.db.insert("dailyPromptLifecycles", {
        coupleId,
        promptDate,
        timezone: "America/New_York",
        firstUserId: isLatest ? partnerUserId : creatorUserId,
        secondUserId: isLatest ? creatorUserId : partnerUserId,
        randomizedFirstLocalMinute: 1140,
        firstScheduledAt: Date.UTC(2026, 2, 1 + offset, 23, 0),
        firstStatus: "scheduled",
        secondStatus: "pending",
        createdAt: offset + 1,
        updatedAt: offset + 1,
      });
    }
  });

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
    nowMs: Date.UTC(2026, 6, 22, 20, 30),
    randomMinute: 1140,
  });

  const lifecycle = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .unique(),
  );

  expect(lifecycle).toMatchObject({
    firstUserId: creatorUserId,
    secondUserId: partnerUserId,
  });
});

test("recipient alternation fails closed when the latest prior prompt date has duplicate lifecycle rows", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId, partnerUserId } = await seedCouple(t);

  await t.run(async (ctx) => {
    await ctx.db.insert("dailyPromptLifecycles", {
      coupleId,
      promptDate: "2026-07-20",
      timezone: "America/New_York",
      firstUserId: creatorUserId,
      secondUserId: partnerUserId,
      randomizedFirstLocalMinute: 1140,
      firstScheduledAt: Date.UTC(2026, 6, 20, 23, 0),
      firstStatus: "scheduled",
      secondStatus: "pending",
      createdAt: 1,
      updatedAt: 1,
    });
    for (const createdAt of [2, 3]) {
      await ctx.db.insert("dailyPromptLifecycles", {
        coupleId,
        promptDate: "2026-07-21",
        timezone: "America/New_York",
        firstUserId: partnerUserId,
        secondUserId: creatorUserId,
        randomizedFirstLocalMinute: 1140,
        firstScheduledAt: Date.UTC(2026, 6, 21, 23, 0),
        firstStatus: "scheduled",
        secondStatus: "pending",
        createdAt,
        updatedAt: createdAt,
      });
    }
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
    }),
  ).rejects.toThrow("Duplicate daily prompt lifecycle.");
});

test("authenticated reconciler fails closed without a membership and does not accept couple or user identifiers", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "solo-auth",
      email: "solo@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );

  await expect(
    t.withIdentity({ tokenIdentifier: "solo-auth" }).mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
    }),
  ).rejects.toThrow("Pair with your partner first.");
});

test("reconcile and state require authentication and exactly one viewer membership", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId } = await seedCouple(t);
  const { otherCoupleId } = await seedOtherCouple(t);

  await expect(
    t.mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
    }),
  ).rejects.toThrow("Not signed in.");
  await expect(
    t.query(getTodayStateForTesting, { nowMs: Date.UTC(2026, 6, 22, 20, 30) }),
  ).rejects.toThrow("Not signed in.");

  await t.run(async (ctx) => {
    await ctx.db.insert("coupleMembers", {
      coupleId: otherCoupleId,
      userId: creatorUserId,
      role: "partner",
      joinedAt: 30,
    });
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
    }),
  ).rejects.toThrow("Ambiguous couple membership.");
  await expect(
    t
      .withIdentity({ tokenIdentifier: "creator-auth" })
      .query(getTodayStateForTesting, { nowMs: Date.UTC(2026, 6, 22, 20, 30) }),
  ).rejects.toThrow("Ambiguous couple membership.");

  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) => q.eq("coupleId", coupleId))
      .take(2),
  );
  expect(rows).toHaveLength(0);
});

test("reconcile blocks unless the couple has exactly two distinct member users", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, partnerUserId } = await seedCouple(t);

  await t.run(async (ctx) => {
    const partnerMembership = await ctx.db
      .query("coupleMembers")
      .withIndex("by_user", (q) => q.eq("userId", partnerUserId))
      .unique();
    if (!partnerMembership) throw new Error("Expected partner membership");
    await ctx.db.delete(partnerMembership._id);
  });
  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
    }),
  ).resolves.toMatchObject({
    status: "blocked",
    lifecycleId: null,
    blockedReason: "invalid_member_count",
  });

  await t.run(async (ctx) => {
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: partnerUserId,
      role: "partner",
      joinedAt: 20,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: partnerUserId,
      role: "partner",
      joinedAt: 30,
    });
  });
  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
    }),
  ).resolves.toMatchObject({
    status: "blocked",
    lifecycleId: null,
    blockedReason: "invalid_member_count",
  });
});

test("reconcile blocks with coarse reasons for partner readiness, timezone, content, and invalid random seams", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, partnerUserId } = await seedCouple(t);

  await t.run(async (ctx) => {
    const partnerDevice = await ctx.db
      .query("notificationDevices")
      .withIndex("by_couple_id_and_user_id", (q) =>
        q.eq("coupleId", coupleId).eq("userId", partnerUserId),
      )
      .unique();
    if (!partnerDevice) throw new Error("Expected partner device");
    await ctx.db.patch(partnerDevice._id, { permissionStatus: "denied" });
  });

  const readiness = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
    });
  expect(readiness).toEqual({
    status: "blocked",
    lifecycleId: null,
    promptDate: "2026-07-22",
    blockedReason: "not_all_members_ready",
  });
  expect(JSON.stringify(readiness)).not.toContain("partner");
  expect(JSON.stringify(readiness)).not.toContain("device");
  expect(JSON.stringify(readiness)).not.toContain("ExponentPushToken");

  await t.run(async (ctx) => {
    await ctx.db.patch(coupleId, { promptTimezone: undefined });
  });
  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
    }),
  ).resolves.toMatchObject({ status: "blocked", blockedReason: "missing_prompt_timezone" });

  await t.run(async (ctx) => {
    await ctx.db.patch(coupleId, { promptTimezone: "Mars/Base", promptTimezoneUpdatedAt: 2 });
  });
  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
    }),
  ).resolves.toMatchObject({ status: "blocked", blockedReason: "invalid_prompt_timezone" });

  await t.run(async (ctx) => {
    const partnerDevice = await ctx.db
      .query("notificationDevices")
      .withIndex("by_couple_id_and_user_id", (q) =>
        q.eq("coupleId", coupleId).eq("userId", partnerUserId),
      )
      .unique();
    if (!partnerDevice) throw new Error("Expected partner device");
    await ctx.db.patch(coupleId, {
      promptTimezone: "America/New_York",
      promptTimezoneUpdatedAt: 3,
    });
    await ctx.db.patch(partnerDevice._id, {
      permissionStatus: "granted",
      pushToken: "ExponentPushToken[partner]",
    });
  });
  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
      promptContentForTesting: "missing_quiz_question",
    }),
  ).resolves.toMatchObject({ status: "blocked", blockedReason: "prompt_content_incomplete" });
  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1139,
    }),
  ).rejects.toThrow("Invalid randomized first local minute");
  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1260,
    }),
  ).rejects.toThrow("Invalid randomized first local minute");
});

test("public lifecycle APIs reject client-supplied date time user and couple identifiers", async () => {
  const t = convexTest(schema, modules);
  await seedCouple(t);

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileToday, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
      userId: "client-user",
      coupleId: "client-couple",
      promptDate: "2026-07-22",
    }),
  ).rejects.toThrow("Unexpected field `nowMs`");
  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(getTodayState, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      userId: "client-user",
      coupleId: "client-couple",
      promptDate: "2026-07-22",
    }),
  ).rejects.toThrow("Unexpected field `nowMs`");
});

test("duplicate logical lifecycle rows fail closed for reconcile replay and today state", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId, partnerUserId } = await seedCouple(t);

  await t.run(async (ctx) => {
    for (const createdAt of [1, 2]) {
      await ctx.db.insert("dailyPromptLifecycles", {
        coupleId,
        promptDate: "2026-07-22",
        timezone: "America/New_York",
        firstUserId: creatorUserId,
        secondUserId: partnerUserId,
        randomizedFirstLocalMinute: 1140,
        firstScheduledAt: Date.UTC(2026, 6, 22, 23, 0),
        firstStatus: "scheduled",
        secondStatus: "pending",
        createdAt,
        updatedAt: createdAt,
      });
    }
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1259,
    }),
  ).rejects.toThrow("Duplicate daily prompt lifecycle.");
  await expect(
    t
      .withIdentity({ tokenIdentifier: "creator-auth" })
      .query(getTodayStateForTesting, { nowMs: Date.UTC(2026, 6, 22, 20, 30) }),
  ).rejects.toThrow("Duplicate daily prompt lifecycle.");
});

test("idempotent replay preserves recipient assignment timezone random minute and absolute schedule", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId, partnerUserId } = await seedCouple(t);

  const first = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
    });
  await t.run(async (ctx) => {
    await ctx.db.patch(coupleId, {
      promptTimezone: "America/Los_Angeles",
      promptTimezoneUpdatedAt: 99,
    });
  });
  const replay = await t
    .withIdentity({ tokenIdentifier: "partner-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 21, 15),
      randomMinute: 1259,
    });

  const lifecycle = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .unique(),
  );

  expect(replay).toMatchObject({ lifecycleId: first.lifecycleId, promptDate: "2026-07-22" });
  expect(lifecycle).toMatchObject({
    timezone: "America/New_York",
    firstUserId: creatorUserId,
    secondUserId: partnerUserId,
    randomizedFirstLocalMinute: 1140,
    firstScheduledAt: Date.UTC(2026, 6, 22, 23, 0),
  });
});

test("timezone rollback cannot create a prompt date behind the latest persisted lifecycle", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedCouple(t);

  await t.run(async (ctx) => {
    await ctx.db.patch(coupleId, {
      promptTimezone: "Asia/Tokyo",
      promptTimezoneUpdatedAt: 2,
    });
  });
  const first = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 15, 0),
      randomMinute: 1140,
    });
  expect(first).toMatchObject({ status: "scheduled", promptDate: "2026-07-23" });

  await t.run(async (ctx) => {
    await ctx.db.patch(coupleId, {
      promptTimezone: "Pacific/Honolulu",
      promptTimezoneUpdatedAt: 3,
    });
  });
  const replay = await t
    .withIdentity({ tokenIdentifier: "partner-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 16, 0),
      randomMinute: 1259,
    });
  const todayState = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .query(getTodayStateForTesting, { nowMs: Date.UTC(2026, 6, 22, 16, 0) });
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) => q.eq("coupleId", coupleId))
      .collect(),
  );

  expect(replay).toMatchObject({ lifecycleId: first.lifecycleId, promptDate: "2026-07-23" });
  expect(todayState).toMatchObject({
    status: "scheduled",
    promptDate: "2026-07-23",
    lifecycle: { promptDate: "2026-07-23" },
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].timezone).toBe("Asia/Tokyo");
});

test("after-window rollover uses the next local calendar date across DST end", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedCouple(t);
  await t.run(async (ctx) => {
    await ctx.db.patch(coupleId, {
      promptTimezone: "America/Los_Angeles",
      promptTimezoneUpdatedAt: 2,
    });
  });

  const result = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 10, 2, 5, 30),
      randomMinute: 1140,
    });

  const lifecycle = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-11-02"),
      )
      .unique(),
  );

  expect(result).toMatchObject({ status: "scheduled", promptDate: "2026-11-02" });
  expect(lifecycle?.firstScheduledAt).toBe(Date.UTC(2026, 10, 3, 3, 0));
});

test("today state returns coarse setup blockers and viewer-safe roles without cross-couple leakage", async () => {
  const t = convexTest(schema, modules);
  const { creatorUserId, partnerUserId } = await seedCouple(t);
  const { otherCoupleId, otherUserId, otherPartnerId } = await seedOtherCouple(t);

  const unscheduled = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .query(getTodayStateForTesting, { nowMs: Date.UTC(2026, 6, 22, 20, 30) });
  expect(unscheduled).toMatchObject({
    status: "not_scheduled",
    blockedReason: null,
    promptDate: "2026-07-22",
    lifecycle: null,
  });

  await t.run(async (ctx) => {
    await ctx.db.patch(otherCoupleId, { promptTimezone: undefined });
  });
  const blocked = await t
    .withIdentity({ tokenIdentifier: "other-auth" })
    .query(getTodayStateForTesting, { nowMs: Date.UTC(2026, 6, 22, 20, 30) });
  expect(blocked).toEqual({ status: "blocked", blockedReason: "missing_prompt_timezone" });

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
    nowMs: Date.UTC(2026, 6, 22, 20, 30),
    randomMinute: 1140,
  });

  const creatorState = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .query(getTodayStateForTesting, { nowMs: Date.UTC(2026, 6, 22, 20, 45) });
  const partnerState = await t
    .withIdentity({ tokenIdentifier: "partner-auth" })
    .query(getTodayStateForTesting, { nowMs: Date.UTC(2026, 6, 22, 20, 45) });
  expect(creatorState.lifecycle?.viewerRole).toBe("first");
  expect(partnerState.lifecycle?.viewerRole).toBe("second");
  for (const state of [creatorState, partnerState]) {
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain(creatorUserId);
    expect(serialized).not.toContain(partnerUserId);
    expect(serialized).not.toContain(otherUserId);
    expect(serialized).not.toContain(otherPartnerId);
    expect(serialized).not.toContain(otherCoupleId);
    expect(serialized).not.toContain("ExponentPushToken");
    expect(serialized).not.toContain("device");
  }
});

test("today state reports invalid member count when setup is incomplete and no lifecycle exists", async () => {
  const t = convexTest(schema, modules);
  const { partnerUserId } = await seedCouple(t);

  await t.run(async (ctx) => {
    const partnerMembership = await ctx.db
      .query("coupleMembers")
      .withIndex("by_user", (q) => q.eq("userId", partnerUserId))
      .unique();
    if (!partnerMembership) throw new Error("Expected partner membership");
    await ctx.db.delete(partnerMembership._id);
  });

  const state = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .query(getTodayStateForTesting, { nowMs: Date.UTC(2026, 6, 22, 20, 30) });

  expect(state).toMatchObject({
    status: "blocked",
    blockedReason: "invalid_member_count",
    promptDate: "2026-07-22",
  });
  expect(JSON.stringify(state)).not.toContain("ExponentPushToken");
});

test("today state reports not-all-ready when setup is incomplete and no lifecycle exists", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, partnerUserId } = await seedCouple(t);

  await t.run(async (ctx) => {
    const partnerDevice = await ctx.db
      .query("notificationDevices")
      .withIndex("by_couple_id_and_user_id", (q) =>
        q.eq("coupleId", coupleId).eq("userId", partnerUserId),
      )
      .unique();
    if (!partnerDevice) throw new Error("Expected partner device");
    await ctx.db.patch(partnerDevice._id, { permissionStatus: "denied" });
  });

  const state = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .query(getTodayStateForTesting, { nowMs: Date.UTC(2026, 6, 22, 20, 30) });

  expect(state).toMatchObject({
    status: "blocked",
    blockedReason: "not_all_members_ready",
    promptDate: "2026-07-22",
  });
  expect(JSON.stringify(state)).not.toContain("partner-ios");
  expect(JSON.stringify(state)).not.toContain("ExponentPushToken");
});

test("today state reports incomplete prompt content when setup is incomplete and no lifecycle exists", async () => {
  const t = convexTest(schema, modules);
  await seedCouple(t);

  const state = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .query(getTodayStateForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      promptContentForTesting: "missing_quiz_question",
    });

  expect(state).toMatchObject({
    status: "blocked",
    blockedReason: "prompt_content_incomplete",
    promptDate: "2026-07-22",
  });
});

test("today lifecycle planning sees ready devices beyond stale registrations", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId } = await seedCouple(t);

  await t.run(async (ctx) => {
    const creatorDevice = await ctx.db
      .query("notificationDevices")
      .withIndex("by_couple_id_and_user_id", (q) =>
        q.eq("coupleId", coupleId).eq("userId", creatorUserId),
      )
      .unique();
    if (!creatorDevice) throw new Error("Expected creator device");
    await ctx.db.delete(creatorDevice._id);
    for (let index = 0; index < 120; index += 1) {
      await ctx.db.insert("notificationDevices", {
        coupleId,
        userId: creatorUserId,
        deviceId: `creator-stale-${index}`,
        platform: "ios",
        permissionStatus: "denied",
        timezone: "America/New_York",
        enabled: false,
        createdAt: index + 1,
        updatedAt: index + 1,
      });
    }
    await ctx.db.insert("notificationDevices", {
      coupleId,
      userId: creatorUserId,
      deviceId: "creator-ready-late",
      pushToken: "ExponentPushToken[creator-ready-late]",
      platform: "ios",
      permissionStatus: "granted",
      timezone: "America/New_York",
      enabled: true,
      createdAt: 100,
      updatedAt: 100,
    });
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reconcileTodayForTesting, {
      nowMs: Date.UTC(2026, 6, 22, 20, 30),
      randomMinute: 1140,
    }),
  ).resolves.toMatchObject({
    status: "scheduled",
    promptDate: "2026-07-22",
    blockedReason: null,
  });
});
