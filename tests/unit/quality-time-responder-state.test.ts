/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import { getFunctionName, type FunctionArgs } from "convex/server";

import {
  beginQualityTimeResponse,
  recordQualityTimeResponderDecision,
  type QualityTimeCompletedProjection,
  type QualityTimeResponderProjection,
  type QualityTimeRequestId,
  type RecordQualityTimeResponderDecisionArgs,
} from "../../src/lib/qualityTimeApi";
import {
  buildQualityTimeOutcomeSummary,
  deriveQualityTimeResponderProgress,
  isQualityTimeResponderWriteDisabled,
  qualityTimeResponderStaleVersionFromError,
  reconcileQualityTimeResponderStaleVersion,
} from "../../src/lib/qualityTimeResponderState";

void test("responder API references keep option IDs separate from initiator plan-idea IDs", () => {
  const requestId = "quality_time_request" as QualityTimeRequestId;
  const beginArgs: FunctionArgs<typeof beginQualityTimeResponse> = {
    requestId,
    expectedVersion: 3,
    categories: ["eat", "entertainment"],
  };
  const decisionArgs: FunctionArgs<typeof recordQualityTimeResponderDecision> = {
    requestId,
    expectedVersion: 4,
    optionId: "quality_time_option",
    decision: "accept",
  };

  assert.equal(getFunctionName(beginQualityTimeResponse), "qualityTime:beginResponse");
  assert.equal(getFunctionName(recordQualityTimeResponderDecision), "qualityTime:recordDecision");
  assert.deepEqual(Object.keys(beginArgs).sort(), ["categories", "expectedVersion", "requestId"]);
  assert.deepEqual(Object.keys(decisionArgs).sort(), [
    "decision",
    "expectedVersion",
    "optionId",
    "requestId",
  ]);

  const forbiddenDecision = {
    requestId,
    expectedVersion: 4,
    // @ts-expect-error responder decisions must never accept a legacy plan idea ID
    planIdeaId: "private_plan_idea",
    decision: "accept",
  } satisfies RecordQualityTimeResponderDecisionArgs;
  void forbiddenDecision;
});

void test("responder and completed projections are exact discriminated server shapes", () => {
  const requestId = "quality_time_request" as QualityTimeRequestId;
  const responding: QualityTimeResponderProjection = {
    requestId,
    status: "responding",
    version: 4,
    timing: { kind: "now" },
    selectedCategories: ["eat", "entertainment"],
    responderCategories: ["eat"],
    categoryResults: [
      {
        category: "eat",
        status: "pending",
        options: [responderCard("eat-option", "Pasta night")],
      },
    ],
  };
  const completed: QualityTimeCompletedProjection = {
    requestId,
    status: "completed",
    version: 7,
    timing: { kind: "now" },
    selectedCategories: ["eat", "entertainment"],
    categoryResults: [
      { category: "eat", status: "matched", option: responderCard("eat-option", "Pasta night") },
      { category: "entertainment", status: "no_match" },
    ],
  };

  assert.deepEqual(Object.keys(responding).sort(), [
    "categoryResults",
    "requestId",
    "responderCategories",
    "selectedCategories",
    "status",
    "timing",
    "version",
  ]);
  assert.deepEqual(Object.keys(completed).sort(), [
    "categoryResults",
    "requestId",
    "selectedCategories",
    "status",
    "timing",
    "version",
  ]);
});

void test("responder stale writes stay latched until a strictly newer projection", () => {
  const submittedVersion = 8;
  const staleVersion = qualityTimeResponderStaleVersionFromError(
    new Error("Stale request version."),
    submittedVersion,
  );

  assert.equal(staleVersion, submittedVersion);
  assert.equal(isQualityTimeResponderWriteDisabled(false, staleVersion, 7), true);
  assert.equal(isQualityTimeResponderWriteDisabled(false, staleVersion, 8), true);
  assert.equal(reconcileQualityTimeResponderStaleVersion(staleVersion, undefined), staleVersion);
  assert.equal(reconcileQualityTimeResponderStaleVersion(staleVersion, 7), staleVersion);
  assert.equal(reconcileQualityTimeResponderStaleVersion(staleVersion, 8), staleVersion);
  assert.equal(reconcileQualityTimeResponderStaleVersion(staleVersion, 9), null);
  assert.equal(isQualityTimeResponderWriteDisabled(false, null, 9), false);
  assert.equal(isQualityTimeResponderWriteDisabled(true, null, 9), true);

  assert.equal(
    qualityTimeResponderStaleVersionFromError(new Error("Network request failed."), 8),
    null,
  );
  assert.equal(
    qualityTimeResponderStaleVersionFromError(new Error("Stale request version."), 8.5),
    null,
  );
});

void test("responder progress chooses the first unresolved persisted category and treats zero options neutrally", () => {
  const progress = deriveQualityTimeResponderProgress(
    ["eat", "entertainment", "romance"],
    [
      { category: "eat", status: "matched", option: responderCard("eat-match", "Pasta night") },
      { category: "entertainment", status: "pending", options: [] },
      {
        category: "romance",
        status: "pending",
        options: [responderCard("romance-next", "Sunset walk")],
      },
    ],
  );

  assert.deepEqual(progress, {
    nextPendingCategory: "romance",
    exhaustedCategories: ["entertainment"],
    resolvedCategories: ["eat", "entertainment"],
  });

  assert.equal(
    deriveQualityTimeResponderProgress(
      ["eat"],
      [{ category: "eat", status: "pending", options: [] }],
    )?.nextPendingCategory,
    null,
  );
});

void test("responder progress rejects malformed, duplicate, unknown, and out-of-order evidence", () => {
  assert.equal(deriveQualityTimeResponderProgress([], []), null);
  assert.equal(
    deriveQualityTimeResponderProgress(
      ["eat", "eat"],
      [
        { category: "eat", status: "pending", options: [] },
        { category: "eat", status: "pending", options: [] },
      ],
    ),
    null,
  );
  assert.equal(
    deriveQualityTimeResponderProgress(
      ["eat"],
      [{ category: "drink", status: "pending", options: [] }],
    ),
    null,
  );
  assert.equal(
    deriveQualityTimeResponderProgress(
      ["eat"],
      [
        {
          category: "eat",
          status: "pending",
          options: [responderCard("one", "One"), responderCard("one", "Duplicate")],
        },
      ],
    ),
    null,
  );
});

void test("responder derivation fails closed for throwing projection evidence", () => {
  const throwingResult = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error("private trap");
      },
    },
  );
  const throwingError = new Error("placeholder");
  Object.defineProperty(throwingError, "message", {
    get() {
      throw new Error("private message");
    },
  });

  assert.equal(deriveQualityTimeResponderProgress(["eat"], [throwingResult]), null);
  assert.equal(buildQualityTimeOutcomeSummary(["eat"], [throwingResult]), null);
  assert.equal(qualityTimeResponderStaleVersionFromError(throwingError, 4), null);
});

void test("completed summary keeps server category order, mutual titles, and neutral no-match copy", () => {
  const summary = buildQualityTimeOutcomeSummary(
    ["eat", "entertainment", "romance"],
    [
      { category: "eat", status: "matched", option: responderCard("eat-match", "Pasta night") },
      { category: "entertainment", status: "no_match" },
      {
        category: "romance",
        status: "matched",
        option: responderCard("romance-match", "Sunset walk"),
      },
    ],
  );

  assert.ok(summary);
  assert.equal(
    summary.accessibleSummary,
    "You both want Pasta night for Eat. No shared Entertainment option this time. You both want Sunset walk for Romance.",
  );
  assert.deepEqual(
    summary.results.map((result) => [result.category, result.status, result.accessibilityLabel]),
    [
      ["eat", "matched", "Mutual Eat option, Pasta night"],
      ["entertainment", "no_match", "No shared Entertainment option this time"],
      ["romance", "matched", "Mutual Romance option, Sunset walk"],
    ],
  );
  assert.deepEqual(Object.keys(summary).sort(), ["accessibleSummary", "results"]);
  assert.equal(
    JSON.stringify(summary).match(/creator|actor|decision|rejected|timestamp|order/gi),
    null,
  );
});

void test("completed summary rejects malformed, duplicate, unknown, or private result evidence", () => {
  for (const results of [
    [],
    [
      { category: "eat", status: "no_match" },
      { category: "eat", status: "no_match" },
    ],
    [{ category: "unknown", status: "no_match" }],
    [{ category: "eat", status: "matched" }],
    [
      {
        category: "eat",
        status: "matched",
        option: { ...responderCard("eat-match", "Pasta night"), createdByUserId: "private" },
      },
    ],
    [{ category: "eat", status: "no_match", rejectedIds: ["private"] }],
  ]) {
    assert.equal(
      buildQualityTimeOutcomeSummary(["eat", "entertainment", "romance"], results),
      null,
    );
  }

  assert.equal(
    buildQualityTimeOutcomeSummary(["eat"], [{ category: "entertainment", status: "no_match" }]),
    null,
  );
});

function responderCard(optionId: string, title: string) {
  return {
    optionId,
    title,
    description: `${title} description`,
    kind: "activity" as const,
    costLevel: 1,
    durationMinutes: 60,
    vibeTags: ["cozy"],
  };
}
