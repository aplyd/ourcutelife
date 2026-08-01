export const MAX_APPROVED_DAILY_PROMPT_CANDIDATES = 64;
export const RECENT_DAILY_PROMPT_ASSIGNMENT_LIMIT = 12;

export type DailyPromptRankingCandidate = {
  id: string;
  normalizedFingerprint: string;
  principle: string;
  category: string;
  completionCount: number;
};

export type RecentDailyPromptAssignment = {
  promptId: string;
  principle: string;
  category: string;
};

function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}

function hasText(value: string) {
  return value.trim().length > 0;
}

export function rankApprovedDailyPrompt({
  candidates,
  recentAssignments,
  selectionSeed,
}: {
  candidates: readonly DailyPromptRankingCandidate[];
  recentAssignments: readonly RecentDailyPromptAssignment[];
  selectionSeed: string;
}): string {
  if (candidates.length === 0) throw new Error("No approved daily prompts are available.");
  if (
    candidates.length > MAX_APPROVED_DAILY_PROMPT_CANDIDATES ||
    recentAssignments.length > RECENT_DAILY_PROMPT_ASSIGNMENT_LIMIT
  ) {
    throw new Error("Daily prompt ranking evidence exceeds its bound.");
  }
  if (
    !hasText(selectionSeed) ||
    candidates.some(
      (candidate) =>
        !hasText(candidate.id) ||
        !hasText(candidate.normalizedFingerprint) ||
        !hasText(candidate.principle) ||
        !hasText(candidate.category) ||
        !Number.isSafeInteger(candidate.completionCount) ||
        candidate.completionCount < 0,
    ) ||
    recentAssignments.some(
      (assignment) =>
        !hasText(assignment.promptId) ||
        !hasText(assignment.principle) ||
        !hasText(assignment.category),
    )
  ) {
    throw new Error("Invalid daily prompt ranking evidence.");
  }
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
    throw new Error("Duplicate daily prompt candidate.");
  }
  if (
    new Set(candidates.map((candidate) => candidate.normalizedFingerprint)).size !==
    candidates.length
  ) {
    throw new Error("Duplicate daily prompt fingerprint.");
  }

  const recentIds = new Set(recentAssignments.map((assignment) => assignment.promptId));
  const freshCandidates = candidates.filter((candidate) => !recentIds.has(candidate.id));
  const recencyEligible = freshCandidates.length > 0 ? freshCandidates : candidates;

  const minimumCompletionCount = Math.min(
    ...recencyEligible.map((candidate) => candidate.completionCount),
  );
  const completionEligible = recencyEligible.filter(
    (candidate) => candidate.completionCount === minimumCompletionCount,
  );

  const categoryFrequency = new Map<string, number>();
  const principleFrequency = new Map<string, number>();
  for (const assignment of recentAssignments) {
    categoryFrequency.set(
      assignment.category,
      (categoryFrequency.get(assignment.category) ?? 0) + 1,
    );
    principleFrequency.set(
      assignment.principle,
      (principleFrequency.get(assignment.principle) ?? 0) + 1,
    );
  }
  const diversityScore = (candidate: DailyPromptRankingCandidate) =>
    (categoryFrequency.get(candidate.category) ?? 0) +
    (principleFrequency.get(candidate.principle) ?? 0);
  const minimumDiversityScore = Math.min(...completionEligible.map(diversityScore));
  const diversityEligible = completionEligible
    .filter((candidate) => diversityScore(candidate) === minimumDiversityScore)
    .toSorted((left, right) =>
      left.normalizedFingerprint.localeCompare(right.normalizedFingerprint),
    );

  return diversityEligible[stableIndex(selectionSeed, diversityEligible.length)].id;
}
