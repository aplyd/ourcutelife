import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import {
  DAILY_PROMPT_GENERATION_PROMPT_VERSION,
  validateDailyPromptCandidate,
} from "./dailyPromptGenerationPolicy";
import { validateDailyPromptDocument } from "./dailyPromptLibrary";

const candidateValidator = v.object({
  text: v.string(),
  principle: v.string(),
  category: v.string(),
});

export const persistGeneratedPrompt = internalMutation({
  args: {
    candidate: candidateValidator,
    model: v.string(),
    generationPromptVersion: v.string(),
    generatedAt: v.number(),
  },
  returns: v.object({
    outcome: v.union(v.literal("generated"), v.literal("deduplicated")),
    promptId: v.id("dailyPrompts"),
  }),
  handler: async (ctx, args) => {
    const validation = validateDailyPromptCandidate(args.candidate);
    if (!validation.ok) {
      throw new Error(`Daily prompt candidate was rejected: ${validation.code}`);
    }
    if (args.generationPromptVersion !== DAILY_PROMPT_GENERATION_PROMPT_VERSION) {
      throw new Error("Unsupported daily prompt generation version.");
    }
    const model = args.model.trim();
    if (!model || model.length > 120) throw new Error("Invalid daily prompt generation model.");
    if (!Number.isSafeInteger(args.generatedAt) || args.generatedAt < 0) {
      throw new Error("Invalid daily prompt generation time.");
    }

    const existingRows = await ctx.db
      .query("dailyPrompts")
      .withIndex("by_normalized_fingerprint", (q) =>
        q.eq("normalizedFingerprint", validation.candidate.normalizedFingerprint),
      )
      .take(2);
    if (existingRows.length > 1) throw new Error("Duplicate daily prompt fingerprint.");
    const existing = existingRows[0];
    if (existing) {
      validateDailyPromptDocument(existing);
      if (
        existing.source !== "ai" ||
        existing.safetyStatus !== "approved" ||
        existing.principle !== validation.candidate.principle ||
        existing.category !== validation.candidate.category ||
        existing.model !== model ||
        existing.generationPromptVersion !== args.generationPromptVersion ||
        existing.generatedAt === undefined
      ) {
        throw new Error("Incompatible existing daily prompt.");
      }
      return { outcome: "deduplicated" as const, promptId: existing._id };
    }

    const promptId = await ctx.db.insert("dailyPrompts", {
      text: validation.candidate.text,
      normalizedFingerprint: validation.candidate.normalizedFingerprint,
      principle: validation.candidate.principle,
      category: validation.candidate.category,
      source: "ai",
      safetyStatus: "approved",
      model,
      generationPromptVersion: args.generationPromptVersion,
      generatedAt: args.generatedAt,
      completionCount: 0,
      createdAt: args.generatedAt,
      updatedAt: args.generatedAt,
    });
    return { outcome: "generated" as const, promptId };
  },
});
