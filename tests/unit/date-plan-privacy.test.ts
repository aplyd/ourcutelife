/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";

import {
  createDatePlanItemKey,
  previewDatePlanItemKeyBackfill,
  shouldCreateDatePlanForItems,
} from "../../convex/datePlanDedupe";
import {
  createScheduledDatePlanState,
  shouldCountDateCompletionEngagement,
  shouldCountDateLikeEngagement,
  shouldCountDateSaveEngagement,
  summarizeDatePlanRatings,
} from "../../convex/datePlanState";
import { canRevealDatePlanItem } from "../../convex/planPrivacy";

void test("date plan item keys are stable regardless of item order", () => {
  assert.equal(createDatePlanItemKey(["idea_b", "idea_a"]), "idea_a|idea_b");
  assert.equal(createDatePlanItemKey(["idea_a", "idea_b"]), "idea_a|idea_b");
});

void test("date plan item keys ignore duplicate item ids", () => {
  assert.equal(createDatePlanItemKey(["idea_a", "idea_a", "idea_b"]), "idea_a|idea_b");
});

void test("date plan creation skips an existing single-item date", () => {
  assert.equal(shouldCreateDatePlanForItems(["idea_a"], [{ itemIds: ["idea_a"] }]), false);
});

void test("date plan creation skips an existing pair regardless of item order", () => {
  assert.equal(
    shouldCreateDatePlanForItems(
      ["idea_a", "idea_b"],
      [{ itemIds: ["idea_c"] }, { itemIds: ["idea_b", "idea_a"] }],
    ),
    false,
  );
});

void test("date plan creation proceeds when the item bundle is new", () => {
  assert.equal(
    shouldCreateDatePlanForItems(
      ["idea_a", "idea_b"],
      [{ itemIds: ["idea_a"] }, { itemIds: ["idea_a", "idea_c"] }],
    ),
    true,
  );
});

void test("date plan item-key backfill preview only targets missing keys", () => {
  const preview = previewDatePlanItemKeyBackfill([
    { _id: "date_existing", itemIds: ["idea_b", "idea_a"], itemKey: "idea_a|idea_b" },
    { _id: "date_missing", itemIds: ["idea_c", "idea_a", "idea_c"] },
    { _id: "date_null", itemIds: ["idea_d"], itemKey: null },
  ]);

  assert.deepEqual(preview, {
    scanned: 3,
    alreadyKeyed: 1,
    wouldPatchCount: 2,
    wouldPatch: [
      {
        datePlanId: "date_missing",
        itemIds: ["idea_a", "idea_c"],
        itemKey: "idea_a|idea_c",
      },
      { datePlanId: "date_null", itemIds: ["idea_d"], itemKey: "idea_d" },
    ],
  });
});

void test("date plan item-key backfill preview is no-op when all rows are keyed", () => {
  const preview = previewDatePlanItemKeyBackfill([
    { _id: "date_existing", itemIds: ["idea_b", "idea_a"], itemKey: "idea_a|idea_b" },
  ]);

  assert.deepEqual(preview, {
    scanned: 1,
    alreadyKeyed: 1,
    wouldPatchCount: 0,
    wouldPatch: [],
  });
});

void test("date plan rating summaries use the latest stored ratings", () => {
  assert.deepEqual(summarizeDatePlanRatings([{ rating: 4 }, { rating: 2 }, { rating: 3 }]), {
    ratingAverage: 3,
    ratingCount: 3,
  });
});

void test("date plan rating summaries stay safe with no ratings", () => {
  assert.deepEqual(summarizeDatePlanRatings([]), {
    ratingAverage: 0,
    ratingCount: 0,
  });
});

void test("date plan save engagement is counted only for new or restored saves", () => {
  assert.equal(shouldCountDateSaveEngagement(null), true);
  assert.equal(shouldCountDateSaveEngagement("archived"), true);
  assert.equal(shouldCountDateSaveEngagement("saved"), false);
  assert.equal(shouldCountDateSaveEngagement("scheduled"), false);
  assert.equal(shouldCountDateSaveEngagement("completed"), false);
});

void test("date plan like engagement is counted only once per member", () => {
  assert.equal(shouldCountDateLikeEngagement(false), true);
  assert.equal(shouldCountDateLikeEngagement(true), false);
});

void test("date plan completion engagement is counted only on the first completion", () => {
  assert.equal(shouldCountDateCompletionEngagement(null), true);
  assert.equal(shouldCountDateCompletionEngagement("saved"), true);
  assert.equal(shouldCountDateCompletionEngagement("scheduled"), true);
  assert.equal(shouldCountDateCompletionEngagement("archived"), true);
  assert.equal(shouldCountDateCompletionEngagement("completed"), false);
});

void test("scheduling a completed date starts a fresh scheduled lifecycle", () => {
  assert.deepEqual(createScheduledDatePlanState(2_000, 1_000), {
    status: "scheduled",
    scheduledFor: 2_000,
    completedAt: undefined,
    updatedAt: 1_000,
  });
});

void test("date plan items without a creator are safe to reveal", () => {
  assert.equal(
    canRevealDatePlanItem({
      itemId: "idea_public",
      createdByUserId: null,
      viewerUserId: "viewer",
      matchedItemIds: new Set<string>(),
    }),
    true,
  );
});

void test("date plan items created by the viewer are safe to reveal before a match", () => {
  assert.equal(
    canRevealDatePlanItem({
      itemId: "idea_viewer",
      createdByUserId: "viewer",
      viewerUserId: "viewer",
      matchedItemIds: new Set<string>(),
    }),
    true,
  );
});

void test("partner-created date plan items stay hidden until mutual match", () => {
  assert.equal(
    canRevealDatePlanItem({
      itemId: "idea_partner",
      createdByUserId: "partner",
      viewerUserId: "viewer",
      matchedItemIds: new Set<string>(),
    }),
    false,
  );
});

void test("partner-created date plan items are revealed after mutual match", () => {
  assert.equal(
    canRevealDatePlanItem({
      itemId: "idea_partner",
      createdByUserId: "partner",
      viewerUserId: "viewer",
      matchedItemIds: new Set(["idea_partner"]),
    }),
    true,
  );
});
