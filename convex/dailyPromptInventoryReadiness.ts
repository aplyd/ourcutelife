import { MAX_DAILY_PROMPT_CANDIDATES, MAX_DUPLICATE_CONTEXT } from "./dailyPromptGenerationPolicy";
import { DAILY_PROMPT_SEEDS, normalizeDailyPromptText } from "./dailyPromptLibrary";
import { MAX_APPROVED_DAILY_PROMPT_CANDIDATES } from "./dailyPromptSelection";

export const DAILY_PROMPT_INVENTORY_POLICY_VERSION = "daily-prompt-inventory-v1";
export const DAILY_PROMPT_INVENTORY_FLOOR = 12;

export type DailyPromptInventoryEvidence = {
  id: string;
  normalizedFingerprint: string;
  source: "seed" | "ai";
  safetyStatus: "approved";
};

export type DailyPromptInventoryReadinessSnapshot = {
  policyVersion: typeof DAILY_PROMPT_INVENTORY_POLICY_VERSION;
  status: "healthy" | "replenish" | "invalid";
  approvedCount: number;
  seedCount: number;
  aiCount: number;
  requestedCount: number;
  duplicateFingerprints: string[];
};

function invalidSnapshot(): DailyPromptInventoryReadinessSnapshot {
  return {
    policyVersion: DAILY_PROMPT_INVENTORY_POLICY_VERSION,
    status: "invalid",
    approvedCount: 0,
    seedCount: 0,
    aiCount: 0,
    requestedCount: 0,
    duplicateFingerprints: [],
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isEvidence(value: unknown): value is DailyPromptInventoryEvidence {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 4 ||
    keys[0] !== "id" ||
    keys[1] !== "normalizedFingerprint" ||
    keys[2] !== "safetyStatus" ||
    keys[3] !== "source" ||
    typeof value.id !== "string" ||
    typeof value.normalizedFingerprint !== "string" ||
    (value.source !== "seed" && value.source !== "ai") ||
    value.safetyStatus !== "approved"
  ) {
    return false;
  }
  const isSeedFingerprint = DAILY_PROMPT_SEEDS.some(
    (seed) => seed.normalizedFingerprint === value.normalizedFingerprint,
  );
  return (
    value.id.length > 0 &&
    value.id === value.id.trim() &&
    value.normalizedFingerprint.length > 0 &&
    value.normalizedFingerprint === value.normalizedFingerprint.trim() &&
    value.normalizedFingerprint === normalizeDailyPromptText(value.normalizedFingerprint) &&
    ((value.source === "seed" && isSeedFingerprint) ||
      (value.source === "ai" && !isSeedFingerprint))
  );
}

export function decideDailyPromptInventoryReadiness(
  input: unknown,
): DailyPromptInventoryReadinessSnapshot {
  if (
    !Array.isArray(input) ||
    input.length > MAX_APPROVED_DAILY_PROMPT_CANDIDATES ||
    !input.every(isEvidence)
  ) {
    return invalidSnapshot();
  }

  const rows = input as DailyPromptInventoryEvidence[];
  if (
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    new Set(rows.map((row) => row.normalizedFingerprint)).size !== rows.length
  ) {
    return invalidSnapshot();
  }

  const approvedCount = rows.length;
  const seedCount = rows.filter((row) => row.source === "seed").length;
  const aiCount = approvedCount - seedCount;
  const duplicateFingerprints = rows
    .map((row) => row.normalizedFingerprint)
    .toSorted((left, right) => left.localeCompare(right))
    .slice(0, MAX_DUPLICATE_CONTEXT);
  const requestedCount = Math.min(
    MAX_DAILY_PROMPT_CANDIDATES,
    Math.max(0, DAILY_PROMPT_INVENTORY_FLOOR - approvedCount),
  );

  return {
    policyVersion: DAILY_PROMPT_INVENTORY_POLICY_VERSION,
    status: requestedCount === 0 ? "healthy" : "replenish",
    approvedCount,
    seedCount,
    aiCount,
    requestedCount,
    duplicateFingerprints,
  };
}

export function isDailyPromptInventoryReadinessSnapshot(
  value: unknown,
): value is DailyPromptInventoryReadinessSnapshot {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 7 ||
    keys[0] !== "aiCount" ||
    keys[1] !== "approvedCount" ||
    keys[2] !== "duplicateFingerprints" ||
    keys[3] !== "policyVersion" ||
    keys[4] !== "requestedCount" ||
    keys[5] !== "seedCount" ||
    keys[6] !== "status" ||
    value.policyVersion !== DAILY_PROMPT_INVENTORY_POLICY_VERSION ||
    (value.status !== "healthy" && value.status !== "replenish" && value.status !== "invalid") ||
    !Number.isSafeInteger(value.approvedCount) ||
    !Number.isSafeInteger(value.seedCount) ||
    !Number.isSafeInteger(value.aiCount) ||
    !Number.isSafeInteger(value.requestedCount) ||
    !Array.isArray(value.duplicateFingerprints) ||
    value.duplicateFingerprints.length > MAX_DUPLICATE_CONTEXT ||
    !value.duplicateFingerprints.every(
      (fingerprint) =>
        typeof fingerprint === "string" &&
        fingerprint.length > 0 &&
        fingerprint === fingerprint.trim() &&
        fingerprint === normalizeDailyPromptText(fingerprint),
    )
  ) {
    return false;
  }

  const approvedCount = value.approvedCount as number;
  const seedCount = value.seedCount as number;
  const aiCount = value.aiCount as number;
  const requestedCount = value.requestedCount as number;
  const fingerprints = value.duplicateFingerprints as string[];
  if (
    approvedCount < 0 ||
    approvedCount > MAX_APPROVED_DAILY_PROMPT_CANDIDATES ||
    seedCount < 0 ||
    seedCount > DAILY_PROMPT_SEEDS.length ||
    aiCount < 0 ||
    seedCount + aiCount !== approvedCount ||
    requestedCount < 0 ||
    requestedCount > MAX_DAILY_PROMPT_CANDIDATES ||
    new Set(fingerprints).size !== fingerprints.length ||
    fingerprints.length !== Math.min(approvedCount, MAX_DUPLICATE_CONTEXT)
  ) {
    return false;
  }

  if (value.status === "invalid") {
    return (
      approvedCount === 0 &&
      seedCount === 0 &&
      aiCount === 0 &&
      requestedCount === 0 &&
      fingerprints.length === 0
    );
  }
  const expectedRequest = Math.min(
    MAX_DAILY_PROMPT_CANDIDATES,
    Math.max(0, DAILY_PROMPT_INVENTORY_FLOOR - approvedCount),
  );
  return (
    requestedCount === expectedRequest &&
    ((value.status === "healthy" && expectedRequest === 0) ||
      (value.status === "replenish" && expectedRequest > 0))
  );
}
