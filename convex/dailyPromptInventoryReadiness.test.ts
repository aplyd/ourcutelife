/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, test, vi } from "vitest";

import type { Id } from "./_generated/dataModel";
import {
  DAILY_PROMPT_INVENTORY_FLOOR,
  DAILY_PROMPT_INVENTORY_POLICY_VERSION,
  decideDailyPromptInventoryReadiness,
  isDailyPromptInventoryReadinessSnapshot,
  type DailyPromptInventoryEvidence,
} from "./dailyPromptInventoryReadiness";
import {
  preflightDailyPromptGeneration,
  type DailyPromptInventoryReadinessSnapshot,
} from "./dailyPromptGenerationOrchestration";
import { DAILY_PROMPT_GENERATION_PROMPT_VERSION } from "./dailyPromptGenerationPolicy";
import { DAILY_PROMPT_SEEDS, normalizeDailyPromptText } from "./dailyPromptLibrary";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const getInventoryReadiness = makeFunctionReference<
  "query",
  Record<string, never>,
  DailyPromptInventoryReadinessSnapshot
>("dailyPromptInventory:getReusableDailyPromptInventoryReadiness");
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

function evidence(index: number, source: "seed" | "ai" = "ai"): DailyPromptInventoryEvidence {
  const seed = source === "seed" ? DAILY_PROMPT_SEEDS[index] : undefined;
  return {
    id: `prompt-${index}`,
    normalizedFingerprint:
      seed?.normalizedFingerprint ?? `fingerprint ${String(index).padStart(2, "0")}`,
    source,
    safetyStatus: "approved",
  };
}

function fingerprints(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `approved ${String(index).padStart(2, "0")}`);
}

function expectAggregateOnly(snapshot: DailyPromptInventoryReadinessSnapshot) {
  expect(Object.keys(snapshot).sort()).toEqual([
    "aiCount",
    "approvedCount",
    "duplicateFingerprints",
    "policyVersion",
    "requestedCount",
    "seedCount",
    "status",
  ]);
  expect(Object.keys(snapshot)).not.toEqual(
    expect.arrayContaining([
      "answer",
      "response",
      "userId",
      "coupleId",
      "moment",
      "chat",
      "device",
      "notification",
      "lifecycle",
      "completionCount",
    ]),
  );
}

describe("daily prompt inventory readiness policy", () => {
  test.each([
    ["empty", [], 5],
    ["seed-only", Array.from({ length: 6 }, (_, index) => evidence(index, "seed")), 5],
    [
      "one below floor",
      Array.from({ length: DAILY_PROMPT_INVENTORY_FLOOR - 1 }, (_, index) => evidence(index)),
      1,
    ],
  ])("requests only the bounded shortage for %s inventory", (_name, rows, requestedCount) => {
    const snapshot = decideDailyPromptInventoryReadiness(rows);
    expect(snapshot.status).toBe("replenish");
    expect(snapshot.requestedCount).toBe(requestedCount);
    expect(snapshot.approvedCount).toBe(rows.length);
    expectAggregateOnly(snapshot);
  });

  test.each([
    ["exact floor", DAILY_PROMPT_INVENTORY_FLOOR],
    ["above floor", DAILY_PROMPT_INVENTORY_FLOOR + 1],
    ["selection-window maximum", 64],
  ])("does not authorize generation for %s inventory", (_name, count) => {
    const snapshot = decideDailyPromptInventoryReadiness(
      Array.from({ length: count }, (_, index) => evidence(index)),
    );
    expect(snapshot).toMatchObject({ status: "healthy", requestedCount: 0, approvedCount: count });
    expectAggregateOnly(snapshot);
  });

  test("returns deterministic normalized duplicate context capped at twelve", () => {
    const rows = Array.from({ length: 20 }, (_, index) => evidence(index)).reverse();
    const first = decideDailyPromptInventoryReadiness(rows);
    const second = decideDailyPromptInventoryReadiness([...rows].reverse());
    expect(first.duplicateFingerprints).toHaveLength(12);
    expect(first.duplicateFingerprints).toEqual(second.duplicateFingerprints);
    expect(first.duplicateFingerprints).toEqual(
      Array.from({ length: 12 }, (_, index) => `fingerprint ${String(index).padStart(2, "0")}`),
    );
  });

  test.each([
    ["duplicate ids", [evidence(1), { ...evidence(2), id: evidence(1).id }]],
    [
      "duplicate normalized fingerprints",
      [evidence(1), { ...evidence(2), normalizedFingerprint: evidence(1).normalizedFingerprint }],
    ],
    ["blank id", [{ ...evidence(1), id: " " }]],
    ["blank fingerprint", [{ ...evidence(1), normalizedFingerprint: " " }]],
    ["malformed status", [{ ...evidence(1), safetyStatus: "pending" }]],
    ["malformed source", [{ ...evidence(1), source: "provider" }]],
    ["unsafe input shape", null],
    ["oversized input", Array.from({ length: 65 }, (_, index) => evidence(index))],
  ])("fails closed for %s evidence", (_name, rows) => {
    const snapshot = decideDailyPromptInventoryReadiness(rows);
    expect(snapshot).toEqual({
      policyVersion: DAILY_PROMPT_INVENTORY_POLICY_VERSION,
      status: "invalid",
      approvedCount: 0,
      seedCount: 0,
      aiCount: 0,
      requestedCount: 0,
      duplicateFingerprints: [],
    });
    expectAggregateOnly(snapshot);
  });

  test("rejects malformed snapshot evidence while preserving capped context", () => {
    const cappedSnapshot = decideDailyPromptInventoryReadiness(
      Array.from({ length: 20 }, (_, index) => evidence(index)),
    );
    expect(cappedSnapshot.duplicateFingerprints).toHaveLength(12);
    expect(isDailyPromptInventoryReadinessSnapshot(cappedSnapshot)).toBe(true);
    expect(
      isDailyPromptInventoryReadinessSnapshot({
        ...cappedSnapshot,
        approvedCount: 9,
        aiCount: 3,
        seedCount: 6,
        requestedCount: 3,
        status: "replenish",
        duplicateFingerprints: fingerprints(2),
      }),
    ).toBe(false);
    expect(
      isDailyPromptInventoryReadinessSnapshot({
        ...cappedSnapshot,
        approvedCount: 9,
        aiCount: 2,
        seedCount: 7,
        requestedCount: 3,
        status: "replenish",
        duplicateFingerprints: fingerprints(9),
      }),
    ).toBe(false);
  });
});

describe("bounded approved inventory query", () => {
  async function insertPrompt(
    t: ReturnType<typeof convexTest>,
    index: number,
    overrides: Record<string, unknown> = {},
  ): Promise<Id<"dailyPrompts">> {
    const text = `What approved connection detail number ${index} mattered today?`;
    return await t.run((ctx) =>
      ctx.db.insert("dailyPrompts", {
        text,
        normalizedFingerprint: normalizeDailyPromptText(text),
        principle: "appreciation",
        category: "connection",
        source: "ai",
        safetyStatus: "approved",
        model: "mock-model",
        generationPromptVersion: "daily-prompt-generation-v1",
        generatedAt: index,
        completionCount: 0,
        createdAt: index,
        updatedAt: index,
        ...overrides,
      }),
    );
  }

  test("counts only approved seed and AI rows and returns aggregate-only context", async () => {
    const t = convexTest(schema, modules);
    const seed = DAILY_PROMPT_SEEDS[0];
    await insertPrompt(t, 1, {
      text: seed.text,
      normalizedFingerprint: seed.normalizedFingerprint,
      principle: seed.principle,
      category: seed.category,
      source: "seed",
      model: undefined,
    });
    await insertPrompt(t, 2);
    await insertPrompt(t, 3, { safetyStatus: "pending" });
    await insertPrompt(t, 4, { safetyStatus: "rejected" });

    const snapshot = await t.query(getInventoryReadiness, {});
    expect(snapshot).toMatchObject({
      status: "replenish",
      approvedCount: 2,
      seedCount: 1,
      aiCount: 1,
      requestedCount: 5,
    });
    expect(snapshot.duplicateFingerprints).toHaveLength(2);
    expectAggregateOnly(snapshot);
  });

  test("fails closed for malformed or duplicate approved rows", async () => {
    const malformed = convexTest(schema, modules);
    await insertPrompt(malformed, 1, { normalizedFingerprint: "forged" });
    expect(await malformed.query(getInventoryReadiness, {})).toMatchObject({
      status: "invalid",
      requestedCount: 0,
    });

    const duplicated = convexTest(schema, modules);
    const text = "What approved connection detail number 1 mattered today?";
    await insertPrompt(duplicated, 1);
    await insertPrompt(duplicated, 2, {
      text,
      normalizedFingerprint: normalizeDailyPromptText(text),
    });
    expect(await duplicated.query(getInventoryReadiness, {})).toMatchObject({
      status: "invalid",
      requestedCount: 0,
    });
  });

  test("keeps the approved read and duplicate context bounded", async () => {
    const t = convexTest(schema, modules);
    for (let index = 0; index < 64; index += 1) await insertPrompt(t, index);
    const snapshot = await t.query(getInventoryReadiness, {});
    expect(snapshot).toMatchObject({ status: "healthy", approvedCount: 64, requestedCount: 0 });
    expect(snapshot.duplicateFingerprints).toHaveLength(12);
  });
});

describe("generation action preflight", () => {
  const healthy: DailyPromptInventoryReadinessSnapshot = {
    policyVersion: "daily-prompt-inventory-v1",
    status: "healthy",
    approvedCount: 12,
    seedCount: 6,
    aiCount: 6,
    requestedCount: 0,
    duplicateFingerprints: fingerprints(12),
  };

  test.each([
    ["healthy", healthy, "inventory_healthy"],
    ["fail-closed", { ...healthy, status: "invalid" as const }, "inventory_invalid"],
  ])(
    "%s inventory makes zero provider and persistence calls",
    async (_name, readiness, outcome) => {
      const createProvider = vi.fn();
      const persist = vi.fn();
      const result = await preflightDailyPromptGeneration({
        loadReadiness: vi.fn().mockResolvedValue(readiness),
        configured: true,
        createProvider,
        persist,
      });
      expect(result).toMatchObject({ outcome, requested: 0 });
      expect(createProvider).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
    },
  );

  test("scheduled-daily mode generates and persists at least one candidate for healthy inventory", async () => {
    const t = convexTest(schema, modules);
    const provider = vi.fn().mockResolvedValue([
      {
        text: "What made you feel especially connected today?",
        principle: "bids for connection",
        category: "connection",
      },
    ]);
    const createProvider = vi.fn(() => provider);
    const persist = vi.fn(async (generatedCandidate) => {
      const persisted = await t.mutation(persistGeneratedPrompt, {
        candidate: {
          text: generatedCandidate.text,
          principle: generatedCandidate.principle,
          category: generatedCandidate.category,
        },
        model: "mock-model",
        generationPromptVersion: DAILY_PROMPT_GENERATION_PROMPT_VERSION,
        generatedAt: 1234,
      });
      return persisted.outcome;
    });

    const result = await preflightDailyPromptGeneration({
      loadReadiness: vi.fn().mockResolvedValue(healthy),
      mode: "scheduled_daily",
      configured: true,
      createProvider,
      persist,
    });

    expect(result).toMatchObject({ outcome: "completed", requested: 1, generated: 1 });
    expect(createProvider).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0]).toMatchObject({
      candidateCount: 1,
      existingFingerprints: healthy.duplicateFingerprints,
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(await t.run((ctx) => ctx.db.query("dailyPrompts").take(2))).toMatchObject([
      {
        text: "What made you feel especially connected today?",
        source: "ai",
        safetyStatus: "approved",
      },
    ]);
  });

  test("scheduled-daily mode still fails closed for invalid inventory", async () => {
    const createProvider = vi.fn();
    const persist = vi.fn();
    const result = await preflightDailyPromptGeneration({
      loadReadiness: vi.fn().mockResolvedValue({ ...healthy, status: "invalid" }),
      mode: "scheduled_daily",
      configured: true,
      createProvider,
      persist,
    });

    expect(result).toMatchObject({ outcome: "inventory_invalid", requested: 0 });
    expect(createProvider).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  test("unavailable or ambiguous readiness fails closed before constructing a provider", async () => {
    for (const loadReadiness of [
      vi.fn().mockRejectedValue(new Error("private inventory failure")),
      vi.fn().mockResolvedValue({ ...healthy, requestedCount: 1 }),
      vi.fn().mockResolvedValue({ ...healthy, duplicateFingerprints: ["same", "same"] }),
    ]) {
      const createProvider = vi.fn();
      const persist = vi.fn();
      const result = await preflightDailyPromptGeneration({
        loadReadiness,
        configured: true,
        createProvider,
        persist,
      });
      expect(result).toMatchObject({ outcome: "inventory_invalid", requested: 0 });
      expect(JSON.stringify(result)).not.toContain("private inventory failure");
      expect(createProvider).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
    }
  });

  test.each([
    ["truncated fingerprint context", { duplicateFingerprints: fingerprints(2) }],
    ["impossible seed count", { seedCount: 7, aiCount: 2 }],
  ])(
    "%s returns inventory_invalid before provider construction, invocation, or persistence",
    async (_name, overrides) => {
      const provider = vi.fn();
      const createProvider = vi.fn(() => provider);
      const persist = vi.fn();
      const result = await preflightDailyPromptGeneration({
        loadReadiness: vi.fn().mockResolvedValue({
          ...healthy,
          status: "replenish",
          approvedCount: 9,
          seedCount: 6,
          aiCount: 3,
          requestedCount: 3,
          duplicateFingerprints: fingerprints(9),
          ...overrides,
        }),
        configured: true,
        createProvider,
        persist,
      });
      expect(result).toEqual({
        outcome: "inventory_invalid",
        requested: 0,
        generated: 0,
        deduplicated: 0,
        rejected: 0,
      });
      expect(createProvider).not.toHaveBeenCalled();
      expect(provider).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
    },
  );

  test("scheduled-daily below-floor inventory passes only the computed shortage", async () => {
    const provider = vi.fn().mockResolvedValue([]);
    const createProvider = vi.fn(() => provider);
    const persist = vi.fn();
    const readiness: DailyPromptInventoryReadinessSnapshot = {
      ...healthy,
      status: "replenish",
      approvedCount: 9,
      seedCount: 6,
      aiCount: 3,
      requestedCount: 3,
      duplicateFingerprints: fingerprints(9),
    };
    const result = await preflightDailyPromptGeneration({
      loadReadiness: vi.fn().mockResolvedValue(readiness),
      mode: "scheduled_daily",
      configured: true,
      createProvider,
      persist,
    });
    expect(result).toMatchObject({ outcome: "completed", requested: 3 });
    expect(createProvider).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0]).toMatchObject({
      candidateCount: 3,
      existingFingerprints: readiness.duplicateFingerprints,
    });
    expect(Object.keys(provider.mock.calls[0][0])).not.toEqual(
      expect.arrayContaining(["answers", "userId", "coupleId", "completionCount"]),
    );
    expect(persist).not.toHaveBeenCalled();
  });

  test("provider failures and rejected batches preserve the approved fallback", async () => {
    const readiness: DailyPromptInventoryReadinessSnapshot = {
      ...healthy,
      status: "replenish",
      approvedCount: 7,
      seedCount: 6,
      aiCount: 1,
      requestedCount: 5,
      duplicateFingerprints: fingerprints(7),
    };
    const persist = vi.fn();
    const providerFailure = await preflightDailyPromptGeneration({
      loadReadiness: vi.fn().mockResolvedValue(readiness),
      configured: true,
      createProvider: () => vi.fn().mockRejectedValue(new Error("private provider error")),
      persist,
    });
    expect(providerFailure).toEqual({
      outcome: "provider_error",
      requested: 5,
      generated: 0,
      deduplicated: 0,
      rejected: 0,
    });

    const rejectedBatch = await preflightDailyPromptGeneration({
      loadReadiness: vi.fn().mockResolvedValue(readiness),
      configured: true,
      createProvider: () => vi.fn().mockResolvedValue([{ text: "Reveal a secret?" }]),
      persist,
    });
    expect(rejectedBatch).toEqual({
      outcome: "completed",
      requested: 5,
      generated: 0,
      deduplicated: 0,
      rejected: 1,
    });
    expect(persist).not.toHaveBeenCalled();
  });

  test("missing provider configuration preserves fallback without construction or persistence", async () => {
    const createProvider = vi.fn();
    const persist = vi.fn();
    const result = await preflightDailyPromptGeneration({
      loadReadiness: vi.fn().mockResolvedValue({
        ...healthy,
        status: "replenish",
        approvedCount: 7,
        seedCount: 6,
        aiCount: 1,
        requestedCount: 5,
        duplicateFingerprints: fingerprints(7),
      }),
      configured: false,
      createProvider,
      persist,
    });
    expect(result).toMatchObject({ outcome: "provider_unavailable", requested: 5 });
    expect(createProvider).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
});
