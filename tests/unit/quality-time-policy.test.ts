/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";

import {
  adaptLegacyPlanCategory,
  evaluateQualityTimeMutualReveal,
  evaluateQualityTimeShortlist,
} from "../../convex/qualityTimePolicy";

const accepted = (optionId: string, category: string) => ({ optionId, category });

void test("adapts only the five supported legacy plan categories", () => {
  assert.equal(adaptLegacyPlanCategory("food"), "eat");
  assert.equal(adaptLegacyPlanCategory("drinks"), "drink");
  assert.equal(adaptLegacyPlanCategory("activity"), "explore_adventure");
  assert.equal(adaptLegacyPlanCategory("entertainment"), "entertainment");
  assert.equal(adaptLegacyPlanCategory("intimacy"), "romance");

  for (const unknown of [
    "dinner",
    "date",
    "weekend",
    "Food",
    "__proto__",
    "constructor",
    "toString",
    "",
    null,
    1,
  ]) {
    assert.equal(adaptLegacyPlanCategory(unknown), null);
  }
});

void test("distinguishes an ordinary incomplete shortlist from send readiness", () => {
  assert.deepEqual(
    evaluateQualityTimeShortlist({
      selectedCategories: ["eat"],
      acceptedOptions: [accepted("eat_1", "eat"), accepted("eat_2", "eat")],
    }),
    { disposition: "incomplete" },
  );

  for (const count of [3, 5]) {
    assert.deepEqual(
      evaluateQualityTimeShortlist({
        selectedCategories: ["eat"],
        acceptedOptions: Array.from({ length: count }, (_, index) =>
          accepted(`eat_${index}`, "eat"),
        ),
      }),
      { disposition: "ready" },
    );
  }
});

void test("requires three to five accepted options in every selected category", () => {
  assert.deepEqual(
    evaluateQualityTimeShortlist({
      selectedCategories: ["eat", "drink"],
      acceptedOptions: [
        accepted("eat_1", "eat"),
        accepted("eat_2", "eat"),
        accepted("eat_3", "eat"),
        accepted("drink_1", "drink"),
        accepted("drink_2", "drink"),
      ],
    }),
    { disposition: "incomplete" },
  );

  assert.deepEqual(
    evaluateQualityTimeShortlist({
      selectedCategories: ["eat", "drink"],
      acceptedOptions: [
        accepted("eat_1", "eat"),
        accepted("eat_2", "eat"),
        accepted("eat_3", "eat"),
        accepted("drink_1", "drink"),
        accepted("drink_2", "drink"),
        accepted("drink_3", "drink"),
      ],
    }),
    { disposition: "ready" },
  );
});

void test("fails closed for invalid shortlist evidence", () => {
  const throwingShortlist = Object.defineProperties(
    {},
    {
      selectedCategories: {
        enumerable: true,
        get: () => {
          throw new Error("must not read malformed accessors");
        },
      },
      acceptedOptions: { enumerable: true, value: [] },
    },
  );
  const throwingOption = Object.defineProperties(
    {},
    {
      optionId: {
        enumerable: true,
        get: () => {
          throw new Error("must not read malformed accessors");
        },
      },
      category: { enumerable: true, value: "eat" },
    },
  );
  const hostileProxy = new Proxy(
    {},
    {
      getPrototypeOf: () => {
        throw new Error("must fail closed for hostile runtime input");
      },
    },
  );
  const invalidInputs: unknown[] = [
    null,
    {},
    hostileProxy,
    throwingShortlist,
    { selectedCategories: ["eat"], acceptedOptions: [throwingOption] },
    { selectedCategories: [], acceptedOptions: [] },
    { selectedCategories: Array(1), acceptedOptions: [] },
    { selectedCategories: ["eat", "eat"], acceptedOptions: [] },
    { selectedCategories: ["unknown"], acceptedOptions: [] },
    {
      selectedCategories: ["eat"],
      acceptedOptions: [accepted("same", "eat"), accepted("same", "eat")],
    },
    {
      selectedCategories: ["eat"],
      acceptedOptions: [accepted("drink_1", "drink")],
    },
    {
      selectedCategories: ["eat"],
      acceptedOptions: [accepted("", "eat")],
    },
    {
      selectedCategories: ["eat"],
      acceptedOptions: Array.from({ length: 6 }, (_, index) => accepted(`eat_${index}`, "eat")),
    },
    { selectedCategories: "eat", acceptedOptions: [] },
    { selectedCategories: ["eat"], acceptedOptions: "not-an-array" },
  ];

  for (const input of invalidInputs) {
    assert.deepEqual(evaluateQualityTimeShortlist(input), { disposition: "invalid" });
  }
});

const revealInput = (overrides: Record<string, unknown> = {}) => ({
  requestStatus: "responding",
  viewerRole: "responder",
  requestCategory: "eat",
  responderSelectedCategory: true,
  optionCategory: "eat",
  initiatorDecision: { optionId: "option_1", decision: "accept" },
  responderDecision: { optionId: "option_1", decision: "accept" },
  outcomeOptionIds: [],
  ...overrides,
});

void test("reveals only exact same-option mutual acceptance in an eligible request", () => {
  for (const requestStatus of ["sent", "responding", "completed"]) {
    for (const viewerRole of ["initiator", "responder"]) {
      const result = evaluateQualityTimeMutualReveal(revealInput({ requestStatus, viewerRole }));
      assert.deepEqual(result, { disposition: "revealable" });
      assert.deepEqual(Object.keys(result), ["disposition"]);
    }
  }

  assert.deepEqual(
    evaluateQualityTimeMutualReveal(revealInput({ outcomeOptionIds: ["option_1"] })),
    { disposition: "revealable" },
  );
});

void test("keeps one-sided acceptance, passes, and unselected or wrong categories private", () => {
  const hiddenInputs = [
    revealInput({ responderDecision: { optionId: "option_1", decision: "missing" } }),
    revealInput({ initiatorDecision: { optionId: "option_1", decision: "missing" } }),
    revealInput({ initiatorDecision: { optionId: "option_1", decision: "pass" } }),
    revealInput({ responderDecision: { optionId: "option_1", decision: "pass" } }),
    revealInput({ responderSelectedCategory: false }),
    revealInput({ optionCategory: "drink" }),
    revealInput({ responderDecision: { optionId: "option_2", decision: "accept" } }),
  ];

  for (const input of hiddenInputs) {
    assert.deepEqual(evaluateQualityTimeMutualReveal(input), { disposition: "hidden" });
  }
});

void test("fails closed for terminal, malformed, unknown, or ambiguous reveal evidence", () => {
  const throwingReveal = Object.defineProperty(revealInput(), "requestStatus", {
    enumerable: true,
    get: () => {
      throw new Error("must not read malformed accessors");
    },
  });
  const throwingDecision = Object.defineProperties(
    {},
    {
      optionId: {
        enumerable: true,
        get: () => {
          throw new Error("must not read malformed accessors");
        },
      },
      decision: { enumerable: true, value: "accept" },
    },
  );
  const hostileProxy = new Proxy(
    {},
    {
      ownKeys: () => {
        throw new Error("must fail closed for hostile runtime input");
      },
    },
  );
  const hiddenStatuses = ["draft", "canceled", "expired", "exhausted", "no_match"];
  for (const requestStatus of hiddenStatuses) {
    assert.deepEqual(evaluateQualityTimeMutualReveal(revealInput({ requestStatus })), {
      disposition: "hidden",
    });
  }

  const invalidInputs: unknown[] = [
    null,
    {},
    hostileProxy,
    throwingReveal,
    revealInput({ initiatorDecision: throwingDecision }),
    revealInput({ requestStatus: "unknown" }),
    revealInput({ viewerRole: "observer" }),
    revealInput({ requestCategory: "unknown" }),
    revealInput({ optionCategory: "unknown" }),
    revealInput({ responderSelectedCategory: "yes" }),
    revealInput({ outcomeOptionIds: Array(1) }),
    revealInput({ outcomeOptionIds: ["option_1", "option_1"] }),
    revealInput({ outcomeOptionIds: ["option_2"] }),
    revealInput({ initiatorDecision: { optionId: "", decision: "accept" } }),
    revealInput({ responderDecision: null }),
  ];

  for (const input of invalidInputs) {
    assert.deepEqual(evaluateQualityTimeMutualReveal(input), { disposition: "invalid" });
  }
});

void test("visibility results never contain identity, authorship, decisions, ordering, or rejected IDs", () => {
  const prohibited = [
    "userId",
    "createdByUserId",
    "initiatorDecision",
    "responderDecision",
    "rejectedOptionIds",
    "optionId",
    "timestamp",
    "order",
  ];

  for (const result of [
    evaluateQualityTimeMutualReveal(revealInput()),
    evaluateQualityTimeMutualReveal(revealInput({ responderSelectedCategory: false })),
    evaluateQualityTimeMutualReveal(null),
  ]) {
    const serialized = JSON.stringify(result);
    for (const field of prohibited) assert.equal(serialized.includes(field), false);
  }
});
