/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";

import type { Id } from "./_generated/dataModel";
import { DAILY_PROMPT_SEEDS } from "./dailyPromptLibrary";
import { chooseGeneratedContent } from "./prompts";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const answer = makeFunctionReference<
  "mutation",
  { promptDate: string; prompt?: string; response: string },
  Id<"promptResponses">
>("prompts:answer");

const today = makeFunctionReference<
  "query",
  Record<string, never>,
  {
    prompt: string;
    promptPrinciple: string;
    response: string | null;
    partnerResponse: { response: string; answeredAt: number } | null;
    isRevealed: boolean;
  }
>("prompts:today");

const todayForUnpairedUser = makeFunctionReference<"query", Record<string, never>, unknown>(
  "prompts:today",
);

const getTodayStateForTesting = makeFunctionReference<
  "query",
  { nowMs: number; promptContentForTesting?: string },
  { prompt?: { question: string; quizQuestion: string; principle?: string } }
>("dailyPromptLifecycles:getTodayStateForTesting");

const reconcileToday = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { status: "scheduled" | "blocked"; lifecycleId: Id<"dailyPromptLifecycles"> | null }
>("dailyPromptLifecycles:reconcileToday");

const startAnswering = makeFunctionReference<"mutation", Record<string, never>, number>(
  "prompts:startAnswering",
);

const secondAnswerBoundary = makeFunctionReference<
  "mutation",
  { lifecycleId: Id<"dailyPromptLifecycles"> },
  unknown
>("prompts:secondAnswerBoundary");

type SeededCouple = {
  coupleId: Id<"couples">;
  creatorUserId: Id<"users">;
  partnerUserId: Id<"users">;
  lifecycleId: Id<"dailyPromptLifecycles">;
};

type SeededOtherCouple = {
  coupleId: Id<"couples">;
  userId: Id<"users">;
  partnerUserId: Id<"users">;
};

afterEach(() => {
  vi.useRealTimers();
});

async function seedCoupleWithLifecycle(t: ReturnType<typeof convexTest>): Promise<SeededCouple> {
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
  });
  const lifecycleId = await t.run(async (ctx) => {
    const promptId = await ctx.db.insert("dailyPrompts", {
      text: "What is one little ritual you want more of in our life together?",
      normalizedFingerprint: "what is one little ritual you want more of in our life together",
      principle: "shared meaning",
      category: "rituals",
      source: "seed",
      safetyStatus: "approved",
      completionCount: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    return await ctx.db.insert("dailyPromptLifecycles", {
      coupleId,
      promptDate: "2026-07-22",
      promptId,
      timezone: "America/New_York",
      firstUserId: creatorUserId,
      secondUserId: partnerUserId,
      randomizedFirstLocalMinute: 1140,
      firstScheduledAt: Date.UTC(2026, 6, 22, 23, 0),
      firstStatus: "scheduled",
      secondStatus: "pending",
      createdAt: 1,
      updatedAt: 1,
    });
  });

  return { coupleId, creatorUserId, partnerUserId, lifecycleId };
}

async function seedOtherCouple(t: ReturnType<typeof convexTest>): Promise<SeededOtherCouple> {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "other-auth",
      email: "shared@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const partnerUserId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "other-partner-auth",
      email: "other-partner@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const coupleId = await t.run(async (ctx) =>
    ctx.db.insert("couples", {
      name: "Them",
      createdByUserId: userId,
      promptTimezone: "America/New_York",
      promptTimezoneUpdatedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId,
      role: "partner",
      joinedAt: 10,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: partnerUserId,
      role: "partner",
      joinedAt: 20,
    });
  });
  return { coupleId, userId, partnerUserId };
}

async function answerAs(
  t: ReturnType<typeof convexTest>,
  tokenIdentifier: string,
  promptDate = "2026-07-22",
  response = "A real answer",
) {
  return await t.withIdentity({ tokenIdentifier }).mutation(answer, {
    promptDate,
    response,
  });
}

test("today returns no couple content for an authenticated user who has left their couple", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      authUserId: "unpaired-auth",
      email: "unpaired@example.com",
      createdAt: 1,
      updatedAt: 1,
    });
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "unpaired-auth" }).query(todayForUnpairedUser, {}),
  ).resolves.toBe(null);
});

test("startup read rejects unauthenticated and ambiguous authenticated users", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(todayForUnpairedUser, {})).rejects.toThrow("Not signed in.");
  await t.run(async (ctx) => {
    for (const email of ["first@example.com", "second@example.com"]) {
      await ctx.db.insert("users", {
        authUserId: "duplicate-auth",
        email,
        createdAt: 1,
        updatedAt: 1,
      });
    }
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "duplicate-auth" }).query(todayForUnpairedUser, {}),
  ).rejects.toThrow("Ambiguous authenticated user.");
});

test("startup read returns no couple content for ambiguous membership while writes reject", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);
  const other = await seedOtherCouple(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("coupleMembers", {
      coupleId: other.coupleId,
      userId: seeded.creatorUserId,
      role: "partner",
      joinedAt: 30,
    });
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(todayForUnpairedUser, {}),
  ).resolves.toBe(null);
  await expect(answerAs(t, "creator-auth")).rejects.toThrow("Ambiguous couple membership.");
});

test("startup read rethrows unexpected timezone failures with a privacy-safe phase code", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);
  await t.run(async (ctx) => {
    await ctx.db.patch(seeded.coupleId, { promptTimezone: "not-a-timezone" });
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(today, {}),
  ).rejects.toMatchObject({
    data: { code: "TODAY_READ_UNEXPECTED", phase: "timezone" },
  });
});

test("canonical reads and writes use the immutable assignment while tags and forged text cannot alter it", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);
  const assigned = {
    text: "Which small shared ritual would feel especially meaningful this week?",
    normalizedFingerprint: "which small shared ritual would feel especially meaningful this week",
    principle: "assigned shared meaning",
  };
  await t.run(async (ctx) => {
    const lifecycle = await ctx.db.get(seeded.lifecycleId);
    if (!lifecycle?.promptId) throw new Error("Expected assigned prompt.");
    await ctx.db.patch(lifecycle.promptId, assigned);
    await ctx.db.insert("dailyPrompts", {
      text: "A newly added fallback that must not replace the assignment",
      normalizedFingerprint: "a newly added fallback that must not replace the assignment",
      principle: "new fallback principle",
      category: "fixture",
      source: "ai",
      safetyStatus: "approved",
      completionCount: 999,
      createdAt: 2,
      updatedAt: 2,
    });
    await ctx.db.insert("moments", {
      coupleId: seeded.coupleId,
      authorUserId: seeded.creatorUserId,
      happenedAt: Date.now(),
      summary: "Private tag fixture",
      feeling: "Private reflection",
      tone: "good",
      tags: ["FORGED_PRIVATE_TAG"],
      createdAt: 2,
    });
  });

  const [creatorToday, partnerToday, lifecycleState] = await Promise.all([
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(today, {}),
    t.withIdentity({ tokenIdentifier: "partner-auth" }).query(today, {}),
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(getTodayStateForTesting, {
      nowMs: Date.now(),
      promptContentForTesting: "missing_quiz_question",
    }),
  ]);
  expect(creatorToday).toMatchObject({
    prompt: assigned.text,
    promptPrinciple: assigned.principle,
    response: null,
    partnerResponse: null,
    isRevealed: false,
  });
  expect(partnerToday.prompt).toBe(assigned.text);
  expect(partnerToday.promptPrinciple).toBe(assigned.principle);
  expect(lifecycleState.prompt).toMatchObject({
    question: assigned.text,
    principle: assigned.principle,
  });
  expect(JSON.stringify({ creatorToday, partnerToday, lifecycleState })).not.toContain(
    "FORGED_PRIVATE_TAG",
  );

  const creatorResponseId = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(answer, {
      promptDate: "2026-07-22",
      prompt: "FORGED CLIENT QUESTION",
      response: "Creator private answer",
    });
  const beforeBoth = await t.withIdentity({ tokenIdentifier: "partner-auth" }).query(today, {});
  expect(beforeBoth.partnerResponse).toBeNull();
  expect(beforeBoth.isRevealed).toBe(false);

  await t.withIdentity({ tokenIdentifier: "partner-auth" }).mutation(answer, {
    promptDate: "2026-07-22",
    prompt: "ANOTHER FORGED CLIENT QUESTION",
    response: "Partner private answer",
  });
  const afterBoth = await t.withIdentity({ tokenIdentifier: "creator-auth" }).query(today, {});
  const stored = await t.run((ctx) => ctx.db.get(creatorResponseId));
  expect(stored?.prompt).toBe(assigned.text);
  expect(afterBoth).toMatchObject({
    prompt: assigned.text,
    promptPrinciple: assigned.principle,
    isRevealed: true,
    partnerResponse: { response: "Partner private answer" },
  });
  expect(JSON.stringify({ stored, afterBoth })).not.toContain("FORGED CLIENT QUESTION");
});

test("today fails closed before revealing responses whose compatibility prompt mismatches the assignment", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);
  await t.run(async (ctx) => {
    for (const [userId, response] of [
      [seeded.creatorUserId, "Creator content must not be misattributed"],
      [seeded.partnerUserId, "Partner content must not be misattributed"],
    ] as const) {
      await ctx.db.insert("promptResponses", {
        coupleId: seeded.coupleId,
        userId,
        promptDate: "2026-07-22",
        prompt: "A corrupted question that is not the assignment",
        response,
        createdAt: 1,
      });
    }
  });

  const result = await t.withIdentity({ tokenIdentifier: "creator-auth" }).query(today, {});
  expect(result).toMatchObject({
    response: null,
    partnerHasAnswered: false,
    partnerResponse: null,
    isRevealed: false,
  });
});

test("rollout reads use the shared deterministic seed fallback before a blocked planner creates a lifecycle", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);
  await t.run(async (ctx) => ctx.db.delete(seeded.lifecycleId));

  const [promptState, lifecycleState] = await Promise.all([
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(today, {}),
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(getTodayStateForTesting, {
      nowMs: Date.now(),
    }),
  ]);
  const expected = DAILY_PROMPT_SEEDS[5];
  expect(promptState).toMatchObject({
    promptDate: "2026-07-22",
    prompt: expected.text,
    promptPrinciple: expected.principle,
  });
  expect(lifecycleState).toMatchObject({
    status: "blocked",
    blockedReason: "not_all_members_ready",
    promptDate: "2026-07-22",
    prompt: {
      question: expected.text,
      principle: expected.principle,
    },
  });
  await expect(answerAs(t, "creator-auth")).rejects.toThrow("Daily prompt is not scheduled.");
});

test("rollout reads fall back for a legacy unassigned lifecycle while answer remains assignment-required", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);
  await t.run(async (ctx) => ctx.db.patch(seeded.lifecycleId, { promptId: undefined }));

  const [promptState, lifecycleState] = await Promise.all([
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(today, {}),
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(getTodayStateForTesting, {
      nowMs: Date.now(),
    }),
  ]);
  const expected = DAILY_PROMPT_SEEDS[5];
  expect(promptState).toMatchObject({ prompt: expected.text, promptPrinciple: expected.principle });
  expect(lifecycleState).toMatchObject({
    status: "scheduled",
    prompt: { question: expected.text, principle: expected.principle },
    lifecycle: { promptDate: "2026-07-22" },
  });
  await expect(answerAs(t, "creator-auth")).rejects.toThrow("Daily prompt assignment is missing.");
});

test("startup read returns a private fallback while duplicate lifecycle writes remain fail-closed", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-23T01:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);
  await t.run(async (ctx) => {
    const lifecycle = await ctx.db.get(seeded.lifecycleId);
    if (!lifecycle) throw new Error("Expected lifecycle.");
    const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...duplicate } = lifecycle;
    await ctx.db.insert("dailyPromptLifecycles", duplicate);
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(today, {}),
  ).resolves.toMatchObject({
    promptDate: "2026-07-22",
    response: null,
    partnerHasAnswered: false,
    partnerResponse: null,
    partnerCount: 0,
    isRevealed: false,
  });
  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(getTodayStateForTesting, {
      nowMs: Date.now(),
    }),
  ).rejects.toThrow("Duplicate daily prompt lifecycle.");
  await expect(answerAs(t, "creator-auth")).rejects.toThrow("Duplicate daily prompt lifecycle.");
});

test("shared seeds solely determine fallback prompt text while tags preserve weekly game and quiz selection", () => {
  const baseline = chooseGeneratedContent("2026-07-22", []);
  const tagged = chooseGeneratedContent("2026-07-22", ["connection"]);
  const seed = DAILY_PROMPT_SEEDS.find((candidate) => candidate.text === baseline.prompt);

  expect(seed).toBeDefined();
  expect(baseline.promptPrinciple).toBe(seed?.principle);
  expect(tagged.prompt).toBe(baseline.prompt);
  expect(tagged.promptPrinciple).toBe(baseline.promptPrinciple);
  expect(baseline.weeklyGame.title).toBe("Two appreciations, one ask");
  expect(baseline.quiz.title).toBe("Do I know your current stress?");
  expect(tagged.weeklyGame.title).toBe("Repair phrase practice");
  expect(tagged.quiz.title).toBe("Ritual audit");
});

test.each([
  { name: "pending", safetyStatus: "pending" },
  { name: "rejected", safetyStatus: "rejected" },
] as const)(
  "$name assignment fails closed for canonical reads and answer writes",
  async (fixture) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
    const t = convexTest(schema, modules);
    const seeded = await seedCoupleWithLifecycle(t);
    await t.run(async (ctx) => {
      const lifecycle = await ctx.db.get(seeded.lifecycleId);
      if (!lifecycle?.promptId) throw new Error("Expected assigned prompt.");
      await ctx.db.patch(lifecycle.promptId, { safetyStatus: fixture.safetyStatus });
    });

    await expect(
      t.withIdentity({ tokenIdentifier: "creator-auth" }).query(today, {}),
    ).resolves.toMatchObject({
      response: null,
      partnerHasAnswered: false,
      partnerResponse: null,
      partnerCount: 0,
      isRevealed: false,
    });
    await expect(
      t.withIdentity({ tokenIdentifier: "creator-auth" }).query(getTodayStateForTesting, {
        nowMs: Date.now(),
      }),
    ).rejects.toThrow(/assignment|assigned daily prompt/i);
    await expect(answerAs(t, "creator-auth")).rejects.toThrow(/assignment|assigned daily prompt/i);
    const responses = await t.run((ctx) => ctx.db.query("promptResponses").take(1));
    expect(responses).toEqual([]);
  },
);

test("a lifecycle referencing a missing assignment fails closed for both reads and answer writes", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);
  await t.run(async (ctx) => {
    const lifecycle = await ctx.db.get(seeded.lifecycleId);
    if (!lifecycle?.promptId) throw new Error("Expected assigned prompt.");
    await ctx.db.delete(lifecycle.promptId);
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(today, {}),
  ).resolves.toMatchObject({
    response: null,
    partnerHasAnswered: false,
    partnerResponse: null,
    partnerCount: 0,
    isRevealed: false,
  });
  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(getTodayStateForTesting, {
      nowMs: Date.now(),
    }),
  ).rejects.toThrow("Assigned daily prompt was not found.");
  await expect(answerAs(t, "creator-auth")).rejects.toThrow("Assigned daily prompt was not found.");
});

test("duplicate assigned prompt fingerprint fails closed before reading or saving", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);
  await t.run(async (ctx) => {
    const lifecycle = await ctx.db.get(seeded.lifecycleId);
    if (!lifecycle?.promptId) throw new Error("Expected assigned prompt.");
    const prompt = await ctx.db.get(lifecycle.promptId);
    if (!prompt) throw new Error("Expected assigned prompt row.");
    await ctx.db.insert("dailyPrompts", {
      text: `${prompt.text}!`,
      normalizedFingerprint: prompt.normalizedFingerprint,
      principle: prompt.principle,
      category: prompt.category,
      source: "ai",
      safetyStatus: "approved",
      completionCount: 0,
      createdAt: 2,
      updatedAt: 2,
    });
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(today, {}),
  ).resolves.toMatchObject({
    response: null,
    partnerHasAnswered: false,
    partnerResponse: null,
    partnerCount: 0,
    isRevealed: false,
  });
  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(getTodayStateForTesting, {
      nowMs: Date.now(),
    }),
  ).rejects.toThrow("Duplicate daily prompt fingerprint.");
  await expect(answerAs(t, "creator-auth")).rejects.toThrow("Duplicate daily prompt fingerprint.");
  const responses = await t.run((ctx) => ctx.db.query("promptResponses").take(1));
  expect(responses).toEqual([]);
});

test("first non-whitespace input records the authoritative start before a later submit", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId, lifecycleId } = await seedCoupleWithLifecycle(t);

  const startedAt = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(startAnswering, {});
  expect(startedAt).toBe(Date.parse("2026-07-22T21:15:00.000Z"));

  vi.setSystemTime(new Date("2026-07-22T21:18:00.000Z"));
  await answerAs(t, "creator-auth", "2026-07-22", "Submitted three minutes later");

  const state = await t.run(async (ctx) => ({
    starts: await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
    lifecycle: await ctx.db.get(lifecycleId),
    responses: await ctx.db.query("promptResponses").collect(),
  }));

  expect(state.starts).toHaveLength(1);
  expect(state.starts[0]).toMatchObject({ userId: creatorUserId, startedAt });
  expect(state.lifecycle).toMatchObject({
    firstStartedAt: startedAt,
    secondScheduledAt: startedAt + 300_000,
    secondStatus: "scheduled",
  });
  expect(state.responses).toHaveLength(1);
});

test("answer save records the first non-empty answer-start once and schedules the second step exactly five minutes later", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId, lifecycleId } = await seedCoupleWithLifecycle(t);

  const responseId = await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(answer, {
    promptDate: "2026-07-22",
    response: "  We took a walk.  ",
  });
  const replayId = await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(answer, {
    promptDate: "2026-07-22",
    response: "Edited answer",
  });

  const state = await t.run(async (ctx) => {
    const starts = await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect();
    const lifecycle = await ctx.db.get(lifecycleId);
    const response = await ctx.db.get(responseId);
    const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
    return { starts, lifecycle, response, scheduled };
  });

  expect(replayId).toBe(responseId);
  expect(state.response).toMatchObject({
    response: "Edited answer",
    createdAt: Date.parse("2026-07-22T21:15:00.000Z"),
  });
  expect(state.starts).toHaveLength(1);
  expect(state.starts[0]).toMatchObject({
    coupleId,
    promptDate: "2026-07-22",
    userId: creatorUserId,
    startedAt: Date.parse("2026-07-22T21:15:00.000Z"),
    source: "first_non_empty_input",
  });
  expect(state.lifecycle).toMatchObject({
    firstStartedAt: Date.parse("2026-07-22T21:15:00.000Z"),
    secondScheduledAt: Date.parse("2026-07-22T21:20:00.000Z"),
    secondStatus: "scheduled",
    secondDeliveryKey: `${lifecycleId}:second`,
  });
  expect(state.scheduled).toHaveLength(1);
  expect(state.lifecycle?.secondSchedulerJobId).toBe(state.scheduled[0]._id);
  expect(state.scheduled[0]).toMatchObject({
    name: "prompts:secondAnswerBoundary",
    args: [{ lifecycleId }],
    scheduledTime: Date.parse("2026-07-22T21:20:00.000Z"),
  });
});

test("answer auth resolves exactly one canonical tokenIdentifier user without email fallback", async () => {
  const t = convexTest(schema, modules);
  await seedCoupleWithLifecycle(t);

  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      authUserId: "creator-auth",
      email: "duplicate@example.com",
      createdAt: 2,
      updatedAt: 2,
    });
  });
  await expect(answerAs(t, "creator-auth")).rejects.toThrow("Ambiguous authenticated user.");

  const stale = convexTest(schema, modules);
  await seedCoupleWithLifecycle(stale);
  await stale.run(async (ctx) => {
    const creator = await ctx.db
      .query("users")
      .withIndex("by_auth_user_id", (q) => q.eq("authUserId", "creator-auth"))
      .unique();
    if (!creator) throw new Error("Expected creator");
    await ctx.db.patch(creator._id, { authUserId: "stale-auth", email: "shared@example.com" });
  });

  await expect(answerAs(stale, "creator-auth")).rejects.toThrow("Not signed in.");
});

test("answer date resolver accepts timezone-changed latest snapshot and fails stale late-window dates", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-23T01:00:30.000Z"));
  const t = convexTest(schema, modules);
  await seedCoupleWithLifecycle(t);
  await t.run(async (ctx) => {
    const couple = (await ctx.db.query("couples").first())!;
    await ctx.db.patch(couple._id, {
      promptTimezone: "America/Chicago",
      promptTimezoneUpdatedAt: Date.parse("2026-07-22T22:00:00.000Z"),
    });
  });

  await expect(answerAs(t, "creator-auth", "2026-07-22")).resolves.toBeTruthy();

  const stale = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(stale);
  await stale.run(async (ctx) => {
    await ctx.db.delete(seeded.lifecycleId);
    await ctx.db.insert("dailyPromptLifecycles", {
      coupleId: seeded.coupleId,
      promptDate: "2026-07-23",
      timezone: "America/New_York",
      firstUserId: seeded.creatorUserId,
      secondUserId: seeded.partnerUserId,
      randomizedFirstLocalMinute: 1140,
      firstScheduledAt: Date.UTC(2026, 6, 23, 23, 0),
      firstStatus: "scheduled",
      secondStatus: "pending",
      createdAt: 2,
      updatedAt: 2,
    });
  });

  await expect(answerAs(stale, "creator-auth", "2026-07-22")).rejects.toThrow(
    "Daily prompt date is not current.",
  );
});

test("answer start and response ownership fail closed on cross-couple or duplicate same-user date rows", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const { creatorUserId } = await seedCoupleWithLifecycle(t);
  const other = await seedOtherCouple(t);

  await t.run(async (ctx) => {
    await ctx.db.insert("dailyPromptAnswerStarts", {
      coupleId: other.coupleId,
      promptDate: "2026-07-22",
      userId: creatorUserId,
      startedAt: 10,
      source: "first_non_empty_input",
      createdAt: 10,
    });
  });
  await expect(answerAs(t, "creator-auth")).rejects.toThrow("Daily prompt answer start mismatch.");

  const responseCase = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(responseCase);
  const otherResponseCouple = await seedOtherCouple(responseCase);
  await responseCase.run(async (ctx) => {
    await ctx.db.insert("promptResponses", {
      coupleId: otherResponseCouple.coupleId,
      userId: seeded.creatorUserId,
      promptDate: "2026-07-22",
      prompt: "Other",
      response: "Other couple answer",
      createdAt: 5,
    });
  });

  await expect(answerAs(responseCase, "creator-auth")).rejects.toThrow(
    "Daily prompt response mismatch.",
  );
});

test("answer lifecycle transition legality rejects malformed states and preserves valid scheduled replay identity", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:30:00.000Z"));
  const invalidFirst = convexTest(schema, modules);
  const invalid = await seedCoupleWithLifecycle(invalidFirst);
  await invalidFirst.run(async (ctx) => {
    await ctx.db.patch(invalid.lifecycleId, { firstStatus: "pending", secondStatus: "pending" });
  });
  await expect(answerAs(invalidFirst, "creator-auth")).rejects.toThrow(
    "Illegal first daily prompt status for answer start.",
  );

  const mismatchedFirstStart = convexTest(schema, modules);
  const mismatch = await seedCoupleWithLifecycle(mismatchedFirstStart);
  await mismatchedFirstStart.run(async (ctx) => {
    await ctx.db.patch(mismatch.lifecycleId, {
      firstStartedAt: Date.parse("2026-07-22T21:14:00.000Z"),
      secondStatus: "pending",
    });
    await ctx.db.insert("dailyPromptAnswerStarts", {
      coupleId: mismatch.coupleId,
      promptDate: "2026-07-22",
      userId: mismatch.creatorUserId,
      startedAt: Date.parse("2026-07-22T21:15:00.000Z"),
      source: "first_non_empty_input",
      createdAt: Date.parse("2026-07-22T21:15:00.000Z"),
    });
  });
  await expect(answerAs(mismatchedFirstStart, "creator-auth")).rejects.toThrow(
    "Malformed first daily prompt start state.",
  );
  const mismatchState = await mismatchedFirstStart.run(async (ctx) => ({
    lifecycle: await ctx.db.get(mismatch.lifecycleId),
    responses: await ctx.db.query("promptResponses").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(mismatchState.lifecycle).toMatchObject({
    firstStartedAt: Date.parse("2026-07-22T21:14:00.000Z"),
    secondStatus: "pending",
  });
  expect(mismatchState.responses).toHaveLength(0);
  expect(mismatchState.scheduled).toHaveLength(0);

  const malformedScheduled = convexTest(schema, modules);
  const malformed = await seedCoupleWithLifecycle(malformedScheduled);
  await malformedScheduled.run(async (ctx) => {
    await ctx.db.patch(malformed.lifecycleId, {
      secondStatus: "scheduled",
      secondScheduledAt: Date.parse("2026-07-22T21:20:00.000Z"),
      secondDeliveryKey: `${malformed.lifecycleId}:second`,
    });
    await ctx.db.insert("dailyPromptAnswerStarts", {
      coupleId: malformed.coupleId,
      promptDate: "2026-07-22",
      userId: malformed.creatorUserId,
      startedAt: Date.parse("2026-07-22T21:15:00.000Z"),
      source: "first_non_empty_input",
      createdAt: Date.parse("2026-07-22T21:15:00.000Z"),
    });
  });
  await expect(answerAs(malformedScheduled, "creator-auth")).rejects.toThrow(
    "Malformed scheduled second daily prompt state.",
  );

  const validReplay = convexTest(schema, modules);
  const valid = await seedCoupleWithLifecycle(validReplay);
  const jobId = await validReplay.run(async (ctx) => {
    const scheduledAt = Date.parse("2026-07-22T21:20:00.000Z");
    const schedulerJobId = await ctx.scheduler.runAt(
      scheduledAt,
      makeFunctionReference<"mutation", { lifecycleId: Id<"dailyPromptLifecycles"> }, null>(
        "prompts:secondAnswerBoundary",
      ),
      { lifecycleId: valid.lifecycleId },
    );
    await ctx.db.patch(valid.lifecycleId, {
      firstStartedAt: Date.parse("2026-07-22T21:15:00.000Z"),
      secondStatus: "scheduled",
      secondScheduledAt: scheduledAt,
      secondDeliveryKey: `${valid.lifecycleId}:second`,
      secondSchedulerJobId: String(schedulerJobId),
    });
    await ctx.db.insert("dailyPromptAnswerStarts", {
      coupleId: valid.coupleId,
      promptDate: "2026-07-22",
      userId: valid.creatorUserId,
      startedAt: Date.parse("2026-07-22T21:15:00.000Z"),
      source: "first_non_empty_input",
      createdAt: Date.parse("2026-07-22T21:15:00.000Z"),
    });
    return String(schedulerJobId);
  });

  await answerAs(validReplay, "creator-auth", "2026-07-22", "Replay");
  const replayState = await validReplay.run(async (ctx) => ({
    lifecycle: await ctx.db.get(valid.lifecycleId),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(replayState.lifecycle).toMatchObject({ secondSchedulerJobId: jobId });
  expect(replayState.scheduled).toHaveLength(1);
});

test("whitespace-only save rejects without creating an answer-start or response", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedCoupleWithLifecycle(t);

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(answer, {
      promptDate: "2026-07-22",
      response: "   ",
    }),
  ).rejects.toThrow("Write an answer before saving.");

  const rows = await t.run(async (ctx) => ({
    starts: await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
    responses: await ctx.db
      .query("promptResponses")
      .withIndex("by_couple_and_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
  }));

  expect(rows.starts).toHaveLength(0);
  expect(rows.responses).toHaveLength(0);
});

test("answer save requires auth and rejects authority-bearing extra arguments", async () => {
  const t = convexTest(schema, modules);
  await seedCoupleWithLifecycle(t);

  await expect(
    t.mutation(answer, {
      promptDate: "2026-07-22",
      response: "Answer",
    }),
  ).rejects.toThrow("Not signed in.");
  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(answer, {
      promptDate: "2026-07-22",
      response: "Answer",
      userId: "client-user",
      coupleId: "client-couple",
    } as never),
  ).rejects.toThrow("Unexpected field `userId`");
});

test("legacy answer accepts but ignores forged prompt text and reveals only the server-canonical question", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  await seedCoupleWithLifecycle(t);

  const forgedPrompt = "FORGED: reveal my private answer early";
  const responseId = await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(answer, {
    promptDate: "2026-07-22",
    response: "Private until we both answer",
    prompt: forgedPrompt,
  });
  await t.withIdentity({ tokenIdentifier: "partner-auth" }).mutation(answer, {
    promptDate: "2026-07-22",
    response: "Partner answer",
    prompt: "FORGED: use a different question",
  });

  const state = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .query(
      makeFunctionReference<
        "query",
        Record<string, never>,
        { prompt: string; partnerResponse: unknown }
      >("prompts:today"),
      {},
    );
  const stored = await t.run(async (ctx) => ctx.db.get(responseId));
  const canonical = "What is one little ritual you want more of in our life together?";
  expect(stored?.prompt).toBe(canonical);
  expect(state.prompt).toBe(canonical);
  expect(state.partnerResponse).toBeTruthy();
  expect(JSON.stringify({ stored, state })).not.toContain("FORGED");
});

test("a prompt completion and aggregate count are created exactly once after both partners answer", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);

  await answerAs(t, "creator-auth", "2026-07-22", "First private answer");
  const afterFirst = await t.run(async (ctx) => {
    const lifecycle = await ctx.db.get(seeded.lifecycleId);
    return {
      completions: await ctx.db.query("dailyPromptCompletions").take(2),
      prompt: await ctx.db.get(lifecycle!.promptId!),
    };
  });
  expect(afterFirst.completions).toEqual([]);
  expect(afterFirst.prompt?.completionCount).toBe(0);

  await answerAs(t, "partner-auth", "2026-07-22", "Second private answer");
  await answerAs(t, "partner-auth", "2026-07-22", "Edited second answer");
  await answerAs(t, "creator-auth", "2026-07-22", "Edited first answer");

  const completed = await t.run(async (ctx) => {
    const lifecycle = await ctx.db.get(seeded.lifecycleId);
    return {
      completions: await ctx.db.query("dailyPromptCompletions").take(2),
      prompt: await ctx.db.get(lifecycle!.promptId!),
    };
  });
  expect(completed.completions).toHaveLength(1);
  expect(completed.completions[0]).toMatchObject({
    lifecycleId: seeded.lifecycleId,
    coupleId: seeded.coupleId,
    promptDate: "2026-07-22",
  });
  expect(completed.prompt?.completionCount).toBe(1);
  expect(Object.keys(completed.completions[0]).sort()).toEqual(
    [
      "_creationTime",
      "_id",
      "completedAt",
      "coupleId",
      "createdAt",
      "lifecycleId",
      "promptDate",
      "promptId",
    ].sort(),
  );
});

test("concurrent and replayed second-partner answers create one completion and one aggregate increment", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);
  await answerAs(t, "creator-auth", "2026-07-22", "First private answer");

  const attempts = await Promise.allSettled([
    answerAs(t, "partner-auth", "2026-07-22", "Concurrent second answer A"),
    answerAs(t, "partner-auth", "2026-07-22", "Concurrent second answer B"),
  ]);
  expect(attempts.every((attempt) => attempt.status === "fulfilled")).toBe(true);
  if (attempts[0].status !== "fulfilled" || attempts[1].status !== "fulfilled") {
    throw new Error("Expected both concurrent saves to succeed.");
  }
  expect(attempts[0].value).toBe(attempts[1].value);
  await answerAs(t, "partner-auth", "2026-07-22", "Replayed second answer");

  const state = await t.run(async (ctx) => {
    const lifecycle = await ctx.db.get(seeded.lifecycleId);
    return {
      completions: await ctx.db
        .query("dailyPromptCompletions")
        .withIndex("by_lifecycle_id", (q) => q.eq("lifecycleId", seeded.lifecycleId))
        .take(2),
      prompt: await ctx.db.get(lifecycle!.promptId!),
      responses: await ctx.db
        .query("promptResponses")
        .withIndex("by_couple_and_date", (q) =>
          q.eq("coupleId", seeded.coupleId).eq("promptDate", "2026-07-22"),
        )
        .take(3),
    };
  });
  expect(state.completions).toHaveLength(1);
  expect(state.prompt?.completionCount).toBe(1);
  expect(state.responses).toHaveLength(2);
});

test("two couples completing the same prompt create two private rows and increment the shared aggregate twice", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const first = await seedCoupleWithLifecycle(t);
  const second = await seedOtherCouple(t);
  const { promptId, secondLifecycleId } = await t.run(async (ctx) => {
    const firstLifecycle = await ctx.db.get(first.lifecycleId);
    if (!firstLifecycle?.promptId) throw new Error("Expected shared prompt.");
    const secondLifecycleId = await ctx.db.insert("dailyPromptLifecycles", {
      coupleId: second.coupleId,
      promptDate: "2026-07-22",
      promptId: firstLifecycle.promptId,
      timezone: "America/New_York",
      firstUserId: second.userId,
      secondUserId: second.partnerUserId,
      randomizedFirstLocalMinute: 1140,
      firstScheduledAt: Date.UTC(2026, 6, 22, 23, 0),
      firstStatus: "scheduled",
      secondStatus: "pending",
      createdAt: 1,
      updatedAt: 1,
    });
    return { promptId: firstLifecycle.promptId, secondLifecycleId };
  });

  await answerAs(t, "creator-auth", "2026-07-22", "First couple first answer");
  await answerAs(t, "partner-auth", "2026-07-22", "First couple second answer");
  await answerAs(t, "other-auth", "2026-07-22", "Second couple first answer");
  await answerAs(t, "other-partner-auth", "2026-07-22", "Second couple second answer");
  await answerAs(t, "partner-auth", "2026-07-22", "First couple replay");
  await answerAs(t, "other-partner-auth", "2026-07-22", "Second couple replay");

  const state = await t.run(async (ctx) => ({
    prompt: await ctx.db.get(promptId),
    completions: await ctx.db
      .query("dailyPromptCompletions")
      .withIndex("by_prompt_id_and_completed_at", (q) => q.eq("promptId", promptId))
      .take(3),
  }));
  expect(state.prompt?.completionCount).toBe(2);
  expect(state.completions).toHaveLength(2);
  expect(new Set(state.completions.map((row) => row.coupleId))).toEqual(
    new Set([first.coupleId, second.coupleId]),
  );
  expect(new Set(state.completions.map((row) => row.lifecycleId))).toEqual(
    new Set([first.lifecycleId, secondLifecycleId]),
  );
  expect(
    state.completions.every(
      (row) =>
        !("response" in row) && !("userId" in row) && !("tags" in row) && !("notification" in row),
    ),
  ).toBe(true);
});

test("premature completion state fails closed without changing rank or saving an answer", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);
  const promptId = await t.run(async (ctx) => {
    const lifecycle = await ctx.db.get(seeded.lifecycleId);
    if (!lifecycle?.promptId) throw new Error("Expected assigned prompt.");
    await ctx.db.insert("dailyPromptCompletions", {
      lifecycleId: seeded.lifecycleId,
      coupleId: seeded.coupleId,
      promptDate: "2026-07-22",
      promptId: lifecycle.promptId,
      completedAt: 1,
      createdAt: 1,
    });
    return lifecycle.promptId;
  });

  await expect(answerAs(t, "creator-auth")).rejects.toThrow(
    "Daily prompt completion exists before both partners answered.",
  );
  const state = await t.run(async (ctx) => ({
    prompt: await ctx.db.get(promptId),
    responses: await ctx.db.query("promptResponses").take(1),
  }));
  expect(state.prompt?.completionCount).toBe(0);
  expect(state.responses).toEqual([]);
});

test("a lifecycle-linked completion under another couple fails closed", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);
  const other = await seedOtherCouple(t);
  await t.run(async (ctx) => {
    const lifecycle = await ctx.db.get(seeded.lifecycleId);
    if (!lifecycle?.promptId) throw new Error("Expected assigned prompt.");
    await ctx.db.insert("dailyPromptCompletions", {
      lifecycleId: seeded.lifecycleId,
      coupleId: other.coupleId,
      promptDate: "2026-07-22",
      promptId: lifecycle.promptId,
      completedAt: 1,
      createdAt: 1,
    });
  });

  await expect(answerAs(t, "creator-auth")).rejects.toThrow("Daily prompt completion mismatch.");
  const responses = await t.run((ctx) => ctx.db.query("promptResponses").take(1));
  expect(responses).toEqual([]);
});

test("an authenticated production reconcile lets a user answer from an empty lifecycle table", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T20:30:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedCoupleWithLifecycle(t);
  await t.run(async (ctx) => {
    await ctx.db.delete(seeded.lifecycleId);
    for (const [userId, deviceId] of [
      [seeded.creatorUserId, "creator-ready"],
      [seeded.partnerUserId, "partner-ready"],
    ] as const) {
      await ctx.db.insert("notificationDevices", {
        coupleId: seeded.coupleId,
        userId,
        deviceId,
        pushToken: `ExponentPushToken[${deviceId}]`,
        platform: "ios",
        permissionStatus: "granted",
        timezone: "America/New_York",
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  });

  const planned = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(reconcileToday, {});
  expect(planned).toMatchObject({ status: "scheduled", lifecycleId: expect.any(String) });

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(startAnswering, {});
  const responseId = await answerAs(t, "creator-auth", "2026-07-22", "It works from empty");
  await expect(t.run(async (ctx) => ctx.db.get(responseId))).resolves.toMatchObject({
    response: "It works from empty",
  });
});

test("second user's early non-empty save records start and skips the pending second delivery without a scheduler job", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:16:00.000Z"));
  const t = convexTest(schema, modules);
  const { coupleId, partnerUserId, lifecycleId } = await seedCoupleWithLifecycle(t);

  await answerAs(t, "partner-auth");

  const state = await t.run(async (ctx) => ({
    starts: await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
    lifecycle: await ctx.db.get(lifecycleId),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));

  expect(state.starts).toHaveLength(1);
  expect(state.starts[0]).toMatchObject({
    userId: partnerUserId,
    startedAt: Date.parse("2026-07-22T21:16:00.000Z"),
  });
  expect(state.lifecycle).toMatchObject({
    secondStatus: "skipped",
    skippedAt: Date.parse("2026-07-22T21:16:00.000Z"),
    skippedReason: "skipped_already_started",
  });
  expect(state.lifecycle?.secondScheduledAt).toBeUndefined();
  expect(state.lifecycle?.secondDeliveryKey).toBeUndefined();
  expect(state.scheduled).toHaveLength(0);
});

test("second user's early non-empty save cancels the persisted scheduled second boundary and is replay-safe", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:16:00.000Z"));
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId, partnerUserId, lifecycleId } = await seedCoupleWithLifecycle(t);
  const firstStartedAt = Date.parse("2026-07-22T21:15:00.000Z");
  const secondScheduledAt = Date.parse("2026-07-22T21:20:00.000Z");
  const secondDeliveryKey = `${lifecycleId}:second`;
  const schedulerJobId = await t.run(async (ctx) => {
    const jobId = await ctx.scheduler.runAt(
      secondScheduledAt,
      makeFunctionReference<"mutation", { lifecycleId: Id<"dailyPromptLifecycles"> }, null>(
        "prompts:secondAnswerBoundary",
      ),
      { lifecycleId },
    );
    await ctx.db.patch(lifecycleId, {
      firstStartedAt,
      secondStatus: "scheduled",
      secondScheduledAt,
      secondDeliveryKey,
      secondSchedulerJobId: String(jobId),
      updatedAt: firstStartedAt,
    });
    await ctx.db.insert("dailyPromptAnswerStarts", {
      coupleId,
      promptDate: "2026-07-22",
      userId: creatorUserId,
      startedAt: firstStartedAt,
      source: "first_non_empty_input",
      createdAt: firstStartedAt,
    });
    return String(jobId);
  });

  const responseId = await answerAs(t, "partner-auth", "2026-07-22", "I already started too");
  const replayId = await answerAs(t, "partner-auth", "2026-07-22", "Edited second answer");

  const state = await t.run(async (ctx) => ({
    starts: await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
    lifecycle: await ctx.db.get(lifecycleId),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    response: await ctx.db.get(responseId),
  }));

  expect(replayId).toBe(responseId);
  expect(state.starts).toHaveLength(2);
  expect(state.starts.filter((start) => start.userId === partnerUserId)).toHaveLength(1);
  expect(state.starts.find((start) => start.userId === partnerUserId)).toMatchObject({
    startedAt: Date.parse("2026-07-22T21:16:00.000Z"),
    source: "first_non_empty_input",
  });
  expect(state.lifecycle).toMatchObject({
    firstStartedAt,
    secondStatus: "skipped",
    secondScheduledAt,
    secondDeliveryKey,
    secondSchedulerJobId: schedulerJobId,
    skippedAt: Date.parse("2026-07-22T21:16:00.000Z"),
    skippedReason: "skipped_already_started",
  });
  expect(state.response).toMatchObject({ response: "Edited second answer" });
  expect(state.scheduled).toHaveLength(1);
  expect(state.scheduled[0]).toMatchObject({
    _id: schedulerJobId,
    state: { kind: "canceled" },
  });
  expect(state.scheduled.filter((job) => job.state.kind === "pending")).toHaveLength(0);
});

test("second user's early start fails closed on malformed scheduled second state", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:16:00.000Z"));
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId, lifecycleId } = await seedCoupleWithLifecycle(t);
  const firstStartedAt = Date.parse("2026-07-22T21:15:00.000Z");
  const secondScheduledAt = Date.parse("2026-07-22T21:20:00.000Z");
  await t.run(async (ctx) => {
    const jobId = await ctx.scheduler.runAt(secondScheduledAt, answer, {
      promptDate: "2099-01-01",
      response: "noop",
    });
    await ctx.db.patch(lifecycleId, {
      firstStartedAt,
      secondStatus: "scheduled",
      secondScheduledAt,
      secondDeliveryKey: `${lifecycleId}:second`,
      secondSchedulerJobId: String(jobId),
      updatedAt: firstStartedAt,
    });
    await ctx.db.insert("dailyPromptAnswerStarts", {
      coupleId,
      promptDate: "2026-07-22",
      userId: creatorUserId,
      startedAt: firstStartedAt,
      source: "first_non_empty_input",
      createdAt: firstStartedAt,
    });
  });

  await expect(answerAs(t, "partner-auth", "2026-07-22", "Started early")).rejects.toThrow(
    "Malformed scheduled second daily prompt state.",
  );

  const state = await t.run(async (ctx) => ({
    starts: await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
    lifecycle: await ctx.db.get(lifecycleId),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(state.starts).toHaveLength(1);
  expect(state.lifecycle).toMatchObject({ secondStatus: "scheduled" });
  expect(state.scheduled).toHaveLength(1);
  expect(state.scheduled[0]).toMatchObject({ name: "prompts:answer", state: { kind: "pending" } });
});

test("second boundary rejects a direct or stale invocation while the persisted job is pending", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const { lifecycleId } = await seedCoupleWithLifecycle(t);
  await answerAs(t, "creator-auth");

  await expect(t.mutation(secondAnswerBoundary, { lifecycleId })).rejects.toThrow(
    "Malformed scheduled second daily prompt state.",
  );

  const state = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.get(lifecycleId),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(state.lifecycle).toMatchObject({ secondStatus: "scheduled" });
  expect(state.scheduled).toHaveLength(1);
  expect(state.scheduled[0]).toMatchObject({ state: { kind: "pending" } });
});

test("matching boundary succeeds and the second partner can still answer afterward", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const { coupleId, partnerUserId, lifecycleId } = await seedCoupleWithLifecycle(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("notificationDevices", {
      coupleId,
      userId: partnerUserId,
      deviceId: "partner-ready-ios",
      pushToken: "ExponentPushToken[partner-ready]",
      platform: "ios",
      permissionStatus: "granted",
      timezone: "America/New_York",
      enabled: true,
      lastObservedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  await answerAs(t, "creator-auth");

  vi.advanceTimersByTime(300_000);
  await t.finishInProgressScheduledFunctions();

  const state = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.get(lifecycleId),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(state.lifecycle).toMatchObject({ secondStatus: "scheduled" });
  expect(state.scheduled).toHaveLength(2);
  expect(state.scheduled).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "prompts:secondAnswerBoundary",
        state: { kind: "success" },
      }),
      expect.objectContaining({
        name: "dailyPromptDispatch:dispatchDailyPrompt",
        args: [{ lifecycleId, step: "second" }],
        state: { kind: "pending" },
      }),
    ]),
  );

  const responseId = await answerAs(t, "partner-auth", "2026-07-22", "Answered after boundary");
  const afterAnswer = await t.run(async (ctx) => ({
    response: await ctx.db.get(responseId),
    starts: await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
    lifecycle: await ctx.db.get(lifecycleId),
  }));
  expect(afterAnswer.response?.response).toBe("Answered after boundary");
  expect(afterAnswer.starts).toHaveLength(2);
  expect(afterAnswer.lifecycle).toMatchObject({
    secondStatus: "skipped",
    skippedReason: "skipped_already_started",
  });
});

test("second partner can save against a successful legacy boundary with no persisted dispatch", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:20:00.000Z"));
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId, partnerUserId, lifecycleId } = await seedCoupleWithLifecycle(t);
  const firstStartedAt = Date.now() - 300_000;
  const secondScheduledAt = Date.now();
  const secondSchedulerJobId = await t.run(async (ctx) =>
    ctx.scheduler.runAt(
      secondScheduledAt,
      makeFunctionReference<"mutation", { lifecycleId: Id<"dailyPromptLifecycles"> }, null>(
        "prompts:secondAnswerBoundary",
      ),
      { lifecycleId },
    ),
  );
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
  await t.run(async (ctx) => {
    await ctx.db.patch(lifecycleId, {
      firstStartedAt,
      secondScheduledAt,
      secondDeliveryKey: `${lifecycleId}:second`,
      secondSchedulerJobId: String(secondSchedulerJobId),
      secondStatus: "scheduled",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("dailyPromptAnswerStarts", {
      coupleId,
      promptDate: "2026-07-22",
      userId: creatorUserId,
      startedAt: firstStartedAt,
      source: "first_non_empty_input",
      createdAt: firstStartedAt,
    });
  });

  const responseId = await t.withIdentity({ tokenIdentifier: "partner-auth" }).mutation(answer, {
    promptDate: "2026-07-22",
    prompt: "FORGED legacy client prompt",
    response: "Compatible legacy save",
  });
  const state = await t.run(async (ctx) => ({
    response: await ctx.db.get(responseId),
    lifecycle: await ctx.db.get(lifecycleId),
    starts: await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
    attempts: await ctx.db.query("dailyPromptDeliveryAttempts").collect(),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(state.response).toMatchObject({
    userId: partnerUserId,
    response: "Compatible legacy save",
    prompt: "What is one little ritual you want more of in our life together?",
  });
  expect(state.lifecycle).toMatchObject({
    secondStatus: "skipped",
    skippedReason: "skipped_already_started",
  });
  expect(state.lifecycle?.secondDispatchSchedulerJobId).toBeUndefined();
  expect(state.starts).toHaveLength(2);
  expect(state.attempts).toHaveLength(0);
  expect(state.jobs).toHaveLength(1);
  expect(JSON.stringify(state)).not.toContain("FORGED");
});

test("first partner can submit after their successful delayed boundary", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const { coupleId, partnerUserId, lifecycleId } = await seedCoupleWithLifecycle(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("notificationDevices", {
      coupleId,
      userId: partnerUserId,
      deviceId: "partner-ready-after-input",
      pushToken: "ExponentPushToken[partner-ready-after-input]",
      platform: "ios",
      permissionStatus: "granted",
      timezone: "America/New_York",
      enabled: true,
      lastObservedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(startAnswering, {});

  vi.advanceTimersByTime(300_000);
  await t.finishInProgressScheduledFunctions();
  const responseId = await answerAs(t, "creator-auth", "2026-07-22", "Submitted after boundary");

  const state = await t.run(async (ctx) => ({
    response: await ctx.db.get(responseId),
    starts: await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
    lifecycle: await ctx.db.get(lifecycleId),
  }));
  expect(state.response?.response).toBe("Submitted after boundary");
  expect(state.starts).toHaveLength(1);
  expect(state.lifecycle).toMatchObject({ secondStatus: "scheduled" });
});

test("second-partner start racing an in-progress boundary converges without blocking the answer", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const { lifecycleId } = await seedCoupleWithLifecycle(t);
  await answerAs(t, "creator-auth");

  vi.advanceTimersByTime(300_000);
  const duringBoundary = await t.run(async (ctx) =>
    ctx.db.system.query("_scheduled_functions").unique(),
  );
  expect(duringBoundary?.state.kind).toBe("inProgress");
  const responseId = await answerAs(t, "partner-auth", "2026-07-22", "Raced the boundary");
  await t.finishInProgressScheduledFunctions();

  const state = await t.run(async (ctx) => ({
    response: await ctx.db.get(responseId),
    lifecycle: await ctx.db.get(lifecycleId),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(state.response?.response).toBe("Raced the boundary");
  expect(state.lifecycle).toMatchObject({
    secondStatus: "skipped",
    skippedReason: "skipped_already_started",
  });
  expect(state.scheduled).toHaveLength(1);
  expect(state.scheduled[0]).toMatchObject({ state: { kind: "success" } });
});

test("editing an existing non-empty response does not create an answer-start or reschedule the lifecycle", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId, lifecycleId } = await seedCoupleWithLifecycle(t);
  const existingResponseId = await t.run(async (ctx) =>
    ctx.db.insert("promptResponses", {
      coupleId,
      userId: creatorUserId,
      promptDate: "2026-07-22",
      prompt: "Old prompt",
      response: "Already answered",
      createdAt: 123,
    }),
  );

  const result = await answerAs(t, "creator-auth", "2026-07-22", "Edited only");

  const state = await t.run(async (ctx) => ({
    starts: await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
    lifecycle: await ctx.db.get(lifecycleId),
    response: await ctx.db.get(existingResponseId),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));

  expect(result).toBe(existingResponseId);
  expect(state.starts).toHaveLength(0);
  expect(state.lifecycle).toMatchObject({ secondStatus: "pending" });
  expect(state.lifecycle?.firstStartedAt).toBeUndefined();
  expect(state.response).toMatchObject({ response: "Edited only", createdAt: 123 });
  expect(state.scheduled).toHaveLength(0);
});

test("persisted empty or whitespace response transitions to a single start when saved non-empty", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId } = await seedCoupleWithLifecycle(t);
  const existingResponseId = await t.run(async (ctx) =>
    ctx.db.insert("promptResponses", {
      coupleId,
      userId: creatorUserId,
      promptDate: "2026-07-22",
      prompt: "Old prompt",
      response: "   ",
      createdAt: 123,
    }),
  );

  const result = await answerAs(t, "creator-auth", "2026-07-22", "Now non-empty");

  const state = await t.run(async (ctx) => ({
    starts: await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
    response: await ctx.db.get(existingResponseId),
  }));

  expect(result).toBe(existingResponseId);
  expect(state.starts).toHaveLength(1);
  expect(state.response).toMatchObject({ response: "Now non-empty", createdAt: 123 });
});

test("replayed save converges from an existing start row using the earliest accepted startedAt", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:30:00.000Z"));
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId, lifecycleId } = await seedCoupleWithLifecycle(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("dailyPromptAnswerStarts", {
      coupleId,
      promptDate: "2026-07-22",
      userId: creatorUserId,
      startedAt: Date.parse("2026-07-22T21:15:00.000Z"),
      source: "first_non_empty_input",
      createdAt: Date.parse("2026-07-22T21:15:00.000Z"),
    });
  });

  await answerAs(t, "creator-auth", "2026-07-22", "Retry after partial write");

  const state = await t.run(async (ctx) => ({
    starts: await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
    lifecycle: await ctx.db.get(lifecycleId),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));

  expect(state.starts).toHaveLength(1);
  expect(state.lifecycle).toMatchObject({
    firstStartedAt: Date.parse("2026-07-22T21:15:00.000Z"),
    secondScheduledAt: Date.parse("2026-07-22T21:20:00.000Z"),
    secondStatus: "scheduled",
    secondDeliveryKey: `${lifecycleId}:second`,
  });
  expect(state.scheduled).toHaveLength(1);
  expect(state.scheduled[0]).toMatchObject({
    scheduledTime: Date.parse("2026-07-22T21:20:00.000Z"),
  });
});

test("answer save fails closed on stale or missing current lifecycle rows", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-23T16:00:00.000Z"));
  const t = convexTest(schema, modules);
  await seedCoupleWithLifecycle(t);

  await expect(answerAs(t, "creator-auth", "2026-07-22")).rejects.toThrow(
    "Daily prompt date is not current.",
  );

  await t.run(async (ctx) => {
    const rows = await ctx.db.query("dailyPromptLifecycles").collect();
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
  });

  await expect(answerAs(t, "creator-auth", "2026-07-23")).rejects.toThrow(
    "Daily prompt is not scheduled.",
  );
});

test("answer save fails closed on duplicate lifecycle, duplicate answer-start, invalid membership cardinality, and malformed recipients", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId, partnerUserId } = await seedCoupleWithLifecycle(t);

  await t.run(async (ctx) => {
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
      createdAt: 2,
      updatedAt: 2,
    });
  });
  await expect(answerAs(t, "creator-auth")).rejects.toThrow("Duplicate daily prompt lifecycle.");

  await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect();
    await ctx.db.delete(rows[1]._id);
    for (const createdAt of [3, 4]) {
      await ctx.db.insert("dailyPromptAnswerStarts", {
        coupleId,
        promptDate: "2026-07-22",
        userId: creatorUserId,
        startedAt: createdAt,
        source: "first_non_empty_input",
        createdAt,
      });
    }
  });
  await expect(answerAs(t, "creator-auth")).rejects.toThrow("Duplicate daily prompt answer start.");

  await t.run(async (ctx) => {
    const starts = await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_user_id_and_prompt_date", (q) =>
        q.eq("userId", creatorUserId).eq("promptDate", "2026-07-22"),
      )
      .collect();
    await Promise.all(starts.map((start) => ctx.db.delete(start._id)));
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: partnerUserId,
      role: "partner",
      joinedAt: 30,
    });
  });
  await expect(answerAs(t, "creator-auth")).rejects.toThrow("Invalid daily prompt membership.");

  await t.run(async (ctx) => {
    const duplicateMemberships = await ctx.db
      .query("coupleMembers")
      .withIndex("by_couple_and_user", (q) =>
        q.eq("coupleId", coupleId).eq("userId", partnerUserId),
      )
      .collect();
    await ctx.db.delete(duplicateMemberships[1]._id);
    const lifecycle = await ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .unique();
    if (!lifecycle) throw new Error("Expected lifecycle");
    await ctx.db.patch(lifecycle._id, { secondUserId: creatorUserId });
  });
  await expect(answerAs(t, "creator-auth")).rejects.toThrow(
    "Malformed daily prompt lifecycle recipients.",
  );
});

test("answer save derives authority from the authenticated couple and rejects cross-couple access", async () => {
  const t = convexTest(schema, modules);
  await seedCoupleWithLifecycle(t);
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
      promptTimezone: "America/New_York",
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

  await expect(answerAs(t, "other-auth", "2026-07-22")).rejects.toThrow(
    "Daily prompt is not scheduled.",
  );

  const leaked = await t.run(async (ctx) =>
    ctx.db
      .query("promptResponses")
      .withIndex("by_user_and_date", (q) =>
        q.eq("userId", otherUserId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
  );
  expect(leaked).toHaveLength(0);
});

test("simulated concurrent first-user saves converge to one answer-start and one second scheduler boundary", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const { coupleId, lifecycleId } = await seedCoupleWithLifecycle(t);

  const [left, right] = await Promise.allSettled([
    answerAs(t, "creator-auth", "2026-07-22", "Left"),
    answerAs(t, "creator-auth", "2026-07-22", "Right"),
  ]);

  expect(left.status).toBe("fulfilled");
  expect(right.status).toBe("fulfilled");
  const state = await t.run(async (ctx) => ({
    starts: await ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
    responses: await ctx.db
      .query("promptResponses")
      .withIndex("by_couple_and_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));

  expect(state.starts).toHaveLength(1);
  expect(state.responses).toHaveLength(1);
  expect(state.scheduled).toHaveLength(1);
  expect(state.scheduled[0]).toMatchObject({
    name: "prompts:secondAnswerBoundary",
    args: [{ lifecycleId }],
  });
});
