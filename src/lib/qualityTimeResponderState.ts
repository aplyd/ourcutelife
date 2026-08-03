import type {
  QualityTimeCategory,
  QualityTimeCompletedCategoryResult,
  QualityTimeResponderCategoryResult,
  QualityTimeResponderCard,
} from "./qualityTimeApi";

const QUALITY_TIME_CATEGORY_LABELS: Readonly<Record<QualityTimeCategory, string>> = {
  eat: "Eat",
  drink: "Drink",
  explore_adventure: "Explore/Adventure",
  entertainment: "Entertainment",
  romance: "Romance",
};

const QUALITY_TIME_CATEGORIES = new Set<QualityTimeCategory>(
  Object.keys(QUALITY_TIME_CATEGORY_LABELS) as QualityTimeCategory[],
);

export type QualityTimeResponderProgress = {
  nextPendingCategory: QualityTimeCategory | null;
  exhaustedCategories: QualityTimeCategory[];
  resolvedCategories: QualityTimeCategory[];
};

export type QualityTimeOutcomeSummaryResult =
  | {
      category: QualityTimeCategory;
      status: "matched";
      accessibilityLabel: string;
      option: QualityTimeResponderCard;
    }
  | {
      category: QualityTimeCategory;
      status: "no_match";
      accessibilityLabel: string;
    };

export type QualityTimeOutcomeSummary = {
  accessibleSummary: string;
  results: QualityTimeOutcomeSummaryResult[];
};

export function qualityTimeResponderStaleVersionFromError(
  error: unknown,
  submittedVersion: number,
): number | null {
  try {
    if (
      error instanceof Error &&
      /(?:^|\b)stale request version(?:\b|\.)/i.test(error.message) &&
      Number.isSafeInteger(submittedVersion) &&
      submittedVersion >= 0
    ) {
      return submittedVersion;
    }
  } catch {
    return null;
  }
  return null;
}

export function reconcileQualityTimeResponderStaleVersion(
  staleVersion: number | null,
  projectionVersion: number | undefined,
): number | null {
  if (
    staleVersion === null ||
    projectionVersion === undefined ||
    !Number.isSafeInteger(projectionVersion) ||
    projectionVersion <= staleVersion
  ) {
    return staleVersion;
  }
  return null;
}

export function isQualityTimeResponderWriteDisabled(
  isPending: boolean,
  staleVersion: number | null,
  projectionVersion: number | undefined,
): boolean {
  return (
    isPending ||
    (staleVersion !== null &&
      (projectionVersion === undefined ||
        !Number.isSafeInteger(projectionVersion) ||
        projectionVersion <= staleVersion))
  );
}

export function deriveQualityTimeResponderProgress(
  responderCategories: readonly unknown[],
  categoryResults: readonly unknown[],
): QualityTimeResponderProgress | null {
  try {
    return deriveQualityTimeResponderProgressUnchecked(responderCategories, categoryResults);
  } catch {
    return null;
  }
}

function deriveQualityTimeResponderProgressUnchecked(
  responderCategories: readonly unknown[],
  categoryResults: readonly unknown[],
): QualityTimeResponderProgress | null {
  const categories = parseUniqueCategories(responderCategories);
  if (!categories || categoryResults.length !== categories.length) return null;

  const exhaustedCategories: QualityTimeCategory[] = [];
  const resolvedCategories: QualityTimeCategory[] = [];
  let nextPendingCategory: QualityTimeCategory | null = null;

  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index]!;
    const result = parseResponderCategoryResult(categoryResults[index]);
    if (!result || result.category !== category) return null;

    if (result.status === "matched") {
      resolvedCategories.push(category);
      continue;
    }
    if (result.options.length === 0) {
      exhaustedCategories.push(category);
      resolvedCategories.push(category);
      continue;
    }
    if (nextPendingCategory === null) nextPendingCategory = category;
  }

  return { nextPendingCategory, exhaustedCategories, resolvedCategories };
}

export function buildQualityTimeOutcomeSummary(
  selectedCategories: readonly unknown[],
  categoryResults: readonly unknown[],
): QualityTimeOutcomeSummary | null {
  try {
    return buildQualityTimeOutcomeSummaryUnchecked(selectedCategories, categoryResults);
  } catch {
    return null;
  }
}

function buildQualityTimeOutcomeSummaryUnchecked(
  selectedCategories: readonly unknown[],
  categoryResults: readonly unknown[],
): QualityTimeOutcomeSummary | null {
  const allowedCategories = parseUniqueCategories(selectedCategories);
  if (!allowedCategories) return null;
  if (categoryResults.length < 1 || categoryResults.length > QUALITY_TIME_CATEGORIES.size)
    return null;

  const allowedCategorySet = new Set(allowedCategories);
  const seenCategories = new Set<QualityTimeCategory>();
  const results: QualityTimeOutcomeSummaryResult[] = [];
  const summaryParts: string[] = [];

  for (const rawResult of categoryResults) {
    const result = parseCompletedCategoryResult(rawResult);
    if (!result || !allowedCategorySet.has(result.category) || seenCategories.has(result.category))
      return null;
    seenCategories.add(result.category);
    const categoryLabel = QUALITY_TIME_CATEGORY_LABELS[result.category];

    if (result.status === "matched") {
      const accessibilityLabel = `Mutual ${categoryLabel} option, ${result.option.title}`;
      results.push({
        category: result.category,
        status: "matched",
        accessibilityLabel,
        option: result.option,
      });
      summaryParts.push(`You both want ${result.option.title} for ${categoryLabel}.`);
      continue;
    }

    const accessibilityLabel = `No shared ${categoryLabel} option this time`;
    results.push({ category: result.category, status: "no_match", accessibilityLabel });
    summaryParts.push(`${accessibilityLabel}.`);
  }

  return { accessibleSummary: summaryParts.join(" "), results };
}

function parseUniqueCategories(values: readonly unknown[]): QualityTimeCategory[] | null {
  if (values.length < 1 || values.length > QUALITY_TIME_CATEGORIES.size) return null;
  const categories: QualityTimeCategory[] = [];
  const seen = new Set<QualityTimeCategory>();
  for (const value of values) {
    if (!isQualityTimeCategory(value) || seen.has(value)) return null;
    seen.add(value);
    categories.push(value);
  }
  return categories;
}

function parseResponderCategoryResult(value: unknown): QualityTimeResponderCategoryResult | null {
  if (!isPlainRecord(value) || !isQualityTimeCategory(value.category)) return null;
  if (value.status === "matched") {
    if (!hasExactKeys(value, ["category", "status", "option"])) return null;
    const option = parseResponderCard(value.option);
    return option ? { category: value.category, status: "matched", option } : null;
  }
  if (value.status === "pending") {
    if (!hasExactKeys(value, ["category", "status", "options"]) || !Array.isArray(value.options)) {
      return null;
    }
    const options: QualityTimeResponderCard[] = [];
    const optionIds = new Set<string>();
    for (const rawOption of value.options) {
      const option = parseResponderCard(rawOption);
      if (!option || optionIds.has(option.optionId)) return null;
      optionIds.add(option.optionId);
      options.push(option);
    }
    return { category: value.category, status: "pending", options };
  }
  return null;
}

function parseCompletedCategoryResult(value: unknown): QualityTimeCompletedCategoryResult | null {
  if (!isPlainRecord(value) || !isQualityTimeCategory(value.category)) return null;
  if (value.status === "no_match") {
    return hasExactKeys(value, ["category", "status"])
      ? { category: value.category, status: "no_match" }
      : null;
  }
  if (value.status === "matched") {
    if (!hasExactKeys(value, ["category", "status", "option"])) return null;
    const option = parseResponderCard(value.option);
    return option ? { category: value.category, status: "matched", option } : null;
  }
  return null;
}

function parseResponderCard(value: unknown): QualityTimeResponderCard | null {
  if (!isPlainRecord(value)) return null;
  const requiredKeys = [
    "optionId",
    "title",
    "description",
    "kind",
    "costLevel",
    "durationMinutes",
    "vibeTags",
  ];
  const optionalKeys = ["photoUrl", "address"];
  if (!hasOnlyKeys(value, requiredKeys, optionalKeys)) return null;
  if (
    typeof value.optionId !== "string" ||
    value.optionId.length === 0 ||
    typeof value.title !== "string" ||
    value.title.length === 0 ||
    typeof value.description !== "string" ||
    (value.kind !== "activity" && value.kind !== "place") ||
    typeof value.costLevel !== "number" ||
    !Number.isFinite(value.costLevel) ||
    typeof value.durationMinutes !== "number" ||
    !Number.isFinite(value.durationMinutes) ||
    !Array.isArray(value.vibeTags) ||
    value.vibeTags.length > 8 ||
    value.vibeTags.some((tag) => typeof tag !== "string") ||
    (value.photoUrl !== undefined && typeof value.photoUrl !== "string") ||
    (value.address !== undefined && typeof value.address !== "string")
  ) {
    return null;
  }
  return {
    optionId: value.optionId,
    title: value.title,
    description: value.description,
    kind: value.kind,
    costLevel: value.costLevel as number,
    durationMinutes: value.durationMinutes as number,
    vibeTags: [...value.vibeTags],
    ...(value.photoUrl === undefined ? {} : { photoUrl: value.photoUrl }),
    ...(value.address === undefined ? {} : { address: value.address }),
  };
}

function isQualityTimeCategory(value: unknown): value is QualityTimeCategory {
  return typeof value === "string" && QUALITY_TIME_CATEGORIES.has(value as QualityTimeCategory);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return hasOnlyKeys(value, keys, []) && keys.every((key) => Object.hasOwn(value, key));
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
): boolean {
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  return (
    requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}
