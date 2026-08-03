import { makeFunctionReference, type FunctionReference } from "convex/server";

export type QualityTimeCategory =
  | "eat"
  | "drink"
  | "explore_adventure"
  | "entertainment"
  | "romance";

export type QualityTimeTiming = { kind: "now" } | { kind: "future"; scheduledFor: number };

export type QualityTimeRequestId = string & {
  readonly __qualityTimeRequestId: unique symbol;
};

export type QualityTimeCard = {
  planIdeaId: string;
  title: string;
  description: string;
  kind: "activity" | "place";
  costLevel: number;
  durationMinutes: number;
  vibeTags: string[];
  photoUrl?: string;
  address?: string;
};

export type QualityTimeResponderCard = {
  optionId: string;
  title: string;
  description: string;
  kind: "activity" | "place";
  costLevel: number;
  durationMinutes: number;
  vibeTags: string[];
  photoUrl?: string;
  address?: string;
};

export type QualityTimeResponderCategoryResult =
  | {
      category: QualityTimeCategory;
      status: "pending";
      options: QualityTimeResponderCard[];
    }
  | {
      category: QualityTimeCategory;
      status: "matched";
      option: QualityTimeResponderCard;
    };

export type QualityTimeCompletedCategoryResult =
  | {
      category: QualityTimeCategory;
      status: "matched";
      option: QualityTimeResponderCard;
    }
  | {
      category: QualityTimeCategory;
      status: "no_match";
    };

export type QualityTimeDraftProjection = {
  requestId: QualityTimeRequestId;
  status: "draft";
  version: number;
  timing: QualityTimeTiming;
  selectedCategories: QualityTimeCategory[];
  shortlistCounts: Array<{
    category: QualityTimeCategory;
    acceptedCount: number;
    decidedCount: number;
  }>;
};

type QualityTimeProjectionBase = {
  requestId: QualityTimeRequestId;
  version: number;
  timing: QualityTimeTiming;
  selectedCategories: QualityTimeCategory[];
};

export type QualityTimeNeutralProjection = QualityTimeProjectionBase & {
  status: "sent" | "responding" | "canceled" | "expired";
};

export type QualityTimeResponderProjection = QualityTimeProjectionBase & {
  status: "responding";
  responderCategories: QualityTimeCategory[];
  categoryResults: QualityTimeResponderCategoryResult[];
};

export type QualityTimeCompletedProjection = QualityTimeProjectionBase & {
  status: "completed";
  categoryResults: QualityTimeCompletedCategoryResult[];
};

export type QualityTimeRequestProjection =
  | QualityTimeDraftProjection
  | QualityTimeNeutralProjection
  | QualityTimeResponderProjection
  | QualityTimeCompletedProjection;

export type QualityTimeInitiatorProjection =
  | QualityTimeDraftProjection
  | QualityTimeNeutralProjection
  | QualityTimeCompletedProjection;

export type CreateQualityTimeDraftResult = {
  requestId: QualityTimeRequestId;
  status: "draft";
  version: number;
};

type VersionedQualityTimeResult = {
  requestId: QualityTimeRequestId;
  status: "draft" | "sent" | "responding" | "completed" | "canceled" | "expired";
  version: number;
};

export const createQualityTimeDraft: FunctionReference<
  "mutation",
  "public",
  { timing: QualityTimeTiming; selectedCategories: QualityTimeCategory[] },
  CreateQualityTimeDraftResult
> = makeFunctionReference("qualityTime:createDraft");

export const getQualityTimeRequest: FunctionReference<
  "query",
  "public",
  { requestId: QualityTimeRequestId },
  QualityTimeRequestProjection
> = makeFunctionReference("qualityTime:getRequest");

export const listQualityTimeDraftInventory: FunctionReference<
  "query",
  "public",
  {
    requestId: QualityTimeRequestId;
    category: QualityTimeCategory;
    paginationOpts: { numItems: number; cursor: string | null };
  },
  {
    page: QualityTimeCard[];
    isDone: boolean;
    continueCursor: string;
  }
> = makeFunctionReference("qualityTime:listDraftInventory");

export const recordQualityTimeDecision: FunctionReference<
  "mutation",
  "public",
  {
    requestId: QualityTimeRequestId;
    expectedVersion: number;
    planIdeaId: string;
    decision: "accept" | "pass";
  },
  VersionedQualityTimeResult
> = makeFunctionReference("qualityTime:recordDecision");

export type BeginQualityTimeResponseArgs = {
  requestId: QualityTimeRequestId;
  expectedVersion: number;
  categories: QualityTimeCategory[];
};

export type RecordQualityTimeResponderDecisionArgs = {
  requestId: QualityTimeRequestId;
  expectedVersion: number;
  optionId: string;
  decision: "accept" | "pass";
};

export const beginQualityTimeResponse: FunctionReference<
  "mutation",
  "public",
  BeginQualityTimeResponseArgs,
  VersionedQualityTimeResult
> = makeFunctionReference("qualityTime:beginResponse");

export const recordQualityTimeResponderDecision: FunctionReference<
  "mutation",
  "public",
  RecordQualityTimeResponderDecisionArgs,
  VersionedQualityTimeResult
> = makeFunctionReference("qualityTime:recordDecision");

export const sendQualityTimeRequest: FunctionReference<
  "mutation",
  "public",
  { requestId: QualityTimeRequestId; expectedVersion: number },
  VersionedQualityTimeResult
> = makeFunctionReference("qualityTime:sendRequest");

export const cancelQualityTimeRequest: FunctionReference<
  "mutation",
  "public",
  { requestId: QualityTimeRequestId; expectedVersion: number },
  VersionedQualityTimeResult
> = makeFunctionReference("qualityTime:cancelRequest");
