export const QUALITY_TIME_CATEGORIES = [
  "eat",
  "drink",
  "explore_adventure",
  "entertainment",
  "romance",
] as const;

export type QualityTimeCategory = (typeof QUALITY_TIME_CATEGORIES)[number];

export type QualityTimeShortlistDisposition = "ready" | "incomplete" | "invalid";
export type QualityTimeRevealDisposition = "revealable" | "hidden" | "invalid";

const QUALITY_TIME_CATEGORY_SET: ReadonlySet<string> = new Set(QUALITY_TIME_CATEGORIES);
const LEGACY_CATEGORY_ADAPTER: ReadonlyMap<string, QualityTimeCategory> = new Map([
  ["food", "eat"],
  ["drinks", "drink"],
  ["activity", "explore_adventure"],
  ["entertainment", "entertainment"],
  ["intimacy", "romance"],
]);

const ELIGIBLE_REVEAL_STATUSES = new Set(["sent", "responding", "completed"]);
const HIDDEN_REVEAL_STATUSES = new Set(["draft", "canceled", "expired", "exhausted", "no_match"]);
const VIEWER_ROLES = new Set(["initiator", "responder"]);
const DECISIONS = new Set(["accept", "pass", "missing"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactDataKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => {
      if (key !== sortedExpected[index]) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && "value" in descriptor;
    })
  );
}

function isQualityTimeCategory(value: unknown): value is QualityTimeCategory {
  return typeof value === "string" && QUALITY_TIME_CATEGORY_SET.has(value);
}

function isNonblankExactString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function containsOnlyNonblankExactStrings(values: readonly unknown[]): values is readonly string[] {
  for (const value of values) {
    if (!isNonblankExactString(value)) return false;
  }
  return true;
}

export function adaptLegacyPlanCategory(value: unknown): QualityTimeCategory | null {
  if (typeof value !== "string") return null;
  return LEGACY_CATEGORY_ADAPTER.get(value) ?? null;
}

function evaluateQualityTimeShortlistUnchecked(input: unknown): {
  disposition: QualityTimeShortlistDisposition;
} {
  if (
    !isPlainObject(input) ||
    !hasExactDataKeys(input, ["selectedCategories", "acceptedOptions"]) ||
    !Array.isArray(input.selectedCategories) ||
    !Array.isArray(input.acceptedOptions) ||
    input.selectedCategories.length === 0 ||
    input.selectedCategories.length > QUALITY_TIME_CATEGORIES.length
  ) {
    return { disposition: "invalid" };
  }

  const selectedCategories = input.selectedCategories;
  for (const category of selectedCategories) {
    if (!isQualityTimeCategory(category)) return { disposition: "invalid" };
  }

  const selectedCategorySet = new Set(selectedCategories);
  if (selectedCategorySet.size !== selectedCategories.length) {
    return { disposition: "invalid" };
  }

  const acceptedCounts = new Map<QualityTimeCategory, number>(
    selectedCategories.map((category) => [category, 0]),
  );
  const acceptedOptionIds = new Set<string>();

  for (const option of input.acceptedOptions) {
    if (
      !isPlainObject(option) ||
      !hasExactDataKeys(option, ["optionId", "category"]) ||
      !isNonblankExactString(option.optionId) ||
      !isQualityTimeCategory(option.category) ||
      !selectedCategorySet.has(option.category) ||
      acceptedOptionIds.has(option.optionId)
    ) {
      return { disposition: "invalid" };
    }

    acceptedOptionIds.add(option.optionId);
    const nextCount = (acceptedCounts.get(option.category) ?? 0) + 1;
    if (nextCount > 5) return { disposition: "invalid" };
    acceptedCounts.set(option.category, nextCount);
  }

  for (const category of selectedCategories) {
    const count = acceptedCounts.get(category);
    if (!Number.isSafeInteger(count) || count === undefined || count < 0 || count > 5) {
      return { disposition: "invalid" };
    }
    if (count < 3) return { disposition: "incomplete" };
  }

  return { disposition: "ready" };
}

export function evaluateQualityTimeShortlist(input: unknown): {
  disposition: QualityTimeShortlistDisposition;
} {
  try {
    return evaluateQualityTimeShortlistUnchecked(input);
  } catch {
    return { disposition: "invalid" };
  }
}

type ValidDecision = {
  optionId: string;
  decision: "accept" | "pass" | "missing";
};

function parseDecision(value: unknown): ValidDecision | null {
  if (
    !isPlainObject(value) ||
    !hasExactDataKeys(value, ["optionId", "decision"]) ||
    !isNonblankExactString(value.optionId) ||
    typeof value.decision !== "string" ||
    !DECISIONS.has(value.decision)
  ) {
    return null;
  }
  return value as ValidDecision;
}

function evaluateQualityTimeMutualRevealUnchecked(input: unknown): {
  disposition: QualityTimeRevealDisposition;
} {
  if (
    !isPlainObject(input) ||
    !hasExactDataKeys(input, [
      "requestStatus",
      "viewerRole",
      "requestCategory",
      "responderSelectedCategory",
      "optionCategory",
      "initiatorDecision",
      "responderDecision",
      "outcomeOptionIds",
    ]) ||
    typeof input.requestStatus !== "string" ||
    typeof input.viewerRole !== "string" ||
    !VIEWER_ROLES.has(input.viewerRole) ||
    !isQualityTimeCategory(input.requestCategory) ||
    !isQualityTimeCategory(input.optionCategory) ||
    typeof input.responderSelectedCategory !== "boolean" ||
    !Array.isArray(input.outcomeOptionIds) ||
    input.outcomeOptionIds.length > 1 ||
    !containsOnlyNonblankExactStrings(input.outcomeOptionIds)
  ) {
    return { disposition: "invalid" };
  }

  const initiatorDecision = parseDecision(input.initiatorDecision);
  const responderDecision = parseDecision(input.responderDecision);
  if (!initiatorDecision || !responderDecision) return { disposition: "invalid" };

  if (
    !ELIGIBLE_REVEAL_STATUSES.has(input.requestStatus) &&
    !HIDDEN_REVEAL_STATUSES.has(input.requestStatus)
  ) {
    return { disposition: "invalid" };
  }
  if (HIDDEN_REVEAL_STATUSES.has(input.requestStatus)) return { disposition: "hidden" };

  const [outcomeOptionId] = input.outcomeOptionIds;
  if (outcomeOptionId !== undefined && outcomeOptionId !== initiatorDecision.optionId) {
    return { disposition: "invalid" };
  }

  if (
    input.requestCategory !== input.optionCategory ||
    !input.responderSelectedCategory ||
    initiatorDecision.optionId !== responderDecision.optionId ||
    initiatorDecision.decision !== "accept" ||
    responderDecision.decision !== "accept"
  ) {
    return { disposition: "hidden" };
  }

  return { disposition: "revealable" };
}

export function evaluateQualityTimeMutualReveal(input: unknown): {
  disposition: QualityTimeRevealDisposition;
} {
  try {
    return evaluateQualityTimeMutualRevealUnchecked(input);
  } catch {
    return { disposition: "invalid" };
  }
}
