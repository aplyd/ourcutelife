/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";

import { canRevealDatePlanItem } from "../../convex/planPrivacy";

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
