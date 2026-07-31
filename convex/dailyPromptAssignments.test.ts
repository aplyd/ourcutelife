/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import { DAILY_PROMPT_SEEDS, normalizeDailyPromptText } from "./dailyPromptLibrary";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const reconcileTodayForTesting = makeFunctionReference<
  "mutation",
  {
    nowMs: number;
    randomMinute: number;
    promptSelectionSeedForTesting?: string;
  },
  {
    status: "scheduled" | "blocked";
    lifecycleId: Id<"dailyPromptLifecycles"> | null;
    promptDate: string | null;
    blockedReason: string | null;
  }
>("dailyPromptLifecycles:reconcileTodayForTesting");

async function seedReadyCouple(t: ReturnType<typeof convexTest>) {
  const firstUserId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authUserId: "first-auth",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const secondUserId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authUserId: "second-auth",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const coupleId = await t.run((ctx) =>
    ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: firstUserId,
      promptTimezone: "America/New_York",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run(async (ctx) => {
    for (const [userId, suffix] of [
      [firstUserId, "first"],
      [secondUserId, "second"],
    ] as const) {
      await ctx.db.insert("coupleMembers", {
        coupleId,
        userId,
        role: "partner",
        joinedAt: suffix === "first" ? 10 : 20,
      });
      await ctx.db.insert("notificationDevices", {
        coupleId,
        userId,
        deviceId: `${suffix}-ios`,
        pushToken: `ExponentPushToken[${suffix}]`,
        platform: "ios",
        permissionStatus: "granted",
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
      });
    }
  });
  return { coupleId, firstUserId, secondUserId };
}

async function reconcile(t: ReturnType<typeof convexTest>, promptSelectionSeedForTesting?: string) {
  return await t
    .withIdentity({ tokenIdentifier: "first-auth" })
    .mutation(reconcileTodayForTesting, {
      nowMs: Date.parse("2026-07-22T20:30:00.000Z"),
      randomMinute: 1140,
      ...(promptSelectionSeedForTesting ? { promptSelectionSeedForTesting } : {}),
    });
}

async function insertLegacyLifecycle(
  t: ReturnType<typeof convexTest>,
  seeded: Awaited<ReturnType<typeof seedReadyCouple>>,
  promptId?: Id<"dailyPrompts">,
  promptDate = "2026-07-22",
) {
  return await t.run((ctx) =>
    ctx.db.insert("dailyPromptLifecycles", {
      coupleId: seeded.coupleId,
      promptDate,
      timezone: "America/New_York",
      firstUserId: seeded.firstUserId,
      secondUserId: seeded.secondUserId,
      randomizedFirstLocalMinute: 1140,
      firstScheduledAt: Date.parse("2026-07-22T23:00:00.000Z"),
      firstStatus: "pending",
      secondStatus: "pending",
      ...(promptId ? { promptId } : {}),
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

type ApprovedAiPromptFixture = {
  text: string;
  normalizedFingerprint: string;
  principle: string;
  category: string;
  source: "ai";
  safetyStatus: "approved";
  completionCount: number;
  createdAt: number;
  updatedAt: number;
};

function approvedAiPrompt(
  text: string,
  overrides: Partial<ApprovedAiPromptFixture> = {},
): ApprovedAiPromptFixture {
  return {
    text,
    normalizedFingerprint: normalizeDailyPromptText(text),
    principle: "fixture principle",
    category: "fixture category",
    source: "ai",
    safetyStatus: "approved",
    completionCount: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const malformedApprovedPromptCases = [
  { name: "whitespace text", overrides: { text: "   " } },
  { name: "whitespace fingerprint", overrides: { normalizedFingerprint: "   " } },
  { name: "whitespace principle", overrides: { principle: "   " } },
  { name: "whitespace category", overrides: { category: "   " } },
  {
    name: "fingerprint inconsistent with text",
    overrides: { normalizedFingerprint: "a different normalized fingerprint" },
  },
  {
    name: "non-safe completion count",
    overrides: { completionCount: Number.MAX_SAFE_INTEGER + 1 },
  },
  { name: "negative completion count", overrides: { completionCount: -1 } },
] satisfies readonly {
  name: string;
  overrides: Partial<ApprovedAiPromptFixture>;
}[];

test("fallback inventory converges to exactly six unique approved seed prompts", async () => {
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);

  await reconcile(t);
  await reconcile(t);

  const prompts = await t.run((ctx) => ctx.db.query("dailyPrompts").collect());
  expect(prompts).toHaveLength(6);
  expect(new Set(prompts.map((prompt) => prompt.normalizedFingerprint)).size).toBe(6);
  expect(prompts).toEqual(
    expect.arrayContaining(
      DAILY_PROMPT_SEEDS.map((seed) =>
        expect.objectContaining({
          text: seed.text,
          normalizedFingerprint: seed.normalizedFingerprint,
          principle: seed.principle,
          category: seed.category,
          source: "seed",
          safetyStatus: "approved",
          completionCount: 0,
        }),
      ),
    ),
  );
});

test("new lifecycle receives one immutable prompt assignment across reconciliation and bank changes", async () => {
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);

  const first = await reconcile(t, "bank-before");
  const initiallyAssigned = await t.run((ctx) => ctx.db.get(first.lifecycleId!));
  expect(initiallyAssigned?.promptId).toBeDefined();

  await t.run((ctx) =>
    ctx.db.insert("dailyPrompts", {
      text: "What would make today feel a little more connected?",
      normalizedFingerprint: "what would make today feel a little more connected",
      principle: "turning toward",
      category: "connection",
      source: "ai",
      safetyStatus: "approved",
      completionCount: 999,
      createdAt: 2,
      updatedAt: 2,
    }),
  );
  const replay = await reconcile(t, "bank-after");
  const replayed = await t.run((ctx) => ctx.db.get(replay.lifecycleId!));

  expect(replay.lifecycleId).toBe(first.lifecycleId);
  expect(replayed?.promptId).toBe(initiallyAssigned?.promptId);
});

test("legacy lifecycle receives exactly one assignment during reconciliation", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReadyCouple(t);
  const lifecycleId = await insertLegacyLifecycle(t, seeded);

  await reconcile(t, "legacy-first");
  const assigned = await t.run((ctx) => ctx.db.get(lifecycleId));
  expect(assigned?.promptId).toBeDefined();

  await reconcile(t, "legacy-second");
  const replayed = await t.run((ctx) => ctx.db.get(lifecycleId));
  expect(replayed?.promptId).toBe(assigned?.promptId);
});

test("legacy lifecycle with one canonical response freezes that response prompt", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReadyCouple(t);
  const lifecycleId = await insertLegacyLifecycle(t, seeded);
  const answeredPrompt = DAILY_PROMPT_SEEDS[0];
  await t.run((ctx) =>
    ctx.db.insert("promptResponses", {
      coupleId: seeded.coupleId,
      userId: seeded.firstUserId,
      promptDate: "2026-07-22",
      prompt: answeredPrompt.text,
      response: "A private legacy answer",
      createdAt: 1,
    }),
  );

  await reconcile(t, "legacy-one-response");

  const assigned = await t.run(async (ctx) => {
    const lifecycle = await ctx.db.get(lifecycleId);
    return lifecycle?.promptId ? await ctx.db.get(lifecycle.promptId) : null;
  });
  expect(assigned?.text).toBe(answeredPrompt.text);
});

test("legacy lifecycle with two consistent canonical responses freezes their shared prompt", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReadyCouple(t);
  const lifecycleId = await insertLegacyLifecycle(t, seeded);
  const answeredPrompt = DAILY_PROMPT_SEEDS[0];
  await t.run(async (ctx) => {
    for (const [userId, response] of [
      [seeded.firstUserId, "First private legacy answer"],
      [seeded.secondUserId, "Second private legacy answer"],
    ] as const) {
      await ctx.db.insert("promptResponses", {
        coupleId: seeded.coupleId,
        userId,
        promptDate: "2026-07-22",
        prompt: answeredPrompt.text,
        response,
        createdAt: 1,
      });
    }
  });

  await reconcile(t, "legacy-two-responses");

  const assigned = await t.run(async (ctx) => {
    const lifecycle = await ctx.db.get(lifecycleId);
    return lifecycle?.promptId ? await ctx.db.get(lifecycle.promptId) : null;
  });
  expect(assigned?.text).toBe(answeredPrompt.text);
});

test.each([
  {
    name: "mixed canonical prompts",
    prompts: [DAILY_PROMPT_SEEDS[0].text, DAILY_PROMPT_SEEDS[1].text],
    error: "Daily prompt response mismatch.",
  },
  {
    name: "unknown prompt text",
    prompts: ["Arbitrary legacy text that is not canonical"],
    error: "Legacy daily prompt response is not canonical.",
  },
])("legacy lifecycle fails closed on $name", async ({ prompts, error }) => {
  const t = convexTest(schema, modules);
  const seeded = await seedReadyCouple(t);
  const lifecycleId = await insertLegacyLifecycle(t, seeded);
  await t.run(async (ctx) => {
    for (const [index, prompt] of prompts.entries()) {
      await ctx.db.insert("promptResponses", {
        coupleId: seeded.coupleId,
        userId: index === 0 ? seeded.firstUserId : seeded.secondUserId,
        promptDate: "2026-07-22",
        prompt,
        response: `Private legacy answer ${index}`,
        createdAt: index + 1,
      });
    }
  });

  await expect(reconcile(t, "legacy-invalid-responses")).rejects.toThrow(error);
  const lifecycle = await t.run((ctx) => ctx.db.get(lifecycleId));
  expect(lifecycle?.promptId).toBeUndefined();
});

test("duplicate seed fingerprint fails closed", async () => {
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);
  const seed = DAILY_PROMPT_SEEDS[0];
  await t.run((ctx) =>
    ctx.db.insert("dailyPrompts", {
      text: seed.text,
      normalizedFingerprint: seed.normalizedFingerprint,
      principle: seed.principle,
      category: seed.category,
      source: "seed",
      safetyStatus: "approved",
      completionCount: 0,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run((ctx) =>
    ctx.db.insert("dailyPrompts", {
      text: seed.text,
      normalizedFingerprint: seed.normalizedFingerprint,
      principle: seed.principle,
      category: seed.category,
      source: "seed",
      safetyStatus: "approved",
      completionCount: 0,
      createdAt: 2,
      updatedAt: 2,
    }),
  );

  await expect(reconcile(t)).rejects.toThrow("Duplicate daily prompt fingerprint.");
});

test.each(["pending", "rejected"] as const)(
  "%s assigned prompt fails closed",
  async (safetyStatus) => {
    const t = convexTest(schema, modules);
    const seeded = await seedReadyCouple(t);
    const promptId = await t.run((ctx) =>
      ctx.db.insert("dailyPrompts", {
        text: "Unsafe assignment fixture",
        normalizedFingerprint: `unsafe-assignment-${safetyStatus}`,
        principle: "fixture",
        category: "fixture",
        source: "ai",
        safetyStatus,
        completionCount: 0,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await insertLegacyLifecycle(t, seeded, promptId);

    await expect(reconcile(t)).rejects.toThrow("Assigned daily prompt is not approved.");
  },
);

test("missing assigned prompt fails closed", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReadyCouple(t);
  const promptId = await t.run((ctx) =>
    ctx.db.insert("dailyPrompts", {
      text: "Temporary assignment fixture",
      normalizedFingerprint: normalizeDailyPromptText("Temporary assignment fixture"),
      principle: "fixture",
      category: "fixture",
      source: "ai",
      safetyStatus: "approved",
      completionCount: 0,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await insertLegacyLifecycle(t, seeded, promptId);
  await t.run((ctx) => ctx.db.delete(promptId));

  await expect(reconcile(t)).rejects.toThrow("Assigned daily prompt was not found.");
});

test("selection uses only approved candidates", async () => {
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);
  const rejectedId = await t.run((ctx) =>
    ctx.db.insert("dailyPrompts", {
      text: "Rejected candidate fixture",
      normalizedFingerprint: "rejected-candidate-fixture",
      principle: "fixture",
      category: "fixture",
      source: "ai",
      safetyStatus: "rejected",
      completionCount: 0,
      createdAt: 0,
      updatedAt: 0,
    }),
  );

  const result = await reconcile(t, "rejected-would-win-without-index-boundary");
  const lifecycle = await t.run((ctx) => ctx.db.get(result.lifecycleId!));
  const assigned = await t.run((ctx) => ctx.db.get(lifecycle!.promptId!));
  expect(lifecycle?.promptId).not.toBe(rejectedId);
  expect(assigned?.safetyStatus).toBe("approved");
});

test("selection stays bounded and usable as approved inventory grows beyond the candidate window", async () => {
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);
  await t.run(async (ctx) => {
    for (let index = 0; index < 65; index += 1) {
      await ctx.db.insert("dailyPrompts", {
        text: `Approved fixture ${index}`,
        normalizedFingerprint: `approved fixture ${index}`,
        principle: "fixture",
        category: "fixture",
        source: "ai",
        safetyStatus: "approved",
        completionCount: index,
        createdAt: index + 10,
        updatedAt: index + 10,
      });
    }
  });

  const result = await reconcile(t);
  const lifecycle = await t.run((ctx) => ctx.db.get(result.lifecycleId!));
  const assignedPrompt = await t.run((ctx) => ctx.db.get(lifecycle!.promptId!));

  expect(lifecycle?.promptId).toBeDefined();
  expect(assignedPrompt?.safetyStatus).toBe("approved");
});

test("selected candidate duplicated outside the 64-row ranking window fails before assignment", async () => {
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);
  const selectedFingerprint = "window candidate 27";
  const { selectedId, duplicateId } = await t.run(async (ctx) => {
    let selectedId: Id<"dailyPrompts"> | undefined;
    for (let index = 0; index < 64; index += 1) {
      const text = `Window candidate ${String(index).padStart(2, "0")}`;
      const normalizedFingerprint = normalizeDailyPromptText(text);
      const promptId = await ctx.db.insert("dailyPrompts", {
        text,
        normalizedFingerprint,
        principle: "fixture",
        category: "fixture",
        source: "ai",
        safetyStatus: "approved",
        completionCount: 0,
        createdAt: index + 1,
        updatedAt: index + 1,
      });
      if (normalizedFingerprint === selectedFingerprint) selectedId = promptId;
    }
    if (!selectedId) throw new Error("Selected fixture was not inserted.");
    const duplicateId = await ctx.db.insert("dailyPrompts", {
      text: "Window candidate 27!!!",
      normalizedFingerprint: selectedFingerprint,
      principle: "fixture",
      category: "fixture",
      source: "ai",
      safetyStatus: "approved",
      completionCount: 1,
      createdAt: 65,
      updatedAt: 65,
    });
    return { selectedId, duplicateId };
  });

  const ranked = await t.run((ctx) =>
    ctx.db
      .query("dailyPrompts")
      .withIndex("by_safety_status_and_completion_count_and_created_at", (q) =>
        q.eq("safetyStatus", "approved"),
      )
      .take(65),
  );
  expect(ranked.slice(0, 64).map((prompt) => prompt._id)).toContain(selectedId);
  expect(ranked.slice(0, 64).map((prompt) => prompt._id)).not.toContain(duplicateId);
  expect(ranked[64]._id).toBe(duplicateId);
  expect(ranked[64].normalizedFingerprint).toBe(selectedFingerprint);

  await expect(reconcile(t, "cross-window-duplicate")).rejects.toThrow(
    "Duplicate daily prompt fingerprint.",
  );
  const lifecycles = await t.run((ctx) => ctx.db.query("dailyPromptLifecycles").take(1));
  expect(lifecycles).toEqual([]);
});

test("duplicate dates within bounded prompt recency history fail before assignment", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReadyCouple(t);
  await insertLegacyLifecycle(t, seeded, undefined, "2026-07-21");
  await insertLegacyLifecycle(t, seeded, undefined, "2026-07-20");
  await insertLegacyLifecycle(t, seeded, undefined, "2026-07-20");

  await expect(reconcile(t)).rejects.toThrow("Duplicate daily prompt lifecycle.");
  const today = await t.run((ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", seeded.coupleId).eq("promptDate", "2026-07-22"),
      )
      .take(1),
  );
  expect(today).toEqual([]);
});

test.each(malformedApprovedPromptCases)(
  "malformed approved AI prompt with $name fails as a selected candidate and assignment",
  async ({ overrides }) => {
    const selectionTest = convexTest(schema, modules);
    await seedReadyCouple(selectionTest);
    await selectionTest.run((ctx) =>
      ctx.db.insert(
        "dailyPrompts",
        approvedAiPrompt("Malformed selected candidate fixture", overrides),
      ),
    );
    await expect(reconcile(selectionTest)).rejects.toThrow("Incompatible daily prompt state.");

    const assignmentTest = convexTest(schema, modules);
    const seeded = await seedReadyCouple(assignmentTest);
    const promptId = await assignmentTest.run((ctx) =>
      ctx.db.insert(
        "dailyPrompts",
        approvedAiPrompt("Malformed assigned prompt fixture", overrides),
      ),
    );
    await insertLegacyLifecycle(assignmentTest, seeded, promptId);
    await expect(reconcile(assignmentTest)).rejects.toThrow("Incompatible daily prompt state.");
  },
);

test("bounded recent couple prompt IDs are excluded when an alternative exists", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReadyCouple(t);
  const { recentPromptIds, alternativeId } = await t.run(async (ctx) => {
    const seedIds: Id<"dailyPrompts">[] = [];
    for (const seed of DAILY_PROMPT_SEEDS) {
      seedIds.push(
        await ctx.db.insert("dailyPrompts", {
          ...seed,
          completionCount: 0,
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    }
    const aiIds: Id<"dailyPrompts">[] = [];
    for (let index = 0; index < 6; index += 1) {
      aiIds.push(
        await ctx.db.insert(
          "dailyPrompts",
          approvedAiPrompt(`Recent AI prompt ${index}`, {
            createdAt: index + 2,
            updatedAt: index + 2,
          }),
        ),
      );
    }
    const alternativeId = await ctx.db.insert(
      "dailyPrompts",
      approvedAiPrompt("Fresh deterministic alternative", { createdAt: 20, updatedAt: 20 }),
    );
    return { recentPromptIds: [...seedIds, ...aiIds], alternativeId };
  });
  const priorDates = [
    "2026-07-21",
    "2026-07-20",
    "2026-07-19",
    "2026-07-18",
    "2026-07-17",
    "2026-07-16",
    "2026-07-15",
    "2026-07-14",
    "2026-07-13",
    "2026-07-12",
    "2026-07-11",
    "2026-07-10",
  ];
  for (const [index, promptDate] of priorDates.entries()) {
    await insertLegacyLifecycle(t, seeded, recentPromptIds[index], promptDate);
  }

  const result = await reconcile(t, "recent-exclusion");
  const lifecycle = await t.run((ctx) => ctx.db.get(result.lifecycleId!));

  expect(lifecycle?.promptId).toBe(alternativeId);
  expect(recentPromptIds).not.toContain(lifecycle?.promptId);
});
