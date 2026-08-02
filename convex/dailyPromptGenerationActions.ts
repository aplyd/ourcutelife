"use node";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { env, internalAction } from "./_generated/server";
import {
  DAILY_PROMPT_GENERATION_PROMPT_VERSION,
  type DailyPromptGenerationCandidate,
} from "./dailyPromptGenerationPolicy";
import {
  preflightDailyPromptGeneration,
  type DailyPromptGenerationProvider,
  type DailyPromptInventoryReadinessSnapshot,
} from "./dailyPromptGenerationOrchestration";

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

function createDailyPromptProvider(
  apiKey: string,
  modelName: string,
): DailyPromptGenerationProvider {
  return async (request) => {
    const openai = createOpenAI({ apiKey });
    const result = await generateText({
      model: openai(modelName),
      system: request.system,
      prompt: JSON.stringify({
        version: request.version,
        candidateCount: request.candidateCount,
        allowedPrinciples: request.principles,
        allowedCategories: request.categories,
        avoidNormalizedFingerprints: request.existingFingerprints,
        responseFormat: "Return only a JSON array of objects with text, principle, and category.",
      }),
      temperature: 0.7,
      maxOutputTokens: 900,
    });
    return JSON.parse(result.text) as unknown;
  };
}

export const generateReusableDailyPrompts = internalAction({
  args: {},
  returns: v.object({
    outcome: v.union(
      v.literal("completed"),
      v.literal("provider_unavailable"),
      v.literal("provider_error"),
      v.literal("inventory_healthy"),
      v.literal("inventory_invalid"),
    ),
    requested: v.number(),
    generated: v.number(),
    deduplicated: v.number(),
    rejected: v.number(),
  }),
  handler: async (ctx) => {
    const apiKey = env.OPENAI_API_KEY?.trim() ?? "";
    const model = (env.OPENAI_MODEL ?? "gpt-4o-mini").trim();
    const generatedAt = Date.now();
    return await preflightDailyPromptGeneration({
      loadReadiness: async () => await ctx.runQuery(getInventoryReadiness, {}),
      configured: Boolean(apiKey && model),
      createProvider: () => createDailyPromptProvider(apiKey, model),
      persist: async (candidate: DailyPromptGenerationCandidate) => {
        const result = await ctx.runMutation(persistGeneratedPrompt, {
          candidate: {
            text: candidate.text,
            principle: candidate.principle,
            category: candidate.category,
          },
          model,
          generationPromptVersion: DAILY_PROMPT_GENERATION_PROMPT_VERSION,
          generatedAt,
        });
        return result.outcome;
      },
    });
  },
});
