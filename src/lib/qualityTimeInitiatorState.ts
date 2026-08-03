export type ExhaustedQualityTimeInventoryCopy = {
  isSendReady: boolean;
  title: string;
  body: string;
};

export function isStaleQualityTimeMutationError(error: unknown): boolean {
  return error instanceof Error && /version|changed|stale|refresh/i.test(error.message);
}

export function qualityTimeStaleVersionFromError(
  error: unknown,
  submittedVersion: number,
): number | null {
  if (isStaleQualityTimeMutationError(error) && Number.isSafeInteger(submittedVersion)) {
    return submittedVersion;
  }
  return null;
}

export function reconcileQualityTimeStaleVersion(
  staleVersion: number | null,
  projectionVersion: number | undefined,
): number | null {
  if (
    staleVersion === null ||
    projectionVersion === undefined ||
    projectionVersion === staleVersion
  ) {
    return staleVersion;
  }
  return null;
}

export function isQualityTimeWriteDisabled(
  isPending: boolean,
  staleVersion: number | null,
  projectionVersion: number | undefined,
): boolean {
  return isPending || (staleVersion !== null && staleVersion === projectionVersion);
}

export function exhaustedQualityTimeInventoryCopy(
  acceptedCount: number,
): ExhaustedQualityTimeInventoryCopy {
  if (Number.isSafeInteger(acceptedCount) && acceptedCount >= 3 && acceptedCount <= 5) {
    return {
      isSendReady: true,
      title: "This shortlist is ready to send",
      body: "No more choices are available in this category. You can send when every selected category is ready.",
    };
  }

  if (Number.isSafeInteger(acceptedCount) && acceptedCount >= 0 && acceptedCount < 3) {
    return {
      isSendReady: false,
      title: "Not enough options yet",
      body: "This category does not have enough choices to reach 3. Nothing will be padded or selected for you.",
    };
  }

  return {
    isSendReady: false,
    title: "Shortlist unavailable",
    body: "The latest server count is invalid. Wait for a refresh before sending.",
  };
}
