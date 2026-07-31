import {
  buildDailyPromptGenerationRequest,
  MAX_DAILY_PROMPT_CANDIDATES,
  validateDailyPromptCandidate,
  type DailyPromptGenerationCandidate,
} from "./dailyPromptGenerationPolicy";

export type DailyPromptGenerationProvider = (
  request: ReturnType<typeof buildDailyPromptGenerationRequest>,
) => Promise<unknown>;

export type DailyPromptGenerationPersistence = (
  candidate: DailyPromptGenerationCandidate,
) => Promise<"generated" | "deduplicated">;

export type DailyPromptGenerationResult = {
  outcome: "completed" | "provider_unavailable" | "provider_error";
  requested: number;
  generated: number;
  deduplicated: number;
  rejected: number;
};

function emptyResult(
  outcome: DailyPromptGenerationResult["outcome"],
  requested: number,
): DailyPromptGenerationResult {
  return { outcome, requested, generated: 0, deduplicated: 0, rejected: 0 };
}

export async function orchestrateDailyPromptGeneration(args: {
  configured: boolean;
  requestedCount: number;
  provider: DailyPromptGenerationProvider;
  persist: DailyPromptGenerationPersistence;
  existingPromptTexts?: readonly string[];
  timeoutMs?: number;
}): Promise<DailyPromptGenerationResult> {
  const request = buildDailyPromptGenerationRequest({
    candidateCount: args.requestedCount,
    existingPromptTexts: args.existingPromptTexts,
  });
  if (!args.configured) return emptyResult("provider_unavailable", request.candidateCount);

  let rawCandidates: unknown;
  try {
    const timeoutMs = Math.min(30_000, Math.max(1, args.timeoutMs ?? 15_000));
    rawCandidates = await Promise.race([
      args.provider(request),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error("provider_timeout")), timeoutMs),
      ),
    ]);
  } catch {
    return emptyResult("provider_error", request.candidateCount);
  }
  if (
    !Array.isArray(rawCandidates) ||
    rawCandidates.length > request.candidateCount ||
    rawCandidates.length > MAX_DAILY_PROMPT_CANDIDATES
  ) {
    return emptyResult("provider_error", request.candidateCount);
  }

  const result = emptyResult("completed", request.candidateCount);
  for (const rawCandidate of rawCandidates) {
    const validation = validateDailyPromptCandidate(rawCandidate);
    if (!validation.ok) {
      result.rejected += 1;
      continue;
    }
    try {
      const outcome = await args.persist(validation.candidate);
      result[outcome] += 1;
    } catch {
      return { ...result, outcome: "provider_error" };
    }
  }
  return result;
}
