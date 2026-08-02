import { v } from "convex/values";

import { internalQuery } from "./_generated/server";
import {
  DAILY_PROMPT_INVENTORY_POLICY_VERSION,
  decideDailyPromptInventoryReadiness,
} from "./dailyPromptInventoryReadiness";
import { DAILY_PROMPT_SEEDS, validateDailyPromptDocument } from "./dailyPromptLibrary";
import { MAX_APPROVED_DAILY_PROMPT_CANDIDATES } from "./dailyPromptSelection";

const readinessSnapshotValidator = v.object({
  policyVersion: v.literal(DAILY_PROMPT_INVENTORY_POLICY_VERSION),
  status: v.union(v.literal("healthy"), v.literal("replenish"), v.literal("invalid")),
  approvedCount: v.number(),
  seedCount: v.number(),
  aiCount: v.number(),
  requestedCount: v.number(),
  duplicateFingerprints: v.array(v.string()),
});

export const getReusableDailyPromptInventoryReadiness = internalQuery({
  args: {},
  returns: readinessSnapshotValidator,
  handler: async (ctx) => {
    const approvedRows = await ctx.db
      .query("dailyPrompts")
      .withIndex("by_safety_status_and_completion_count_and_created_at", (q) =>
        q.eq("safetyStatus", "approved"),
      )
      .take(MAX_APPROVED_DAILY_PROMPT_CANDIDATES);

    try {
      for (const row of approvedRows) {
        validateDailyPromptDocument(row);
        if (row.source === "seed") {
          const seed = DAILY_PROMPT_SEEDS.find(
            (candidate) => candidate.normalizedFingerprint === row.normalizedFingerprint,
          );
          if (
            !seed ||
            row.text !== seed.text ||
            row.principle !== seed.principle ||
            row.category !== seed.category
          ) {
            throw new Error("Incompatible daily prompt seed state.");
          }
        }
      }
      return decideDailyPromptInventoryReadiness(
        approvedRows.map((row) => ({
          id: row._id,
          normalizedFingerprint: row.normalizedFingerprint,
          source: row.source,
          safetyStatus: row.safetyStatus,
        })),
      );
    } catch {
      return decideDailyPromptInventoryReadiness(null);
    }
  },
});
