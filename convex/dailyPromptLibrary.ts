import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type DailyPromptSeed = {
  text: string;
  normalizedFingerprint: string;
  principle: string;
  category: string;
  source: "seed";
  safetyStatus: "approved";
};

export function normalizeDailyPromptText(text: string): string {
  return text
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function validateDailyPromptDocument(prompt: Doc<"dailyPrompts">) {
  if (
    !prompt.text.trim() ||
    !prompt.normalizedFingerprint.trim() ||
    !prompt.principle.trim() ||
    !prompt.category.trim() ||
    prompt.normalizedFingerprint !== normalizeDailyPromptText(prompt.text) ||
    !Number.isSafeInteger(prompt.completionCount) ||
    prompt.completionCount < 0
  ) {
    throw new Error("Incompatible daily prompt state.");
  }
}

export async function getAssignedDailyPrompt(
  ctx: QueryCtx | MutationCtx,
  lifecycle: Doc<"dailyPromptLifecycles">,
) {
  if (!lifecycle.promptId) throw new Error("Daily prompt assignment is missing.");
  const prompt = await ctx.db.get(lifecycle.promptId);
  if (!prompt) throw new Error("Assigned daily prompt was not found.");
  if (prompt.safetyStatus !== "approved") {
    throw new Error("Assigned daily prompt is not approved.");
  }
  validateDailyPromptDocument(prompt);
  const fingerprintRows = await ctx.db
    .query("dailyPrompts")
    .withIndex("by_normalized_fingerprint", (q) =>
      q.eq("normalizedFingerprint", prompt.normalizedFingerprint),
    )
    .take(2);
  if (fingerprintRows.length !== 1 || fingerprintRows[0]._id !== prompt._id) {
    throw new Error("Duplicate daily prompt fingerprint.");
  }
  return prompt;
}

function seed(text: string, principle: string, category: string): DailyPromptSeed {
  return {
    text,
    normalizedFingerprint: normalizeDailyPromptText(text),
    principle,
    category,
    source: "seed",
    safetyStatus: "approved",
  };
}

export const DAILY_PROMPT_SEEDS: readonly DailyPromptSeed[] = [
  seed(
    "What is one specific thing your partner did recently that you want them to know mattered?",
    "appreciation",
    "appreciation",
  ),
  seed(
    "What is one small detail about your inner world this week that your partner might not know yet?",
    "love maps",
    "curiosity",
  ),
  seed(
    "What is one tiny way your partner could get your attention or affection today that would land well?",
    "bids for connection",
    "connection",
  ),
  seed(
    "Is there a small moment from this week that would feel better with a quick repair or clarification?",
    "repair",
    "repair",
  ),
  seed(
    "What stress are you carrying that you do not need your partner to fix, only understand?",
    "stress reducing conversation",
    "support",
  ),
  seed(
    "What is one little ritual you want more of in our life together?",
    "shared meaning",
    "rituals",
  ),
];

function stableSeedIndex(seed: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}

export function getDeterministicDailyPromptFallback(promptDate: string): DailyPromptSeed {
  const prompt = DAILY_PROMPT_SEEDS[stableSeedIndex(`${promptDate}:`, DAILY_PROMPT_SEEDS.length)];
  if (!prompt) throw new Error("No daily prompt fallback is available.");
  return prompt;
}
