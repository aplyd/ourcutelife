/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { applyMockDatePlanMutation, type MockDatePlanState } from "../../src/lib/mockDatePlanState";
import {
  createMockQualityTimeState,
  createMockQualityTimeTestBridge,
  installMockQualityTimeTestBridge,
  QUALITY_TIME_CATEGORIES,
  type MockQualityTimeCategory,
} from "../../src/lib/mockQualityTimeState";

const NOW = Date.parse("2026-08-02T20:00:00.000Z");

function acceptCards(
  state: ReturnType<typeof createMockQualityTimeState>,
  requestId: string,
  category: MockQualityTimeCategory,
  count: number,
  startingVersion = 1,
) {
  let version = startingVersion;
  const inventory = state.listDraftInventory({
    requestId,
    category,
    paginationOpts: { numItems: 12, cursor: null },
  });
  for (const card of inventory.page.slice(0, count)) {
    const result = state.recordDecision({
      requestId,
      expectedVersion: version,
      planIdeaId: card.planIdeaId,
      decision: "accept",
    });
    version = result.version;
  }
  return version;
}

void test("creates valid now and future drafts and rejects invalid timing or categories", () => {
  const state = createMockQualityTimeState(() => NOW);
  const nowDraft = state.createDraft({ timing: { kind: "now" }, selectedCategories: ["eat"] });
  assert.deepEqual(nowDraft, {
    requestId: "mock_quality_time_request_1",
    status: "draft",
    version: 1,
  });
  assert.deepEqual(state.getRequest({ requestId: nowDraft.requestId }), {
    requestId: nowDraft.requestId,
    status: "draft",
    version: 1,
    timing: { kind: "now" },
    selectedCategories: ["eat"],
    shortlistCounts: [{ category: "eat", acceptedCount: 0, decidedCount: 0 }],
  });

  state.reset();
  const scheduledFor = NOW + 60_000;
  const futureDraft = state.createDraft({
    timing: { kind: "future", scheduledFor },
    selectedCategories: ["drink", "romance"],
  });
  assert.deepEqual(state.getRequest({ requestId: futureDraft.requestId }).timing, {
    kind: "future",
    scheduledFor,
  });

  state.reset();
  for (const args of [
    { timing: { kind: "future", scheduledFor: NOW }, selectedCategories: ["eat"] },
    { timing: { kind: "future", scheduledFor: Number.NaN }, selectedCategories: ["eat"] },
    { timing: { kind: "now" }, selectedCategories: [] },
    { timing: { kind: "now" }, selectedCategories: ["eat", "eat"] },
    { timing: { kind: "now" }, selectedCategories: ["unknown"] },
  ]) {
    assert.throws(() => state.createDraft(args as never));
  }
});

void test("returns stable neutral inventory without private provenance", () => {
  const state = createMockQualityTimeState(() => NOW);
  const draft = state.createDraft({
    timing: { kind: "now" },
    selectedCategories: [...QUALITY_TIME_CATEGORIES],
  });

  for (const category of QUALITY_TIME_CATEGORIES) {
    const first = state.listDraftInventory({
      requestId: draft.requestId,
      category,
      paginationOpts: { numItems: 12, cursor: null },
    });
    const second = state.listDraftInventory({
      requestId: draft.requestId,
      category,
      paginationOpts: { numItems: 12, cursor: null },
    });
    assert.deepEqual(second, first);
    assert.equal(first.page.length, 6);
    assert.equal(first.isDone, true);
    for (const card of first.page) {
      assert.deepEqual(
        Object.keys(card).sort(),
        [
          "costLevel",
          "description",
          "durationMinutes",
          "kind",
          "planIdeaId",
          "title",
          "vibeTags",
        ].sort(),
      );
      const serialized = JSON.stringify(card).toLowerCase();
      for (const forbidden of ["creator", "userid", "coupleid", "partner", "decision", "match"])
        assert.equal(serialized.includes(forbidden), false);
    }
  }
});

void test("increments decisions once and rejects duplicate, stale, wrong-category, and sixth accepts", () => {
  const state = createMockQualityTimeState(() => NOW);
  const draft = state.createDraft({
    timing: { kind: "now" },
    selectedCategories: ["eat"],
  });
  const cards = state.listDraftInventory({
    requestId: draft.requestId,
    category: "eat",
    paginationOpts: { numItems: 12, cursor: null },
  }).page;

  const accepted = state.recordDecision({
    requestId: draft.requestId,
    expectedVersion: 1,
    planIdeaId: cards[0]!.planIdeaId,
    decision: "accept",
  });
  assert.equal(accepted.version, 2);
  const afterAccept = state.getRequest({ requestId: draft.requestId });
  assert.equal(afterAccept.status, "draft");
  if (afterAccept.status !== "draft") assert.fail("expected a draft projection");
  assert.deepEqual(afterAccept.shortlistCounts, [
    { category: "eat", acceptedCount: 1, decidedCount: 1 },
  ]);
  assert.throws(() =>
    state.recordDecision({
      requestId: draft.requestId,
      expectedVersion: 2,
      planIdeaId: cards[0]!.planIdeaId,
      decision: "pass",
    }),
  );
  assert.throws(() =>
    state.recordDecision({
      requestId: draft.requestId,
      expectedVersion: 1,
      planIdeaId: cards[1]!.planIdeaId,
      decision: "accept",
    }),
  );
  const afterRejectedWrites = state.getRequest({ requestId: draft.requestId });
  assert.equal(afterRejectedWrites.status, "draft");
  if (afterRejectedWrites.status !== "draft") assert.fail("expected a draft projection");
  assert.deepEqual(afterRejectedWrites.shortlistCounts, [
    { category: "eat", acceptedCount: 1, decidedCount: 1 },
  ]);

  let version = accepted.version;
  for (const card of cards.slice(1, 5)) {
    version = state.recordDecision({
      requestId: draft.requestId,
      expectedVersion: version,
      planIdeaId: card.planIdeaId,
      decision: "accept",
    }).version;
  }
  assert.throws(() =>
    state.recordDecision({
      requestId: draft.requestId,
      expectedVersion: version,
      planIdeaId: "mock_quality_time_eat_6",
      decision: "accept",
    }),
  );
});

void test("sends only with three to five accepts in every selected category", () => {
  const state = createMockQualityTimeState(() => NOW);
  const draft = state.createDraft({
    timing: { kind: "now" },
    selectedCategories: ["eat", "drink"],
  });

  let version = acceptCards(state, draft.requestId, "eat", 2);
  assert.throws(() => state.sendRequest({ requestId: draft.requestId, expectedVersion: version }));
  version = acceptCards(state, draft.requestId, "drink", 3, version);
  assert.throws(() => state.sendRequest({ requestId: draft.requestId, expectedVersion: version }));

  const nextEat = state.listDraftInventory({
    requestId: draft.requestId,
    category: "eat",
    paginationOpts: { numItems: 12, cursor: null },
  }).page[0]!;
  version = state.recordDecision({
    requestId: draft.requestId,
    expectedVersion: version,
    planIdeaId: nextEat.planIdeaId,
    decision: "accept",
  }).version;
  const sent = state.sendRequest({ requestId: draft.requestId, expectedVersion: version });
  assert.deepEqual(sent, { requestId: draft.requestId, status: "sent", version: version + 1 });
  assert.deepEqual(state.getRequest({ requestId: draft.requestId }), {
    requestId: draft.requestId,
    status: "sent",
    version: version + 1,
    timing: { kind: "now" },
    selectedCategories: ["eat", "drink"],
  });
  assert.throws(() =>
    state.sendRequest({ requestId: draft.requestId, expectedVersion: version + 1 }),
  );
});

void test("canceled projections are neutral and terminal writes do not change state", () => {
  const state = createMockQualityTimeState(() => NOW);
  const draft = state.createDraft({
    timing: { kind: "future", scheduledFor: NOW + 60_000 },
    selectedCategories: ["romance"],
  });
  const canceled = state.cancelRequest({ requestId: draft.requestId, expectedVersion: 1 });
  assert.deepEqual(canceled, { requestId: draft.requestId, status: "canceled", version: 2 });
  assert.deepEqual(state.getRequest({ requestId: draft.requestId }), {
    requestId: draft.requestId,
    status: "canceled",
    version: 2,
    timing: { kind: "future", scheduledFor: NOW + 60_000 },
    selectedCategories: ["romance"],
  });
  assert.throws(() => state.cancelRequest({ requestId: draft.requestId, expectedVersion: 2 }));
  assert.equal(state.getRequest({ requestId: draft.requestId }).version, 2);
});

void test("Quality Time mock transitions do not alter legacy date-plan state", () => {
  const legacy: MockDatePlanState = {
    likedByViewer: false,
    likeCount: 0,
    isSaved: true,
    savedStatus: "saved",
    scheduledFor: null,
    completedAt: null,
    ratingAverage: null,
    updatedAt: NOW,
  };
  const expectedLegacy = applyMockDatePlanMutation(legacy, "plans:likeDate", {}, NOW + 1);
  const state = createMockQualityTimeState(() => NOW);
  const draft = state.createDraft({ timing: { kind: "now" }, selectedCategories: ["eat"] });
  const version = acceptCards(state, draft.requestId, "eat", 3);
  state.sendRequest({ requestId: draft.requestId, expectedVersion: version });
  assert.deepEqual(
    applyMockDatePlanMutation(legacy, "plans:likeDate", {}, NOW + 1),
    expectedLegacy,
  );
});

void test("projects one sent request differently for exactly the initiator and responder", () => {
  const state = createMockQualityTimeState(() => NOW);
  const draft = state.createDraft({
    timing: { kind: "now" },
    selectedCategories: ["eat", "entertainment"],
  });
  let version = acceptCards(state, draft.requestId, "eat", 3);
  version = acceptCards(state, draft.requestId, "entertainment", 3, version);
  state.sendRequest({ requestId: draft.requestId, expectedVersion: version });

  const sentProjection = {
    requestId: draft.requestId,
    status: "sent",
    version: version + 1,
    timing: { kind: "now" },
    selectedCategories: ["eat", "entertainment"],
  };
  assert.deepEqual(state.getRequest({ requestId: draft.requestId }), sentProjection);
  state.setActor("responder");
  assert.deepEqual(state.getRequest({ requestId: draft.requestId }), sentProjection);
  assert.throws(() => state.setActor("third_actor" as never));
});

void test("responder chooses one immutable subset and receives optionId-only neutral cards", () => {
  const state = createMockQualityTimeState(() => NOW);
  const seeded = state.seed("mixed");
  state.setActor("responder");
  const begun = state.beginResponse({
    requestId: seeded.requestId,
    expectedVersion: seeded.version,
    categories: ["eat", "entertainment"],
  });
  assert.equal(begun.version, seeded.version + 1);

  const projection = state.getRequest({ requestId: seeded.requestId });
  assert.equal(projection.status, "responding");
  if (projection.status !== "responding" || !("responderCategories" in projection)) {
    assert.fail("expected responder responding projection");
  }
  assert.deepEqual(projection.responderCategories, ["eat", "entertainment"]);
  assert.deepEqual(
    projection.categoryResults.map((result) => [result.category, result.status]),
    [
      ["eat", "pending"],
      ["entertainment", "pending"],
    ],
  );
  for (const result of projection.categoryResults) {
    if (result.status !== "pending") assert.fail("expected pending responder category");
    assert.equal(result.options.length, 3);
    for (const option of result.options) {
      assert.deepEqual(
        Object.keys(option).sort(),
        [
          "costLevel",
          "description",
          "durationMinutes",
          "kind",
          "optionId",
          "title",
          "vibeTags",
        ].sort(),
      );
      assert.equal("planIdeaId" in option, false);
      assert.equal(
        /creator|author|userId|coupleId|decision|partner/i.test(JSON.stringify(option)),
        false,
      );
    }
  }

  const beforeRejected = JSON.stringify(projection);
  assert.throws(() =>
    state.beginResponse({
      requestId: seeded.requestId,
      expectedVersion: begun.version,
      categories: ["eat"],
    }),
  );
  assert.equal(JSON.stringify(state.getRequest({ requestId: seeded.requestId })), beforeRejected);
});

void test("mixed responder lifecycle stops a match, exhausts privately, and completes once", () => {
  const state = createMockQualityTimeState(() => NOW);
  const seeded = state.seed("mixed");
  state.setActor("responder");
  let version = state.beginResponse({
    requestId: seeded.requestId,
    expectedVersion: seeded.version,
    categories: ["eat", "entertainment"],
  }).version;

  version = state.recordDecision({
    requestId: seeded.requestId,
    expectedVersion: version,
    optionId: "mock_quality_time_option_eat_1",
    decision: "pass",
  }).version;
  version = state.recordDecision({
    requestId: seeded.requestId,
    expectedVersion: version,
    optionId: "mock_quality_time_option_eat_2",
    decision: "accept",
  }).version;
  const afterMatch = state.getRequest({ requestId: seeded.requestId });
  assert.equal(afterMatch.status, "responding");
  if (afterMatch.status !== "responding" || !("categoryResults" in afterMatch)) {
    assert.fail("expected responder responding projection");
  }
  assert.equal(afterMatch.categoryResults[0]?.status, "matched");
  assert.throws(() =>
    state.recordDecision({
      requestId: seeded.requestId,
      expectedVersion: version,
      optionId: "mock_quality_time_option_eat_3",
      decision: "pass",
    }),
  );
  for (let index = 1; index <= 3; index += 1) {
    version = state.recordDecision({
      requestId: seeded.requestId,
      expectedVersion: version,
      optionId: `mock_quality_time_option_entertainment_${index}`,
      decision: "pass",
    }).version;
  }
  const completed = state.getRequest({ requestId: seeded.requestId });
  assert.equal(completed.status, "completed");
  if (completed.status !== "completed") assert.fail("expected completed projection");
  assert.deepEqual(completed.categoryResults, [
    {
      category: "eat",
      status: "matched",
      option: {
        optionId: "mock_quality_time_option_eat_2",
        title: "Breakfast picnic",
        description: "Eat together with a simple, low-pressure plan.",
        kind: "food",
        costLevel: 1,
        durationMinutes: 60,
        vibeTags: ["playful", "local"],
      },
    },
    { category: "entertainment", status: "no_match" },
  ]);
  assert.throws(() =>
    state.recordDecision({
      requestId: seeded.requestId,
      expectedVersion: version,
      optionId: "mock_quality_time_option_entertainment_3",
      decision: "accept",
    }),
  );
  state.setActor("initiator");
  assert.deepEqual(state.getRequest({ requestId: seeded.requestId }), completed);
});

void test("responder rejects stale, duplicate, wrong-actor, hidden-category, and arbitrary options atomically", () => {
  const state = createMockQualityTimeState(() => NOW);
  const seeded = state.seed("mixed");
  const initial = JSON.stringify(state.getRequest({ requestId: seeded.requestId }));
  assert.throws(() =>
    state.beginResponse({
      requestId: seeded.requestId,
      expectedVersion: seeded.version,
      categories: ["eat"],
    }),
  );
  assert.equal(JSON.stringify(state.getRequest({ requestId: seeded.requestId })), initial);

  state.setActor("responder");
  for (const categories of [[], ["eat", "eat"], ["drink"]]) {
    const revision = state.getRevision();
    assert.throws(() =>
      state.beginResponse({
        requestId: seeded.requestId,
        expectedVersion: seeded.version,
        categories: categories as MockQualityTimeCategory[],
      }),
    );
    assert.equal(state.getRevision(), revision);
  }
  const responding = state.beginResponse({
    requestId: seeded.requestId,
    expectedVersion: seeded.version,
    categories: ["eat"],
  });
  const beforeRejected = JSON.stringify(state.getRequest({ requestId: seeded.requestId }));
  for (const args of [
    {
      requestId: seeded.requestId,
      expectedVersion: seeded.version,
      optionId: "mock_quality_time_option_eat_1",
      decision: "pass",
    },
    {
      requestId: seeded.requestId,
      expectedVersion: responding.version,
      optionId: "mock_quality_time_option_entertainment_1",
      decision: "pass",
    },
    {
      requestId: seeded.requestId,
      expectedVersion: responding.version,
      optionId: "arbitrary_option",
      decision: "accept",
    },
  ]) {
    const revision = state.getRevision();
    assert.throws(() => state.recordDecision(args as never));
    assert.equal(state.getRevision(), revision);
    assert.equal(JSON.stringify(state.getRequest({ requestId: seeded.requestId })), beforeRejected);
  }

  const accepted = state.recordDecision({
    requestId: seeded.requestId,
    expectedVersion: responding.version,
    optionId: "mock_quality_time_option_eat_1",
    decision: "accept",
  });
  assert.equal(accepted.version, responding.version + 1);
  const afterAccepted = JSON.stringify(state.getRequest({ requestId: seeded.requestId }));
  assert.throws(() =>
    state.recordDecision({
      requestId: seeded.requestId,
      expectedVersion: accepted.version,
      optionId: "mock_quality_time_option_eat_1",
      decision: "pass",
    }),
  );
  assert.equal(JSON.stringify(state.getRequest({ requestId: seeded.requestId })), afterAccepted);
});

void test("initiator stays neutral while responding and both actors get identical private-safe results", () => {
  const state = createMockQualityTimeState(() => NOW);
  const seeded = state.seed("all_match");
  const initiator = state.getRequest({ requestId: seeded.requestId });
  assert.equal(initiator.status, "completed");
  state.setActor("responder");
  const responder = state.getRequest({ requestId: seeded.requestId });
  assert.deepEqual(responder, initiator);
  const serialized = JSON.stringify(responder);
  for (const forbidden of [
    "planIdeaId",
    "initiator",
    "responder",
    "userId",
    "coupleId",
    "createdBy",
    "decision",
    "rejected",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }

  const waiting = createMockQualityTimeState(() => NOW);
  const waitingSeed = waiting.seed("mixed");
  waiting.setActor("responder");
  waiting.beginResponse({
    requestId: waitingSeed.requestId,
    expectedVersion: waitingSeed.version,
    categories: ["eat"],
  });
  waiting.setActor("initiator");
  assert.deepEqual(waiting.getRequest({ requestId: waitingSeed.requestId }), {
    requestId: waitingSeed.requestId,
    status: "responding",
    version: waitingSeed.version + 1,
    timing: { kind: "now" },
    selectedCategories: ["eat", "entertainment"],
  });
});

void test("fixed scenarios, stale projection advance, cancellation, and listeners are deterministic", () => {
  const state = createMockQualityTimeState(() => NOW);
  let notifications = 0;
  state.subscribe(() => {
    notifications += 1;
  });
  const stale = state.seed("stale");
  state.setActor("responder");
  const beforeFailure = state.getRevision();
  assert.throws(() =>
    state.beginResponse({
      requestId: stale.requestId,
      expectedVersion: stale.version,
      categories: ["eat"],
    }),
  );
  assert.equal(state.getRevision(), beforeFailure);
  const advanced = state.advanceStaleProjection();
  assert.equal(advanced.version, stale.version + 1);
  assert.ok(notifications >= 3);

  const allNoMatch = state.seed("all_no_match");
  const allNoMatchProjection = state.getRequest({ requestId: allNoMatch.requestId });
  assert.equal(allNoMatchProjection.status, "completed");
  if (allNoMatchProjection.status !== "completed") assert.fail("expected completed projection");
  assert.deepEqual(allNoMatchProjection.categoryResults, [
    { category: "eat", status: "no_match" },
    { category: "entertainment", status: "no_match" },
  ]);

  for (const scenario of ["expired", "canceled"] as const) {
    const terminal = state.seed(scenario);
    for (const actor of ["initiator", "responder"] as const) {
      state.setActor(actor);
      const projection = state.getRequest({ requestId: terminal.requestId });
      assert.equal(projection.status, scenario);
      assert.deepEqual(Object.keys(projection).sort(), [
        "requestId",
        "selectedCategories",
        "status",
        "timing",
        "version",
      ]);
    }
  }

  const cancelable = state.seed("mixed");
  state.setActor("responder");
  const canceled = state.cancelRequest({
    requestId: cancelable.requestId,
    expectedVersion: cancelable.version,
  });
  assert.equal(canceled.status, "canceled");
});

void test("test bridge exposes only fixed development operations and devMock installs it conditionally", () => {
  const state = createMockQualityTimeState(() => NOW);
  const bridge = createMockQualityTimeTestBridge(state);
  assert.deepEqual(Object.keys(bridge).sort(), [
    "advanceStaleProjection",
    "reset",
    "seed",
    "setActor",
  ]);
  assert.throws(() => bridge.seed("arbitrary" as never));
  assert.throws(() => bridge.setActor("arbitrary" as never));
  assert.equal("getRequest" in bridge, false);
  assert.equal("state" in bridge, false);

  const target: { __OUR_CUTE_LIFE_QUALITY_TIME_MOCK__?: typeof bridge } = {};
  installMockQualityTimeTestBridge(target, true, state);
  assert.deepEqual(Object.keys(target.__OUR_CUTE_LIFE_QUALITY_TIME_MOCK__ ?? {}).sort(), [
    "advanceStaleProjection",
    "reset",
    "seed",
    "setActor",
  ]);
  installMockQualityTimeTestBridge(target, false, state);
  assert.equal("__OUR_CUTE_LIFE_QUALITY_TIME_MOCK__" in target, false);

  const devMockSource = readFileSync("src/lib/devMock.ts", "utf8");
  assert.match(
    devMockSource,
    /installMockQualityTimeTestBridge\([\s\S]*isDevMockAuthEnabled,[\s\S]*mockQualityTimeState/,
  );
  assert.match(devMockSource, /case "qualityTime:beginResponse"/);
});
