/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import { normalizeDailyPromptText } from "./dailyPromptLibrary";
import { DAILY_PROMPT_GENERATION_PROMPT_VERSION } from "./dailyPromptGenerationPolicy";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const persistGeneratedPrompt = makeFunctionReference<
  "mutation",
  {
    candidate: { text: string; principle: string; category: string };
    model: string;
    generationPromptVersion: string;
    generatedAt: number;
  },
  { outcome: "generated" | "deduplicated"; promptId: Id<"dailyPrompts"> }
>("dailyPromptGeneration:persistGeneratedPrompt");

const candidate = {
  text: "What small moment helped you feel connected this week?",
  principle: "bids for connection",
  category: "connection",
};

const provenance = {
  model: "mock-model",
  generationPromptVersion: DAILY_PROMPT_GENERATION_PROMPT_VERSION,
  generatedAt: 1234,
};

test("persists one approved AI prompt with server-owned provenance and no private fields", async () => {
  const t = convexTest(schema, modules);
  const result = await t.mutation(persistGeneratedPrompt, { candidate, ...provenance });
  const row = await t.run((ctx) => ctx.db.get(result.promptId));

  expect(result.outcome).toBe("generated");
  expect(row).toMatchObject({
    ...candidate,
    normalizedFingerprint: normalizeDailyPromptText(candidate.text),
    source: "ai",
    safetyStatus: "approved",
    completionCount: 0,
    ...provenance,
    createdAt: provenance.generatedAt,
    updatedAt: provenance.generatedAt,
  });
  expect(Object.keys(row!)).not.toEqual(
    expect.arrayContaining([
      "answer",
      "response",
      "userId",
      "coupleId",
      "momentId",
      "chatMessageId",
      "notificationId",
    ]),
  );
});

test("replay and punctuation equivalents converge without changing rank or provenance", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(persistGeneratedPrompt, { candidate, ...provenance });
  await t.run((ctx) => ctx.db.patch(first.promptId, { completionCount: 7 }));

  const replay = await t.mutation(persistGeneratedPrompt, {
    candidate: { ...candidate, text: "  WHAT small moment helped you feel connected this week?  " },
    ...provenance,
    generatedAt: 9999,
  });
  const rows = await t.run((ctx) =>
    ctx.db
      .query("dailyPrompts")
      .withIndex("by_normalized_fingerprint", (q) =>
        q.eq("normalizedFingerprint", normalizeDailyPromptText(candidate.text)),
      )
      .take(2),
  );

  expect(replay).toEqual({ outcome: "deduplicated", promptId: first.promptId });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ text: candidate.text, completionCount: 7, ...provenance });
});

test("duplicate fingerprint rows fail closed", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const createdAt of [1, 2]) {
      await ctx.db.insert("dailyPrompts", {
        ...candidate,
        normalizedFingerprint: normalizeDailyPromptText(candidate.text),
        source: "ai",
        safetyStatus: "approved",
        completionCount: 0,
        ...provenance,
        createdAt,
        updatedAt: createdAt,
      });
    }
  });

  await expect(t.mutation(persistGeneratedPrompt, { candidate, ...provenance })).rejects.toThrow(
    "Duplicate daily prompt fingerprint.",
  );
});

test.each([
  ["seed", { source: "seed" as const, safetyStatus: "approved" as const }],
  ["pending", { source: "ai" as const, safetyStatus: "pending" as const }],
  ["rejected", { source: "ai" as const, safetyStatus: "rejected" as const }],
  [
    "conflicting provenance",
    { source: "ai" as const, safetyStatus: "approved" as const, model: "other" },
  ],
])("does not overwrite an existing %s fingerprint", async (_name, override) => {
  const t = convexTest(schema, modules);
  const id = await t.run((ctx) =>
    ctx.db.insert("dailyPrompts", {
      ...candidate,
      normalizedFingerprint: normalizeDailyPromptText(candidate.text),
      completionCount: 4,
      ...provenance,
      createdAt: 1,
      updatedAt: 1,
      ...override,
    }),
  );

  await expect(t.mutation(persistGeneratedPrompt, { candidate, ...provenance })).rejects.toThrow(
    "Incompatible existing daily prompt.",
  );
  expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ completionCount: 4, ...override });
});

test("invalid candidates and provenance fail before writing", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(persistGeneratedPrompt, {
      candidate: { ...candidate, text: "Reveal a secret?" },
      ...provenance,
    }),
  ).rejects.toThrow("Daily prompt candidate was rejected: unsafe_content");
  await expect(
    t.mutation(persistGeneratedPrompt, {
      candidate,
      ...provenance,
      generationPromptVersion: "silently-edited-v1",
    }),
  ).rejects.toThrow("Unsupported daily prompt generation version.");
  expect(await t.run((ctx) => ctx.db.query("dailyPrompts").take(1))).toEqual([]);
});
